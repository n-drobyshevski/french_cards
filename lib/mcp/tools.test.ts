import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import { resetRateLimits } from "@/lib/ai/rate-limit";
import { defaultFolderId } from "@/lib/core/folders";
import { buildWord, type NewWordInput } from "@/lib/core/words";
import { folderOrderOf, planDay } from "@/lib/core/plan";
import { LEGACY_STUDY_PLAN, parseStudyPlan, type StudyPlan } from "@/lib/core/study-plan";
import { newReviewState, retrievability } from "@/lib/scheduler";
import type { ExerciseRun, ExerciseSet, FieldDef, Folder, ReviewLog, ReviewState, UserPref, Word } from "@/lib/types";
import { createFakeRepo, type FakeRepo } from "./fake-repo";
import { RepoError } from "./repo";
import {
  addWords,
  callTool,
  createExerciseSet,
  createField,
  createFolder,
  deleteExerciseSet,
  deleteField,
  deleteFolder,
  deleteWords,
  exerciseMaterial,
  exerciseSetId,
  focusItemCount,
  listExerciseSets,
  listFields,
  scopeSuggestedItems,
  listFolders,
  moveWords,
  resolveFolder,
  restoreExerciseSet,
  restoreField,
  restoreFolder,
  restoreMoves,
  restoreWords,
  searchWords,
  setWordLevels,
  stampAfter,
  studySummary,
  updateField,
  updateFolder,
  updateWord,
  type ToolSpec,
} from "./tools";

const NOW = new Date("2026-10-22T10:00:00.000Z");
const OLD = new Date("2026-10-01T09:00:00.000Z");

const folder = (slug: string, name: string, extra: Partial<Folder> = {}): Folder => ({
  id: `f-${slug}`,
  slug,
  name,
  description: null,
  color: "#5a5a57",
  created_by: "user",
  locked: false,
  sort: 0,
  updated_at: OLD.toISOString(),
  deleted_at: null,
  ...extra,
});

const word = (id: string, fr: string, ru: string, extra: Partial<NewWordInput> = {}) => buildWord({ id, fr, ru, ...extra }, OLD);
const cards = (wordId: string, both = true): ReviewState[] =>
  (both ? (["fr_ru", "ru_fr"] as const) : (["fr_ru"] as const)).map((d) => newReviewState(wordId, d, OLD));

const FOLDERS = [
  folder("dengi", "Деньги", { sort: 0 }),
  folder("emotsii", "Эмоции", { sort: 1 }),
  folder("zamok", "Замок", { sort: 2, locked: true }),
  folder("old", "Старое", { sort: 3, deleted_at: OLD.toISOString() }),
];

const planRow = (value: StudyPlan): UserPref => ({ id: "study_plan", value, updated_at: OLD.toISOString(), deleted_at: null });
const legacyPlanRow = (newWords: number) => planRow({ ...LEGACY_STUDY_PLAN, new_words: newWords });

const deps = (fake: FakeRepo) => ({ repo: fake.repo, userId: "user-1", timeZone: "Europe/Paris", now: () => NOW });

async function ok<S extends z.ZodObject, O extends Record<string, unknown>>(spec: ToolSpec<S, O>, fake: FakeRepo, args: unknown): Promise<O> {
  const res = await callTool(spec, deps(fake), args);
  if (res.isError) throw new Error(`${spec.name}: ${JSON.stringify(res.content)}`);
  expect(JSON.parse((res.content[0] as { text: string }).text)).toEqual(res.structuredContent);
  return res.structuredContent as O;
}

async function refused<S extends z.ZodObject, O extends Record<string, unknown>>(spec: ToolSpec<S, O>, fake: FakeRepo, args: unknown): Promise<string> {
  const res = await callTool(spec, deps(fake), args);
  expect(res.isError).toBe(true);
  return (res.content[0] as { text: string }).text;
}

beforeEach(() => resetRateLimits());

describe("stampAfter", () => {
  it("uses now, or 1 ms past a stored value from a clock running ahead", () => {
    expect(stampAfter(NOW, OLD.toISOString())).toBe(NOW.toISOString());
    expect(stampAfter(NOW, "2027-01-01T00:00:00.000+00:00")).toBe("2027-01-01T00:00:00.001Z");
    expect(stampAfter(NOW, null)).toBe(NOW.toISOString());
  });
});

describe("resolveFolder", () => {
  it("accepts an id, slug, Russian name or inbox, and refuses deleted or unknown themes", () => {
    expect(resolveFolder("f-dengi", FOLDERS)?.name).toBe("Деньги");
    expect(resolveFolder("emotsii", FOLDERS)?.name).toBe("Эмоции");
    expect(resolveFolder("деньги", FOLDERS)?.id).toBe("f-dengi");
    expect(resolveFolder("inbox", FOLDERS)).toBeNull();
    expect(resolveFolder("Входящие", FOLDERS)).toBeNull();
    expect(() => resolveFolder("Старое", FOLDERS)).toThrow(/deleted/);
    expect(() => resolveFolder("Работа", FOLDERS)).toThrow(/Unknown theme/);
  });
});

describe("add_words", () => {
  it("saves a word with every default, source chat, and two cards written before the word", async () => {
    const fake = createFakeRepo({ folders: FOLDERS });
    const out = await ok(addWords, fake, {
      words: [{ fr: "  avoir   le seum ", ru: "беситься", slang_level: 1, example_fr: "J'ai le seum.", example_ru: "Я в бешенстве." }],
      folder: "Эмоции",
      folder_chosen_by_user: true,
    });
    expect(out.added).toHaveLength(1);
    const saved = [...fake.tables.words.values()][0];
    expect(saved).toMatchObject({
      fr: "avoir le seum",
      ru: "беситься",
      pos: "other",
      gender: "none",
      slang_level: 1,
      verlan: false,
      both_directions: true,
      folder_id: "f-emotsii",
      folder_source: "user",
      folder_confidence: null,
      source: "chat",
      example_ru: "Я в бешенстве.",
      created_at: NOW.toISOString(),
      updated_at: NOW.toISOString(),
      deleted_at: null,
    });
    expect([...fake.tables.review_state.values()].map((s) => s.id).sort()).toEqual([`${saved.id}:fr_ru`, `${saved.id}:ru_fr`]);
    expect(fake.writes.map((w) => w.table)).toEqual(["review_state", "words"]);
    expect(out.undo).toEqual({ tool: "delete_words", ids: [saved.id] });
  });

  it("files a theme Claude picked as auto with medium confidence, and the inbox with none", async () => {
    const fake = createFakeRepo({ folders: FOLDERS });
    await ok(addWords, fake, {
      words: [{ fr: "la thune", ru: "бабки", pos: "noun", gender: "f" }, { fr: "kiffer", ru: "тащиться", folder: "inbox" }],
      folder: "dengi",
      folder_chosen_by_user: false,
    });
    const byFr = new Map([...fake.tables.words.values()].map((w) => [w.fr, w]));
    expect(byFr.get("la thune")).toMatchObject({ folder_id: "f-dengi", folder_source: "auto", folder_confidence: "med", gender: "f" });
    expect(byFr.get("kiffer")).toMatchObject({ folder_id: null, folder_source: "auto", folder_confidence: null });
  });

  it("takes folder_chosen_by_user per word, next to the per-word folder", async () => {
    const fake = createFakeRepo({ folders: FOLDERS });
    await ok(addWords, fake, {
      words: [
        { fr: "avoir le seum", ru: "беситься", folder: "Эмоции", folder_chosen_by_user: true },
        { fr: "la thune", ru: "бабки", folder: "dengi" },
      ],
      folder_chosen_by_user: false,
    });
    const byFr = new Map([...fake.tables.words.values()].map((w) => [w.fr, w]));
    expect(byFr.get("avoir le seum")).toMatchObject({ folder_id: "f-emotsii", folder_source: "user", folder_confidence: null });
    expect(byFr.get("la thune")).toMatchObject({ folder_id: "f-dengi", folder_source: "auto", folder_confidence: "med" });
  });

  it("keeps gender for nouns only, drops example_ru without example_fr, and honours both_directions", async () => {
    const fake = createFakeRepo();
    await ok(addWords, fake, {
      words: [{ fr: "chelou", ru: "странный", pos: "adj", gender: "m", example_ru: "висит в воздухе", verlan: true, both_directions: false }],
      folder_chosen_by_user: false,
    });
    const saved = [...fake.tables.words.values()][0];
    expect(saved).toMatchObject({ gender: "none", example_fr: null, example_ru: null, verlan: true, both_directions: false });
    expect([...fake.tables.review_state.keys()]).toEqual([`${saved.id}:fr_ru`]);
  });

  it("skips duplicates by lemma (articles, case, apostrophes) against live words and within the call", async () => {
    const fake = createFakeRepo({
      folders: FOLDERS,
      words: [word("w1", "Thune", "деньги", { folder_id: "f-dengi" }), word("w2", "pote", "друг"), { ...word("w3", "meuf", "девушка"), deleted_at: OLD.toISOString() }],
    });
    const out = await ok(addWords, fake, {
      words: [
        { fr: "la thune", ru: "бабки" },
        { fr: "meuf", ru: "девушка" },
        { fr: "c’est ouf", ru: "это безумие" },
        { fr: "C'est ouf !", ru: "офигеть" },
      ],
      folder_chosen_by_user: false,
    });
    expect(out.added.map((w) => w.fr)).toEqual(["meuf", "c’est ouf"]);
    expect(out.duplicates.map((d) => [d.fr, d.existing.id])).toEqual([
      ["la thune", "w1"],
      ["C'est ouf !", out.added[1].id],
    ]);
    expect(out.duplicates[0].existing.folder).toEqual({ id: "f-dengi", name: "Деньги" });
  });

  it("adds a duplicate anyway with on_duplicate add", async () => {
    const fake = createFakeRepo({ words: [word("w1", "thune", "деньги")] });
    const out = await ok(addWords, fake, { words: [{ fr: "la thune", ru: "бабки" }], folder_chosen_by_user: false, on_duplicate: "add" });
    expect(out.added).toHaveLength(1);
    expect(fake.tables.words.size).toBe(2);
  });

  it("refuses an unknown theme before writing anything", async () => {
    const fake = createFakeRepo({ folders: FOLDERS });
    const message = await refused(addWords, fake, { words: [{ fr: "flic", ru: "мент", folder: "Полиция" }], folder_chosen_by_user: true });
    expect(message).toMatch(/Unknown theme "Полиция"/);
    expect(fake.writes).toHaveLength(0);
  });

  it("soft-deletes the cards when the word insert fails", async () => {
    const fake = createFakeRepo();
    fake.beforeUpsert = (table) => {
      if (table === "words") throw new RepoError("words: boom");
    };
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const message = await refused(addWords, fake, { words: [{ fr: "bouffer", ru: "жрать" }], folder_chosen_by_user: false });
    expect(message).toMatch(/database refused or did not answer: words: boom\. Part of the change may be saved/);
    expect(logged).toHaveBeenCalledWith("[mcp] add_words: words: boom");
    logged.mockRestore();
    expect(fake.tables.words.size).toBe(0);
    const states = [...fake.tables.review_state.values()];
    expect(states).toHaveLength(2);
    expect(states.every((s) => s.deleted_at !== null && Date.parse(s.updated_at) > NOW.getTime())).toBe(true);
  });

  it("keeps the cards when the word insert committed but its answer was lost", async () => {
    const fake = createFakeRepo();
    const upsert = fake.repo.upsert;
    fake.repo.upsert = async (table, rows) => {
      const out = await upsert(table, rows);
      if (table === "words") throw new RepoError("words: fetch failed");
      return out;
    };
    vi.spyOn(console, "error").mockImplementationOnce(() => undefined);
    await refused(addWords, fake, { words: [{ fr: "bouffer", ru: "жрать" }], folder_chosen_by_user: false });
    expect(fake.tables.words.size).toBe(1);
    expect([...fake.tables.review_state.values()].map((s) => s.deleted_at)).toEqual([null, null]);
  });

  it("rejects bad input like the SDK would", async () => {
    const fake = createFakeRepo();
    expect(await refused(addWords, fake, { words: [], folder_chosen_by_user: true })).toMatch(/words/);
    expect(await refused(addWords, fake, { words: [{ fr: "x", ru: "y", slang_level: 5 }], folder_chosen_by_user: true })).toMatch(/slang_level/);
  });
});

