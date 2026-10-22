// Two-way sync between Dexie (the source of truth) and Supabase.
//
// Push: drain db.outbox (filled automatically by lib/outbox.ts) in batches, upserting the
//   current local rows. Every table, review_log included, is last-write-wins on the server
//   (an undone review soft-deletes its log row and that change has to reach other devices).
// Pull: per table, fetch rows whose server `synced_at` is past the stored cursor (with a short
//   overlap for transactions that committed late) and merge them last-write-wins on
//   `updated_at`. Merged rows are not queued for upload again.
// Loop: startSyncLoop() syncs on open, focus, reconnect and 3 s after local writes.
import { liveQuery, type Subscription } from "dexie";
import { useSyncExternalStore } from "react";
import { isAuthRetryableFetchError, type SupabaseClient } from "@supabase/supabase-js";
import { db as defaultDb, nowIso, type KartochkiDB, type Outbox } from "./db";
import { isSyncTable, skipOutboxFor } from "./outbox";
import { getSupabaseBrowserClient } from "./supabase/client";
import { isSupabaseConfigured } from "./supabase/config";
import { DEFAULT_SETTINGS, SYNC_TABLES, type Settings, type SyncTable } from "./types";

export const PUSH_BATCH = 200;
export const PULL_PAGE = 500;
/** Re-read this much before the cursor, so rows committed slightly out of order are not missed. */
export const PULL_OVERLAP_MS = 60_000;
export const WRITE_DEBOUNCE_MS = 3_000;
const PERIODIC_MS = 5 * 60_000;
const RETRY_BASE_MS = 15_000;
const RETRY_MAX_MS = 5 * 60_000;

type Row = Record<string, unknown> & { id: string; updated_at: string };

/** Columns stored in Supabase, per table. Local-only fields never leave the device. */
export const REMOTE_COLUMNS: Record<SyncTable, readonly string[]> = {
  folders: ["id", "slug", "name", "description", "color", "created_by", "locked", "sort", "updated_at", "deleted_at"],
  words: [
    "id", "fr", "ru", "note", "example_fr", "example_ru", "extra_examples", "pos", "gender", "slang_level", "verlan", "tags",
    "folder_id", "folder_source", "folder_confidence", "source", "both_directions", "created_at", "updated_at", "deleted_at",
  ],
  review_state: [
    "id", "word_id", "direction", "due", "stability", "difficulty", "elapsed_days", "scheduled_days",
    "learning_steps", "reps", "lapses", "state", "last_review", "updated_at", "deleted_at",
  ],
  review_log: [
    "id", "word_id", "direction", "rating", "state", "due", "stability", "difficulty", "elapsed_days",
    "scheduled_days", "review", "prev", "updated_at", "deleted_at",
  ],
  reorg_runs: ["id", "created_at", "applied_at", "moves", "created_folders", "updated_at", "deleted_at"],
  review_sets: ["id", "name", "folders", "statuses", "slang", "added", "mode", "created_at", "updated_at", "deleted_at"],
};

/** Postgres returns `2026-10-21T08:00:00.123+00:00`; locally every timestamp is `toISOString()`. */
const TIMESTAMP_COLUMNS: Record<SyncTable, readonly string[]> = {
  folders: ["updated_at", "deleted_at"],
  words: ["created_at", "updated_at", "deleted_at"],
  review_state: ["due", "last_review", "updated_at", "deleted_at"],
  review_log: ["due", "review", "updated_at", "deleted_at"],
  reorg_runs: ["created_at", "applied_at", "updated_at", "deleted_at"],
  review_sets: ["created_at", "updated_at", "deleted_at"],
};

// ---------------------------------------------------------------------------------------------
// Row mapping and last-write-wins

const toMs = (iso: string | null | undefined): number => {
  const ms = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(ms) ? -Infinity : ms;
};

/** True when the remote copy should replace the local one. Ties keep the local row. */
export function remoteWins(remoteUpdatedAt: string, localUpdatedAt: string | null | undefined): boolean {
  if (localUpdatedAt == null) return true;
  return toMs(remoteUpdatedAt) > toMs(localUpdatedAt);
}

