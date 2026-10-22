// On-device source of truth (IndexedDB via Dexie). The UI reads with useLiveQuery;
// lib/sync.ts mirrors these tables to Supabase.
import Dexie, { type EntityTable } from "dexie";
import { installOutboxTracking } from "./outbox";
import type { FieldDef, Folder, ReorgRun, ReviewLog, ReviewSet, ReviewState, Settings, Word } from "./types";

/** Local bookkeeping for sync: rows changed since the last successful push. */
export interface Outbox {
  key: string; // `${table}:${id}`
  table: string;
  id: string;
  queued_at: string;
}

export class KartochkiDB extends Dexie {
  folders!: EntityTable<Folder, "id">;
  words!: EntityTable<Word, "id">;
  review_state!: EntityTable<ReviewState, "id">;
  review_log!: EntityTable<ReviewLog, "id">;
  reorg_runs!: EntityTable<ReorgRun, "id">;
  review_sets!: EntityTable<ReviewSet, "id">;
  field_defs!: EntityTable<FieldDef, "id">;
  settings!: EntityTable<Settings, "id">;
  outbox!: EntityTable<Outbox, "key">;

  constructor(name = "kartochki") {
    super(name);
    this.version(1).stores({
      folders: "id, slug, sort, updated_at",
      words: "id, fr, ru, folder_id, slang_level, created_at, updated_at",
      review_state: "id, word_id, direction, due, state, updated_at",
      review_log: "id, word_id, review, updated_at",
      reorg_runs: "id, created_at, updated_at",
      settings: "id",
      outbox: "key, table, queued_at",
    });
    // «Мои наборы» move from Settings (device-local) into a synced table.
    this.version(2)
      .stores({ review_sets: "id, created_at, updated_at" })
      .upgrade(async (tx) => {
        const settings = await tx.table<Settings, string>("settings").get("settings");
        const legacy = legacyReviewSets(settings?.review_sets, new Date().toISOString());
        if (legacy.length) await tx.table<ReviewSet, string>("review_sets").bulkPut(legacy);
        if (settings && "review_sets" in settings) {
          const rest: Settings = { ...settings };
          delete rest.review_sets;
          await tx.table<Settings, string>("settings").put(rest);
        }
      });
    // «Свои поля»: shared custom field definitions (synced).
    this.version(3).stores({ field_defs: "id, sort, updated_at" });
    // Every write to a synced table queues `${table}:${id}` in outbox, in the same transaction.
    installOutboxTracking(this);
  }
}

export const db = new KartochkiDB();

/**
 * Sets stored the old way (an array in Settings, or in an old backup's settings) as table rows.
 * Kept free of other imports (lib/review-sets imports this module). Malformed entries are dropped.
 */
export function legacyReviewSets(raw: unknown, now: string): ReviewSet[] {
  if (!Array.isArray(raw)) return [];
  const out: ReviewSet[] = [];
  const seen = new Set<string>();
  const statuses = ["new", "learning", "difficult", "known"] as const;
  const slang = [0, 1, 2, 3, "verl"] as const;
  for (const v of raw) {
    if (!v || typeof v !== "object") continue;
    const r = v as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.replace(/\s+/g, " ").trim().slice(0, 40) : "";
    if (typeof r.id !== "string" || !r.id || seen.has(r.id) || !name) continue;
    seen.add(r.id);
    const list = (x: unknown) => (Array.isArray(x) ? x : []);
    out.push({
      id: r.id,
      name,
      folders: [...new Set(list(r.folders).filter((s): s is string => typeof s === "string" && s.length > 0))],
      statuses: statuses.filter((s) => list(r.statuses).includes(s)),
      slang: slang.filter((k) => list(r.slang).includes(k)),
      added: r.added === "week" || r.added === "month" ? r.added : "all",
      mode: r.mode === "practice" ? "practice" : "schedule",
      created_at: typeof r.created_at === "string" ? r.created_at : now,
      updated_at: now,
      deleted_at: null,
    });
  }
  return out;
}

export const nowIso = () => new Date().toISOString();
export { newId } from "./id";