describe("update_word", () => {
  it("bumps updated_at past a stored value from the future and applies the client rules", async () => {
    const future = "2027-03-01T00:00:00.000Z";
    const fake = createFakeRepo({ words: [{ ...word("w1", "la thune", "деньги", { pos: "noun", gender: "f" }), updated_at: future }] });
    const out = await ok(updateWord, fake, { id: "w1", patch: { pos: "expression", note: "  арго ", example_fr: null } });
    expect(out.status).toBe("updated");
    expect(fake.tables.words.get("w1")).toMatchObject({ pos: "expression", gender: "none", note: "арго", updated_at: "2027-03-01T00:00:00.001Z" });
  });

  it("keeps the word's further examples («+ Ещё пример»), which it does not edit", async () => {
    const extra = [{ fr: "j'ai pas une thune", ru: "у меня ни гроша" }];
    const fake = createFakeRepo({ folders: FOLDERS, words: [word("w1", "la thune", "деньги", { example_fr: "file-moi de la thune", extra_examples: extra })] });
    await ok(updateWord, fake, { id: "w1", patch: { ru: "бабки", example_fr: null } });
    expect(fake.tables.words.get("w1")).toMatchObject({ ru: "бабки", example_fr: null, extra_examples: extra });
    await ok(moveWords, fake, { ids: ["w1"], folder: "Деньги" });
    expect(fake.tables.words.get("w1")).toMatchObject({ folder_id: "f-dengi", extra_examples: extra });
    const found = await ok(searchWords, fake, { query: "thune" });
    expect(found.words[0].extra_examples).toEqual(extra);
  });

  it("toggles the RU→FR card with both_directions, keeping its progress", async () => {
    const progressed = { ...cards("w1")[1], state: 2 as const, reps: 4, stability: 9 };
    const fake = createFakeRepo({ words: [word("w1", "pote", "друг")], review_state: [cards("w1")[0], progressed] });
    await ok(updateWord, fake, { id: "w1", patch: { both_directions: false } });
    expect(fake.tables.words.get("w1")?.both_directions).toBe(false);
    expect(fake.tables.review_state.get("w1:ru_fr")?.deleted_at).toBe(NOW.toISOString());
    expect(fake.tables.review_state.get("w1:fr_ru")?.deleted_at).toBeNull();

    const later = new Date(NOW.getTime() + 60_000);
    const res = await callTool(updateWord, { ...deps(fake), now: () => later }, { id: "w1", patch: { both_directions: true } });
    expect(res.isError).toBeFalsy();
    expect(fake.tables.review_state.get("w1:ru_fr")).toMatchObject({ deleted_at: null, reps: 4, stability: 9, updated_at: later.toISOString() });
  });

  it("reports a conflict when the app saved a newer version meanwhile", async () => {
    const fake = createFakeRepo({ words: [word("w1", "pote", "друг")] });
    fake.beforeUpsert = (table) => {
      if (table !== "words") return;
      const stored = fake.tables.words.get("w1")!;
      fake.tables.words.set("w1", { ...stored, ru: "кореш", updated_at: "2030-01-01T00:00:00.000Z" });
    };
    const out = await ok(updateWord, fake, { id: "w1", patch: { ru: "приятель" } });
    expect(out.status).toBe("conflict");
    expect(fake.tables.words.get("w1")?.ru).toBe("кореш");
  });

  it("does not overwrite a change made after its read, even one with an older timestamp", async () => {
    // A parallel call wrote the word between this call's read and its write, stamped before this call's now.
    const fake = createFakeRepo({ words: [word("w1", "pote", "друг")] });
    fake.beforeUpsert = (table) => {
      if (table !== "words") return;
      const stored = fake.tables.words.get("w1")!;
      fake.tables.words.set("w1", { ...stored, folder_id: "f-dengi", updated_at: new Date(NOW.getTime() - 1000).toISOString() });
    };
    const out = await ok(updateWord, fake, { id: "w1", patch: { ru: "кореш" } });
    expect(out.status).toBe("conflict");
    expect(fake.tables.words.get("w1")).toMatchObject({ ru: "друг", folder_id: "f-dengi" });
  });

  it("writes nothing when the patch changes nothing, and refuses deleted words", async () => {
    const fake = createFakeRepo({ words: [word("w1", "pote", "друг"), { ...word("w2", "meuf", "девушка"), deleted_at: OLD.toISOString() }] });
    expect((await ok(updateWord, fake, { id: "w1", patch: { ru: "друг" } })).status).toBe("unchanged");
    expect(fake.writes).toHaveLength(0);
    expect(await refused(updateWord, fake, { id: "w2", patch: { ru: "тёлка" } })).toMatch(/No word with id w2/);
  });
});

describe("move_words", () => {
  const seed = () =>
    createFakeRepo({
      folders: FOLDERS,
      words: [
        word("a", "fric", "бабло", { folder_id: null }),
        word("b", "keuf", "мент", { folder_id: "f-dengi", folder_source: "user" }),
        word("c", "daron", "батя", { folder_id: "f-zamok" }),
        word("d", "ouf", "безумный", { folder_id: "f-old" }),
      ],
    });

  it("in auto mode skips words placed by hand and words in locked themes", async () => {
    const fake = seed();
    const out = await ok(moveWords, fake, { ids: ["a", "b", "c", "d", "zzz"], folder: "Эмоции", mode: "auto" });
    expect(out.moved.map((m) => [m.id, m.from.name, m.to.name])).toEqual([
      ["a", "Входящие", "Эмоции"],
      ["d", "Входящие", "Эмоции"],
    ]);
    expect(out.skipped.map((s) => [s.id, s.reason])).toEqual([
      ["b", "placed by the user"],
      ["c", "in a locked theme"],
    ]);
    expect(out.not_found).toEqual(["zzz"]);
    expect(fake.tables.words.get("a")).toMatchObject({ folder_id: "f-emotsii", folder_source: "auto", folder_confidence: "med" });
  });

  it("in user mode moves any word and marks it as placed by the user", async () => {
    const fake = seed();
    const out = await ok(moveWords, fake, { ids: ["b", "c"], folder: "inbox" });
    expect(out.moved).toHaveLength(2);
    expect(fake.tables.words.get("c")).toMatchObject({ folder_id: null, folder_source: "user", folder_confidence: null });
    const again = await ok(moveWords, fake, { ids: ["b"], folder: "inbox" });
    expect(again.unchanged).toEqual(["b"]);
  });

  it("is undone exactly by restore_moves, sorting state included", async () => {
    const fake = seed();
    fake.tables.words.set("a", { ...fake.tables.words.get("a")!, folder_id: "f-dengi", folder_confidence: "high" });
    const out = await ok(moveWords, fake, { ids: ["a", "d"], folder: "inbox" });
    expect(out.undo).toEqual({
      tool: "restore_moves",
      moves: [
        { id: "a", folder_id: "f-dengi", folder_source: "auto", folder_confidence: "high" },
        { id: "d", folder_id: "f-old", folder_source: "auto", folder_confidence: null },
      ],
    });
    expect(fake.tables.words.get("a")).toMatchObject({ folder_id: null, folder_source: "user" });

    const later = new Date(NOW.getTime() + 1000);
    const res = await callTool(restoreMoves, { ...deps(fake), now: () => later }, out.undo);
    expect(res.isError).toBeFalsy();
    const back = res.structuredContent as { restored: { id: string }[]; not_found: string[] };
    expect(back.restored.map((w) => w.id)).toEqual(["a", "d"]);
    expect(fake.tables.words.get("a")).toMatchObject({ folder_id: "f-dengi", folder_source: "auto", folder_confidence: "high", updated_at: later.toISOString() });
    expect(fake.tables.words.get("d")).toMatchObject({ folder_id: "f-old", folder_source: "auto", folder_confidence: null });
    const bogus = await ok(restoreMoves, fake, { moves: [{ id: "a", folder_id: "f-nope", folder_source: "user", folder_confidence: null }] });
    expect(bogus.not_found).toEqual(["a"]);
  });
});

describe("writes that fail part-way", () => {
  const seed = () =>
    createFakeRepo({
      folders: FOLDERS,
      words: [
        word("a", "fric", "бабло", { folder_id: "f-dengi", folder_confidence: "high" }),
        word("b", "keuf", "мент", { folder_id: "f-dengi", folder_source: "user" }),
        word("c", "ouf", "безумный", { folder_id: null }),
      ],
      review_state: [...cards("a"), ...cards("b"), ...cards("c")],
    });

  it("move_words reports what moved and keeps the undo of every word that may have moved", async () => {
    const fake = seed();
    fake.failNextReplace("words", { after: 1 });
    const out = await ok(moveWords, fake, { ids: ["a", "b", "c"], folder: "Эмоции" });
    expect(out.moved.map((m) => m.id)).toEqual(["a"]);
    expect(out.failed).toEqual(["b", "c"]);
    expect(out.error).toMatch(/simulated failure/);
    expect(out.undo?.moves.map((m) => m.id)).toEqual(["a", "b", "c"]);
    expect(fake.tables.words.get("a")).toMatchObject({ folder_id: "f-emotsii", folder_source: "user" });

    const later = new Date(NOW.getTime() + 1000);
    const res = await callTool(restoreMoves, { ...deps(fake), now: () => later }, out.undo);
    const back = res.structuredContent as { restored: { id: string }[]; unchanged: string[] };
    expect(back.restored.map((w) => w.id)).toEqual(["a"]);
    expect(back.unchanged).toEqual(["b", "c"]);
    expect(fake.tables.words.get("a")).toMatchObject({ folder_id: "f-dengi", folder_source: "auto", folder_confidence: "high" });
  });

  it("counts a write whose answer was lost as done once it reads it back", async () => {
    const fake = seed();
    fake.failNextReplace("words", { after: 1, lostAnswers: true });
    const out = await ok(moveWords, fake, { ids: ["a", "b", "c"], folder: "Эмоции" });
    expect(out.moved.map((m) => m.id)).toEqual(["a", "b", "c"]);
    expect(out.failed).toBeUndefined();
    expect(out.conflicts).toEqual([]);
  });

  it("delete_words still deletes the cards of the words it did delete", async () => {
    const fake = seed();
    fake.failNextReplace("words", { after: 1 });
    const out = await ok(deleteWords, fake, { ids: ["a", "b"] });
    expect(out.deleted.map((w) => w.id)).toEqual(["a"]);
    expect(out.failed).toEqual(["b"]);
    expect(out.not_found).toEqual([]);
    expect(out.undo).toEqual({ tool: "restore_words", ids: ["a"] });
    expect(fake.tables.review_state.get("a:fr_ru")?.deleted_at).toBe(NOW.toISOString());
    expect(fake.tables.review_state.get("b:fr_ru")?.deleted_at).toBeNull();

    const lost = seed();
    lost.failNextReplace("words", { after: 0, lostAnswers: true });
    const again = await ok(deleteWords, lost, { ids: ["a", "b"] });
    expect(again.deleted.map((w) => w.id)).toEqual(["a", "b"]);
    expect([...lost.tables.review_state.values()].filter((s) => s.word_id !== "c").every((s) => s.deleted_at !== null)).toBe(true);
  });

  it("update_word reports the failure as a database error", async () => {
    const fake = seed();
    fake.failNextReplace("words", { after: 0 });
    expect(await refused(updateWord, fake, { id: "a", patch: { ru: "бабки" } })).toMatch(/database refused or did not answer: words: simulated failure/);
  });
});

describe("delete_words / restore_words", () => {
  it("soft-deletes words with their cards and restores both with their progress", async () => {
    const reviewed = { ...cards("w1")[0], state: 2 as const, reps: 7, stability: 30 };
    const fake = createFakeRepo({ words: [word("w1", "pote", "друг")], review_state: [reviewed, cards("w1")[1]] });
    const del = await ok(deleteWords, fake, { ids: ["w1", "nope"] });
    expect(del.deleted.map((w) => w.id)).toEqual(["w1"]);
    expect(del.not_found).toEqual(["nope"]);
    expect(del.undo).toEqual({ tool: "restore_words", ids: ["w1"] });
    expect(fake.tables.words.get("w1")?.deleted_at).toBe(NOW.toISOString());
    expect([...fake.tables.review_state.values()].every((s) => s.deleted_at === NOW.toISOString())).toBe(true);

    const later = new Date(NOW.getTime() + 1000);
    const res = await callTool(restoreWords, { ...deps(fake), now: () => later }, { ids: ["w1"] });
    expect(res.isError).toBeFalsy();
    expect(fake.tables.words.get("w1")).toMatchObject({ deleted_at: null, updated_at: later.toISOString() });
    expect(fake.tables.review_state.get("w1:fr_ru")).toMatchObject({ deleted_at: null, reps: 7, stability: 30 });
    expect(fake.tables.review_state.get("w1:ru_fr")?.deleted_at).toBeNull();
    // Cards are revived before the word.
    expect(fake.writes.slice(-2).map((w) => w.table)).toEqual(["review_state", "words"]);
  });

  it("never sends a hard delete: every write is an upsert of the full row", async () => {
    const fake = createFakeRepo({ words: [word("w1", "pote", "друг")], review_state: cards("w1") });
    await ok(deleteWords, fake, { ids: ["w1"] });
    for (const w of fake.writes) for (const row of w.rows as { deleted_at: string | null }[]) expect(row.deleted_at).not.toBeNull();
    expect(fake.tables.words.has("w1")).toBe(true);
  });
});

