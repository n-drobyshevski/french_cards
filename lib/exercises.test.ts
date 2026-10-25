import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import {
  addNewWords,
  completeSet,
  contextFromWords,
  deleteSet,
  finishRun,
  getResumableRun,
  getScopeCounts,
  getRun,
  getSet,
  lastRunBySet,
  latestRunFor,
  liveSets,
  liveWordsById,
  playContext,
  recordAnswer,
  resumableRunFor,
  requestWords,
  restoreSet,
  savedNewWords,
  scopeCounts,
  scoreRun,
  startRun,
  undoAddNewWords,
  unfinishedRun,
} from "./exercises";
import { createFolder, libraryStatsFrom } from "./folders";
import { newReviewState } from "./scheduler";
import type { ExerciseAnswer, ExerciseSet, Folder, ReviewState, Word } from "./types";
import { addWord } from "./words";

const NOON = new Date(2026, 9, 23, 12, 0, 0);
const at = (min: number) => new Date(NOON.getTime() + min * 60_000);

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

async function fixture(opts: { folders?: string[]; id?: string; createdAt?: Date } = {}): Promise<{ set: ExerciseSet; words: Word[] }> {
  const words = await Promise.all(
    ["la meuf", "kiffer", "la bagnole", "la thune", "le keuf", "le daron"].map((fr, i) =>
      addWord({ fr, ru: `ru-${i}`, slang_level: 1, both_directions: false }, NOON),
    ),
  );
  const [meuf, kiffer, bagnole, thune, keuf, daron] = words;
  const content = completeSet(
    {
      title: "Сленг",
      folders: opts.folders ?? [],
      new_words: [
        { ref: "n1", fr: "avoir la flemme", ru: "лениться", pos: "expression", slang_level: 1, example_fr: "J'ai la flemme.", example_ru: "Мне лень." },
        { ref: "n2", fr: "la teuf", ru: "тусовка", pos: "noun", gender: "f", slang_level: 2, verlan: true },
        { ref: "n3", fr: "la meuf", ru: "девушка", slang_level: 1 },
      ],
      items: [
        { type: "choice", word_id: meuf.id, distractors: ["a", "b", "c"] },
        { type: "cloze", word_id: kiffer.id, sentence: "J'ai [[kiffé]].", distractors: ["x", "y", "z"] },
        { type: "register", word_id: bagnole.id },
        { type: "pairs", pairs: [thune.id, keuf.id, daron.id, meuf.id] },
        { type: "choice", skill: "meaning", ask: "ru", new_ref: "n1", distractors: ["d", "e", "f"] },
        { type: "register", new_ref: "n2" },
      ],
    },
    contextFromWords(words),
  );
  const iso = (opts.createdAt ?? NOON).toISOString();
  const set: ExerciseSet = { ...content, id: opts.id ?? "x-abc", source: "chat", created_at: iso, updated_at: iso, deleted_at: null };
  await db.exercise_sets.put(set);
  return { set, words };
}

const answer = (item_id: string, attempt: number, outcome: ExerciseAnswer["outcome"], min = 1): ExerciseAnswer => ({
  item_id,
  word_id: null,
  new_ref: null,
  attempt,
  outcome,
  chosen: outcome === "wrong" ? "b" : null,
  ms: 900,
  at: at(min).toISOString(),
});

