// Two-way sync between Dexie (the source of truth) and Supabase.
//
// Push: drain db.outbox (filled automatically by lib/outbox.ts) in batches, upserting the
//   current local rows. Every table, review_log included, is last-write-wins on the server
//   (an undone review soft-deletes its log row and that change has to reach other devices).
// Pull: per table, fetch rows whose server `synced_at` is past the stored cursor (with a short
//   overlap for transactions that committed late) and merge them last-write-wins on
//   `updated_at`. Merged rows are not queued for upload again.
// Loop: startSyncLoop() pushes 3 s after local writes, and pushes then pulls on open, focus,
//   reconnect, sign-in, every 5 minutes and on demand.
// Bookkeeping (cursors, last sync time) lives in its own settings row, id "sync", so a cycle
//   does not wake the UI's live queries on the "settings" row.
import { liveQuery, type Subscription } from "dexie";
import { useSyncExternalStore } from "react";
import { isAuthRetryableFetchError, type SupabaseClient } from "@supabase/supabase-js";
import { db as defaultDb, nowIso, type KartochkiDB, type Outbox } from "./db";
import { isSyncTable, skipOutboxFor } from "./outbox";
import { getSupabaseBrowserClient } from "./supabase/client";
import { isSupabaseConfigured } from "./supabase/config";
import { SYNC_TABLES, type Settings, type SyncTable } from "./types";

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

export const SYNC_META_ID = "sync";

/** Sync bookkeeping, stored in the settings table under its own key. */
export interface SyncMeta {
  id: typeof SYNC_META_ID;
  /** Client time of the last successful cycle. */
  last_sync_at: string | null;
  /** Pull cursors per synced table: the server `synced_at` of the last row received. */
  sync_cursors: Partial<Record<SyncTable, string>>;
}

const metaTable = (database: KartochkiDB) => database.table<SyncMeta, string>("settings");

/** The "sync" row; until it exists, the fields the "settings" row used to carry. */
export async function readSyncMeta(database: KartochkiDB = defaultDb): Promise<SyncMeta> {
  const meta = await metaTable(database).get(SYNC_META_ID);
  if (meta) return { id: SYNC_META_ID, last_sync_at: meta.last_sync_at ?? null, sync_cursors: { ...meta.sync_cursors } };
  const legacy: Partial<Settings> | undefined = await database.settings.get("settings");
  return { id: SYNC_META_ID, last_sync_at: legacy?.last_sync_at ?? null, sync_cursors: { ...legacy?.sync_cursors } };
}