describe("create_folder", () => {
  it("uses the createFolder rules: unique slug over tombstones, first free color, next sort", async () => {
    const fake = createFakeRepo({ folders: [...FOLDERS, folder("rabota", "Работа", { deleted_at: OLD.toISOString(), sort: 9 })] });
    const out = await ok(createFolder, fake, { name: "  Работа ", description: "Офис, начальник, зарплата." });
    expect(out.folder).toMatchObject({ slug: "rabota-2", name: "Работа", description: "Офис, начальник, зарплата." });
    const saved = fake.tables.folders.get(out.folder.id)!;
    expect(saved).toMatchObject({ created_by: "user", locked: false, sort: 3, updated_at: NOW.toISOString() });
    expect(saved.color).not.toBe("#5a5a57");
  });

  it("refuses a live name in any case, and the reserved inbox", async () => {
    const fake = createFakeRepo({ folders: FOLDERS });
    expect(await refused(createFolder, fake, { name: "деньги" })).toMatch(/already exists \(id f-dengi\)/);
    expect(await refused(createFolder, fake, { name: "Inbox" })).toMatch(/built in/);
    expect(fake.writes).toHaveLength(0);
  });

  it("gives a default theme that never existed its fixed id, so a fresh device merges with it", async () => {
    const fake = createFakeRepo();
    const out = await ok(createFolder, fake, { name: "Еда" });
    expect(out.folder.id).toBe(defaultFolderId("eda"));
  });
});