describe("sets", () => {
  it("lists live sets newest first", async () => {
    await fixture({ id: "x-old", createdAt: at(-60) });
    await db.exercise_sets.put({ ...(await db.exercise_sets.get("x-old"))!, id: "x-new", created_at: at(5).toISOString() });
    await db.exercise_sets.put({ ...(await db.exercise_sets.get("x-old"))!, id: "x-gone", created_at: at(10).toISOString(), deleted_at: at(10).toISOString() });
    expect((await liveSets()).map((s) => s.id)).toEqual(["x-new", "x-old"]);
    expect(await getSet("x-gone")).toBeUndefined();
    expect((await getSet("x-new"))?.title).toBe("Сленг");
  });

  it("soft-deletes and restores a set, stamped and queued for sync", async () => {
    const { set } = await fixture();
    await db.outbox.clear();
    const deleted = await deleteSet(set.id, at(1));
    expect(deleted?.id).toBe(set.id);
    expect(await getSet(set.id)).toBeUndefined();
    expect((await db.exercise_sets.get(set.id))?.deleted_at).toBe(at(1).toISOString());
    expect(await deleteSet(set.id, at(2))).toBeNull();
    const restored = await restoreSet(set.id, at(3));
    expect(restored).toMatchObject({ deleted_at: null, updated_at: at(3).toISOString(), items: set.items });
    expect((await liveSets()).map((s) => s.id)).toEqual([set.id]);
    expect((await db.outbox.toArray()).map((o) => o.key)).toEqual([`exercise_sets:${set.id}`]);
    expect(await restoreSet("x-none", at(4))).toBeNull();
  });
});

describe("runs", () => {
  it("upserts one run row per answer, leaving one outbox key and never touching the schedule", async () => {
    const { set } = await fixture();
    const statesBefore = await db.review_state.toArray();
    await db.outbox.clear();
    const run = await startRun(set, {}, at(0));
    expect(run).toMatchObject({ set_id: set.id, kind: "set", item_ids: [], total: 6, first_try: 0, finished_at: null, answers: [] });

    await recordAnswer(run.id, answer("q1", 1, "correct"), at(1));
    await recordAnswer(run.id, answer("q2", 1, "wrong"), at(2));
    await recordAnswer(run.id, answer("q3", 1, "dont_know"), at(3));
    const after = await recordAnswer(run.id, answer("q2", 2, "correct"), at(4));
    expect(after.answers).toHaveLength(4);
    expect(after.first_try).toBe(1);
    expect(after.updated_at).toBe(at(4).toISOString());
    expect(await getRun(run.id)).toEqual(after);

    expect((await db.outbox.toArray()).map((o) => o.key)).toEqual([`exercise_runs:${run.id}`]);
    expect(await db.review_log.count()).toBe(0);
    expect(await db.review_state.toArray()).toEqual(statesBefore);
    expect(scoreRun(after, set)).toEqual({ total: 6, answered: 3, first_try: 1, accuracy: 17 });
  });

  it("finishes a run once", async () => {
    const { set } = await fixture();
    const run = await startRun(set, {}, at(0));
    expect((await finishRun(run.id, at(5)))?.finished_at).toBe(at(5).toISOString());
    expect((await finishRun(run.id, at(9)))?.finished_at).toBe(at(5).toISOString());
    expect(await finishRun("none", at(9))).toBeUndefined();
    await expect(recordAnswer("none", answer("q1", 1, "correct"))).rejects.toThrow();
  });

  it("starts a mistakes round over the given items", async () => {
    const { set } = await fixture();
    const run = await startRun(set, { kind: "mistakes", itemIds: ["q5", "q2", "nope"] }, at(0));
    expect(run).toMatchObject({ kind: "mistakes", item_ids: ["q2", "q5"], total: 2 });
  });

  it("refuses a round over items the set does not have (item_ids [] would mean the whole set)", async () => {
    const { set } = await fixture();
    await expect(startRun(set, { kind: "mistakes", itemIds: ["nope"] }, at(0))).rejects.toThrow();
    await expect(startRun(set, { kind: "mistakes", itemIds: [] }, at(0))).rejects.toThrow();
    expect(await db.exercise_runs.count()).toBe(0);
  });

  it("finds the latest run per set and the unfinished one to resume", async () => {
    const { set } = await fixture();
    const other = { ...set, id: "x-other" };
    await db.exercise_sets.put(other);
    const first = await startRun(set, {}, at(0));
    await finishRun(first.id, at(10));
    const second = await startRun(set, {}, at(20));
    await startRun(set, { kind: "mistakes", itemIds: ["q1"] }, at(30));
    const elsewhere = await startRun(other, {}, at(5));

    expect((await latestRunFor(set.id))?.id).toBe(second.id);
    expect((await latestRunFor(set.id, "mistakes"))?.kind).toBe("mistakes");
    expect(await latestRunFor("x-none")).toBeUndefined();
    const last = await lastRunBySet();
    expect([...last.entries()].map(([k, r]) => [k, r.id])).toEqual([
      [set.id, second.id],
      [other.id, elsewhere.id],
    ]);

    // The newest unfinished run is the mistakes round; its set is live.
    expect((await unfinishedRun())?.run.kind).toBe("mistakes");
    await deleteSet(set.id, at(40));
    const resume = await unfinishedRun();
    expect(resume?.run.id).toBe(elsewhere.id);
    expect(resume?.set.id).toBe(other.id);
    await finishRun(elsewhere.id, at(41));
    expect(await unfinishedRun()).toBeUndefined();
  });

  it("resumes only runs started on this device, with something left to play", async () => {
    const { set } = await fixture();
    // A run synced from another device: not in own_runs, so it is never resumed (nor written) here.
    const base = await startRun(set, {}, at(0));
    await Promise.all([db.exercise_runs.delete(base.id), db.own_runs.delete(base.id)]);
    const synced = { ...base, id: "r-elsewhere", started_at: at(50).toISOString() };
    await db.exercise_runs.put(synced);
    const mine = await startRun(set, {}, at(10));
    expect((await unfinishedRun())?.run.id).toBe(mine.id);
    expect((await resumableRunFor(set))?.id).toBe(mine.id);
    expect(await getResumableRun(synced.id, set)).toBeUndefined();
    expect((await getResumableRun(mine.id, set))?.id).toBe(mine.id);

    // Every item settled (left on the last, answered card): nothing to resume, even unfinished.
    for (const item of set.items) await recordAnswer(mine.id, answer(item.id, 1, "correct"), at(11));
    expect(await unfinishedRun()).toBeUndefined();
    expect(await resumableRunFor(set)).toBeUndefined();
  });
});