export function toRemoteRow(table: SyncTable, row: object): Record<string, unknown> {
  const source = row as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const column of REMOTE_COLUMNS[table]) {
    if (source[column] !== undefined) out[column] = source[column];
  }
  return out;
}

export function fromRemoteRow(table: SyncTable, row: object): Row {
  const source = row as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const column of REMOTE_COLUMNS[table]) {
    if (column in source) out[column] = source[column];
  }
  for (const column of TIMESTAMP_COLUMNS[table]) {
    const value = out[column];
    if (typeof value === "string") {
      const ms = Date.parse(value);
      if (!Number.isNaN(ms)) out[column] = new Date(ms).toISOString();
    }
  }
  return out as Row;
}

/**
 * Merges server rows into Dexie, last-write-wins on `updated_at`. Winning rows keep any
 * local-only fields, are written without being queued for upload, and drop a pending outbox
 * entry for the same row (the local edit lost). Returns how many rows changed locally.
 */
export async function mergeRemoteRows(
  table: SyncTable,
  remoteRows: readonly object[],
  database: KartochkiDB = defaultDb,
): Promise<number> {
  if (remoteRows.length === 0) return 0;

  const newest = new Map<string, Row>();
  for (const raw of remoteRows) {
    const row = fromRemoteRow(table, raw);
    if (typeof row.id !== "string" || !row.id) continue;
    const seen = newest.get(row.id);
    if (!seen || remoteWins(row.updated_at, seen.updated_at)) newest.set(row.id, row);
  }
  const incoming = [...newest.values()];
  const target = database.table<Row, string>(table);

  return database.transaction("rw", target, database.outbox, async (tx) => {
    skipOutboxFor(tx);
    const locals = await target.bulkGet(incoming.map((r) => r.id));
    const winners: Row[] = [];
    incoming.forEach((remote, i) => {
      const local = locals[i];
      if (!local) winners.push(remote);
      else if (remoteWins(remote.updated_at, local.updated_at)) winners.push({ ...local, ...remote });
    });
    if (winners.length === 0) return 0;
    await target.bulkPut(winners);
    await database.outbox.bulkDelete(winners.map((r) => `${table}:${r.id}`));
    return winners.length;
  });
}

// ---------------------------------------------------------------------------------------------
// Errors

/** A failure that should stop the whole cycle (network down, auth, server error). */
export class SyncAbort extends Error {
  constructor(
    message: string,
    readonly kind: "offline" | "auth" | "server",
  ) {
    super(message);
    this.name = "SyncAbort";
  }
}

interface RemoteError {
  message: string;
  status: number;
}

/** Network, auth and 5xx errors abort the cycle; other 4xx are blamed on the rows sent. */
function abortFor(err: RemoteError): SyncAbort | null {
  if (err.status === 0) return new SyncAbort(err.message, "offline");
  if (err.status === 401) return new SyncAbort(err.message, "auth");
  if (err.status >= 500 || err.status === 408 || err.status === 429) return new SyncAbort(err.message, "server");
  return null;
}

// ---------------------------------------------------------------------------------------------
// Push

export interface PushResult {
  pushed: number;
  /** Rows the server rejected; they stay in the outbox and are retried next cycle. */
  rejected: number;
  lastRejection: string | null;
}

async function upsertRows(client: SupabaseClient, table: SyncTable, rows: Record<string, unknown>[]): Promise<RemoteError | null> {
  const { error, status } = await client
    .from(table)
    .upsert(rows, { onConflict: "user_id,id", ignoreDuplicates: false, defaultToNull: false });
  return error ? { message: error.message, status } : null;
}

/** Removes outbox entries that were not re-queued (edited again) while the upload ran. */
async function acknowledge(database: KartochkiDB, entries: readonly Outbox[]): Promise<void> {
  if (entries.length === 0) return;
  await database.transaction("rw", database.outbox, async () => {
    const current = await database.outbox.bulkGet(entries.map((e) => e.key));
    const done = entries.filter((e, i) => current[i]?.queued_at === e.queued_at).map((e) => e.key);
    if (done.length) await database.outbox.bulkDelete(done);
  });
}

