// Automatic change tracking for sync. A DBCore middleware adds the `outbox` store to every
// read-write transaction that touches a synced table and records `${table}:${id}` there in
// the same transaction, so a local write and its outbox entry commit (or roll back) together.
// Feature code never has to enqueue anything by hand.
//
// Kept free of imports from ./db so that lib/db.ts can call installOutboxTracking(this)
// from its constructor without an import cycle.
import type Dexie from "dexie";
import type {
  DBCore,
  DBCoreMutateRequest,
  DBCorePutRequest,
  DBCoreTable,
  DBCoreTransaction,
  Middleware,
  Transaction,
} from "dexie";
import { SYNC_TABLES, type SyncTable } from "./types";

const OUTBOX = "outbox";
const MIDDLEWARE_NAME = "kartochki-outbox";
const SKIP_FLAG = "__kartochkiSkipOutbox";

const syncTables = new Set<string>(SYNC_TABLES);

export const isSyncTable = (name: string): name is SyncTable => syncTables.has(name);

export const outboxKey = (table: string, id: string) => `${table}:${id}`;

type FlaggedTransaction = DBCoreTransaction & { [SKIP_FLAG]?: boolean };

/**
 * Marks a Dexie transaction as applying rows that came from the server, so the writes
 * inside it are not queued for upload again. Call it first thing inside `db.transaction(...)`.
 */
export function skipOutboxFor(tx: Transaction): void {
  (tx.idbtrans as unknown as FlaggedTransaction)[SKIP_FLAG] = true;
}

/** Monotonic ISO timestamp, so two writes in the same millisecond still order correctly. */
let lastQueuedMs = 0;
export function nextQueuedAt(): string {
  const now = Date.now();
  lastQueuedMs = now > lastQueuedMs ? now : lastQueuedMs + 1;
  return new Date(lastQueuedMs).toISOString();
}

function mutatedIds(req: DBCoreMutateRequest, failures: Record<number, Error>): string[] {
  if (req.type !== "add" && req.type !== "put") return [];
  const ids: string[] = [];
  req.values.forEach((value, i) => {
    if (failures[i]) return;
    const key = req.keys?.[i] ?? (value as { id?: unknown } | null)?.id;
    if (typeof key === "string" && key) ids.push(key);
  });
  return ids;
}

const rowKey = (req: DBCorePutRequest, i: number): unknown => req.keys?.[i] ?? (req.values[i] as { id?: unknown } | null)?.id;

/**
 * Local writes always order after the copy they replace. Device clocks drift, so a row pulled
 * from a device whose clock runs ahead can carry an updated_at later than this device's "now";
 * an edit made after that pull would then lose last-write-wins everywhere. Such writes get
 * updated_at = stored updated_at + 1 ms (a hybrid logical clock).
 */
async function orderAfterStored(table: DBCoreTable, req: DBCorePutRequest): Promise<DBCorePutRequest> {
  const keys = req.values.map((_, i) => rowKey(req, i));
  const lookup = keys.filter((k): k is string => typeof k === "string" && k.length > 0);
  if (lookup.length === 0) return req;
  const stored = await table.getMany({ trans: req.trans, keys: lookup });
  const storedAt = new Map<string, number>();
  lookup.forEach((key, i) => {
    const at = Date.parse((stored[i] as { updated_at?: string } | undefined)?.updated_at ?? "");
    if (!Number.isNaN(at)) storedAt.set(key, at);
  });
  if (storedAt.size === 0) return req;

  let changed = false;
  const values = req.values.map((value, i) => {
    const prev = storedAt.get(keys[i] as string);
    const next = Date.parse((value as { updated_at?: string } | null)?.updated_at ?? "");
    if (prev === undefined || Number.isNaN(next) || next > prev) return value;
    changed = true;
    return { ...(value as object), updated_at: new Date(prev + 1).toISOString() };
  });
  return changed ? { ...req, values } : req;
}

export const outboxMiddleware: Middleware<DBCore> = {
  stack: "dbcore",
  name: MIDDLEWARE_NAME,
  create(down) {
    const hasOutbox = down.schema.tables.some((t) => t.name === OUTBOX);
    if (!hasOutbox) return {};
    return {
      transaction(stores, mode, options) {
        const scope =
          mode === "readwrite" && !stores.includes(OUTBOX) && stores.some((s) => syncTables.has(s))
            ? [...stores, OUTBOX]
            : stores;
        return down.transaction(scope, mode, options);
      },
      table(name) {
        const table = down.table(name);
        if (!syncTables.has(name)) return table;
        return {
          ...table,
          async mutate(request) {
            const fromServer = (request.trans as FlaggedTransaction)[SKIP_FLAG] === true;
            const req = !fromServer && request.type === "put" ? await orderAfterStored(table, request) : request;
            const res = await table.mutate(req);
            if (fromServer) return res;
            const ids = mutatedIds(req, res.failures);
            if (ids.length === 0) return res;
            const queued_at = nextQueuedAt();
            await down.table(OUTBOX).mutate({
              type: "put",
              trans: req.trans,
              values: ids.map((id) => ({ key: outboxKey(name, id), table: name, id, queued_at })),
            });
            return res;
          },
        };
      },
    };
  },
};

/**
 * Registers the outbox middleware on a database. Must run before the database opens;
 * calling it again is a no-op because the middleware is registered by name.
 */
const installed = new WeakSet<Dexie>();

export function installOutboxTracking(database: Dexie): void {
  if (installed.has(database)) return;
  installed.add(database);
  if (database.isOpen() && process.env.NODE_ENV !== "production") {
    console.warn("[sync] installOutboxTracking() ran after the database opened; local changes are not queued until it reopens.");
  }
  database.use(outboxMiddleware);
}
