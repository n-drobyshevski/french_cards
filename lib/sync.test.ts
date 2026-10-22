import "fake-indexeddb/auto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KartochkiDB } from "./db";
import { installOutboxTracking } from "./outbox";
import {
  PULL_OVERLAP_MS,
  PUSH_BATCH,
  SYNC_META_ID,
  fromRemoteRow,
  mergeRemoteRows,
  pullChanges,
  pushOutbox,
  readSyncMeta,
  remoteWins,
  runSyncCycle,
  subscribeSyncStatus,
  getSyncStatus,
  syncNow,
  toRemoteRow,
  type SyncMeta,
} from "./sync";
import { DEFAULT_SETTINGS, type Folder, type ReviewLog, type Word } from "./types";

// syncNow() takes its client from here.
const browser = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("./supabase/client", () => ({ getSupabaseBrowserClient: () => browser.client }));

// ---------------------------------------------------------------------------------------------
// A small in-memory stand-in for the parts of supabase-js that lib/sync.ts uses. It behaves like
// the real schema: upsert on (user_id, id), server-side LWW (an older updated_at keeps the stored
// row but re-stamps its synced_at) and synced_at stamped from a server clock.

type ServerRow = Record<string, unknown> & { id: string; updated_at: string; synced_at: string };

interface MockOptions {
  /** Return status 0 (fetch failed) for every request. */
  offline?: boolean;
  /** Reject any upsert that contains one of these ids with a 400. */
  badIds?: Set<string>;
  /** Answer every select on these tables with this HTTP status. */
  failSelects?: Record<string, number>;
  /** Hold every select answer until this settles. */
  gate?: Promise<void>;
}