export async function pushOutbox(client: SupabaseClient, database: KartochkiDB = defaultDb): Promise<PushResult> {
  const result: PushResult = { pushed: 0, rejected: 0, lastRejection: null };
  const rejected = new Set<string>();

  for (;;) {
    const batch = await database.outbox
      .orderBy("queued_at")
      .filter((e) => !rejected.has(e.key))
      .limit(PUSH_BATCH)
      .toArray();
    if (batch.length === 0) break;

    const byTable = new Map<string, Outbox[]>();
    for (const entry of batch) {
      const list = byTable.get(entry.table) ?? [];
      list.push(entry);
      byTable.set(entry.table, list);
    }

    for (const [table, entries] of byTable) {
      if (!isSyncTable(table)) {
        await acknowledge(database, entries);
        continue;
      }
      const rows = await database.table<Row, string>(table).bulkGet(entries.map((e) => e.id));
      const present: { entry: Outbox; row: Record<string, unknown> }[] = [];
      const gone: Outbox[] = [];
      entries.forEach((entry, i) => {
        const row = rows[i];
        if (row) present.push({ entry, row: toRemoteRow(table, row) });
        else gone.push(entry); // hard-deleted locally: nothing to send
      });
      await acknowledge(database, gone);
      if (present.length === 0) continue;

      const error = await upsertRows(client, table, present.map((p) => p.row));
      if (!error) {
        await acknowledge(database, present.map((p) => p.entry));
        result.pushed += present.length;
        continue;
      }
      const abort = abortFor(error);
      if (abort) throw abort;

      // The batch was refused: send rows one by one so a single bad row cannot block the rest.
      for (const { entry, row } of present) {
        const rowError = await upsertRows(client, table, [row]);
        if (!rowError) {
          await acknowledge(database, [entry]);
          result.pushed += 1;
          continue;
        }
        const rowAbort = abortFor(rowError);
        if (rowAbort) throw rowAbort;
        rejected.add(entry.key);
        result.rejected += 1;
        result.lastRejection = `${table}/${entry.id}: ${rowError.message}`;
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------------------------
// Pull

async function readSettings(database: KartochkiDB): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...(await database.settings.get("settings")), id: "settings" };
}

async function patchSettings(database: KartochkiDB, patch: (s: Settings) => Partial<Settings>): Promise<void> {
  await database.transaction("rw", database.settings, async () => {
    const current = await readSettings(database);
    await database.settings.put({ ...current, ...patch(current) });
  });
}

/** Later of two server timestamps; same-millisecond ties fall back to the microsecond text. */
function laterCursor(a: string | undefined, b: string): string {
  if (!a) return b;
  const diff = toMs(b) - toMs(a);
  if (diff !== 0) return diff > 0 ? b : a;
  return b > a ? b : a;
}

const quote = (value: string) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

export async function pullChanges(client: SupabaseClient, database: KartochkiDB = defaultDb): Promise<number> {
  let merged = 0;
  for (const table of SYNC_TABLES) {
    const cursors = (await readSettings(database)).sync_cursors ?? {};
    let cursor = cursors[table];
    const since = cursor ? new Date(toMs(cursor) - PULL_OVERLAP_MS).toISOString() : null;
    let after: { at: string; id: string } | null = null;

    for (;;) {
      let query = client.from(table).select("*");
      if (after) {
        query = query.or(`synced_at.gt.${quote(after.at)},and(synced_at.eq.${quote(after.at)},id.gt.${quote(after.id)})`);
      } else if (since) {
        query = query.gt("synced_at", since);
      }
      const { data, error, status } = await query.order("synced_at", { ascending: true }).order("id", { ascending: true }).limit(PULL_PAGE);
      if (error) throw abortFor({ message: error.message, status }) ?? new SyncAbort(error.message, "server");

      const rows = (data ?? []) as Record<string, unknown>[];
      merged += await mergeRemoteRows(table, rows, database);

      const last = rows.at(-1);
      if (last && typeof last.synced_at === "string") {
        cursor = laterCursor(cursor, last.synced_at);
        const saved = cursor;
        await patchSettings(database, (s) => ({ sync_cursors: { ...s.sync_cursors, [table]: saved } }));
      }
      if (rows.length < PULL_PAGE || !last) break;
      after = { at: String(last.synced_at), id: String(last.id) };
    }
  }
  return merged;
}

// ---------------------------------------------------------------------------------------------
// Status store

export type SyncState = "idle" | "syncing" | "error" | "offline" | "disabled";

export interface SyncStatus {
  state: SyncState;
  /** Client time of the last fully successful cycle. */
  lastSyncAt: string | null;
  /** Short technical reason for `error` (not user copy). */
  error: string | null;
  /** What failed last, for the line's second row («Сервер не ответил · 14:05»); null after a good cycle. */
  errorKind: "server" | "auth" | "rejected" | null;
  /** Client time of that failure. */
  errorAt: string | null;
}

const SERVER_STATUS: SyncStatus = { state: "disabled", lastSyncAt: null, error: null, errorKind: null, errorAt: null };
let status: SyncStatus = {
  state: isSupabaseConfigured() ? "idle" : "disabled",
  lastSyncAt: null,
  error: null,
  errorKind: null,
  errorAt: null,
};
const listeners = new Set<() => void>();

function setStatus(patch: Partial<SyncStatus>): void {
  const next = { ...status, ...patch };
  if (
    next.state === status.state &&
    next.lastSyncAt === status.lastSyncAt &&
    next.error === status.error &&
    next.errorKind === status.errorKind &&
    next.errorAt === status.errorAt
  ) {
    return;
  }
  status = next;
  for (const listener of listeners) listener();
}

export const getSyncStatus = (): SyncStatus => status;

export function subscribeSyncStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribeSyncStatus, getSyncStatus, () => SERVER_STATUS);
}