describe("play context", () => {
  it("blocks words deleted or paused since the set was made, and knows the saved new words", async () => {
    const { set, words } = await fixture();
    const [meuf, kiffer] = words;
    await db.words.put({ ...meuf, muted: true });
    await db.words.put({ ...kiffer, deleted_at: NOON.toISOString() });
    const ctx = await playContext(set);
    expect([...ctx.blocked].sort()).toEqual([meuf.id, kiffer.id].sort());
    expect([...ctx.savedRefs]).toEqual(["n3"]);
    expect([...(await liveWordsById([meuf.id, kiffer.id, "nope"])).keys()]).toEqual([meuf.id]);
  });
});

describe("new words", () => {
  it("adds the checked words with their cards into the set's first theme, skipping saved ones, with undo", async () => {
    const theme = await createFolder({ name: "Тусовка" }, NOON);
    const { set } = await fixture({ folders: [theme.id, "inbox"] });
    expect([...(await savedNewWords(set)).keys()]).toEqual(["n3"]);

    const result = await addNewWords(set, ["n1", "n2", "n3", "n9", "n1"], at(1));
    expect(result.added.map((w) => w.fr)).toEqual(["avoir la flemme", "la teuf"]);
    expect(result.skipped.map((s) => [s.ref, s.existing?.fr ?? null])).toEqual([
      ["n9", null],
      ["n3", "la meuf"],
    ]);
    expect(result.undo).toEqual(result.added.map((w) => w.id));

    const flemme = (await db.words.get(result.undo[0]))!;
    expect(flemme).toMatchObject({
      source: "chat",
      folder_id: theme.id,
      folder_source: "auto",
      ru: "лениться",
      pos: "expression",
      gender: "none",
      slang_level: 1,
      example_fr: "J'ai la flemme.",
      both_directions: true,
    });
    const teuf = (await db.words.get(result.undo[1]))!;
    expect(teuf).toMatchObject({ gender: "f", verlan: true, slang_level: 2 });
    const cards = await db.review_state.where("word_id").anyOf(result.undo).toArray();
    expect(cards.map((c) => c.id).sort()).toEqual(result.undo.flatMap((id) => [`${id}:fr_ru`, `${id}:ru_fr`]).sort());
    expect([...(await savedNewWords(set)).keys()].sort()).toEqual(["n1", "n2", "n3"]);

    await undoAddNewWords(result.undo, at(2));
    const gone = await db.words.bulkGet(result.undo);
    expect(gone.every((w) => w?.deleted_at === at(2).toISOString())).toBe(true);
    const states = await db.review_state.where("word_id").anyOf(result.undo).toArray();
    expect(states.every((s) => s.deleted_at !== null)).toBe(true);
    expect([...(await savedNewWords(set)).keys()]).toEqual(["n3"]);
  });

  it("uses the first theme still live when an earlier one was deleted", async () => {
    const gone = await createFolder({ name: "Удалённая" }, NOON);
    await db.folders.put({ ...gone, deleted_at: NOON.toISOString() });
    const live = await createFolder({ name: "Живая" }, NOON);
    const { set } = await fixture({ folders: [gone.id, live.id] });
    expect((await addNewWords(set, ["n1"], at(1))).added[0].folder_id).toBe(live.id);
    // The inbox named before a live theme is a live choice too.
    expect((await addNewWords({ ...set, folders: [gone.id, "inbox", live.id] }, ["n2"], at(2))).added[0].folder_id).toBeNull();
  });

  it("falls back to «Входящие» when no theme is live or the inbox comes first", async () => {
    const theme = await createFolder({ name: "Старое" }, NOON);
    await db.folders.put({ ...theme, deleted_at: NOON.toISOString() });
    const { set } = await fixture({ folders: [theme.id] });
    expect((await addNewWords(set, ["n1"], at(1))).added[0].folder_id).toBeNull();
    expect((await addNewWords({ ...set, folders: ["inbox"] }, ["n2"], at(2))).added[0].folder_id).toBeNull();
    expect((await addNewWords(set, [], at(3))).added).toEqual([]);
  });

  it("adds a word once when two new words share its dictionary form", async () => {
    const { set } = await fixture();
    const twins = { ...set, new_words: [...set.new_words, { ...set.new_words[1], ref: "n4", fr: "La  Teuf" }] };
    const result = await addNewWords(twins, ["n2", "n4"], at(1));
    expect(result.added.map((w) => w.fr)).toEqual(["la teuf"]);
    expect(result.skipped).toEqual([{ ref: "n4", existing: null }]);
  });
});

