// Supabase row shapes shared by the app's sync and the server (no Dexie): the synced columns per
// table and the mapping to and from local rows. lib/sync.ts re-exports them.
import type { SyncTable } from "../types";

export type Row = Record<string, unknown> & { id: string; updated_at: string };

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