// ---------------------------------------------------------------------------------------------
// One full cycle

export interface SyncResult {
  ok: boolean;
  state: SyncState;
  pushed: number;
  pulled: number;
  rejected: number;
}

const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

/** Push then pull with an explicit client and database. Used by syncNow() and by tests. */
export async function runSyncCycle(client: SupabaseClient, database: KartochkiDB = defaultDb) {
  const push = await pushOutbox(client, database);
  const pulled = await pullChanges(client, database);
  const lastSyncAt = nowIso();
  await patchSettings(database, () => ({ last_sync_at: lastSyncAt }));
  return { ...push, pulled, lastSyncAt };
}

let inflight: Promise<SyncResult> | null = null;
let rerun = false;
let failures = 0;

async function cycle(): Promise<SyncResult> {
  const empty = { pushed: 0, pulled: 0, rejected: 0 };
  const client = getSupabaseBrowserClient();
  if (!client) {
    setStatus({ state: "disabled", error: null });
    return { ok: false, state: "disabled", ...empty };
  }
  if (isOffline()) {
    setStatus({ state: "offline" });
    return { ok: false, state: "offline", ...empty };
  }

  try {
    const { data, error: sessionError } = await client.auth.getSession();
    if (!data.session) {
      const offline = isOffline() || isAuthRetryableFetchError(sessionError);
      const state: SyncState = offline ? "offline" : "disabled";
      setStatus({ state, error: null });
      if (offline) scheduleRetry();
      return { ok: false, state, ...empty };
    }

    setStatus({ state: "syncing", error: null });
    const result = await runSyncCycle(client);
    failures = 0;
    const state: SyncState = result.rejected > 0 ? "error" : "idle";
    setStatus({
      state,
      lastSyncAt: result.lastSyncAt,
      error: result.lastRejection,
      errorKind: state === "error" ? "rejected" : null,
      errorAt: state === "error" ? nowIso() : null,
    });
    return { ok: result.rejected === 0, state, pushed: result.pushed, pulled: result.pulled, rejected: result.rejected };
  } catch (err) {
    const offline = isOffline() || (err instanceof SyncAbort && err.kind === "offline");
    const state: SyncState = offline ? "offline" : "error";
    setStatus({
      state,
      error: err instanceof Error ? err.message : String(err),
      ...(offline ? {} : { errorKind: err instanceof SyncAbort && err.kind === "auth" ? "auth" : "server", errorAt: nowIso() }),
    });
    scheduleRetry();
    return { ok: false, state, ...empty };
  }
}

