import { beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import { resetRateLimits } from "@/lib/ai/rate-limit";
import { defaultFolderId } from "@/lib/core/folders";
import { buildWord, type NewWordInput } from "@/lib/core/words";
import { newReviewState } from "@/lib/scheduler";
import type { FieldDef, Folder, ReviewLog, ReviewState } from "@/lib/types";
import { createFakeRepo, type FakeRepo } from "./fake-repo";
import { RepoError } from "./repo";
import {
  addWords,
  callTool,
  createField,
  createFolder,
  deleteField,
  deleteFolder,
  deleteWords,
  listFields,
  listFolders,
  moveWords,
  resolveFolder,
  restoreField,
  restoreFolder,
  restoreMoves,
  restoreWords,
  searchWords,
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
    expect(out.total).toEqual({ words: 3, due: 1 });
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
    expect(out.previous).toEqual({ name: "Эмоции", description: null, locked: false, position: 2 });
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
    });
    const out = await ok(studySummary, fake, { new_per_day: 3 });
    expect(out.study_day).toEqual({ start: "2026-10-22T02:00:00.000Z", end: "2026-10-23T02:00:00.000Z", time_zone: "Europe/Paris" });
    expect(out.due_cards).toBe(2);
    expect(out.reviewed_today).toBe(1);
    // c:fr_ru and a:ru_fr are available (b:ru_fr waits: its fr_ru was reviewed today); 2 new already
    // introduced, the deleted word's included (as in the app).
    expect(out.new_cards_ready).toBe(2);
    expect(out.new_cards_available).toBe(1);
    expect(out.words).toMatchObject({ total: 3, new: 1, learning: 2 });
    expect(out.due_soonest.map((w) => w.id)).toEqual(["b", "a"]);
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