describe("scope counts («Трудные · 9», «К повторению · 23»)", () => {
  const YESTERDAY = new Date(NOON.getTime() - 86_400_000).toISOString();
  const NEXT_WEEK = new Date(NOON.getTime() + 7 * 86_400_000).toISOString();
  const card = (word_id: string, kind: "new" | "difficult" | "due" | "both" | "fine", extra: Partial<ReviewState> = {}): ReviewState => {
    const base = newReviewState(word_id, "fr_ru", NOON);
    if (kind === "new") return { ...base, ...extra };
    const difficult = kind === "difficult" || kind === "both";
    const due = kind === "due" || kind === "both" ? YESTERDAY : NEXT_WEEK;
    return { ...base, state: 2, reps: 5, lapses: difficult ? 3 : 0, stability: 10, difficulty: 5, due, ...extra };
  };
  const w = (id: string, extra: Partial<Word> = {}) => ({ id, fr: id, folder_id: null, muted: false, created_at: NOON.toISOString(), deleted_at: null, ...extra }) as Word;
  const paused = { id: "f-later", muted: true, deleted_at: null } as Folder;
  const live = { id: "f-now", muted: false, deleted_at: null } as Folder;

  const words = [
    w("hard", { folder_id: "f-now" }),
    w("due"),
    w("both"),
    w("new"),
    w("fine"),
    w("muted-hard", { muted: true }),
    w("paused-due", { folder_id: "f-later" }),
    w("deleted-hard", { deleted_at: NOON.toISOString() }),
    // Two cards: one due, one difficult — counted once in `both`.
    w("split"),
  ];
  const states = [
    card("hard", "difficult"),
    card("due", "due"),
    card("both", "both"),
    card("new", "new"),
    card("fine", "fine"),
    card("muted-hard", "difficult"),
    card("paused-due", "due"),
    card("deleted-hard", "difficult"),
    card("split", "due"),
    { ...card("split", "difficult"), id: "split-ru", direction: "ru_fr" as const },
    // A deleted card never counts.
    { ...card("fine", "both"), id: "fine-old", deleted_at: NOON.toISOString() },
  ];

  it("counts live unpaused words: difficult, due today and either, like the library ledger", () => {
    const counts = scopeCounts(words, states, [paused, live], NOON);
    expect(counts).toEqual({ difficult: 3, due: 3, both: 4 });
    const lib = libraryStatsFrom([live, paused], words.filter((x) => x.deleted_at === null), states.filter((x) => x.deleted_at === null), NOON);
    expect({ difficult: lib.totals.difficult, due: lib.totals.due }).toEqual({ difficult: counts.difficult, due: counts.due });
    expect(scopeCounts([], [], [], NOON)).toEqual({ difficult: 0, due: 0, both: 0 });
  });

  it("«Авто»'s words: a scope's, else the picked themes', else every unpaused theme's", () => {
    const ids = (out: Word[]) => out.map((x) => x.id).sort();
    expect(ids(requestWords(words, states, [paused, live], [], "difficult", NOON))).toEqual(["both", "hard", "split"]);
    expect(ids(requestWords(words, states, [paused, live], [], "due", NOON))).toEqual(["both", "due", "split"]);
    expect(ids(requestWords(words, states, [paused, live], ["f-now"], null, NOON))).toEqual(["hard"]);
    // A paused theme named by the user is used as asked; «Входящие» is "inbox".
    expect(ids(requestWords(words, states, [paused, live], ["f-later"], null, NOON))).toEqual(["paused-due"]);
    expect(ids(requestWords(words, states, [paused, live], ["inbox"], null, NOON))).toEqual(["both", "due", "fine", "new", "split"]);
    expect(ids(requestWords(words, states, [paused, live], [], null, NOON))).toEqual(["both", "due", "fine", "hard", "new", "split"]);
  });

  it("reads the device's rows", async () => {
    const theme = await createFolder({ name: "Потом" }, NOON);
    await db.folders.put({ ...theme, muted: true });
    const [a, b, c] = await Promise.all(["la meuf", "le keuf", "la daronne"].map((fr) => addWord({ fr, ru: "x", both_directions: false }, NOON)));
    await db.words.update(c.id, { folder_id: theme.id });
    const put = async (word: Word, kind: "difficult" | "due") => {
      const [s] = await db.review_state.where("word_id").equals(word.id).toArray();
      await db.review_state.put({ ...s, ...card(word.id, kind), id: s.id });
    };
    await put(a, "difficult");
    await put(b, "due");
    await put(c, "difficult");
    expect(await getScopeCounts(NOON)).toEqual({ difficult: 1, due: 1, both: 2 });
  });

  it("reads sets synced before the scope column as ordinary sets", async () => {
    const { set } = await fixture();
    const legacy: Partial<ExerciseSet> = { ...set };
    delete legacy.scope;
    await db.exercise_sets.put(legacy as ExerciseSet);
    expect((await liveSets())[0].scope).toBeNull();
    expect((await getSet(set.id))!.scope).toBeNull();
    await db.exercise_sets.put({ ...set, scope: "due" });
    expect((await getSet(set.id))!.scope).toBe("due");
  });
});
