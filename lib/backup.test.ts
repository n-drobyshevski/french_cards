import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  backupFileName,
  BackupError,
  exportBackup,
  exportBackupJson,
  importBackup,
  parseBackup,
  previewBackupImport,
  undoBackupImport,
} from "./backup";
import { db } from "./db";
import { createFolder } from "./folders";
import { getSettings, updateSettings } from "./settings";
import type { Settings, Word } from "./types";
import { addWord, gradeCard, softDeleteWord } from "./words";

const T0 = new Date("2026-10-21T10:00:00.000Z");
const later = (s: number) => new Date(T0.getTime() + s * 1000);

const clearAll = () => Promise.all(db.tables.map((t) => t.clear()));

async function sampleData() {
  const folder = await createFolder({ name: "Деньги" }, T0);
  const thune = await addWord({ fr: "la thune", ru: "бабки", folder_id: folder.id }, T0);
  const gone = await addWord({ fr: "gone", ru: "x" }, T0);
  await gradeCard(thune.id, "fr_ru", 3, later(10));
  await softDeleteWord(gone.id, later(20));
  await updateSettings({ new_per_day: 7 });
  return { folder, thune, gone };
}

beforeEach(clearAll);

describe("export", () => {
  it("includes every table and tombstones", async () => {
    const { gone } = await sampleData();
    const file = await exportBackup(later(30));
    expect(file.format).toBe("kartochki-backup");
    expect(file.version).toBe(1);
    expect(file.exported_at).toBe(later(30).toISOString());
    expect(file.tables.folders).toHaveLength(1);
    expect(file.tables.words).toHaveLength(2);
    expect(file.tables.review_state).toHaveLength(4);
    expect(file.tables.review_log).toHaveLength(1);
    expect(file.tables.reorg_runs).toEqual([]);
    expect(file.tables.progress_days).toEqual([]);
    expect(file.tables.settings[0]).toMatchObject({ new_per_day: 7 });
    expect((file.tables.words as Word[]).find((w) => w.id === gone.id)?.deleted_at).not.toBeNull();
  });

  it("names the file by local date", () => {
    expect(backupFileName(new Date(2026, 0, 5, 12))).toBe("kartochki-2026-01-05.json");
  });
});

