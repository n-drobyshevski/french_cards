// JSON export of every table, and import that merges by updated_at (newer row wins).
import { EXERCISE_ITEM_TYPES } from "./core/exercises";
import { db, legacyReviewSets } from "./db";
import { DEFAULT_SETTINGS, SYNC_TABLES, type ExerciseItemType, type Settings, type SyncTable, type Syncable } from "./types";

export const BACKUP_FORMAT = "kartochki-backup";
export const BACKUP_VERSION = 1;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exported_at: string;
  tables: { [T in SyncTable]: Syncable[] } & { settings: Settings[] };
}

export interface TableImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  /** Of `updated`: rows live on this device that the backup marks deleted. */
  deleted: number;
}

export type ImportResult = Record<SyncTable, TableImportResult> & { settings: "kept" | "imported" | "absent" };

/** What `undoBackupImport` needs to put the device back as it was before an import. */
export interface BackupUndo {
  /** Local rows the import overwrote, as they were. */
  previous: { [T in SyncTable]: Syncable[] };
  /** Ids the import added. */
  inserted: { [T in SyncTable]: string[] };
  /** Settings before the import, when it replaced them. */
  settings?: Settings;
}

export interface AppliedImport extends ImportResult {
  undo: BackupUndo;
}

export class BackupError extends Error {}

/** Every row of every table, tombstones included, so deletions survive a round-trip. */
export async function exportBackup(now: Date = new Date()): Promise<BackupFile> {
  return db.transaction("r", [...SYNC_TABLES.map((t) => db.table(t)), db.settings], async () => {
    const entries = await Promise.all(SYNC_TABLES.map(async (t) => [t, await db.table<Syncable>(t).toArray()] as const));
    // Only the "settings" row: the "sync" row next to it is this device's sync bookkeeping.
    const settings = await db.settings.get("settings");
    return {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exported_at: now.toISOString(),
      tables: { ...(Object.fromEntries(entries) as { [T in SyncTable]: Syncable[] }), settings: settings ? [settings] : [] },
    };
  });
}

export async function exportBackupJson(now: Date = new Date()): Promise<string> {
  return JSON.stringify(await exportBackup(now), null, 2);
}