describe("search_words / list_folders", () => {
  const seed = () =>
    createFakeRepo({
      folders: FOLDERS,
      words: [
        word("a", "être fauché", "без денег", { folder_id: "f-dengi", tags: ["argent"] }),
        word("b", "ouf", "безумный", { folder_id: "f-old" }),
        word("c", "chelou", "странный"),
        { ...word("d", "fric", "бабло"), deleted_at: OLD.toISOString() },
      ],
      review_state: [
        ...cards("a"),
        { ...cards("b")[0], state: 2, due: "2026-10-22T12:00:00.000Z", stability: 3, reps: 2 },
        cards("b")[1],
        ...cards("c"),
      ],
    });

  it("folds accents, counts words in deleted themes as inbox, and filters by status", async () => {
    const fake = seed();
    expect((await ok(searchWords, fake, { query: "fauche" })).words.map((w) => w.id)).toEqual(["a"]);
    expect((await ok(searchWords, fake, { query: "ДЕНЕГ" })).total).toBe(1);
    expect((await ok(searchWords, fake, { folder: "inbox" })).words.map((w) => w.id).sort()).toEqual(["b", "c"]);
    const due = await ok(searchWords, fake, { status: "due" });
    expect(due.words.map((w) => [w.id, w.due_today, w.folder.name])).toEqual([["b", true, "Входящие"]]);
    expect((await ok(searchWords, fake, { query: "fric" })).total).toBe(0);
  });

  it("pages through matches with offset and next_offset", async () => {
    const fake = seed();
    const first = await ok(searchWords, fake, { limit: 2 });
    expect(first.total).toBe(3);
    expect(first.next_offset).toBe(2);
    const rest = await ok(searchWords, fake, { limit: 2, offset: first.next_offset });
    expect(rest.next_offset).toBeNull();
    expect([...first.words, ...rest.words].map((w) => w.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("lists live themes in order with counts and the inbox", async () => {
    const out = await ok(listFolders, seed(), {});
    expect(out.folders.map((f) => [f.name, f.words, f.due])).toEqual([
      ["Деньги", 1, 0],
      ["Эмоции", 0, 0],
      ["Замок", 0, 0],
    ]);
    expect(out.inbox).toMatchObject({ words: 2, due: 1 });
    expect(out.total).toEqual({ words: 3, due: 1, new: 2 });
  });
});

describe("custom fields («Свои поля»)", () => {
  const def = (id: string, name: string, sort: number, extra: Partial<FieldDef> = {}): FieldDef => ({
    id,
    name,
    hint: null,
    ai_fill: false,
    sort,
    updated_at: OLD.toISOString(),
    deleted_at: null,
    ...extra,
  });
  const DEFS = [
    def("d-ant", "Антонимы", 2, { ai_fill: true, hint: "1–2 антонима" }),
    def("d-syn", "Синонимы", 1, { hint: "2–3 синонима на французском" }),
    def("d-old", "Ударение", 0, { deleted_at: OLD.toISOString() }),
  ];

  it("add_words maps a shared name (any case) to its definition and saves other names as one-off fields", async () => {
    const fake = createFakeRepo({ folders: FOLDERS, field_defs: DEFS });
    const out = await ok(addWords, fake, {
      words: [{ fr: "chelou", ru: "странный", custom_fields: { синонимы: "bizarre, louche", "Откуда": "  верлан   от louche ", Антонимы: null } }],
      folder_chosen_by_user: false,
    });
    const saved = [...fake.tables.words.values()][0];
    expect(saved.custom_fields).toEqual([
      { field_id: "d-syn", label: "Синонимы", value: "bizarre, louche" },
      { field_id: null, label: "Откуда", value: "верлан от louche" },
    ]);
    expect(out.added[0]).toMatchObject({ custom_fields: { Синонимы: "bizarre, louche", Откуда: "верлан от louche" }, new_one_off_fields: ["Откуда"] });
    expect(out.fields_note).toMatch(/that word only/);
  });

  it("add_words reads no definitions without custom fields, and refuses too long values before writing", async () => {
    const fake = createFakeRepo({ field_defs: DEFS });
    const spy = vi.spyOn(fake.repo, "fieldDefs");
    const out = await ok(addWords, fake, { words: [{ fr: "ouf", ru: "безумный" }], folder_chosen_by_user: false });
    expect(spy).not.toHaveBeenCalled();
    expect(out.added[0]).not.toHaveProperty("custom_fields");
    expect(out).not.toHaveProperty("fields_note");
    expect([...fake.tables.words.values()][0].custom_fields).toEqual([]);

    const tooLong = await refused(addWords, fake, { words: [{ fr: "relou", ru: "напряжный", custom_fields: { Синонимы: "x".repeat(301) } }], folder_chosen_by_user: false });
    expect(tooLong).toMatch(/custom_fields/);
    expect(await refused(addWords, fake, { words: [{ fr: "relou", ru: "напряжный", custom_fields: { ["я".repeat(41)]: "x" } }], folder_chosen_by_user: false })).toMatch(/custom_fields/);
    const full = Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`Поле ${i}`, "x"]));
    expect(await refused(addWords, fake, { words: [{ fr: "relou", ru: "напряжный", custom_fields: full }], folder_chosen_by_user: false })).toMatch(/at most 12/);
    expect(fake.tables.words.size).toBe(1);
  });

  it("update_word sets and clears only the named fields and keeps the others", async () => {
    const fake = createFakeRepo({
      field_defs: DEFS,
      words: [
        word("w1", "la thune", "бабки", {
          custom_fields: [
            { field_id: "d-syn", label: "Синонимы", value: "le fric" },
            { field_id: "d-ant", label: "Антонимы", value: "la dèche" },
            { field_id: null, label: "Откуда", value: "цыганское" },
          ],
        }),
      ],
    });
    const out = await ok(updateWord, fake, { id: "w1", patch: { custom_fields: { СИНОНИМЫ: "le fric, l'oseille", Антонимы: null } } });
    expect(out.status).toBe("updated");
    expect(out).not.toHaveProperty("new_one_off_fields");
    expect(fake.tables.words.get("w1")?.custom_fields).toEqual([
      { field_id: "d-syn", label: "Синонимы", value: "le fric, l'oseille" },
      { field_id: null, label: "Откуда", value: "цыганское" },
    ]);
    expect(out).toMatchObject({ word: { custom_fields: { Синонимы: "le fric, l'oseille", Откуда: "цыганское" } } });

    const oneOff = await ok(updateWord, fake, { id: "w1", patch: { custom_fields: { откуда: "из цыганского", Пример: "j'ai pas une thune" } } });
    expect(oneOff).toMatchObject({ status: "updated", new_one_off_fields: ["Пример"] });
    expect(fake.tables.words.get("w1")?.custom_fields?.map((f) => [f.label, f.value])).toEqual([
      ["Синонимы", "le fric, l'oseille"],
      ["Откуда", "из цыганского"],
      ["Пример", "j'ai pas une thune"],
    ]);

    const writes = fake.writes.length;
    const same = await ok(updateWord, fake, { id: "w1", patch: { custom_fields: { Антонимы: null, Синонимы: "le fric, l'oseille" } } });
    expect(same.status).toBe("unchanged");
    expect(fake.writes).toHaveLength(writes);
  });

  it("search_words shows the values under the definition's current name, and finds words by them", async () => {
    const fake = createFakeRepo({
      field_defs: [{ ...DEFS[1], name: "Похожие" }, DEFS[2]],
      words: [
        word("a", "chelou", "странный", {
          custom_fields: [
            { field_id: "d-syn", label: "Синонимы", value: "bizarre" },
            { field_id: "d-old", label: "Ударение", value: "на второй слог" },
          ],
        }),
        word("b", "ouf", "безумный"),
      ],
    });
    const out = await ok(searchWords, fake, { query: "bizarre" });
    expect(out.words.map((w) => w.id)).toEqual(["a"]);
    expect(out.words[0].custom_fields).toEqual({ Похожие: "bizarre", Ударение: "на второй слог" });
    const plain = await ok(searchWords, fake, { query: "ouf" });
    expect(plain.words[0]).not.toHaveProperty("custom_fields");
  });

  it("list_fields lists the live definitions in order, without deleted ones", async () => {
    const out = await ok(listFields, createFakeRepo({ field_defs: DEFS }), {});
    expect(out.fields).toEqual([
      { id: "d-syn", name: "Синонимы", hint: "2–3 синонима на французском", auto_fill: false },
      { id: "d-ant", name: "Антонимы", hint: "1–2 антонима", auto_fill: true },
    ]);
    expect(out.note).toMatch(/that word only/);
  });
});

describe("managing custom fields", () => {
  const def = (id: string, name: string, sort: number, extra: Partial<FieldDef> = {}): FieldDef => ({
    id,
    name,
    hint: null,
    ai_fill: true,
    sort,
    updated_at: OLD.toISOString(),
    deleted_at: null,
    ...extra,
  });
  const live = (fake: FakeRepo) =>
    [...fake.tables.field_defs.values()].filter((d) => d.deleted_at === null).sort((a, b) => a.sort - b.sort);

  it("create_field adds a field at the end, refuses repeats and the limit", async () => {
    const fake = createFakeRepo({ field_defs: [def("a", "Синонимы", 1)] });
    const out = await ok(createField, fake, { name: " Мнемоника ", hint: "  как запомнить ", auto_fill: false });
    expect(out.field).toMatchObject({ name: "Мнемоника", hint: "как запомнить", auto_fill: false });
    expect(out.undo).toEqual({ tool: "delete_field", field: out.field.id });
    expect(live(fake).map((d) => [d.name, d.sort])).toEqual([
      ["Синонимы", 1],
      ["Мнемоника", 2],
    ]);
    expect((await callTool(createField, deps(fake), { name: "синонимы" })).isError).toBe(true);
    const full = createFakeRepo({ field_defs: Array.from({ length: 10 }, (_, i) => def(`d${i}`, `Поле ${i}`, i)) });
    const res = await callTool(createField, deps(full), { name: "Ещё" });
    expect(res.isError).toBe(true);
    expect(JSON.stringify(res.content)).toMatch(/maximum/);
  });

  it("update_field renames, changes hint and auto_fill, moves, and reports the previous values", async () => {
    const fake = createFakeRepo({ field_defs: [def("a", "Синонимы", 1), def("b", "Мнемоника", 2), def("c", "Антонимы", 3)] });
    const out = await ok(updateField, fake, { field: "антонимы", name: "Противоположное", hint: "1 слово", auto_fill: false, position: 1 });
    expect(out.field).toMatchObject({ id: "c", name: "Противоположное", hint: "1 слово", auto_fill: false, position: 1 });
    expect(out.previous).toEqual({ name: "Антонимы", hint: null, auto_fill: true, position: 3 });
    expect(live(fake).map((d) => d.name)).toEqual(["Противоположное", "Синонимы", "Мнемоника"]);
    expect((await callTool(updateField, deps(fake), { field: "Синонимы", name: "мнемоника" })).isError).toBe(true);
    expect(await ok(updateField, fake, { field: "Синонимы", name: "Синонимы" })).toMatchObject({ result: "unchanged" });
  });

  it("delete_field is soft (cards keep their values) and restore_field brings it back", async () => {
    const fake = createFakeRepo({
      field_defs: [def("a", "Синонимы", 1)],
      words: [word("w", "chelou", "странный", { custom_fields: [{ field_id: "a", label: "Синонимы", value: "bizarre" }] })],
    });
    const out = await ok(deleteField, fake, { field: "Синонимы" });
    expect(out.undo).toEqual({ tool: "restore_field", id: "a" });
    expect(live(fake)).toEqual([]);
    expect([...fake.tables.words.values()][0].custom_fields).toEqual([{ field_id: "a", label: "Синонимы", value: "bizarre" }]);
    const search = await ok(searchWords, fake, { query: "chelou" });
    expect(search.words[0].custom_fields).toEqual({ Синонимы: "bizarre" });
    await ok(restoreField, fake, { id: "a" });
    expect(live(fake).map((d) => d.name)).toEqual(["Синонимы"]);
    expect((await callTool(deleteField, deps(fake), { field: "нет такого" })).isError).toBe(true);
  });
});

describe("changing and deleting themes", () => {
  const liveNames = (fake: FakeRepo) =>
    [...fake.tables.folders.values()].filter((f) => f.deleted_at === null).sort((a, b) => a.sort - b.sort).map((f) => f.name);

  it("update_folder renames, describes, locks and moves a theme, and reports the previous values", async () => {
    const fake = createFakeRepo({ folders: FOLDERS });
    const out = await ok(updateFolder, fake, { folder: "эмоции", name: "Чувства", description: "Эмоции и реакции", locked: true, position: 1 });
    expect(out.folder).toMatchObject({ id: "f-emotsii", slug: "emotsii", name: "Чувства", description: "Эмоции и реакции", locked: true, position: 1 });
    expect(out.previous).toEqual({ name: "Эмоции", description: null, locked: false, muted: false, position: 2 });
    expect(liveNames(fake)).toEqual(["Чувства", "Деньги", "Замок"]);
    expect((await callTool(updateFolder, deps(fake), { folder: "Деньги", name: "замок" })).isError).toBe(true);
    expect((await callTool(updateFolder, deps(fake), { folder: "inbox", name: "Новое" })).isError).toBe(true);
    expect(await ok(updateFolder, fake, { folder: "Деньги", name: "Деньги" })).toMatchObject({ result: "unchanged" });
  });

  it("delete_folder moves its words to the inbox; restore_folder brings the theme and those words back", async () => {
    const fake = createFakeRepo({
      folders: FOLDERS,
      words: [
        word("a", "le fric", "бабки", { folder_id: "f-dengi", folder_source: "user" }),
        word("b", "la thune", "деньги", { folder_id: "f-dengi", folder_source: "auto", folder_confidence: "high" }),
        word("c", "chelou", "странный", { folder_id: "f-emotsii" }),
      ],
    });
    const out = await ok(deleteFolder, fake, { folder: "Деньги" });
    expect(out).toMatchObject({ deleted: { id: "f-dengi" }, moved_to_inbox: 2 });
    expect(liveNames(fake)).toEqual(["Эмоции", "Замок"]);
    const w = (id: string) => fake.tables.words.get(id)!;
    expect([w("a").folder_id, w("b").folder_id, w("c").folder_id]).toEqual([null, null, "f-emotsii"]);

    // A word the user filed elsewhere in the meantime stays there.
    await ok(moveWords, fake, { ids: ["b"], folder: "Эмоции" });
    const back = await ok(restoreFolder, fake, out.undo);
    expect(back).toMatchObject({ restored: { id: "f-dengi" }, words_back: 1, left_elsewhere: 1 });
    expect(liveNames(fake)).toEqual(["Деньги", "Эмоции", "Замок"]);
    expect(w("a")).toMatchObject({ folder_id: "f-dengi", folder_source: "user" });
    expect(w("b").folder_id).toBe("f-emotsii");
    expect((await callTool(deleteFolder, deps(fake), { folder: "inbox" })).isError).toBe(true);
  });
});

describe("study_summary", () => {
  it("counts due cards, new cards left today and reviews in the study day", async () => {
    const log = (id: string, wordId: string, review: string, state: ReviewLog["state"], deleted = false): ReviewLog => ({
      id,
      word_id: wordId,
      direction: "fr_ru",
      rating: 3,
      state,
      due: review,
      stability: 1,
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: 0,
      review,
      prev: null,
      updated_at: review,
      deleted_at: deleted ? review : null,
    });
    const fake = createFakeRepo({
      words: [word("a", "pote", "друг"), word("b", "meuf", "девушка"), word("c", "keuf", "мент")],
      review_state: [
        { ...cards("a")[0], state: 2, due: "2026-10-22T20:00:00.000Z", stability: 5, reps: 3 },
        cards("a")[1],
        { ...cards("b")[0], state: 1, due: "2026-10-22T10:05:00.000Z", reps: 1 },
        cards("b")[1],
        ...cards("c"),
      ],
      review_log: [
        log("l1", "b", "2026-10-22T08:00:00.000Z", 0),
        log("l2", "a", "2026-10-22T01:00:00.000Z", 2), // before 04:00 Paris (02:00Z): yesterday
        log("l3", "a", "2026-10-22T09:00:00.000Z", 2, true), // undone
        log("l4", "gone", "2026-10-22T09:30:00.000Z", 0), // a word learned today, then deleted
      ],
      // The rule before «План дня»: one allowance of new cards, RU→FR the day after FR→RU.
      user_prefs: [legacyPlanRow(3)],
    });
    const out = await ok(studySummary, fake, {});
    expect(out.study_day).toEqual({ start: "2026-10-22T02:00:00.000Z", end: "2026-10-23T02:00:00.000Z", time_zone: "Europe/Paris" });
    expect(out.due_cards).toBe(2);
    expect(out.reviewed_today).toBe(1);
    // c:fr_ru and a:ru_fr are available (b:ru_fr waits: its fr_ru was reviewed today); 2 new already
    // introduced, the deleted word's included (as in the app).
    expect(out.new_cards_ready).toBe(2);
    expect(out.new_cards_available).toBe(1);
    expect(out.words).toMatchObject({ total: 3, new: 1, learning: 2 });
    expect(out.due_soonest.map((w) => w.id)).toEqual(["b", "a"]);
    expect(out.plan).toMatchObject({ new_words_today: 3, new_words_left: 1, ceiling: 3, reason: "limit", backlog: false, deferred: 0 });
    expect(out.plan.settings).toMatchObject({ new_order: "added", ru_fr: "together", saved: true });
  });

  /** `n` new words in theme Деньги plus `due` review cards due today. */
  function planned(n: number, due = 0, prefs: UserPref[] = []) {
    const ws = Array.from({ length: n }, (_, i) => word(`n${i}`, `mot${i}`, `слово${i}`, { folder_id: "f-dengi" }));
    const rs = Array.from({ length: due }, (_, i) => word(`r${i}`, `rev${i}`, `повтор${i}`, { folder_id: "f-emotsii", both_directions: false }));
    return createFakeRepo({
      folders: FOLDERS,
      words: [...ws, ...rs],
      review_state: [
        ...ws.flatMap((w) => cards(w.id)),
        ...rs.flatMap((w, i) => cards(w.id, false).map((s) => ({ ...s, state: 2 as const, stability: 5 + i, reps: 3, due: "2026-10-21T08:00:00.000Z", last_review: "2026-10-16T08:00:00.000Z" }))),
      ],
      user_prefs: prefs,
    });
  }

  it("plans the day with the saved «План повторения»: new words, not cards; RU→FR waits", async () => {
    const out = await ok(studySummary, planned(12, 0, [planRow({ new_words: 5, review_cap: 200, new_order: "themes", mix: "mixed", ru_fr: "after" })]), {});
    expect(out.new_cards_available).toBe(5);
    expect(out.new_cards_ready).toBe(12);
    expect(out.plan).toMatchObject({ new_words_today: 5, ceiling: 5, ru_unlocks: 0, reason: "limit", forecast_7d: 0 });
  });

  it("without a saved plan: the defaults with 8 new words (the device's 15 cards, halved); new_per_day plans a «what if»", async () => {
    let out = await ok(studySummary, planned(12), {});
    expect(out.plan).toMatchObject({ ceiling: 8, new_words_today: 8, settings: { new_order: "level", mix: "mixed", ru_fr: "after", review_cap: 200, saved: false } });
    out = await ok(studySummary, planned(12), { new_per_day: 3 });
    expect(out.plan).toMatchObject({ ceiling: 3, new_words_today: 3 });
    expect(out.new_cards_available).toBe(3);
  });

  it("over the review cap: a backlog, reviews deferred, no new words", async () => {
    const out = await ok(studySummary, planned(4, 60, [planRow({ new_words: 10, review_cap: 50, new_order: "added", mix: "after", ru_fr: "after" })]), {});
    expect(out.plan).toMatchObject({ backlog: true, deferred: 10, reason: "backlog", new_words_today: 0 });
    expect(out.due_cards).toBe(50);
    expect(out.new_cards_available).toBe(0);
  });

  it("matches planDay on the same data (the app's loadSession calls it too)", async () => {
    const fake = planned(9, 7, [planRow({ new_words: 4, review_cap: null, new_order: "level", mix: "mixed", ru_fr: "after" })]);
    const out = await ok(studySummary, fake, {});
    const day = { start: new Date("2026-10-22T02:00:00.000Z"), end: new Date("2026-10-23T02:00:00.000Z") };
    const ws = [...fake.tables.words.values()];
    const direct = planDay({
      now: NOW,
      dayStart: day.start,
      dayEnd: day.end,
      states: [...fake.tables.review_state.values()],
      words: new Map(ws.map((w) => [w.id, w])),
      todayLogs: [],
      logs7d: [],
      plan: parseStudyPlan(fake.tables.user_prefs.get("study_plan")!.value),
      r: retrievability,
      folderOrder: folderOrderOf(FOLDERS.filter((f) => f.deleted_at === null)),
    });
    expect(out.due_cards).toBe(direct.counts.due);
    expect(out.new_cards_available).toBe(direct.counts.new);
    expect(out.plan.new_words_today).toBe(direct.day.budget);
  });
});

describe("muted («на паузе»)", () => {
  it("update_word mutes and unmutes; search shows it and the word is never due", async () => {
    const fake = createFakeRepo({ words: [word("w1", "relou", "занудный")], review_state: cards("w1", false).map((s) => ({ ...s, state: 2 as const, due: OLD.toISOString() })) });
    expect((await ok(searchWords, fake, { query: "relou" })).words[0]).toMatchObject({ due_today: true });
    await ok(updateWord, fake, { id: "w1", patch: { muted: true } });
    expect(fake.tables.words.get("w1")).toMatchObject({ muted: true });
    const found = (await ok(searchWords, fake, { query: "relou" })).words[0];
    expect(found).toMatchObject({ muted: true, due_today: false });
    expect((await ok(studySummary, fake, { new_per_day: 3 })).due_cards).toBe(0);
    await ok(updateWord, fake, { id: "w1", patch: { muted: false } });
    expect((await ok(searchWords, fake, { query: "relou" })).words[0]).not.toHaveProperty("muted");
  });

  it("update_folder pauses a theme: its words are never due, list_folders and study_summary say so", async () => {
    const due = (id: string) => cards(id, false).map((s) => ({ ...s, state: 2 as const, due: OLD.toISOString() }));
    const fake = createFakeRepo({
      folders: FOLDERS,
      words: [word("w1", "relou", "занудный", { folder_id: "f-dengi" }), word("w2", "chelou", "странный", { folder_id: "f-emotsii" })],
      review_state: [...due("w1"), ...due("w2")],
    });
    const out = await ok(updateFolder, fake, { folder: "Деньги", muted: true });
    expect(out.folder).toMatchObject({ name: "Деньги", muted: true });
    expect(out.previous).toMatchObject({ muted: false });
    expect(fake.tables.folders.get("f-dengi")).toMatchObject({ muted: true });

    const list = await ok(listFolders, fake, {});
    expect(list.folders.find((f) => f.name === "Деньги")).toMatchObject({ muted: true, words: 1, due: 0, new: 0 });
    expect(list.folders.find((f) => f.name === "Эмоции")).not.toHaveProperty("muted");
    expect(list.total).toMatchObject({ words: 2, due: 1 });
    expect((await ok(searchWords, fake, { query: "relou" })).words[0]).toMatchObject({ theme_muted: true, due_today: false });
    const summary = await ok(studySummary, fake, { new_per_day: 3 });
    expect(summary).toMatchObject({ due_cards: 1, muted_themes: ["Деньги"] });

    expect(await ok(updateFolder, fake, { folder: "Деньги", muted: true })).toMatchObject({ result: "unchanged" });
    await ok(updateFolder, fake, { folder: "Деньги", muted: false });
    expect((await ok(studySummary, fake, { new_per_day: 3 })).due_cards).toBe(2);
  });
});

describe("rate limit", () => {
  it("limits write tools inside tools/call and leaves read tools alone", async () => {
    const fake = createFakeRepo({ folders: FOLDERS });
    for (let i = 0; i < 20; i++) expect((await callTool(createFolder, deps(fake), { name: `Тема ${i}` })).isError).toBeFalsy();
    expect(await refused(createFolder, fake, { name: "Ещё одна" })).toMatch(/Too many changes/);
    expect((await callTool(listFolders, deps(fake), {})).isError).toBeFalsy();
  });
});

describe("origin and conjugation", () => {
  const six = (verb: string) => [`je ${verb}`, `tu ${verb}`, `il ${verb}`, `nous ${verb}`, `vous ${verb}`, `ils ${verb}`];
  const conj = { auxiliary: "avoir", remark: "неправильный", present: six("bédave"), passe_compose: six("a bédavé"), imparfait: six("bédavait"), futur: six("bédavera") };

  it("update_word saves an origin and a verb's conjugation; null clears them", async () => {
    const fake = createFakeRepo({ words: [word("w1", "bédave", "курить", { pos: "verb" })] });
    await ok(updateWord, fake, { id: "w1", patch: { origin: "  из цыганского  ", conjugation: conj } });
    expect(fake.tables.words.get("w1")).toMatchObject({
      origin: "из цыганского",
      conjugation: { auxiliary: "avoir", remark: "неправильный", tenses: { present: six("bédave") } },
    });
    const found = await ok(searchWords, fake, { query: "bédave" });
    expect(found.words[0]).toMatchObject({ origin: "из цыганского", conjugation: { auxiliary: "avoir", present: six("bédave") } });

    await ok(updateWord, fake, { id: "w1", patch: { origin: null, conjugation: null } });
    expect(fake.tables.words.get("w1")).toMatchObject({ origin: null, conjugation: null });
  });

  it("refuses a conjugation of five forms or on a noun", async () => {
    const fake = createFakeRepo({ words: [word("w1", "la thune", "бабки", { pos: "noun", gender: "f" })] });
    expect((await callTool(updateWord, deps(fake), { id: "w1", patch: { conjugation: { ...conj, present: six("x").slice(0, 5) } } })).isError).toBe(true);
    expect((await callTool(updateWord, deps(fake), { id: "w1", patch: { conjugation: conj } })).isError).toBe(true);
  });

  it("search_words tells which verbs the app conjugates by itself", async () => {
    const fake = createFakeRepo({ words: [word("w1", "kiffer", "тащиться", { pos: "verb" }), word("w2", "falloir", "надо", { pos: "verb" }), word("w3", "chelou", "стрёмный", { pos: "adj" })] });
    const out = await ok(searchWords, fake, { query: "" });
    const byFr = Object.fromEntries(out.words.map((w: Record<string, unknown>) => [w.fr, w]));
    expect(byFr.kiffer).toMatchObject({ conjugation_builtin: true });
    expect(byFr.falloir).toMatchObject({ conjugation_builtin: false });
    expect(byFr.chelou).not.toHaveProperty("conjugation_builtin");
  });

  it("add_words takes origin and conjugation (a verb's only)", async () => {
    const fake = createFakeRepo();
    const out = await ok(addWords, fake, {
      words: [
        { fr: "bédave", ru: "курить", pos: "verb", origin: "из цыганского", conjugation: conj },
        { fr: "relou", ru: "занудный", pos: "adj", origin: "верлан от lourd", conjugation: conj },
      ],
      folder_chosen_by_user: false,
    });
    const [a, b] = out.added.map((w: { id: string }) => fake.tables.words.get(w.id)!);
    expect(a).toMatchObject({ origin: "из цыганского", conjugation: { auxiliary: "avoir" } });
    expect(b).toMatchObject({ origin: "верлан от lourd", conjugation: null });
  });
});

describe("exercises («Упражнения»)", () => {
  const LIB = [
    word("w-meuf", "la meuf", "девушка", { pos: "noun", gender: "f", slang_level: 1, verlan: true, folder_id: "f-emotsii" }),
    word("w-relou", "relou", "занудный", { pos: "adj", slang_level: 1, verlan: true, folder_id: "f-emotsii" }),
    word("w-bagnole", "la bagnole", "тачка", { pos: "noun", gender: "f", slang_level: 1, folder_id: "f-dengi" }),
    word("w-kiffer", "kiffer", "тащиться", { pos: "verb", slang_level: 1, example_fr: "J'ai trop kiffé ce concert.", example_ru: "Я так кайфанул на концерте." }),
    word("w-keuf", "le keuf", "мент", { pos: "noun", gender: "m", slang_level: 2, verlan: true }),
    word("w-ouf", "ouf", "безумный", { pos: "adj", slang_level: 1, verlan: true, folder_id: "f-emotsii" }),
    word("w-chelou", "chelou", "стрёмный", { pos: "adj", slang_level: 2, verlan: true, folder_id: "f-emotsii", note: "верлан от louche, про вечеринку" }),
    { ...word("w-thune", "la thune", "бабки", { pos: "noun", gender: "f", slang_level: 2 }), muted: true },
    { ...word("w-fric", "le fric", "бабло", { pos: "noun", gender: "m", slang_level: 1 }), deleted_at: OLD.toISOString() },
  ];

  /** A valid set covering every v1 type; `id`s are deliberately clashing, the server renumbers them. */
  const ITEMS: Record<string, unknown>[] = [
    { id: "a", type: "choice", word_id: "w-meuf", distractors: ["тачка", "мент", "зануда"] },
    { id: "a", type: "choice", skill: "verlan", word_id: "w-keuf", prompt: "Верлан от «flic»", answer: "le keuf", distractors: ["le reuf", "la meuf", "le teuf"] },
    { type: "cloze", word_id: "w-kiffer", sentence: "J'ai trop [[kiffé]] ce concert.", sentence_ru: "Концерт был что надо.", distractors: ["bouffé", "galéré", "flippé"] },
    { type: "register", word_id: "w-relou" },
    { type: "pairs", pairs: ["w-meuf", "w-bagnole", "w-keuf", "w-ouf"] },
    {
      type: "choice",
      skill: "situation",
      word_id: "w-ouf",
      prompt: "Друг рассказывает о концерте: было офигенно. Что он скажет?",
      answer: "C'était ouf",
      distractors: ["C'était chelou", "C'était relou", "C'était nul"],
    },
    { type: "choice", ask: "ru", word_id: "w-chelou", distractors: ["relou", "vénère", "louche"] },
  ];
  const set = (extra: Record<string, unknown> = {}) => ({ client_ref: "fete-1", title: "Вечеринка · сленг", folders: ["Эмоции", "inbox"], items: ITEMS, ...extra });
  const fakeLib = (seed: Parameters<typeof createFakeRepo>[0] = {}) => createFakeRepo({ folders: FOLDERS, words: LIB, ...seed });
  const stored = (fake: FakeRepo) => [...fake.tables.exercise_sets.values()];

  it("saves a set under x- + sha256(client_ref), renumbers the items and fills what the server writes", async () => {
    const fake = fakeLib();
    const out = await ok(createExerciseSet, fake, set());
    const id = `x-${createHash("sha256").update("fete-1").digest("hex").slice(0, 24)}`;
    expect(exerciseSetId(" fete-1 ")).toBe(id);
    expect(out).toEqual({
      already_saved: false,
      set: { id, title: "Вечеринка · сленг", count: 7, by_type: { choice: 4, cloze: 1, register: 1, pairs: 1 }, new_words: 0 },
      warnings: expect.any(Array),
      undo: { tool: "delete_exercise_set", id },
      note: expect.stringMatching(/next sync/),
    });
    // The set itself is not echoed back.
    expect(JSON.stringify(out)).not.toContain("стрёмный");
    expect(fake.writes.map((w) => w.table)).toEqual(["exercise_sets"]);
    const [row] = stored(fake);
    expect(row).toMatchObject({ id, folders: ["f-emotsii", "inbox"], source: "chat", created_at: NOW.toISOString(), updated_at: NOW.toISOString(), deleted_at: null, new_words: [] });
    expect(row.items.map((i) => i.id)).toEqual(["q1", "q2", "q3", "q4", "q5", "q6", "q7"]);
    expect(row.items[0]).toMatchObject({ skill: "meaning", ask: "fr", prompt: "la meuf", answer: "девушка", word: { fr: "la meuf", ru: "девушка", gender: "f", verlan: true } });
    expect(row.items[2]).toMatchObject({ answer: "kiffé", word: { example_fr: "J'ai trop kiffé ce concert." } });
    expect(row.items[3]).toMatchObject({ answer: "fam.", distractors: [] });
    expect(row.items[4].tiles).toEqual([
      { key: "w-meuf", fr: "la meuf", ru: "девушка" },
      { key: "w-bagnole", fr: "la bagnole", ru: "тачка" },
      { key: "w-keuf", fr: "le keuf", ru: "мент" },
      { key: "w-ouf", fr: "ouf", ru: "безумный" },
    ]);
    expect(row.items[6]).toMatchObject({ ask: "ru", prompt: "стрёмный", answer: "chelou" });
  });

  it("parses items, new_words and folders sent as JSON strings", async () => {
    const fake = fakeLib();
    const newWords = [{ ref: "n1", fr: "la teuf", ru: "тусовка", pos: "noun", gender: "f", slang_level: 2, verlan: true, source_url: "https://example.org/teuf" }];
    const items = [...ITEMS.slice(0, 6), { type: "choice", new_ref: "n1", distractors: ["тачка", "мент", "бабки"] }];
    const out = await ok(createExerciseSet, fake, set({ items: JSON.stringify(items), new_words: JSON.stringify(newWords), folders: '["emotsii"]' }));
    expect(out.set).toMatchObject({ count: 7, new_words: 1 });
    const [row] = stored(fake);
    expect(row.folders).toEqual(["f-emotsii"]);
    expect(row.new_words[0]).toMatchObject({ ref: "n1", fr: "la teuf", gender: "f", slang_level: 2, source_url: "https://example.org/teuf", note: null });
    expect(row.items[6]).toMatchObject({ new_ref: "n1", word_id: null, prompt: "la teuf", answer: "тусовка" });
  });

  it("accepts null for absent fields and any item ids (they are renumbered anyway)", async () => {
    const fake = fakeLib();
    const items = ITEMS.map((item, i) => ({ skill: null, ask: null, distractors: null, pairs: null, prompt: null, answer: null, ...item, id: i }));
    items[3] = { ...items[3], skill: null, ask: null, distractors: null, pairs: null };
    const out = await ok(createExerciseSet, fake, set({ items, new_words: null, folders: null, topic: null }));
    expect(out.set).toMatchObject({ count: 7, new_words: 0 });
    const [row] = stored(fake);
    expect(row.folders).toEqual([]);
    expect(row.items.map((i) => i.id)).toEqual(["q1", "q2", "q3", "q4", "q5", "q6", "q7"]);
    expect(row.items[3]).toMatchObject({ type: "register", skill: null, answer: "fam.", distractors: [] });
    expect((await ok(exerciseMaterial, fake, { folders: null })).scope).toMatchObject({ folders: "all" });
  });

  it("refuses unknown, deleted and muted word_ids with their paths, and writes nothing", async () => {
    const fake = fakeLib();
    const items = [...ITEMS];
    items[1] = { ...items[1], word_id: "w-nope" };
    items[3] = { type: "register", word_id: "w-thune" };
    items[6] = { ...items[6], word_id: "w-fric" };
    const message = await refused(createExerciseSet, fake, set({ items }));
    expect(message).toMatch(/not saved/);
    expect(message).toContain('items[1].word_id: no such word "w-nope"');
    expect(message).toMatch(/items\[3\]\.word_id: «la thune» is paused/);
    expect(message).toContain('items[6].word_id: no such word "w-fric"');
    expect(fake.writes).toEqual([]);
  });

  it("refuses a new word that is saved already (use word_id), an unknown new_ref, a distractor equal to the answer and a cloze span that is not the answer", async () => {
    const fake = fakeLib();
    const items = [...ITEMS];
    items[0] = { ...items[0], distractors: ["Девушка ", "мент", "тачка"] };
    items[2] = { ...items[2], answer: "bouffé", distractors: ["kiffé", "galéré", "flippé"] };
    items[5] = { ...items[5], new_ref: "n9", word_id: null };
    const message = await refused(createExerciseSet, fake, set({ items, new_words: [{ ref: "n1", fr: "Relou", ru: "занудный" }] }));
    expect(message).toContain("new_words[0].fr: «Relou» is already saved: use word_id w-relou");
    expect(message).toContain("items[0].distractors[0]: equals the answer «девушка»");
    expect(message).toMatch(/items\[2\]\.sentence: the span «kiffé» differs from the answer «bouffé»/);
    expect(message).toContain('items[5].new_ref: no new word with ref "n9"');
    expect(fake.writes).toEqual([]);
  });

  it("refuses an unknown theme and a set that is too short before reading words", async () => {
    const fake = fakeLib();
    expect(await refused(createExerciseSet, fake, set({ folders: ["Полиция"] }))).toMatch(/Unknown theme/);
    expect(await refused(createExerciseSet, fake, set({ items: ITEMS.slice(0, 5) }))).toMatch(/^items/);
    expect(fake.writes).toEqual([]);
  });

  it("returns already_saved on a client_ref replay without rewriting, and refuses one whose set was deleted", async () => {
    const fake = fakeLib();
    const first = await ok(createExerciseSet, fake, set());
    const before = structuredClone(stored(fake));
    const again = await ok(createExerciseSet, fake, set({ title: "Другое", items: ITEMS.slice(1) }));
    expect(again).toMatchObject({ already_saved: true, set: first.set, undo: first.undo });
    expect(fake.writes).toHaveLength(1);
    expect(stored(fake)).toEqual(before);

    await ok(deleteExerciseSet, fake, { id: first.set.id });
    expect(await refused(createExerciseSet, fake, set())).toMatch(/was deleted.*restore_exercise_set/);
  });

  it("is all or nothing: a failed upsert leaves no set, and the retry with the same client_ref saves it", async () => {
    const fake = fakeLib();
    fake.failNextUpsert("exercise_sets");
    const res = await callTool(createExerciseSet, deps(fake), set());
    expect(res.isError).toBe(true);
    expect(fake.tables.exercise_sets.size).toBe(0);
    const out = await ok(createExerciseSet, fake, set());
    expect(out.already_saved).toBe(false);
    expect(fake.tables.exercise_sets.size).toBe(1);
  });

  it("says so when the database refuses, with a safe retry hint", async () => {
    const fake = fakeLib();
    fake.repo.upsert = async () => {
      throw new RepoError("exercise_sets: fetch failed");
    };
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await refused(createExerciseSet, fake, set())).toMatch(/did not answer.*same client_ref is safe/);
  });

  it("refuses a write the app overtook, like the other single-row writes", async () => {
    const fake = fakeLib();
    const { set: saved } = await ok(createExerciseSet, fake, set());
    fake.beforeUpsert = (table, rows) => {
      const row = rows[0] as ExerciseSet;
      fake.tables.exercise_sets.set(row.id, { ...row, deleted_at: null, updated_at: "2027-01-01T00:00:00.000Z" });
    };
    expect(await refused(deleteExerciseSet, fake, { id: saved.id })).toMatch(/changed in the app at the same time/);
  });

  it("returns warnings that never block", async () => {
    const fake = fakeLib();
    const onlyChoice = [0, 1, 5, 6, 6, 1].map((i) => ITEMS[i]);
    const out = await ok(createExerciseSet, fake, set({ items: onlyChoice }));
    expect(out.warnings!.map((w: { code: string }) => w.code)).toEqual(expect.arrayContaining(["few_types", "consecutive_word"]));
    expect(fake.tables.exercise_sets.size).toBe(1);
  });

  it("delete is soft and restore brings it back; list hides deleted sets unless asked", async () => {
    const fake = fakeLib();
    const { set: saved } = await ok(createExerciseSet, fake, set());
    const del = await ok(deleteExerciseSet, fake, { id: saved.id });
    expect(del.undo).toEqual({ tool: "restore_exercise_set", id: saved.id });
    // Created at NOW too, so the delete is stamped 1 ms past it.
    expect(stored(fake)[0].deleted_at).toBe("2026-10-22T10:00:00.001Z");
    expect(await ok(deleteExerciseSet, fake, { id: saved.id })).toMatchObject({ result: "unchanged" });
    expect((await ok(listExerciseSets, fake, {})).sets).toEqual([]);
    expect((await ok(listExerciseSets, fake, { include_deleted: true })).sets[0]).toMatchObject({ id: saved.id, deleted: true });

    const back = await ok(restoreExerciseSet, fake, { id: saved.id });
    expect(back.restored).toMatchObject({ id: saved.id });
    expect(stored(fake)[0].deleted_at).toBeNull();
    expect(Date.parse(stored(fake)[0].updated_at)).toBeGreaterThan(NOW.getTime());
    expect(await ok(restoreExerciseSet, fake, { id: saved.id })).toMatchObject({ result: "unchanged" });
    expect(await refused(deleteExerciseSet, fake, { id: "x-nope" })).toMatch(/No exercise set/);
    expect(fake.writes.every((w) => w.table === "exercise_sets")).toBe(true);
  });

  const SET: ExerciseSet = {
    id: "x-old",
    title: "Эмоции · 7",
    topic: null,
    folders: ["f-emotsii", "inbox"],
    items: [
      { ...blankItem("q1", "w-meuf"), answer: "девушка", word: { fr: "la meuf", ru: "девушка", pos: "noun", gender: "f", slang_level: 1, verlan: true, example_fr: null, example_ru: null } },
      { ...blankItem("q2", "w-relou"), answer: "занудный", word: { fr: "relou", ru: "занудный", pos: "adj", gender: "none", slang_level: 1, verlan: true, example_fr: null, example_ru: null } },
    ],
    new_words: [],
    scope: null,
    source: "chat",
    created_at: "2026-10-20T10:00:00.000Z",
    updated_at: "2026-10-20T10:00:00.000Z",
    deleted_at: null,
  };
  function blankItem(id: string, wordId: string): ExerciseSet["items"][number] {
    return { id, type: "choice", skill: "meaning", ask: "fr", word_id: wordId, new_ref: null, prompt: null, sentence: null, sentence_ru: null, answer: null, distractors: ["a", "b", "c"], pairs: [], tiles: [], explain_ru: null, word: null };
  }
  const run = (id: string, startedAt: string, answers: ExerciseRun["answers"], extra: Partial<ExerciseRun> = {}): ExerciseRun => ({
    id,
    set_id: "x-old",
    kind: "set",
    item_ids: [],
    started_at: startedAt,
    finished_at: null,
    answers,
    total: 2,
    first_try: 0,
    updated_at: startedAt,
    deleted_at: null,
    ...extra,
  });
  const answer = (item: string, outcome: "correct" | "wrong" | "dont_know", chosen: string | null, at: string, attempt = 1) => ({
    item_id: item,
    word_id: null,
    new_ref: null,
    attempt,
    outcome,
    chosen,
    ms: 900,
    at,
  });

  it("list_exercise_sets shows the newest run with the words missed and the options picked", async () => {
    const older = run("r1", "2026-10-20T11:00:00.000Z", [answer("q1", "correct", "девушка", "2026-10-20T11:00:05.000Z")], { finished_at: "2026-10-20T11:02:00.000Z", first_try: 1 });
    const newer = run("r2", "2026-10-21T09:00:00.000Z", [
      answer("q1", "wrong", "мент", "2026-10-21T09:00:05.000Z"),
      answer("q2", "correct", "занудный", "2026-10-21T09:00:09.000Z"),
      answer("q1", "correct", "девушка", "2026-10-21T09:00:20.000Z", 2),
    ], { first_try: 1 });
    const fake = fakeLib({ exercise_sets: [SET], exercise_runs: [older, newer, run("r3", "2026-10-22T09:00:00.000Z", [], { deleted_at: NOW.toISOString() })] });
    const out = await ok(listExerciseSets, fake, {});
    expect(out.total).toBe(1);
    expect(out.sets[0]).toMatchObject({
      id: "x-old",
      count: 2,
      by_type: { choice: 2 },
      folders: [{ id: "f-emotsii", name: "Эмоции" }, { id: null, name: "Входящие" }],
      last_run: {
        at: "2026-10-21T09:00:20.000Z",
        kind: "set",
        // Never marked finished, but every item is answered right: the app was left on the last card.
        finished: true,
        first_try: 1,
        total: 2,
        missed: [{ word_id: "w-meuf", fr: "la meuf", ru: "девушка", chosen: ["мент"] }],
      },
    });
  });

  it("exercise_material ranks words weakest first from runs, low ratings and difficult cards, without muted or deleted words", async () => {
    const hardCard: ReviewState = { ...cards("w-bagnole")[0], state: 2, reps: 6, lapses: 3, stability: 2, difficulty: 6, due: "2026-10-30T00:00:00.000Z" };
    const lowLog: ReviewLog = {
      id: "l1",
      word_id: "w-relou",
      direction: "fr_ru",
      rating: 1,
      state: 2,
      due: NOW.toISOString(),
      stability: 1,
      difficulty: 5,
      elapsed_days: 1,
      scheduled_days: 1,
      review: "2026-10-21T08:00:00.000Z",
      prev: null,
      updated_at: "2026-10-21T08:00:00.000Z",
      deleted_at: null,
    };
    const fake = fakeLib({
      review_state: [hardCard],
      review_log: [lowLog, { ...lowLog, id: "l2", rating: 3 }],
      exercise_sets: [SET],
      exercise_runs: [
        run("r2", "2026-10-21T09:00:00.000Z", [
          answer("q1", "wrong", "мент", "2026-10-21T09:00:05.000Z"),
          answer("q1", "dont_know", null, "2026-10-21T09:00:30.000Z", 2),
          answer("q2", "correct", "занудный", "2026-10-21T09:00:09.000Z"),
        ]),
        // Outside the window.
        run("r0", "2026-09-01T09:00:00.000Z", [answer("q2", "wrong", "x", "2026-09-01T09:00:05.000Z")]),
      ],
    });
    const out = await ok(exerciseMaterial, fake, {});
    const ids = out.words.map((w: { id: string }) => w.id);
    expect(ids.slice(0, 3)).toEqual(["w-meuf", "w-bagnole", "w-relou"]);
    expect(ids).not.toContain("w-thune");
    expect(ids).not.toContain("w-fric");
    expect(out.total).toBe(7);
    const byId = Object.fromEntries(out.words.map((w: { id: string; signals: unknown }) => [w.id, w.signals]));
    expect(byId["w-meuf"]).toEqual({ lapses: 0, due: false, difficult: false, review_misses: 0, ex_attempts: 2, ex_misses: 2, confusions: ["мент"], last_miss: "2026-10-21T09:00:30.000Z" });
    expect(byId["w-bagnole"]).toMatchObject({ lapses: 3, difficult: true });
    expect(byId["w-relou"]).toMatchObject({ review_misses: 1, ex_attempts: 1, ex_misses: 0, last_miss: "2026-10-21T08:00:00.000Z" });
    expect(out.recent_sets).toEqual([{ id: "x-old", title: "Эмоции · 7", topic: null, created_at: SET.created_at, count: 2, words: ["la meuf", "relou"] }]);
    expect(out).not.toHaveProperty("topic_matches");
  });

  it("exercise_material keeps to the given themes and lists saved words that fit a topic", async () => {
    const fake = fakeLib();
    const out = await ok(exerciseMaterial, fake, { folders: '["Эмоции"]', topic: "вечеринке", limit: 2 });
    expect(out.scope).toEqual({ folders: [{ id: "f-emotsii", name: "Эмоции" }], topic: "вечеринке", days: 14 });
    expect(out.total).toBe(4);
    expect(out.words).toHaveLength(2);
    expect(out.topic_matches!.map((w: { id: string }) => w.id)).toEqual(["w-chelou"]);
    const muted = await ok(exerciseMaterial, fake, { topic: "бабки" });
    expect(muted.topic_matches).toEqual([expect.objectContaining({ id: "w-thune", muted: true })]);
    expect(await refused(exerciseMaterial, fake, { folders: ["Старое"] })).toMatch(/deleted/);
  });

  it("exercise_material leaves a paused theme out of «all themes» but uses it when named", async () => {
    const fake = fakeLib();
    const all = await ok(exerciseMaterial, fake, {});
    const emotions = await ok(exerciseMaterial, fake, { folders: ["Эмоции"] });
    const f = fake.tables.folders.get("f-emotsii")!;
    fake.tables.folders.set(f.id, { ...f, muted: true });
    const paused = await ok(exerciseMaterial, fake, {});
    expect(paused.total).toBe(all.total - emotions.total);
    expect(paused.words.some((w) => w.folder?.id === "f-emotsii")).toBe(false);
    expect((await ok(exerciseMaterial, fake, { folders: ["Эмоции"] })).total).toBe(emotions.total);
  });

  it("list_exercise_sets keeps the result with the misses ahead of a newer mistakes round or an empty run", async () => {
    const played = run("r1", "2026-10-21T09:00:00.000Z", [answer("q1", "wrong", "мент", "2026-10-21T09:00:05.000Z"), answer("q2", "correct", null, "2026-10-21T09:00:09.000Z")], {
      finished_at: "2026-10-21T09:01:00.000Z",
    });
    const mistakes = run("r2", "2026-10-21T10:00:00.000Z", [answer("q1", "correct", null, "2026-10-21T10:00:05.000Z")], {
      kind: "mistakes",
      item_ids: ["q1"],
      total: 1,
      first_try: 1,
      finished_at: "2026-10-21T10:00:10.000Z",
    });
    const empty = run("r3", "2026-10-21T11:00:00.000Z", []);
    const out = await ok(listExerciseSets, fakeLib({ exercise_sets: [SET], exercise_runs: [played, mistakes, empty] }), {});
    expect(out.sets[0].last_run).toMatchObject({ kind: "set", finished: true, missed: [{ word_id: "w-meuf", chosen: ["мент"] }] });
    expect(out.sets[0].last_mistakes_round).toMatchObject({ kind: "mistakes", finished: true, first_try: 1, missed: [] });
  });

  it("exercise_material counts pairs boards and saved new words for each word, without register labels as confusions", async () => {
    const pairsSet: ExerciseSet = {
      ...SET,
      id: "x-pairs",
      items: [
        { ...blankItem("p1", "w-meuf"), type: "pairs", skill: null, ask: null, word_id: null, distractors: [], pairs: ["w-meuf", "w-relou", "n1"], tiles: [] },
        { ...blankItem("q2", "w-relou"), type: "register", skill: null, ask: null, distractors: [] },
        { ...blankItem("q3", "w-meuf"), word_id: null, new_ref: "n1" },
      ],
      new_words: [{ ref: "n1", fr: "Chelou", ru: "стрёмный", note: null, example_fr: null, example_ru: null, pos: "adj", gender: "none", slang_level: 2, verlan: true, origin: null, source_url: null }],
    };
    const t = "2026-10-21T09:00:05.000Z";
    const fake = fakeLib({
      exercise_sets: [pairsSet],
      exercise_runs: [
        {
          ...run("r1", "2026-10-21T09:00:00.000Z", [
            // The final 'correct' of a board names no word: it counts for every word on it.
            answer("p1", "correct", null, t),
            answer("q2", "wrong", "arg.", t),
            { ...answer("q3", "wrong", "бабки", t), new_ref: "n1" },
          ]),
          set_id: "x-pairs",
        },
      ],
    });
    const out = await ok(exerciseMaterial, fake, {});
    const byId = Object.fromEntries(out.words.map((w: { id: string; signals: unknown }) => [w.id, w.signals]));
    expect(byId["w-meuf"]).toMatchObject({ ex_attempts: 1, ex_misses: 0 });
    expect(byId["w-relou"]).toMatchObject({ ex_attempts: 2, ex_misses: 1, confusions: [] });
    // n1 «Chelou» was saved since as w-chelou: its answers count for it.
    expect(byId["w-chelou"]).toMatchObject({ ex_attempts: 2, ex_misses: 1, confusions: ["бабки"] });
  });

  it("exercise_material matches inflected and quoted topics and gives topic matches the full word fields", async () => {
    const bar = [
      word("w-rade", "le rade", "бар, кабак", { pos: "noun", gender: "m", slang_level: 1 }),
      word("w-zinc", "le zinc", "барная стойка", { pos: "noun", gender: "m", slang_level: 1 }),
      word("w-teuf", "la teuf", "вечеринка", { pos: "noun", gender: "f", slang_level: 1, verlan: true }),
    ];
    const fake = createFakeRepo({ folders: FOLDERS, words: [...LIB, ...bar] });
    const idsFor = async (topic: string) => ((await ok(exerciseMaterial, fake, { topic })).topic_matches ?? []).map((w: { id: string }) => w.id).sort();
    expect(await idsFor("в баре")).toEqual(["w-rade", "w-zinc"]);
    expect(await idsFor("бары")).toEqual(["w-rade", "w-zinc"]);
    expect(await idsFor("«вечеринка»")).toContain("w-teuf");
    const [match] = (await ok(exerciseMaterial, fake, { topic: "кабак" })).topic_matches!;
    expect(match).toEqual({ id: "w-rade", fr: "le rade", ru: "бар, кабак", pos: "noun", gender: "m", slang_level: 1, verlan: false, example_fr: null, example_ru: null, folder: expect.anything() });
    // A null topic is "no topic", as on create_exercise_set.
    expect(await ok(exerciseMaterial, fake, { folders: null, topic: null })).not.toHaveProperty("topic_matches");
  });

  describe("«Чаще в упражнениях» (user_prefs exercise_focus)", () => {
    const hard = (wordId: string): ReviewState => ({ ...cards(wordId, false)[0], state: 2, reps: 6, lapses: 3, stability: 2, difficulty: 6, due: "2026-10-30T00:00:00.000Z" });
    const due = (wordId: string): ReviewState => ({ ...cards(wordId, false)[0], state: 2, reps: 2, lapses: 0, stability: 5, difficulty: 5, due: "2026-10-22T06:00:00.000Z" });
    const pref = (value: unknown, deleted = false) => ({ id: "exercise_focus", value, updated_at: OLD.toISOString(), deleted_at: deleted ? OLD.toISOString() : null });
    const lowLog: ReviewLog = {
      id: "l-relou",
      word_id: "w-relou",
      direction: "fr_ru",
      rating: 1,
      state: 2,
      due: NOW.toISOString(),
      stability: 1,
      difficulty: 5,
      elapsed_days: 1,
      scheduled_days: 1,
      review: "2026-10-21T08:00:00.000Z",
      prev: null,
      updated_at: "2026-10-21T08:00:00.000Z",
      deleted_at: null,
    };
    // Weakness alone: bagnole (difficult, 3 lapses) > relou (a «Снова») > ouf (due today).
    const focusLib = (prefs: ReturnType<typeof pref>[] = []) => fakeLib({ review_state: [hard("w-bagnole"), due("w-ouf")], review_log: [lowLog], user_prefs: prefs });
    const ids = (out: { words: { id: string }[] }) => out.words.map((w) => w.id);
    const marked = (out: { words: { id: string; focus?: boolean }[] }) => out.words.filter((w) => w.focus).map((w) => w.id);

    it("exercise_material puts the saved focus words first, marks them and says how many questions they need", async () => {
      const out = await ok(exerciseMaterial, focusLib([pref({ target: "both", share: "half" })]), {});
      expect(ids(out).slice(0, 3)).toEqual(["w-bagnole", "w-ouf", "w-relou"]);
      expect(marked(out)).toEqual(["w-bagnole", "w-ouf"]);
      expect(out.focus).toEqual({ target: "both", share: "half", from: "settings", min_items_for_12: 6, available: 2, note: expect.stringMatching(/At least 50% .*focus: true.*only 2/) });

      const dueOnly = await ok(exerciseMaterial, focusLib([pref({ target: "due", share: "most" })]), {});
      expect(ids(dueOnly).slice(0, 3)).toEqual(["w-ouf", "w-bagnole", "w-relou"]);
      expect(dueOnly.focus).toMatchObject({ target: "due", share: "most", from: "settings", min_items_for_12: 10, available: 1 });
    });

    it("exercise_material takes a focus from the request over the saved one, keeping the saved share when none is given", async () => {
      const fake = focusLib([pref({ target: "both", share: "some" })]);
      const out = await ok(exerciseMaterial, fake, { focus: { target: "due" } });
      expect(ids(out)[0]).toBe("w-ouf");
      expect(marked(out)).toEqual(["w-ouf"]);
      expect(out.focus).toMatchObject({ target: "due", share: "some", from: "request", min_items_for_12: 3, available: 1 });

      const off = await ok(exerciseMaterial, fake, { focus: { target: "normal", share: null } });
      expect(off.focus).toEqual({ target: "normal" });
      expect(marked(off)).toEqual([]);

      const scoped = await ok(exerciseMaterial, focusLib(), { folders: ["Эмоции"], focus: { target: "difficult", share: "most" } });
      expect(scoped.focus).toMatchObject({ target: "difficult", from: "request", available: 0, note: expect.stringMatching(/as usual/) });
    });

    it("exercise_material leaves the ranking alone without a focus (no row, a deleted row, or normal)", async () => {
      for (const prefs of [[], [pref({ target: "due", share: "most" }, true)], [pref({ target: "normal", share: "most" })], [pref("garbage")]]) {
        const out = await ok(exerciseMaterial, focusLib(prefs), {});
        expect(ids(out).slice(0, 3)).toEqual(["w-bagnole", "w-relou", "w-ouf"]);
        expect(out.focus).toEqual({ target: "normal" });
        expect(marked(out)).toEqual([]);
      }
    });

    it("create_exercise_set warns (and still saves) when the set ignores the saved focus", async () => {
      // In the set's themes (Эмоции + inbox), w-chelou is the one difficult word; ITEMS[6] is about it.
      const seed = { review_state: [hard("w-chelou"), hard("w-bagnole")], user_prefs: [pref({ target: "difficult", share: "half" })] };
      const fake = fakeLib(seed);
      const out = await ok(createExerciseSet, fake, set({ items: ITEMS.slice(0, 6) }));
      expect(stored(fake)).toHaveLength(1);
      const warning = out.warnings!.find((w: { code: string }) => w.code === "focus_share");
      expect(warning?.message).toMatch(/at least 50% .*difficult words \(3 of 6\); this set has 0, and 1 such words/);

      const followed = await ok(createExerciseSet, fakeLib(seed), set());
      expect(followed.warnings!.map((w: { code: string }) => w.code)).not.toContain("focus_share");
      const off = await ok(createExerciseSet, fakeLib({ ...seed, user_prefs: [] }), set({ items: ITEMS.slice(0, 6) }));
      expect(off.warnings!.map((w: { code: string }) => w.code)).not.toContain("focus_share");
    });

    it("counts an item about a focus word, and a pairs board when at least half its words are", () => {
      const items = [
        { type: "choice", word_id: "a", pairs: [] },
        { type: "cloze", word_id: "z", pairs: [] },
        { type: "pairs", word_id: null, pairs: ["a", "b", "y", "z"] },
        { type: "pairs", word_id: null, pairs: ["a", "x", "y", "z"] },
        { type: "choice", word_id: null, new_ref: "n1", pairs: [] },
      ] as unknown as ExerciseSet["items"];
      expect(focusItemCount(items, new Set(["a", "b"]))).toBe(2);
      expect(focusItemCount(items, new Set())).toBe(0);
    });
  });

  describe("scoped sets: only the difficult / due words, from every theme", () => {
    const hard = (wordId: string): ReviewState => ({ ...cards(wordId, false)[0], state: 2, reps: 6, lapses: 3, stability: 2, difficulty: 6, due: "2026-10-30T00:00:00.000Z" });
    const due = (wordId: string): ReviewState => ({ ...cards(wordId, false)[0], state: 2, reps: 2, lapses: 0, stability: 5, difficulty: 5, due: "2026-10-22T06:00:00.000Z" });
    const focusPref = { id: "exercise_focus", value: { target: "both", share: "most" }, updated_at: OLD.toISOString(), deleted_at: null };
    // Difficult: bagnole (Деньги), chelou (Эмоции), thune (muted). Due today: ouf (Эмоции), keuf (inbox).
    const scopeLib = () =>
      fakeLib({ review_state: [hard("w-bagnole"), hard("w-chelou"), hard("w-thune"), due("w-ouf"), due("w-keuf")], user_prefs: [focusPref] });
    const ids = (out: { words: { id: string }[] }) => out.words.map((w) => w.id).sort();

    it("exercise_material `only` returns just those words across themes, without paused ones, the topic or the focus", async () => {
      const fake = scopeLib();
      const difficult = await ok(exerciseMaterial, fake, { only: "difficult", topic: "вечеринка" });
      expect(ids(difficult)).toEqual(["w-bagnole", "w-chelou"]);
      expect(difficult.total).toBe(2);
      expect(difficult.scope).toEqual({
        folders: "all",
        days: 14,
        only: "difficult",
        available: 2,
        suggested_items: 6,
        note: expect.stringMatching(/only these 2 difficult words.*no new_words.*2–3 different question types.*scope: "difficult"/),
      });
      expect(difficult).not.toHaveProperty("focus");
      expect(difficult).not.toHaveProperty("topic_matches");
      expect(difficult.words.some((w: { focus?: boolean }) => w.focus)).toBe(false);
      expect(difficult.note).toMatch(/scope/);

      expect(ids(await ok(exerciseMaterial, fake, { only: "due" }))).toEqual(["w-keuf", "w-ouf"]);
      const both = await ok(exerciseMaterial, fake, { only: "both" });
      expect(ids(both)).toEqual(["w-bagnole", "w-chelou", "w-keuf", "w-ouf"]);
      expect(both.scope).toMatchObject({ only: "both", available: 4, suggested_items: 12 });
      // `folders` still narrows it.
      expect(ids(await ok(exerciseMaterial, fake, { only: "both", folders: ["Деньги"] }))).toEqual(["w-bagnole"]);

      // A paused theme's words are out, even when the theme is named.
      const f = fake.tables.folders.get("f-emotsii")!;
      fake.tables.folders.set(f.id, { ...f, muted: true });
      expect(ids(await ok(exerciseMaterial, fake, { only: "both" }))).toEqual(["w-bagnole", "w-keuf"]);
      const none = await ok(exerciseMaterial, fake, { only: "both", folders: ["Эмоции"] });
      expect(none.words).toEqual([]);
      expect(none.scope).toMatchObject({ only: "both", available: 0, suggested_items: 0, note: expect.stringMatching(/nothing to drill.*tell the user/) });

      // Without `only`, nothing changes: the saved focus applies.
      const plain = await ok(exerciseMaterial, fake, {});
      expect(plain.focus).toMatchObject({ target: "both" });
      expect(plain.scope).not.toHaveProperty("only");
    });

    it("suggests a shorter set for few words: each word up to 3 times, at least 6, at most 12", () => {
      expect([0, 1, 2, 3, 4, 10].map(scopeSuggestedItems)).toEqual([0, 6, 6, 9, 12, 12]);
    });

    it("create_exercise_set stores the scope, refuses new_words with it, and warns about words off scope", async () => {
      const seed = () => fakeLib({ review_state: ["w-meuf", "w-keuf", "w-bagnole", "w-ouf", "w-chelou"].map(hard), user_prefs: [focusPref] });
      const newWords = [{ ref: "n1", fr: "la teuf", ru: "тусовка", pos: "noun", gender: "f", slang_level: 2, verlan: true, source_url: "https://example.org/teuf" }];
      const withNew = seed();
      const message = await refused(
        createExerciseSet,
        withNew,
        set({ scope: "difficult", folders: null, new_words: newWords, items: [...ITEMS.slice(0, 6), { type: "choice", new_ref: "n1", distractors: ["тачка", "мент", "бабки"] }] }),
      );
      expect(message).toMatch(/not saved/);
      expect(message).toContain('- new_words: must be empty in a set with scope "difficult"');
      expect(withNew.writes).toEqual([]);

      const fake = seed();
      const out = await ok(createExerciseSet, fake, set({ scope: "difficult", folders: null }));
      expect(stored(fake)[0]).toMatchObject({ scope: "difficult", folders: [], new_words: [] });
      const codes = out.warnings!.map((w: { code: string }) => w.code);
      expect(codes).toContain("scope_words");
      // A scoped set is all focus words by design: the saved focus share is not checked.
      expect(codes).not.toContain("focus_share");
      const warning = out.warnings!.find((w: { code: string }) => w.code === "scope_words")!;
      expect(warning.message).toMatch(/difficult words.*items\[2\] \(kiffer\); items\[3\] \(relou\)\./);

      // Every word difficult: no warning. An ordinary set stores scope null.
      const allHard = fakeLib({ review_state: ["w-meuf", "w-keuf", "w-bagnole", "w-ouf", "w-chelou", "w-kiffer", "w-relou"].map(hard) });
      const clean = await ok(createExerciseSet, allHard, set({ scope: "both", client_ref: "s-2" }));
      expect(clean.warnings!.map((w: { code: string }) => w.code)).not.toContain("scope_words");
      await ok(createExerciseSet, allHard, set({ client_ref: "s-3" }));
      expect(stored(allHard).map((r) => r.scope).sort()).toEqual(["both", null]);
      expect(await refused(createExerciseSet, allHard, set({ scope: "sometimes", client_ref: "s-4" }))).toBeTruthy();
    });

    it("list_exercise_sets shows each set's scope (null for an ordinary set or a row from before 0013)", async () => {
      const legacy = { ...SET, id: "x-legacy" } as Partial<ExerciseSet>;
      delete legacy.scope;
      const fake = fakeLib({ exercise_sets: [{ ...SET, id: "x-hard", scope: "difficult", created_at: "2026-10-21T10:00:00.000Z" }, legacy as ExerciseSet] });
      const out = await ok(listExerciseSets, fake, {});
      expect(out.sets.map((s: { id: string; scope: unknown }) => [s.id, s.scope])).toEqual([
        ["x-hard", "difficult"],
        ["x-legacy", null],
      ]);
    });
  });

  it("takes a rate-limit token for create_exercise_set but not for the read tools", async () => {
    const fake = fakeLib();
    for (let i = 0; i < 20; i++) expect((await callTool(createExerciseSet, deps(fake), set({ client_ref: `s-${i}` }))).isError).toBeFalsy();
    expect(await refused(createExerciseSet, fake, set({ client_ref: "s-20" }))).toMatch(/Too many changes/);
    expect((await callTool(exerciseMaterial, deps(fake), {})).isError).toBeFalsy();
    expect((await callTool(listExerciseSets, deps(fake), {})).isError).toBeFalsy();
  });
});