describe("import", () => {
  it("round-trips into an empty db and queues everything for sync", async () => {
    await sampleData();
    const json = await exportBackupJson(later(30));
    const before = await exportBackup(later(30));
    await clearAll();
    const res = await importBackup(json);
    expect(res.words).toEqual({ inserted: 2, updated: 0, skipped: 0, deleted: 0 });
    expect(res.review_state.inserted).toBe(4);
    expect(res.settings).toBe("imported");
    const after = await exportBackup(later(30));
    expect(after.tables.words).toEqual(before.tables.words);
    expect(after.tables.review_state).toEqual(before.tables.review_state);
    expect(after.tables.review_log).toEqual(before.tables.review_log);
    expect((await getSettings()).new_per_day).toBe(7);
    expect(await db.outbox.count()).toBe(1 + 2 + 4 + 1);
  });

  it("merges by updated_at: newer rows win, older ones are skipped", async () => {
    const { thune } = await sampleData();
    const file = await exportBackup(later(30));
    const words = file.tables.words as Word[];
    const fileThune = words.find((w) => w.id === thune.id)!;

    // local edit is newer than the backup → kept
    await db.words.update(thune.id, { ru: "local", updated_at: later(100).toISOString() });
    // a word that only exists in the backup and a newer remote edit of another
    const extra: Word = { ...fileThune, id: "extra-id", fr: "le fric", ru: "бабло", updated_at: later(5).toISOString() };
    const newerFolder = { ...file.tables.folders[0], name: "Бабки", updated_at: later(200).toISOString() };
    const res = await importBackup({ ...file, tables: { ...file.tables, words: [...words, extra], folders: [newerFolder] } });

    expect((await db.words.get(thune.id))?.ru).toBe("local");
    expect(await db.words.get("extra-id")).toMatchObject({ fr: "le fric" });
    expect((await db.folders.get(newerFolder.id))?.name).toBe("Бабки");
    expect(res.words).toEqual({ inserted: 1, updated: 0, skipped: 2, deleted: 0 });
    expect(res.folders).toEqual({ inserted: 0, updated: 1, skipped: 0, deleted: 0 });
    expect(res.settings).toBe("kept");
  });

  it("applies newer tombstones", async () => {
    const { thune } = await sampleData();
    const file = await exportBackup(later(30));
    const words = (file.tables.words as Word[]).map((w) =>
      w.id === thune.id ? { ...w, deleted_at: later(50).toISOString(), updated_at: later(50).toISOString() } : w,
    );
    await importBackup({ ...file, tables: { ...file.tables, words } });
    expect((await db.words.get(thune.id))?.deleted_at).toBe(later(50).toISOString());
  });

  it("previews the changes without writing anything", async () => {
    const { thune } = await sampleData();
    const file = await exportBackup(later(30));
    const words = (file.tables.words as Word[]).map((w) =>
      w.id === thune.id ? { ...w, deleted_at: later(50).toISOString(), updated_at: later(50).toISOString() } : w,
    );
    const extra: Word = { ...words[0], id: "extra-id", fr: "le fric", deleted_at: null, updated_at: later(5).toISOString() };
    const outbox = await db.outbox.count();

    const preview = await previewBackupImport({ ...file, tables: { ...file.tables, words: [...words, extra] } });

    expect(preview.words).toEqual({ inserted: 1, updated: 1, skipped: 1, deleted: 1 });
    expect(preview.exported_at).toBe(later(30).toISOString());
    expect(preview.settings).toBe("kept");
    expect(await db.words.get("extra-id")).toBeUndefined();
    expect((await db.words.get(thune.id))?.deleted_at).toBeNull();
    expect(await db.outbox.count()).toBe(outbox);
  });

  it("undoes an import: overwritten rows come back and added rows are deleted", async () => {
    const { thune, folder } = await sampleData();
    const file = await exportBackup(later(30));
    const words = (file.tables.words as Word[]).map((w) =>
      w.id === thune.id ? { ...w, ru: "из копии", deleted_at: later(50).toISOString(), updated_at: later(50).toISOString() } : w,
    );
    const extra: Word = { ...words[0], id: "extra-id", fr: "le fric", deleted_at: null, updated_at: later(5).toISOString() };
    const folders = [{ ...file.tables.folders[0], name: "Бабки", updated_at: later(60).toISOString() }];
    await updateSettings({ new_per_day: 20 });

    const applied = await importBackup(
      { ...file, tables: { ...file.tables, words: [...words, extra], folders } },
      { includeSettings: true },
    );
    expect((await db.words.get(thune.id))?.deleted_at).not.toBeNull();
    expect((await getSettings()).new_per_day).toBe(7);

    await undoBackupImport(applied.undo, later(70));

    const restored = await db.words.get(thune.id);
    expect(restored).toMatchObject({ ru: "бабки", deleted_at: null, updated_at: later(70).toISOString() });
    expect((await db.folders.get(folder.id))?.name).toBe("Деньги");
    expect((await db.words.get("extra-id"))?.deleted_at).toBe(later(70).toISOString());
    expect((await getSettings()).new_per_day).toBe(20);
    expect(await db.outbox.get(`words:${thune.id}`)).toBeDefined();
  });

  it("imports settings only when asked (or when none exist)", async () => {
    await sampleData();
    const file = await exportBackup(later(30));
    await updateSettings({ new_per_day: 20, last_sync_at: "x" });
    expect((await importBackup(file)).settings).toBe("kept");
    expect((await getSettings()).new_per_day).toBe(20);
    expect((await importBackup(file, { includeSettings: true })).settings).toBe("imported");
    const s = await getSettings();
    expect(s.new_per_day).toBe(7);
    expect(s.last_sync_at).toBe("x");
  });

  it("leaves the device's sync bookkeeping out of the export", async () => {
    await sampleData();
    await db.table("settings").put({ id: "sync", last_sync_at: "x", sync_cursors: { words: "x" } });
    const file = await exportBackup(later(30));
    expect(file.tables.settings.map((s) => s.id)).toEqual(["settings"]);
  });

  it("round-trips the shortcuts setting and defaults it for old backups", async () => {
    await sampleData();
    await updateSettings({ shortcuts: false });
    const file = await exportBackup(later(30));
    expect(file.tables.settings[0]).toMatchObject({ shortcuts: false });

    await updateSettings({ shortcuts: true });
    await importBackup(file, { includeSettings: true });
    expect((await getSettings()).shortcuts).toBe(false);

    // A backup from before the setting existed keeps the local value.
    const old = {
      ...file,
      tables: {
        ...file.tables,
        settings: file.tables.settings.map((row) => {
          const rest: Partial<Settings> = { ...row };
          delete rest.shortcuts;
          return rest;
        }),
      },
    };
    await updateSettings({ shortcuts: true });
    await importBackup(old, { includeSettings: true });
    expect((await getSettings()).shortcuts).toBe(true);
  });

  it("skips malformed rows", async () => {
    const res = await importBackup({
      format: "kartochki-backup",
      version: 1,
      exported_at: T0.toISOString(),
      tables: {
        words: [{ id: "a" }, { id: "b", updated_at: "nope", fr: "x", ru: "y", slang_level: 0, created_at: "z" }, "junk"],
        folders: [],
      },
    });
    expect(res.words).toEqual({ inserted: 0, updated: 0, skipped: 3, deleted: 0 });
    expect(res.review_log).toEqual({ inserted: 0, updated: 0, skipped: 0, deleted: 0 });
    expect(res.settings).toBe("absent");
    expect(await db.words.count()).toBe(0);
  });

  it("round-trips exercise sets and runs, and imports old backups without them", async () => {
    const set = {
      id: "x-1",
      title: "Сленг",
      topic: null,
      folders: [],
      items: [{ id: "q1", type: "register", word_id: "w-1", new_ref: null, answer: "fam.", distractors: [], pairs: [], tiles: [] }],
      new_words: [],
      source: "chat",
      created_at: T0.toISOString(),
      updated_at: T0.toISOString(),
      deleted_at: null,
    };
    const run = {
      id: "r-1",
      set_id: "x-1",
      kind: "set",
      item_ids: [],
      started_at: T0.toISOString(),
      finished_at: null,
      answers: [{ item_id: "q1", word_id: null, new_ref: null, attempt: 1, outcome: "correct", chosen: "fam.", ms: 800, at: T0.toISOString() }],
      total: 1,
      first_try: 1,
      updated_at: T0.toISOString(),
      deleted_at: null,
    };
    await db.exercise_sets.put(set as never);
    await db.exercise_runs.put(run as never);
    const json = await exportBackupJson(later(30));
    await clearAll();
    const res = await importBackup(json);
    expect(res.exercise_sets).toEqual({ inserted: 1, updated: 0, skipped: 0, deleted: 0 });
    expect(res.exercise_runs).toEqual({ inserted: 1, updated: 0, skipped: 0, deleted: 0 });
    // A set from before migrations 0013 / 0017 has no scope or level: an ordinary set (null, no level).
    expect(await db.exercise_sets.get("x-1")).toEqual({ ...set, scope: null, levels: [], level_auto: false });
    expect(await db.exercise_runs.get("r-1")).toEqual(run);
    expect((await db.outbox.toArray()).map((o) => o.key)).toEqual(expect.arrayContaining(["exercise_sets:x-1", "exercise_runs:r-1"]));

    const malformed = await importBackup({
      format: "kartochki-backup",
      version: 1,
      exported_at: T0.toISOString(),
      tables: {
        exercise_sets: [
          { ...set, id: "x-2", items: "nope" },
          { ...set, id: "x-3", new_words: undefined },
          // A pairs item without its tiles, a choice without distractors, an unknown type: the player would crash on them.
          { ...set, id: "x-4", items: [{ id: "q1", type: "pairs", pairs: ["w-1"] }] },
          { ...set, id: "x-5", items: [{ id: "q1", type: "choice", answer: "девушка" }] },
          { ...set, id: "x-6", items: [{ id: "q1", type: "typed" }] },
          { ...set, id: "x-7", new_words: [{ ref: "n1" }] },
          { ...set, id: "x-8", scope: "sometimes" },
          // A conjugate item needs its tense, person and sentence (the card header and the gap).
          { ...set, id: "x-10", items: [{ id: "q1", type: "conjugate", tense: "futur", person: "elle", sentence: "elle [[kiffera]]", distractors: [] }] },
          { ...set, id: "x-12", items: [{ id: "q1", type: "conjugate", tense: "subjonctif", person: "tu", sentence: "tu [[kiffes]]", distractors: [] }] },
          { ...set, id: "x-13", items: [{ id: "q1", type: "conjugate", tense: "futur", person: "tu", distractors: [] }] },
          { ...set, id: "x-14", items: [{ id: "q1", type: "conjugate", tense: "futur", person: "tu", sentence: "tu [[kifferas]]" }] },
          { ...set, id: "x-11", items: [{ id: "q1", type: "conjugate", tense: "futur", person: "tu", sentence: "tu [[kifferas]]", answer: "kifferas", distractors: ["kiffes", "kiffais", "as kiffé"] }] },
        ],
        exercise_runs: [
          { ...run, id: "r-2", answers: null },
          { ...run, id: "r-3", item_ids: undefined },
        ],
      },
    });
    expect(malformed.exercise_sets.skipped).toBe(11);
    expect(malformed.exercise_sets.inserted).toBe(1);
    expect(await db.exercise_sets.count()).toBe(2);
    expect(malformed.exercise_runs.skipped).toBe(2);

    // A scoped set («Трудные · все темы») keeps its scope through export and import, a set's level its level.
    await clearAll();
    await db.exercise_sets.put({ ...set, id: "x-9", scope: "difficult" } as never);
    await db.exercise_sets.put({ ...set, id: "x-10", scope: null, levels: ["B2", "B1", "C2"], level_auto: true } as never);
    await db.exercise_sets.put({ ...set, id: "x-12", scope: null, levels: ["Z9"], level_auto: true } as never);
    const scopedJson = await exportBackupJson(later(30));
    await clearAll();
    expect((await importBackup(scopedJson)).exercise_sets).toEqual({ inserted: 3, updated: 0, skipped: 0, deleted: 0 });
    expect(await db.exercise_sets.get("x-9")).toEqual({ ...set, id: "x-9", scope: "difficult", levels: [], level_auto: false });
    expect(await db.exercise_sets.get("x-10")).toMatchObject({ levels: ["B1", "B2", "C1"], level_auto: true });
    expect(await db.exercise_sets.get("x-12")).toMatchObject({ levels: [], level_auto: false });

    await clearAll();
    const old = await importBackup({ format: "kartochki-backup", version: 1, exported_at: T0.toISOString(), tables: { words: [], folders: [] } });
    expect(old.exercise_sets).toEqual({ inserted: 0, updated: 0, skipped: 0, deleted: 0 });
    expect(await db.exercise_sets.count()).toBe(0);
  });

  it("round-trips «Прогресс» days and skips malformed ones", async () => {
    const day = {
      id: "2026-10-20", known: 3, learning: 2, fresh: 1, difficult: 1, paused: 0, total: 6, memorized: 4.2, reviews: 12, again: 2,
      new_introduced: 1, added: 0, source: "live", algo: "v5.4.2 using FSRS-6.0", updated_at: T0.toISOString(), deleted_at: null,
    };
    const res = await importBackup({
      format: "kartochki-backup",
      version: 1,
      exported_at: T0.toISOString(),
      tables: { progress_days: [day, { ...day, id: "2026-10-21", known: "3" }] },
    });
    expect(res.progress_days).toEqual({ inserted: 1, updated: 0, skipped: 1, deleted: 0 });
    expect(await db.progress_days.get("2026-10-20")).toEqual(day);
    expect((await exportBackup(later(30))).tables.progress_days).toEqual([day]);
  });

  it("rejects files that are not backups", () => {
    expect(() => parseBackup("{oops")).toThrow(BackupError);
    expect(() => parseBackup({ format: "other", tables: {} })).toThrow(/не резервная копия/);
    expect(() => parseBackup({ format: "kartochki-backup", version: 99, tables: {} })).toThrow(/новой версией/);
    expect(() => parseBackup({ format: "kartochki-backup", version: 1, tables: { words: {} } })).toThrow(BackupError);
  });
});


describe("«Уровень языка» in backups", () => {
  it("keeps a stored level and fills older rows with none", async () => {
    const w = await addWord({ fr: "le loyer", ru: "квартплата", cefr: "B1", cefr_source: "ai" }, T0);
    const json = await exportBackupJson(later(30));
    await clearAll();
    await importBackup(json);
    expect(await db.words.get(w.id)).toMatchObject({ cefr: "B1", cefr_source: "ai" });

    // A row from before migration 0014, and one with junk in the columns.
    const old: Partial<Word> = { ...w };
    delete old.cefr;
    delete old.cefr_source;
    await clearAll();
    await importBackup({
      format: "kartochki-backup",
      version: 1,
      exported_at: T0.toISOString(),
      tables: { words: [{ ...old, id: "w-old" }, { ...old, id: "w-junk", cefr: "B9", cefr_source: "who" }, { ...old, id: "w-nosrc", cefr: "C1" }] },
    });
    expect(await db.words.get("w-old")).toMatchObject({ cefr: null, cefr_source: null });
    expect(await db.words.get("w-junk")).toMatchObject({ cefr: null, cefr_source: null });
    expect(await db.words.get("w-nosrc")).toMatchObject({ cefr: "C1", cefr_source: "user" });
  });
});
