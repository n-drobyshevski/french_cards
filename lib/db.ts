// On-device source of truth (IndexedDB via Dexie). The UI reads with useLiveQuery;
// lib/sync.ts mirrors these tables to Supabase.
import Dexie, { type EntityTable } from "dexie";
import type { Folder, ReorgRun, ReviewLog, ReviewState, Settings, Word } from "./types";

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
  }
}

export const db = new KartochkiDB();

export const nowIso = () => new Date().toISOString();
export const newId = () => crypto.randomUUID();