async function patchSyncMeta(database: KartochkiDB, patch: (m: SyncMeta) => Partial<Omit<SyncMeta, "id">>): Promise<void> {
  await database.transaction("rw", database.settings, async () => {
    const current = await readSyncMeta(database);
    await metaTable(database).put({ ...current, ...patch(current), id: SYNC_META_ID });
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

/** Pages one table from its cursor. The cursor is saved once at the end, and only if it moved. */
async function pullTable(client: SupabaseClient, table: SyncTable, start: string | undefined, database: KartochkiDB): Promise<number> {
  let merged = 0;
  let cursor = start;
  const since = cursor ? new Date(toMs(cursor) - PULL_OVERLAP_MS).toISOString() : null;
  let after: { at: string; id: string } | null = null;

  const saveCursor = async () => {
    if (cursor === start) return;
    const saved = cursor;
    await patchSyncMeta(database, (m) => ({ sync_cursors: { ...m.sync_cursors, [table]: saved } }));
  };
  try {
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
      if (last && typeof last.synced_at === "string") cursor = laterCursor(cursor, last.synced_at);
      if (rows.length < PULL_PAGE || !last) break;
      after = { at: String(last.synced_at), id: String(last.id) };
    }
  } catch (error: unknown) {
    // Pages merged before a failure keep their progress; the failure (and its kind) goes on.
    await saveCursor().catch(() => {});
    throw error;
  }
  await saveCursor();
  return merged;
}

/** Pulls every table at once (no foreign keys between them); the first failure is rethrown. */
export async function pullChanges(client: SupabaseClient, database: KartochkiDB = defaultDb): Promise<number> {
  const { sync_cursors: cursors } = await readSyncMeta(database);
  const settled = await Promise.allSettled(SYNC_TABLES.map((table) => pullTable(client, table, cursors[table], database)));
  let merged = 0;
  for (const result of settled) {
    if (result.status === "rejected") throw result.reason;
    merged += result.value;
  }
  return merged;
}

// ---------------------------------------------------------------------------------------------
// Status store

export type SyncState = "idle" | "syncing" | "error" | "offline" | "disabled";

export interface SyncStatus {
  state: SyncState;
  /** Client time of the last successful cycle (a push-only one included). */
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

export interface SyncOptions {
  /** false: push the outbox only (the debounce after local writes). Default true. */
  pull?: boolean;
}

/**
 * Push then pull with an explicit client and database. Used by syncNow() and by tests. Only a
 * full cycle counts as a sync for «last synced» (`lastSyncAt` stays null when pushing only).
 */
export async function runSyncCycle(client: SupabaseClient, database: KartochkiDB = defaultDb, { pull = true }: SyncOptions = {}) {
  const push = await pushOutbox(client, database);
  if (!pull) return { ...push, pulled: 0, lastSyncAt: null };
  const pulled = await pullChanges(client, database);
  const lastSyncAt = nowIso();
  await patchSyncMeta(database, () => ({ last_sync_at: lastSyncAt }));
  return { ...push, pulled, lastSyncAt };
}

let inflight: Promise<SyncResult> | null = null;
/** Whether the running cycle pulls. */
let inflightPulls = false;
let rerun = false;
let rerunPull = false;
/** Settles with the follow-up cycle, for a pull asked for while a push-only cycle runs. */
let followUp: { promise: Promise<SyncResult>; resolve: (r: Promise<SyncResult>) => void } | null = null;
let failures = 0;

async function cycle(opts: SyncOptions): Promise<SyncResult> {
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

    // A push-only cycle says nothing about pulling: it keeps an earlier failure on show (and its
    // retry backoff) until a full cycle gets through.
    const pullFailure = opts.pull === false && status.state === "error" && status.errorKind !== "rejected" ? status : null;
    setStatus({ state: "syncing", error: null });
    const result = await runSyncCycle(client, defaultDb, opts);
    if (pullFailure && result.rejected === 0) {
      setStatus(pullFailure);
      return { ok: true, state: "idle", pushed: result.pushed, pulled: 0, rejected: 0 };
    }
    failures = 0;
    const state: SyncState = result.rejected > 0 ? "error" : "idle";
    setStatus({
      state,
      ...(result.lastSyncAt ? { lastSyncAt: result.lastSyncAt } : {}),
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
 * Runs one push+pull cycle now (push only with `pull: false`). Concurrent calls share the
 * running cycle, and a call made while one is running triggers exactly one more cycle
 * afterwards (to pick up new writes), which pulls if any of those calls asked for a pull.
 */
export function syncNow({ pull = true }: SyncOptions = {}): Promise<SyncResult> {
  if (inflight) {
    rerun = true;
    rerunPull ||= pull;
    if (!pull || inflightPulls) return inflight;
    // The running cycle doesn't pull: answer with the follow-up that does (manual sync waits on it).
    if (!followUp) {
      let resolve!: (r: Promise<SyncResult>) => void;
      const promise = new Promise<SyncResult>((r) => (resolve = r));
      followUp = { promise, resolve };
    }
    return followUp.promise;
  }
  inflightPulls = pull;
  inflight = cycle({ pull }).finally(() => {
    inflight = null;
    if (rerun) {
      const next = rerunPull;
      const waiting = followUp;
      rerun = false;
      rerunPull = false;
      followUp = null;
      const again = syncNow({ pull: next });
      waiting?.resolve(again);
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
  // Its own timer, so a write does not cancel a pending retry.
  let pushTimer: ReturnType<typeof setTimeout> | undefined;
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

  void readSyncMeta(defaultDb)
    .then((m) => {
      if (m.last_sync_at && !status.lastSyncAt) setStatus({ lastSyncAt: m.last_sync_at });
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

  // Debounced push after local writes (no pull: remote changes come with the other kicks).
  // Every write re-queues its row with a newer queued_at.
  // The first emission only records the starting point; the initial kick below covers it.
  let newestQueued: string | null = null;
  let primed = false;
  const outboxWatch: Subscription = liveQuery(() => defaultDb.outbox.orderBy("queued_at").last()).subscribe({
    next(entry) {
      const queuedAt = entry?.queued_at ?? null;
      const isNewer = queuedAt !== null && (newestQueued === null || queuedAt > newestQueued);
      if (isNewer) newestQueued = queuedAt;
      if (primed && isNewer) {
        clearTimeout(pushTimer);
        pushTimer = setTimeout(() => void syncNow({ pull: false }), WRITE_DEBOUNCE_MS);
      }
      primed = true;
    },
    error() {},
  });

  // supabase-js re-emits SIGNED_IN for the same session when a tab comes back, and the
  // visibility kick covers that; only a new user (a real sign-in or a switch) syncs here.
  let knownUser: string | null | undefined;
  const { data: auth } = client.auth.onAuthStateChange((event, session) => {
    // Never await Supabase calls inside this callback; defer instead.
    const user = session?.user?.id ?? null;
    if (event === "INITIAL_SESSION") knownUser = user;
    if (event === "SIGNED_IN" && user !== knownUser) {
      knownUser = user;
      schedule(0);
    }
    if (event === "SIGNED_OUT") {
      knownUser = null;
      setStatus({ state: "disabled", error: null });
    }
  });

  const periodic = setInterval(() => {
    if (document.visibilityState === "visible") kick();
  }, PERIODIC_MS);

  kick();

  return {
    schedule,
    stop() {
      clearTimeout(timer);
      clearTimeout(pushTimer);
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