function createMockSupabase(options: MockOptions = {}) {
  const tables = new Map<string, Map<string, ServerRow>>();
  const calls: { table: string; op: "upsert" | "select"; rows?: Record<string, unknown>[]; opts?: unknown; filter?: string }[] = [];
  let clock = Date.parse("2026-10-21T08:00:00.000Z");
  const stamp = () => {
    clock += 1;
    // Postgres style, with microseconds and +00:00.
    return new Date(clock).toISOString().replace("Z", "123+00:00");
  };
  const tableOf = (name: string) => {
    if (!tables.has(name)) tables.set(name, new Map());
    return tables.get(name)!;
  };

  const networkError = { data: null, error: { message: "TypeError: fetch failed" }, status: 0 };

  function from(table: string) {
    return {
      upsert(rows: Record<string, unknown>[], opts: { ignoreDuplicates?: boolean }) {
        calls.push({ table, op: "upsert", rows, opts });
        if (options.offline) return Promise.resolve(networkError);
        if (rows.some((r) => options.badIds?.has(String(r.id)))) {
          return Promise.resolve({ data: null, error: { message: "invalid input syntax" }, status: 400 });
        }
        const store = tableOf(table);
        for (const row of rows) {
          const existing = store.get(String(row.id));
          if (existing && opts.ignoreDuplicates) continue;
          if (existing && Date.parse(String(row.updated_at)) <= Date.parse(existing.updated_at)) {
            // kartochki_stamp_row: keep the stored row but re-stamp synced_at so the sender pulls it.
            existing.synced_at = stamp();
            continue;
          }
          store.set(String(row.id), { ...row, user_id: "u1", synced_at: stamp() } as unknown as ServerRow);
        }
        return Promise.resolve({ data: null, error: null, status: 201 });
      },
      select() {
        const filters: ((r: ServerRow) => boolean)[] = [];
        let limit = Infinity;
        let filterText = "";
        const builder = {
          gt(column: string, value: string) {
            filterText = `gt:${value}`;
            filters.push((r) => Date.parse(String(r[column])) > Date.parse(value));
            return builder;
          },
          or(expr: string) {
            filterText = `or:${expr}`;
            const m = expr.match(/^synced_at\.gt\."(.+)",and\(synced_at\.eq\."(.+)",id\.gt\."(.+)"\)$/);
            if (!m) throw new Error(`unexpected or() filter: ${expr}`);
            const [, at, , id] = m;
            filters.push((r) => r.synced_at > at || (r.synced_at === at && r.id > id));
            return builder;
          },
          order() {
            return builder;
          },
          limit(n: number) {
            limit = n;
            return builder;
          },
          then<T>(resolve: (v: unknown) => T, reject?: (e: unknown) => T) {
            calls.push({ table, op: "select", filter: filterText });
            const answer = () => {
              if (options.offline) return networkError;
              const failStatus = options.failSelects?.[table];
              if (failStatus) return { data: null, error: { message: `select ${table} failed` }, status: failStatus };
              const rows = [...tableOf(table).values()]
                .filter((r) => filters.every((f) => f(r)))
                .sort((a, b) => (a.synced_at === b.synced_at ? (a.id < b.id ? -1 : 1) : a.synced_at < b.synced_at ? -1 : 1))
                .slice(0, limit);
              return { data: rows, error: null, status: 200 };
            };
            return Promise.resolve(options.gate)
              .then(answer)
              .then(resolve, reject);
          },
        };
        return builder;
      },
    };
  }

  return {
    client: { from } as unknown as SupabaseClient,
    tables,
    calls,
    seed(table: string, row: object) {
      const server = { ...row, user_id: "u1", synced_at: stamp() } as unknown as ServerRow;
      tableOf(table).set(server.id, server);
    },
    advanceClock(ms: number) {
      clock += ms;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Fixtures

const T0 = "2026-10-21T08:00:00.000Z";
const T1 = "2026-10-21T09:00:00.000Z";
const T2 = "2026-10-21T10:00:00.000Z";

function word(id: string, patch: Partial<Word> = {}): Word {
  return {
    id,
    fr: "la thune",
    ru: "бабки, деньги",
    note: null,
    example_fr: null,
    example_ru: null,
    pos: "noun",
    gender: "f",
    slang_level: 2,
    verlan: false,
    tags: [],
    folder_id: null,
    folder_source: "auto",
    folder_confidence: null,
    source: "manual",
    both_directions: false,
    created_at: T0,
    updated_at: T0,
    deleted_at: null,
    ...patch,
  };
}

function folder(id: string, patch: Partial<Folder> = {}): Folder {
  return {
    id,
    slug: "dengi",
    name: "Деньги",
    description: null,
    color: "#2f6b4f",
    created_by: "user",
    locked: false,
    sort: 1,
    updated_at: T0,
    deleted_at: null,
    ...patch,
  };
}

function log(id: string): ReviewLog {
  return {
    id,
    word_id: "w1",
    direction: "fr_ru",
    rating: 3,
    state: 2,
    due: T1,
    stability: 3.2,
    difficulty: 5.1,
    elapsed_days: 1,
    scheduled_days: 3,
    review: T0,
    prev: null,
    updated_at: T0,
    deleted_at: null,
  };
}

let testDb: KartochkiDB;

const syncRow = (database: KartochkiDB) => database.table<SyncMeta, string>("settings").get(SYNC_META_ID);

/** Counts writes to each key of the settings table. */
function countSettingsWrites(database: KartochkiDB): Map<string, number> {
  const writes = new Map<string, number>();
  const count = (key: unknown) => writes.set(String(key), (writes.get(String(key)) ?? 0) + 1);
  database.settings.hook("creating", (key, obj) => void count(key ?? (obj as { id: string }).id));
  database.settings.hook("updating", (_mods, key) => void count(key));
  return writes;
}

beforeEach(async () => {
  testDb = new KartochkiDB(`sync-test-${crypto.randomUUID()}`);
  installOutboxTracking(testDb);
  await testDb.open();
  await testDb.settings.put({ ...DEFAULT_SETTINGS });
});

afterEach(async () => {
  await testDb.delete();
});

// ---------------------------------------------------------------------------------------------

describe("remoteWins (LWW)", () => {
  it("prefers the newer updated_at and keeps local on ties", () => {
    expect(remoteWins(T2, T1)).toBe(true);
    expect(remoteWins(T1, T2)).toBe(false);
    expect(remoteWins(T1, T1)).toBe(false);
    expect(remoteWins(T1, undefined)).toBe(true);
  });

  it("compares instants, not strings, across timestamp formats", () => {
    expect(remoteWins("2026-10-21T09:00:00.001+00:00", "2026-10-21T09:00:00.000Z")).toBe(true);
    expect(remoteWins("2026-10-21T11:00:00+02:00", "2026-10-21T09:00:00.500Z")).toBe(false);
  });
});

describe("row mapping", () => {
  it("sends only remote columns", () => {
    const row = { ...word("w1"), local_only: "x" };
    const remote = toRemoteRow("words", row);
    expect(remote).not.toHaveProperty("local_only");
    expect(remote).toMatchObject({ id: "w1", fr: "la thune", tags: [] });
  });

  it("drops server columns and normalizes timestamps to toISOString()", () => {
    const local = fromRemoteRow("review_state", {
      id: "w1:fr_ru",
      user_id: "u1",
      synced_at: "2026-10-21T08:00:00.123456+00:00",
      due: "2026-10-22T08:00:00+00:00",
      last_review: null,
      updated_at: "2026-10-21T10:00:00.5+02:00",
    });
    expect(local).not.toHaveProperty("user_id");
    expect(local).not.toHaveProperty("synced_at");
    expect(local.due).toBe("2026-10-22T08:00:00.000Z");
    expect(local.updated_at).toBe("2026-10-21T08:00:00.500Z");
    expect(local.last_review).toBeNull();
  });
});

describe("outbox tracking", () => {
  it("queues writes to synced tables, inside the caller's transaction", async () => {
    await testDb.words.add(word("w1"));
    await testDb.transaction("rw", testDb.words, testDb.folders, async () => {
      await testDb.words.update("w1", { ru: "бабки", updated_at: T1 });
      await testDb.folders.put(folder("f1"));
    });
    await testDb.settings.update("settings", { theme: "dark" });

    const keys = (await testDb.outbox.toArray()).map((e) => e.key).sort();
    expect(keys).toEqual(["folders:f1", "words:w1"]);
  });

  it("orders a local edit after the stored copy, even when this device's clock is behind", async () => {
    // Pulled from a device whose clock runs ahead: stored updated_at is later than our "now".
    await mergeRemoteRows("words", [{ ...word("w1", { ru: "A" }), updated_at: T2 }], testDb);
    await testDb.words.update("w1", { ru: "B", updated_at: T1 });
    const local = await testDb.words.get("w1");
    expect(local?.ru).toBe("B");
    expect(local?.updated_at).toBe(new Date(Date.parse(T2) + 1).toISOString());

    // Newer writes and brand-new rows keep their own timestamp.
    await testDb.words.put({ ...word("w1", { ru: "C" }), updated_at: T2.replace("10:00", "11:00") });
    expect((await testDb.words.get("w1"))?.updated_at).toBe("2026-10-21T11:00:00.000Z");
    await testDb.words.put(word("w2", { updated_at: T0 }));
    expect((await testDb.words.get("w2"))?.updated_at).toBe(T0);
  });

  it("rolls the outbox entry back with a failed transaction", async () => {
    await expect(
      testDb.transaction("rw", testDb.words, async () => {
        await testDb.words.put(word("w1"));
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await testDb.outbox.count()).toBe(0);
  });
});

describe("mergeRemoteRows", () => {
  it("applies newer remote rows, ignores older ones and does not re-queue them", async () => {
    await testDb.words.bulkPut([word("w1", { updated_at: T1, ru: "local" }), word("w2", { updated_at: T1, ru: "local" })]);
    await testDb.outbox.clear();

    const changed = await mergeRemoteRows(
      "words",
      [
        { ...word("w1", { ru: "remote newer" }), updated_at: "2026-10-21T10:00:00+00:00", user_id: "u1", synced_at: "x" },
        { ...word("w2", { ru: "remote older" }), updated_at: T0 },
        { ...word("w3", { ru: "remote new row" }), updated_at: T0 },
      ],
      testDb,
    );

    expect(changed).toBe(2);
    expect((await testDb.words.get("w1"))?.ru).toBe("remote newer");
    expect((await testDb.words.get("w1"))?.updated_at).toBe(T2);
    expect((await testDb.words.get("w2"))?.ru).toBe("local");
    expect((await testDb.words.get("w3"))?.ru).toBe("remote new row");
    expect(await testDb.outbox.count()).toBe(0);
  });

  it("keeps the local row on equal updated_at", async () => {
    await testDb.words.put(word("w1", { updated_at: T1, ru: "local" }));
    expect(await mergeRemoteRows("words", [word("w1", { updated_at: T1, ru: "remote" })], testDb)).toBe(0);
    expect((await testDb.words.get("w1"))?.ru).toBe("local");
  });

  it("applies tombstones and keeps local-only fields", async () => {
    await testDb.words.put({ ...word("w1", { updated_at: T1 }), draft: true } as Word);
    await mergeRemoteRows("words", [word("w1", { updated_at: T2, deleted_at: T2 })], testDb);
    const merged = (await testDb.words.get("w1")) as Word & { draft?: boolean };
    expect(merged.deleted_at).toBe(T2);
    expect(merged.draft).toBe(true);
  });

  it("drops the pending outbox entry of a local edit that lost", async () => {
    await testDb.words.put(word("w1", { updated_at: T1 }));
    expect(await testDb.outbox.get("words:w1")).toBeDefined();
    await mergeRemoteRows("words", [word("w1", { updated_at: T2 })], testDb);
    expect(await testDb.outbox.get("words:w1")).toBeUndefined();
  });

  it("uses the newest copy when the same row arrives twice", async () => {
    await mergeRemoteRows("words", [word("w1", { updated_at: T2, ru: "new" }), word("w1", { updated_at: T1, ru: "old" })], testDb);
    expect((await testDb.words.get("w1"))?.ru).toBe("new");
  });
});

describe("pushOutbox", () => {
  it("drains the outbox in batches with upsert on id", async () => {
    const total = PUSH_BATCH + 50;
    await testDb.words.bulkPut(Array.from({ length: total }, (_, i) => word(`w${i}`)));
    await testDb.folders.put(folder("f1"));
    const remote = createMockSupabase();

    const result = await pushOutbox(remote.client, testDb);

    expect(result).toEqual({ pushed: total + 1, rejected: 0, lastRejection: null });
    expect(await testDb.outbox.count()).toBe(0);
    expect(remote.tables.get("words")?.size).toBe(total);
    expect(remote.tables.get("folders")?.size).toBe(1);
    const upserts = remote.calls.filter((c) => c.op === "upsert");
    expect(upserts.every((c) => (c.rows?.length ?? 0) <= PUSH_BATCH)).toBe(true);
    expect(upserts.length).toBeGreaterThanOrEqual(2);
    expect(upserts[0].opts).toMatchObject({ onConflict: "user_id,id" });
  });

  it("uploads review_log last-write-wins so an undone review reaches the server", async () => {
    const original = log("l1");
    const remote = createMockSupabase();
    remote.seed("review_log", original);
    const undoneAt = new Date(Date.parse(original.updated_at) + 60_000).toISOString();
    await testDb.review_log.put({ ...original, deleted_at: undoneAt, updated_at: undoneAt });

    await pushOutbox(remote.client, testDb);

    const call = remote.calls.find((c) => c.table === "review_log");
    expect(call?.opts).toMatchObject({ onConflict: "user_id,id", ignoreDuplicates: false });
    expect(remote.tables.get("review_log")?.get("l1")?.deleted_at).toBe(undoneAt);
    expect(await testDb.outbox.count()).toBe(0);
  });

  it("keeps entries that were re-queued while the upload ran", async () => {
    await testDb.words.put(word("w1"));
    const remote = createMockSupabase();
    const queuedBefore = (await testDb.outbox.get("words:w1"))!.queued_at;
    let edited = false;
    const client = {
      from: (table: string) => ({
        upsert: async (rows: Record<string, unknown>[], opts: { ignoreDuplicates?: boolean }) => {
          const response = await remote.client.from(table).upsert(rows, opts);
          if (!edited) {
            edited = true;
            await testDb.words.update("w1", { ru: "edited during push", updated_at: T1 });
            // The edit made mid-upload must still be queued when this upload is acknowledged.
            expect((await testDb.outbox.get("words:w1"))!.queued_at > queuedBefore).toBe(true);
          }
          return response;
        },
      }),
    } as unknown as SupabaseClient;

    const result = await pushOutbox(client, testDb);
    // First upload sent the old text; the re-queued entry was sent again in the same drain.
    expect(result.pushed).toBe(2);
    expect(remote.tables.get("words")?.get("w1")?.ru).toBe("edited during push");
    expect(await testDb.outbox.count()).toBe(0);
  });

  it("isolates a rejected row and pushes the rest", async () => {
    await testDb.words.bulkPut([word("w1"), word("bad"), word("w3")]);
    const remote = createMockSupabase({ badIds: new Set(["bad"]) });

    const result = await pushOutbox(remote.client, testDb);

    expect(result.pushed).toBe(2);
    expect(result.rejected).toBe(1);
    expect(result.lastRejection).toContain("words/bad");
    expect((await testDb.outbox.toArray()).map((e) => e.key)).toEqual(["words:bad"]);
    expect([...(remote.tables.get("words")?.keys() ?? [])].sort()).toEqual(["w1", "w3"]);
  });

  it("aborts on network failure and leaves the outbox intact", async () => {
    await testDb.words.bulkPut([word("w1"), word("w2")]);
    const remote = createMockSupabase({ offline: true });

    await expect(pushOutbox(remote.client, testDb)).rejects.toMatchObject({ name: "SyncAbort", kind: "offline" });
    expect(await testDb.outbox.count()).toBe(2);
  });

  it("acknowledges entries whose row was hard-deleted locally", async () => {
    await testDb.words.put(word("w1"));
    await testDb.words.delete("w1");
    const remote = createMockSupabase();

    const result = await pushOutbox(remote.client, testDb);

    expect(result.pushed).toBe(0);
    expect(await testDb.outbox.count()).toBe(0);
    expect(remote.calls).toHaveLength(0);
  });
});

describe("pullChanges", () => {
  it("merges remote rows, stores a per-table cursor and pages with a keyset", async () => {
    const remote = createMockSupabase();
    for (let i = 0; i < 1203; i++) remote.seed("words", word(`w${String(i).padStart(4, "0")}`));
    remote.seed("folders", folder("f1"));
    const writes = countSettingsWrites(testDb);

    const merged = await pullChanges(remote.client, testDb);

    expect(merged).toBe(1204);
    expect(await testDb.words.count()).toBe(1203);
    expect(await testDb.outbox.count()).toBe(0);
    const selects = remote.calls.filter((c) => c.op === "select" && c.table === "words");
    expect(selects).toHaveLength(3);
    expect(selects[1].filter).toMatch(/^or:synced_at\.gt\."/);
    const cursors = (await syncRow(testDb))?.sync_cursors;
    expect(cursors?.words).toBe(remote.tables.get("words")?.get("w1202")?.synced_at);
    expect(cursors?.folders).toBeDefined();
    // One cursor write per table that moved (not one per page), none to the "settings" row.
    expect(Object.fromEntries(writes)).toEqual({ [SYNC_META_ID]: 2 });
    expect((await testDb.settings.get("settings"))?.sync_cursors).toBeUndefined();
  });

  it("does not rewrite cursors that did not move", async () => {
    const remote = createMockSupabase();
    remote.seed("words", word("w1"));
    await pullChanges(remote.client, testDb);
    const before = await syncRow(testDb);
    const writes = countSettingsWrites(testDb);

    // The overlap window returns w1 again; the cursor stays where it was.
    const merged = await pullChanges(remote.client, testDb);

    expect(merged).toBe(0);
    expect(remote.calls.filter((c) => c.op === "select" && c.table === "words").at(-1)?.filter).toMatch(/^gt:/);
    expect(writes.size).toBe(0);
    expect(await syncRow(testDb)).toEqual(before);
  });

  it("starts from the cursors the settings row used to hold, then keeps them in the sync row", async () => {
    const legacy = new Date(Date.parse(T0) + 5 * PULL_OVERLAP_MS).toISOString();
    await testDb.settings.update("settings", { sync_cursors: { words: legacy }, last_sync_at: T1 });
    expect(await readSyncMeta(testDb)).toEqual({ id: SYNC_META_ID, last_sync_at: T1, sync_cursors: { words: legacy } });

    const remote = createMockSupabase();
    remote.advanceClock(10 * PULL_OVERLAP_MS);
    remote.seed("words", word("w1"));
    await pullChanges(remote.client, testDb);

    const select = remote.calls.find((c) => c.op === "select" && c.table === "words");
    expect(select?.filter).toBe(`gt:${new Date(Date.parse(legacy) - PULL_OVERLAP_MS).toISOString()}`);
    const meta = await syncRow(testDb);
    expect(meta).toMatchObject({ last_sync_at: T1, sync_cursors: { words: remote.tables.get("words")?.get("w1")?.synced_at } });
    // The old fields are left alone and no longer read once the sync row exists.
    expect((await testDb.settings.get("settings"))?.sync_cursors).toEqual({ words: legacy });
    await testDb.settings.update("settings", { sync_cursors: {}, last_sync_at: null });
    expect(await readSyncMeta(testDb)).toEqual(meta);
  });

  it("pulls the tables in parallel", async () => {
    let open!: () => void;
    const remote = createMockSupabase({ gate: new Promise<void>((resolve) => (open = resolve)) });
    remote.seed("words", word("w1"));

    const pulling = pullChanges(remote.client, testDb);
    // Every table has asked before any answer arrived.
    await vi.waitFor(() => expect(new Set(remote.calls.map((c) => c.table)).size).toBe(6));
    open();

    expect(await pulling).toBe(1);
  });

  it("rethrows the first failed table and keeps what the others pulled", async () => {
    const remote = createMockSupabase({ failSelects: { review_state: 401, review_log: 503 } });
    remote.seed("words", word("w1"));
    remote.seed("folders", folder("f1"));

    await expect(pullChanges(remote.client, testDb)).rejects.toMatchObject({ name: "SyncAbort", kind: "auth" });

    expect(await testDb.words.get("w1")).toBeDefined();
    expect(await testDb.folders.get("f1")).toBeDefined();
    const cursors = (await syncRow(testDb))?.sync_cursors;
    expect(Object.keys(cursors ?? {}).sort()).toEqual(["folders", "words"]);
  });

  it("asks only for rows after the cursor minus the overlap window", async () => {
    const remote = createMockSupabase();
    remote.seed("words", word("w1"));
    await pullChanges(remote.client, testDb);
    const cursor = (await syncRow(testDb))!.sync_cursors.words!;

    remote.advanceClock(10 * 60_000);
    remote.seed("words", word("w2", { updated_at: T1 }));
    remote.calls.length = 0;
    await pullChanges(remote.client, testDb);

    const select = remote.calls.find((c) => c.op === "select" && c.table === "words");
    expect(select?.filter).toBe(`gt:${new Date(Date.parse(cursor) - PULL_OVERLAP_MS).toISOString()}`);
    expect(await testDb.words.get("w2")).toBeDefined();
  });

  it("throws SyncAbort when offline", async () => {
    const remote = createMockSupabase({ offline: true });
    await expect(pullChanges(remote.client, testDb)).rejects.toMatchObject({ kind: "offline" });
  });
});

describe("runSyncCycle", () => {
  it("converges two devices last-write-wins", async () => {
    const remote = createMockSupabase();
    const other = new KartochkiDB(`sync-test-${crypto.randomUUID()}`);
    installOutboxTracking(other);
    await other.open();
    await other.settings.put({ ...DEFAULT_SETTINGS });

    try {
      // Device A creates a word and syncs; device B pulls it.
      await testDb.words.put(word("w1", { ru: "A1", updated_at: T0 }));
      await runSyncCycle(remote.client, testDb);
      await runSyncCycle(remote.client, other);
      expect((await other.words.get("w1"))?.ru).toBe("A1");

      // B edits later than A; A's older offline edit must not win.
      await other.words.update("w1", { ru: "B", updated_at: T2 });
      await testDb.words.update("w1", { ru: "A2", updated_at: T1 });
      await runSyncCycle(remote.client, other);
      await runSyncCycle(remote.client, testDb);
      await runSyncCycle(remote.client, other);

      expect((await testDb.words.get("w1"))?.ru).toBe("B");
      expect((await other.words.get("w1"))?.ru).toBe("B");
      expect(remote.tables.get("words")?.get("w1")?.ru).toBe("B");
      expect(await testDb.outbox.count()).toBe(0);
      expect((await syncRow(testDb))?.last_sync_at).not.toBeNull();
      expect((await testDb.settings.get("settings"))?.last_sync_at).toBeNull();
    } finally {
      await other.delete();
    }
  });

  it("pulls the winning row back after the server keeps it over a stale push", async () => {
    const remote = createMockSupabase();
    // The server holds a newer copy whose synced_at is already behind this device's cursor.
    remote.seed("words", word("w1", { ru: "server", updated_at: T2 }));
    remote.advanceClock(10 * PULL_OVERLAP_MS);
    const cursor = new Date(Date.parse("2026-10-21T08:00:00.000Z") + 5 * PULL_OVERLAP_MS).toISOString();
    await testDb.table<SyncMeta, string>("settings").put({ id: SYNC_META_ID, last_sync_at: null, sync_cursors: { words: cursor } });
    await testDb.words.put(word("w1", { ru: "local", updated_at: T1 }));

    const result = await runSyncCycle(remote.client, testDb);

    expect(result.pushed).toBe(1);
    expect(remote.tables.get("words")?.get("w1")?.ru).toBe("server");
    expect((await testDb.words.get("w1"))?.ru).toBe("server");
    expect(await testDb.outbox.count()).toBe(0);
  });

  it("pushes without pulling when asked to", async () => {
    const remote = createMockSupabase();
    remote.seed("words", word("remote"));
    await testDb.words.put(word("w1"));

    const result = await runSyncCycle(remote.client, testDb, { pull: false });

    expect(result).toMatchObject({ pushed: 1, pulled: 0 });
    expect(remote.calls.map((c) => c.op)).toEqual(["upsert"]);
    expect(await testDb.words.get("remote")).toBeUndefined();
    expect(await testDb.outbox.count()).toBe(0);
    // Only a full cycle counts as «last synced».
    expect(result.lastSyncAt).toBeNull();
    expect((await syncRow(testDb))?.last_sync_at ?? null).toBeNull();
  });
});

describe("syncNow", () => {
  let getSession: ReturnType<typeof vi.fn>;

  function connect(options: MockOptions = {}) {
    const remote = createMockSupabase(options);
    getSession = vi.fn(async () => ({ data: { session: { user: { id: "u1" } } }, error: null }));
    browser.client = { ...remote.client, auth: { getSession } };
    return remote;
  }

  /** Resolves once `n` cycles have run (each goes «syncing», then back to rest). */
  function cyclesDone(n: number): Promise<void> {
    return new Promise((resolve) => {
      let syncing = false;
      let done = 0;
      const stop = subscribeSyncStatus(() => {
        const busy = getSyncStatus().state === "syncing";
        if (syncing && !busy && ++done === n) {
          stop();
          resolve();
        }
        syncing = busy;
      });
    });
  }

  afterEach(() => {
    browser.client = null;
  });

  it("follows a push-only cycle with a full one when a pull was asked for meanwhile", async () => {
    const remote = connect();
    const done = cyclesDone(2);

    void syncNow({ pull: false });
    void syncNow({ pull: false });
    void syncNow();
    await done;

    expect(getSession).toHaveBeenCalledTimes(2);
    // Only the second cycle pulled: one select per table.
    expect(remote.calls.filter((c) => c.op === "select")).toHaveLength(6);
  });

  it("answers a pull asked for during a push-only cycle once that pull has run", async () => {
    const remote = connect();
    void syncNow({ pull: false });
    const full = await syncNow();

    expect(full.ok).toBe(true);
    expect(remote.calls.filter((c) => c.op === "select")).toHaveLength(6);
  });

  it("keeps a pull failure on show through a push-only cycle", async () => {
    connect({ failSelects: { words: 500 } });
    await syncNow();
    expect(getSyncStatus()).toMatchObject({ state: "error", errorKind: "server" });

    const push = await syncNow({ pull: false });
    expect(push.ok).toBe(true);
    expect(getSyncStatus()).toMatchObject({ state: "error", errorKind: "server" });
  });

  it("keeps the follow-up cycle push-only when no call asked for a pull", async () => {
    const remote = connect();
    const done = cyclesDone(2);

    void syncNow({ pull: false });
    void syncNow({ pull: false });
    await done;

    expect(getSession).toHaveBeenCalledTimes(2);
    expect(remote.calls).toHaveLength(0);
  });
});