/**
 * Runs one push+pull cycle now. Concurrent calls share the running cycle, and a call made
 * while one is running triggers exactly one more cycle afterwards (to pick up new writes).
 */
export function syncNow(): Promise<SyncResult> {
  if (inflight) {
    rerun = true;
    return inflight;
  }
  inflight = cycle().finally(() => {
    inflight = null;
    if (rerun) {
      rerun = false;
      void syncNow();
    }
  });
  return inflight;
}

// ---------------------------------------------------------------------------------------------
// Loop

let loop: { schedule: (ms: number) => void; stop: () => void } | null = null;
let loopUsers = 0;

function scheduleRetry(): void {
  if (!loop) return;
  failures += 1;
  loop.schedule(Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (failures - 1)));
}

function createLoop(): { schedule: (ms: number) => void; stop: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastEventKick = 0;
  const kick = () => void syncNow();
  // focus and visibilitychange usually fire together when the app comes back.
  const kickFromEvent = () => {
    const now = Date.now();
    if (now - lastEventKick < 2_000) return;
    lastEventKick = now;
    kick();
  };
  const schedule = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(kick, ms);
  };

  const client = getSupabaseBrowserClient();
  if (!client) {
    setStatus({ state: "disabled" });
    return { schedule: () => {}, stop: () => {} };
  }

  void readSettings(defaultDb)
    .then((s) => {
      if (s.last_sync_at && !status.lastSyncAt) setStatus({ lastSyncAt: s.last_sync_at });
    })
    .catch(() => {});

  const onFocus = () => kickFromEvent();
  const onVisible = () => {
    if (document.visibilityState === "visible") kickFromEvent();
  };
  const onOnline = () => {
    failures = 0;
    kickFromEvent();
  };
  const onOffline = () => setStatus({ state: "offline" });
  window.addEventListener("focus", onFocus);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  document.addEventListener("visibilitychange", onVisible);

  // Debounced push after local writes: every write re-queues its row with a newer queued_at.
  // The first emission only records the starting point; the initial kick below covers it.
  let newestQueued: string | null = null;
  let primed = false;
  const outboxWatch: Subscription = liveQuery(() => defaultDb.outbox.orderBy("queued_at").last()).subscribe({
    next(entry) {
      const queuedAt = entry?.queued_at ?? null;
      const isNewer = queuedAt !== null && (newestQueued === null || queuedAt > newestQueued);
      if (isNewer) newestQueued = queuedAt;
      if (primed && isNewer) schedule(WRITE_DEBOUNCE_MS);
      primed = true;
    },
    error() {},
  });

  const { data: auth } = client.auth.onAuthStateChange((event) => {
    // Never await Supabase calls inside this callback; defer instead.
    if (event === "SIGNED_IN") schedule(0);
    if (event === "SIGNED_OUT") setStatus({ state: "disabled", error: null });
  });

  const periodic = setInterval(() => {
    if (document.visibilityState === "visible") kick();
  }, PERIODIC_MS);

  kick();

  return {
    schedule,
    stop() {
      clearTimeout(timer);
      clearInterval(periodic);
      outboxWatch.unsubscribe();
      auth.subscription.unsubscribe();
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
    },
  };
}

/**
 * Starts background sync (idempotent, reference-counted). Call from a client effect and
 * return the result as the cleanup: `useEffect(() => startSyncLoop(), [])`.
 */
export function startSyncLoop(): () => void {
  if (typeof window === "undefined") return () => {};
  loopUsers += 1;
  if (!loop) loop = createLoop();
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    loopUsers -= 1;
    if (loopUsers === 0 && loop) {
      loop.stop();
      loop = null;
    }
  };
}