describe("«Уровень языка»", () => {
  const seed = () =>
    createFakeRepo({
      folders: FOLDERS,
      words: [
        word("a", "le loyer", "квартплата", { pos: "noun", gender: "m" }),
        word("b", "relou", "надоедливый", { slang_level: 2, verlan: true }),
        word("c", "faire la queue", "стоять в очереди", { pos: "expression" }),
        word("d", "la démarche", "процедура", { pos: "noun", gender: "f", cefr: "A2", cefr_source: "user" }),
        word("e", "constater", "констатировать", { pos: "verb", cefr: "C1", cefr_source: "ai" }),
      ],
      review_state: ["a", "b", "c", "d", "e"].flatMap((id) => cards(id)),
    });

  it("search_words shows the effective level and its source, and filters by level or «none»", async () => {
    const fake = seed();
    const out = await ok(searchWords, fake, { limit: 100 });
    const byId = new Map(out.words.map((w) => [w.id, w]));
    expect(byId.get("a")).toMatchObject({ level: "B1", level_source: "flelex" });
    expect(byId.get("b")).toMatchObject({ level: null });
    expect(byId.get("b")).not.toHaveProperty("level_source");
    expect(byId.get("c")).toMatchObject({ level: null });
    expect(byId.get("d")).toMatchObject({ level: "A2", level_source: "user" });
    expect(byId.get("e")).toMatchObject({ level: "C1", level_source: "ai" });
    expect((await ok(searchWords, fake, { level: "none" })).words.map((w) => w.id).sort()).toEqual(["b", "c"]);
    expect((await ok(searchWords, fake, { level: ["A2", "C1"] })).words.map((w) => w.id).sort()).toEqual(["d", "e"]);
    expect((await ok(searchWords, fake, { level: ["B1", "none"] })).words.map((w) => w.id).sort()).toEqual(["a", "b", "c"]);
    expect(await refused(searchWords, fake, { level: ["B3"] })).toMatch(/level/);
  });

  it("add_words saves a given level as Claude's, and shows the estimate otherwise", async () => {
    const fake = createFakeRepo({ folders: FOLDERS });
    const out = await ok(addWords, fake, {
      words: [
        { fr: "le titre de séjour", ru: "вид на жительство", pos: "expression", cefr: "B1" },
        { fr: "le loyer", ru: "квартплата", pos: "noun", gender: "m" },
      ],
      folder_chosen_by_user: false,
    });
    expect(out.added.map((w) => [w.fr, w.level, w.level_source])).toEqual([
      ["le titre de séjour", "B1", "chat"],
      ["le loyer", "B1", "flelex"],
    ]);
    const saved = [...fake.tables.words.values()];
    expect(saved.map((w) => [w.cefr, w.cefr_source])).toEqual([
      ["B1", "chat"],
      [null, null],
    ]);
  });

  it("update_word sets a level as Claude's, keeps a user's equal level, and null clears it", async () => {
    const fake = seed();
    const set = await ok(updateWord, fake, { id: "a", patch: { cefr: "A2" } });
    expect("word" in set && set.word).toMatchObject({ level: "A2", level_source: "chat" });
    expect(fake.tables.words.get("a")).toMatchObject({ cefr: "A2", cefr_source: "chat" });
    expect((await ok(updateWord, fake, { id: "d", patch: { cefr: "A2" } })).status).toBe("unchanged");
    expect(fake.tables.words.get("d")?.cefr_source).toBe("user");
    const cleared = await ok(updateWord, fake, { id: "a", patch: { cefr: null } });
    expect("word" in cleared && cleared.word).toMatchObject({ level: "B1", level_source: "flelex" });
    expect(fake.tables.words.get("a")).toMatchObject({ cefr: null, cefr_source: null });
    // An older row without the columns: the same «no level» is no change.
    const old: Partial<Word> = word("x", "pote", "друг");
    delete old.cefr;
    delete old.cefr_source;
    const legacy = createFakeRepo({ words: [old as never] });
    expect((await ok(updateWord, legacy, { id: "x", patch: { cefr: null } })).status).toBe("unchanged");
    expect(legacy.writes).toHaveLength(0);
  });

  it("set_word_levels writes a batch as Claude's, skips the user's levels, and is undone exactly", async () => {
    const fake = seed();
    const out = await ok(setWordLevels, fake, {
      items: [
        { word_id: "b", cefr: "B2" },
        { word_id: "c", cefr: "A2" },
        { word_id: "d", cefr: "B1" },
        { word_id: "e", cefr: "C1" },
        { word_id: "nope", cefr: "A1" },
        { word_id: "c", cefr: "A1" },
      ],
    });
    expect(out.updated).toEqual([
      { id: "b", fr: "relou", level: "B2", level_source: "chat" },
      { id: "c", fr: "faire la queue", level: "A1", level_source: "chat" },
      { id: "e", fr: "constater", level: "C1", level_source: "chat" },
    ]);
    expect(out.skipped_user).toEqual([{ id: "d", fr: "la démarche", level: "A2" }]);
    expect(out.not_found).toEqual(["nope"]);
    expect(out.unchanged).toEqual([]);
    expect(fake.tables.words.get("d")).toMatchObject({ cefr: "A2", cefr_source: "user" });
    // One replace for the whole batch, each row compare-and-set.
    expect(fake.writes.map((w) => [w.table, w.rows.length])).toEqual([["words", 3]]);
    expect(out.undo).toEqual({
      tool: "set_word_levels",
      overwrite_user: false,
      items: [
        { word_id: "b", cefr: null, source: null, expect: { cefr: "B2", source: "chat" } },
        { word_id: "c", cefr: null, source: null, expect: { cefr: "A1", source: "chat" } },
        { word_id: "e", cefr: "C1", source: "ai", expect: { cefr: "C1", source: "chat" } },
      ],
    });

    const later = new Date(NOW.getTime() + 1000);
    const res = await callTool(setWordLevels, { ...deps(fake), now: () => later }, { items: out.undo!.items, overwrite_user: out.undo!.overwrite_user });
    expect(res.isError).toBeFalsy();
    expect(["b", "c", "e"].map((id) => [fake.tables.words.get(id)?.cefr, fake.tables.words.get(id)?.cefr_source])).toEqual([
      [null, null],
      [null, null],
      ["C1", "ai"],
    ]);
  });

  it("set_word_levels overwrites a user's level only with overwrite_user, and reports conflicts", async () => {
    const fake = seed();
    const out = await ok(setWordLevels, fake, { items: [{ word_id: "d", cefr: "B1" }], overwrite_user: true });
    expect(out.updated).toEqual([{ id: "d", fr: "la démarche", level: "B1", level_source: "chat" }]);
    expect(out.undo).toMatchObject({ overwrite_user: false, items: [{ word_id: "d", cefr: "A2", source: "user", expect: { cefr: "B1", source: "chat" } }] });
    // Undoing the undo writes over the user's restored level, so that one carries overwrite_user.
    const back = await ok(setWordLevels, fake, { items: out.undo!.items, overwrite_user: out.undo!.overwrite_user });
    expect(fake.tables.words.get("d")).toMatchObject({ cefr: "A2", cefr_source: "user" });
    expect(back.undo).toMatchObject({ overwrite_user: true, items: [{ word_id: "d", cefr: "B1", source: "chat", expect: { cefr: "A2", source: "user" } }] });

    fake.beforeUpsert = (table) => {
      if (table !== "words") return;
      const stored = fake.tables.words.get("a")!;
      fake.tables.words.set("a", { ...stored, ru: "аренда", updated_at: "2030-01-01T00:00:00.000Z" });
    };
    const clash = await ok(setWordLevels, fake, { items: [{ word_id: "a", cefr: "A1" }] });
    expect(clash.conflicts).toEqual(["a"]);
    expect(clash.updated).toEqual([]);
    expect(clash.undo).toBeNull();
    expect(fake.tables.words.get("a")?.cefr).toBeNull();
  });

  it("set_word_levels takes 1–100 items and writes nothing when nothing changes", async () => {
    const fake = seed();
    const items = Array.from({ length: 101 }, (_, i) => ({ word_id: `w${i}`, cefr: "A1" }));
    expect(await refused(setWordLevels, fake, { items })).toMatch(/items/);
    expect(await refused(setWordLevels, fake, { items: [] })).toMatch(/items/);
    const same = await ok(setWordLevels, fake, { items: [{ word_id: "e", cefr: "C1", source: "ai", expect: { cefr: "C1", source: "ai" } }] });
    expect(same.unchanged).toEqual(["e"]);
    expect(fake.writes).toHaveLength(0);
  });

  it("set_word_levels takes source only from an undo, so Claude can't save a level as the user's", async () => {
    const fake = seed();
    expect(await refused(setWordLevels, fake, { items: [{ word_id: "a", cefr: "B1", source: "user" }] })).toMatch(/source/);
    expect(await refused(setWordLevels, fake, { items: [{ word_id: "a", cefr: "B1", source: "ai" }] })).toMatch(/source/);
    expect(fake.writes).toHaveLength(0);
    expect(fake.tables.words.get("a")).toMatchObject({ cefr: null, cefr_source: null });
  });

  it("set_word_levels' undo leaves a level the user picked after the call", async () => {
    const fake = seed();
    const out = await ok(setWordLevels, fake, { items: [{ word_id: "a", cefr: "B1" }, { word_id: "b", cefr: "B2" }] });
    // Meanwhile the user picks A2 for «a» in the app.
    const stored = fake.tables.words.get("a")!;
    fake.tables.words.set("a", { ...stored, cefr: "A2", cefr_source: "user", updated_at: "2030-01-01T00:00:00.000Z" });
    const res = await ok(setWordLevels, fake, { items: out.undo!.items, overwrite_user: out.undo!.overwrite_user });
    expect(res.changed_since).toEqual([{ id: "a", fr: stored.fr, level: "A2", level_source: "user" }]);
    expect(res.updated.map((u) => u.id)).toEqual(["b"]);
    expect(fake.tables.words.get("a")).toMatchObject({ cefr: "A2", cefr_source: "user" });
    expect(fake.tables.words.get("b")).toMatchObject({ cefr: null, cefr_source: null });
  });
});