/** «kartochki-2026-10-21.json» */
export function backupFileName(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `kartochki-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
}

/** A Blob ready for a download link. */
export async function exportBackupBlob(now: Date = new Date()): Promise<Blob> {
  return new Blob([await exportBackupJson(now)], { type: "application/json" });
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function isRow(v: unknown): v is Syncable {
  return (
    isRecord(v) &&
    typeof v.id === "string" &&
    v.id.length > 0 &&
    typeof v.updated_at === "string" &&
    !Number.isNaN(Date.parse(v.updated_at)) &&
    (v.deleted_at === null || v.deleted_at === undefined || typeof v.deleted_at === "string")
  );
}

/** Minimal field checks per table so a broken file cannot plant rows the UI would crash on. */
const REQUIRED: Record<SyncTable, Record<string, "string" | "number" | "boolean" | "array">> = {
  folders: { slug: "string", name: "string", color: "string", sort: "number" },
  words: { fr: "string", ru: "string", slang_level: "number", created_at: "string" },
  review_state: { word_id: "string", direction: "string", due: "string", stability: "number", state: "number", reps: "number" },
  review_log: { word_id: "string", direction: "string", rating: "number", review: "string" },
  reorg_runs: { created_at: "string", moves: "array" },
  review_sets: { name: "string", created_at: "string", folders: "array", statuses: "array", slang: "array" },
  field_defs: { name: "string", sort: "number", ai_fill: "boolean" },
  exercise_sets: { title: "string", created_at: "string", folders: "array", items: "array", new_words: "array" },
  exercise_runs: { kind: "string", item_ids: "array", started_at: "string", answers: "array", total: "number" },
};

const isText = (v: unknown) => typeof v === "string";
const isOptionalText = (v: unknown) => v === null || v === undefined || typeof v === "string";

/** An exercise item the player can show: the arrays its type reads, and text where text goes. */
function isExerciseItem(v: unknown): boolean {
  if (!isRecord(v) || !isText(v.id) || !EXERCISE_ITEM_TYPES.includes(v.type as ExerciseItemType)) return false;
  if (![v.answer, v.prompt, v.sentence, v.sentence_ru, v.explain_ru, v.word_id, v.new_ref].every(isOptionalText)) return false;
  if ((v.type === "choice" || v.type === "cloze") && !(Array.isArray(v.distractors) && v.distractors.every(isText))) return false;
  if (v.type === "pairs") {
    const tiles = v.tiles;
    if (!Array.isArray(v.pairs) || !Array.isArray(tiles)) return false;
    if (!tiles.every((t) => isRecord(t) && isText(t.key) && isText(t.fr) && isText(t.ru))) return false;
  }
  return true;
}

/** Deeper checks for tables whose rows the UI reads inside (a set's items and new words). */
const DEEP: Partial<Record<SyncTable, (row: Record<string, unknown>) => boolean>> = {
  exercise_sets: (row) =>
    (row.items as unknown[]).every(isExerciseItem) &&
    (row.new_words as unknown[]).every((w) => isRecord(w) && isText(w.ref) && isText(w.fr) && isText(w.ru)),
};

function hasFields(table: SyncTable, row: Record<string, unknown>): boolean {
  const shallow = Object.entries(REQUIRED[table]).every(([k, t]) => (t === "array" ? Array.isArray(row[k]) : typeof row[k] === t));
  return shallow && (DEEP[table]?.(row) ?? true);
}

/** Parses and validates a backup file's text or object. Throws BackupError with a Russian message. */
export function parseBackup(input: string | unknown): BackupFile {
  let data: unknown = input;
  if (typeof input === "string") {
    try {
      data = JSON.parse(input);
    } catch {
      throw new BackupError("Файл не похож на JSON");
    }
  }
  if (!isRecord(data) || data.format !== BACKUP_FORMAT || !isRecord(data.tables)) {
    throw new BackupError("Это не резервная копия «Карточек»");
  }
  if (typeof data.version !== "number" || data.version > BACKUP_VERSION) {
    throw new BackupError("Копия сделана более новой версией приложения");
  }
  const tables = data.tables as Record<string, unknown>;
  for (const t of SYNC_TABLES) {
    if (tables[t] !== undefined && !Array.isArray(tables[t])) throw new BackupError(`Повреждена таблица ${t}`);
  }
  // Backups made while «Мои наборы» lived in Settings carry them there: import them as rows.
  if (tables.review_sets === undefined && Array.isArray(tables.settings)) {
    const settings = tables.settings.find((s) => isRecord(s)) as Record<string, unknown> | undefined;
    const at = typeof data.exported_at === "string" && !Number.isNaN(Date.parse(data.exported_at)) ? data.exported_at : new Date(0).toISOString();
    const legacy = legacyReviewSets(settings?.review_sets, at);
    if (legacy.length) tables.review_sets = legacy;
  }
  return data as unknown as BackupFile;
}

interface TablePlan {
  result: TableImportResult;
  /** Rows to write (missing locally, or newer than the local copy). */
  writes: Syncable[];
  /** The local rows those writes replace. */
  previous: Syncable[];
  inserted: string[];
}

/** Compares a backup table with the local rows: a row is taken when missing locally or newer. */
async function planTable(file: BackupFile, t: SyncTable): Promise<TablePlan> {
  const result: TableImportResult = { inserted: 0, updated: 0, skipped: 0, deleted: 0 };
  const incoming = ((file.tables[t] ?? []) as unknown[]).filter((r): r is Syncable => {
    const ok = isRow(r) && hasFields(t, r as unknown as Record<string, unknown>);
    if (!ok) result.skipped++;
    return ok;
  });
  const local = await db.table<Syncable, string>(t).bulkGet(incoming.map((r) => r.id));
  const plan: TablePlan = { result, writes: [], previous: [], inserted: [] };
  incoming.forEach((row, i) => {
    const mine = local[i];
    const normalized = { ...row, deleted_at: row.deleted_at ?? null };
    if (!mine) {
      plan.writes.push(normalized);
      plan.inserted.push(row.id);
      result.inserted++;
    } else if (Date.parse(row.updated_at) > Date.parse(mine.updated_at)) {
      plan.writes.push(normalized);
      plan.previous.push(mine);
      result.updated++;
      if (mine.deleted_at == null && normalized.deleted_at !== null) result.deleted++;
    } else {
      result.skipped++;
    }
  });
  return plan;
}

const IMPORT_TABLES = () => [...SYNC_TABLES.map((t) => db.table(t)), db.settings, db.outbox];

const incomingSettingsOf = (file: BackupFile) =>
  Array.isArray(file.tables.settings) ? file.tables.settings.find((s) => isRecord(s)) : undefined;

/** What `importBackup` would change, without writing anything (for the confirmation sheet). */
export async function previewBackupImport(
  input: string | unknown,
  opts: { includeSettings?: boolean } = {},
): Promise<ImportResult & { exported_at: string | null }> {
  const file = parseBackup(input);
  return db.transaction("r", IMPORT_TABLES(), async () => {
    const result = {} as ImportResult;
    for (const t of SYNC_TABLES) result[t] = (await planTable(file, t)).result;
    const incoming = incomingSettingsOf(file);
    result.settings = !incoming ? "absent" : opts.includeSettings || !(await db.settings.get("settings")) ? "imported" : "kept";
    const exported = typeof file.exported_at === "string" && !Number.isNaN(Date.parse(file.exported_at)) ? file.exported_at : null;
    return { ...result, exported_at: exported };
  });
}

/**
 * Merges a backup into the local db: a row is written when it is missing locally or its
 * `updated_at` is newer than the local copy; written rows get queued for sync by the outbox middleware. Invalid rows
 * are skipped. Local settings are kept unless `includeSettings` is set (or none exist yet).
 * The result carries `undo` for `undoBackupImport`.
 */
export async function importBackup(input: string | unknown, opts: { includeSettings?: boolean } = {}): Promise<AppliedImport> {
  const file = parseBackup(input);
  return db.transaction("rw", IMPORT_TABLES(), async () => {
    const result = {} as ImportResult;
    const undo: BackupUndo = {
      previous: {} as BackupUndo["previous"],
      inserted: {} as BackupUndo["inserted"],
    };
    for (const t of SYNC_TABLES) {
      const plan = await planTable(file, t);
      await db.table<Syncable, string>(t).bulkPut(plan.writes);
      result[t] = plan.result;
      undo.previous[t] = plan.previous;
      undo.inserted[t] = plan.inserted;
    }
    const incomingSettings = incomingSettingsOf(file);
    if (!incomingSettings) {
      result.settings = "absent";
    } else {
      const localSettings = await db.settings.get("settings");
      if (opts.includeSettings || !localSettings) {
        const merged: Settings = { ...DEFAULT_SETTINGS, ...localSettings, ...pickSettings(incomingSettings), id: "settings" };
        await db.settings.put(merged);
        result.settings = "imported";
        if (localSettings) undo.settings = localSettings;
      } else {
        result.settings = "kept";
      }
    }
    return { ...result, undo };
  });
}

/**
 * Undoes `importBackup`: overwritten rows get their previous content back and added rows are
 * soft-deleted, all stamped `now` so the undo also wins on other devices once synced.
 */
export async function undoBackupImport(undo: BackupUndo, now: Date = new Date()): Promise<void> {
  const iso = now.toISOString();
  await db.transaction("rw", IMPORT_TABLES(), async () => {
    for (const t of SYNC_TABLES) {
      const table = db.table<Syncable, string>(t);
      const previous = undo.previous[t] ?? [];
      if (previous.length) await table.bulkPut(previous.map((row) => ({ ...row, updated_at: iso })));
      const added = await table.bulkGet(undo.inserted[t] ?? []);
      const live = added.filter((row): row is Syncable => !!row && row.deleted_at == null);
      if (live.length) await table.bulkPut(live.map((row) => ({ ...row, deleted_at: iso, updated_at: iso })));
    }
    if (undo.settings) await db.settings.put(undo.settings);
  });
}

/** Only known settings keys with the right primitive type; device-specific last_sync_at is never imported. */
function pickSettings(s: Record<string, unknown>): Partial<Settings> {
  const out: Record<string, unknown> = {};
  for (const [k, def] of Object.entries(DEFAULT_SETTINGS)) {
    if (k === "id" || k === "last_sync_at") continue;
    if (k in s && typeof s[k] === typeof def) out[k] = s[k];
  }
  return out as Partial<Settings>;
}
