import { describe, expect, it } from "vitest";
import type { ExerciseAnswer, ExerciseItem, ExerciseRun, ExerciseSet } from "../types";
import {
  buildFollowUpText,
  buildQueue,
  buildRequestText,
  clozeParts,
  completeSet,
  contextFromWords,
  countFirstTry,
  DISTRACTORS,
  EXERCISE_ID_PREFIX,
  type ExerciseItemInput,
  type ExerciseLibraryWord,
  type ExerciseSetContent,
  type ExerciseSetInput,
  MAX_ATTEMPTS,
  missedItemIds,
  missedWords,
  optionsFor,
  pairsBoard,
  type QueueEntry,
  REGISTER_LEVELS,
  requeue,
  resumeQueue,
  scoreRun,
  seededRandom,
  shuffled,
  validateSet,
  warningsFor,
} from "./exercises";
import { advancePractice } from "./practice";

const lib = (id: string, fr: string, ru: string, extra: Partial<ExerciseLibraryWord> = {}): ExerciseLibraryWord => ({
  id,
  fr,
  ru,
  pos: "noun",
  gender: "f",
  slang_level: 1,
  verlan: false,
  example_fr: null,
  example_ru: null,
  deleted_at: null,
  ...extra,
});

const WORDS = [
  lib("w-meuf", "la meuf", "девушка", { verlan: true, example_fr: "C'est ma meuf.", example_ru: "Это моя девушка." }),
  lib("w-kiffer", "kiffer", "обожать, тащиться", { pos: "verb", gender: "none" }),
  lib("w-bagnole", "la bagnole", "тачка"),
  lib("w-thune", "la thune", "бабки"),
  lib("w-keuf", "le keuf", "коп", { gender: "m", slang_level: 2, verlan: true }),
  lib("w-daron", "le daron", "батя", { gender: "m" }),
  lib("w-bouffer", "bouffer", "жрать", { pos: "verb", gender: "none" }),
  lib("w-relou", "relou", "надоедливый", { pos: "adj", gender: "none", verlan: true }),
  lib("w-muted", "le flic", "мент", { gender: "m", muted: true }),
  lib("w-gone", "la caisse", "тачка", { deleted_at: "2026-10-01T00:00:00.000Z" }),
  lib("w-blague", "une blague", "шутка", { slang_level: 0 }),
];
const ctx = contextFromWords(WORDS);

const FLEMME = {
  ref: "n1",
  fr: "avoir la flemme",
  ru: "лениться, неохота",
  pos: "expression" as const,
  slang_level: 1 as const,
  example_fr: "J'ai la flemme de sortir.",
  example_ru: "Неохота выходить.",
  source_url: "https://example.org/flemme",
};

function goodInput(): ExerciseSetInput {
  return {
    title: "Сленг на каждый день",
    topic: null,
    folders: ["f-people"],
    new_words: [FLEMME],
    items: [
      { type: "choice", word_id: "w-meuf", distractors: ["машина", "деньги", "полицейский"] },
      { type: "cloze", word_id: "w-kiffer", sentence: "J'ai trop [[kiffé]] ce concert.", sentence_ru: "Концерт был что надо.", answer: "kiffé", distractors: ["bouffé", "galéré", "flippé"] },
      { type: "register", word_id: "w-bagnole" },
      { type: "pairs", pairs: ["w-thune", "w-keuf", "w-daron", "w-bouffer"] },
      {
        type: "choice",
        skill: "situation",
        word_id: "w-relou",
        prompt: "Ton pote parle sans arrêt de son boulot. Il est…",
        answer: "relou",
        distractors: ["ouf", "chelou", "vénère"],
        explain_ru: "relou — верлан от lourd.",
      },
      { type: "choice", skill: "meaning", ask: "ru", new_ref: "n1", distractors: ["avoir la dalle", "avoir le seum", "avoir la frousse"] },
    ],
  };
}

const good = () => completeSet(goodInput(), ctx);

/** The good set with item `i` patched (after completion). */
function withItem(i: number, patch: Partial<ExerciseItem>): ExerciseSetContent {
  const set = good();
  set.items[i] = { ...set.items[i], ...patch };
  return set;
}

/** Completes the good input with item `i` replaced or patched before completion. */
function withInput(i: number, patch: Partial<ExerciseItemInput>, replace = false): ExerciseSetContent {
  const input = goodInput();
  const items = [...input.items];
  items[i] = replace ? (patch as ExerciseItemInput) : { ...items[i], ...patch };
  return completeSet({ ...input, items }, ctx);
}

const paths = (set: ExerciseSetContent) => validateSet(set, ctx).errors.map((e) => e.path);
const errorAt = (set: ExerciseSetContent, path: string) => validateSet(set, ctx).errors.find((e) => e.path === path)?.message;

describe("completeSet", () => {
  it("fills ids, defaults, snapshots and the server-written answers", () => {
    const set = good();
    expect(set.items.map((i) => i.id)).toEqual(["q1", "q2", "q3", "q4", "q5", "q6"]);
    const [meaning, cloze, register, pairs, situation, fresh] = set.items;
    expect(meaning).toMatchObject({ skill: "meaning", ask: "fr", prompt: "la meuf", answer: "девушка", new_ref: null, sentence: null, tiles: [], pairs: [] });
    expect(meaning.word).toEqual({
      fr: "la meuf",
      ru: "девушка",
      pos: "noun",
      gender: "f",
      slang_level: 1,
      verlan: true,
      example_fr: "C'est ma meuf.",
      example_ru: "Это моя девушка.",
    });
    expect(cloze).toMatchObject({ skill: null, ask: null, prompt: null, answer: "kiffé", sentence_ru: "Концерт был что надо." });
    expect(register).toMatchObject({ answer: "fam.", distractors: [], prompt: null });
    expect(pairs).toMatchObject({ word_id: null, new_ref: null, word: null, answer: null, prompt: null });
    expect(pairs.tiles).toEqual([
      { key: "w-thune", fr: "la thune", ru: "бабки" },
      { key: "w-keuf", fr: "le keuf", ru: "коп" },
      { key: "w-daron", fr: "le daron", ru: "батя" },
      { key: "w-bouffer", fr: "bouffer", ru: "жрать" },
    ]);
    expect(situation).toMatchObject({ skill: "situation", ask: null, explain_ru: "relou — верлан от lourd." });
    expect(fresh).toMatchObject({ ask: "ru", prompt: "лениться, неохота", answer: "avoir la flemme", word_id: null, new_ref: "n1" });
    expect(fresh.word?.fr).toBe("avoir la flemme");
    expect(set.new_words[0]).toEqual({ ...FLEMME, note: null, gender: "none", verlan: false, origin: null });
    expect(set.folders).toEqual(["f-people"]);
  });

  it("keeps Claude's prompt and answer, derives a cloze answer from its span, and drops stray fields", () => {
    const set = completeSet(
      {
        title: "  Еда  ",
        items: [
          { type: "choice", word_id: "w-meuf", prompt: "Как сказать «девушка»?", answer: "la meuf", ask: "ru", distractors: ["a", "b", "c"] },
          { type: "cloze", word_id: "w-kiffer", sentence: "Je [[kiffe]] ça.", distractors: ["x", "y", "z"], skill: "form", pairs: ["w-thune"] },
          { type: "register", word_id: "w-keuf", answer: "vulg.", distractors: ["a"] },
          { type: "pairs", word_id: "w-meuf", prompt: "ignored", pairs: ["w-thune", "zzz"], distractors: ["a"] },
        ],
      },
      ctx,
    );
    expect(set.title).toBe("Еда");
    expect(set.topic).toBeNull();
    expect(set.new_words).toEqual([]);
    expect(set.items[0]).toMatchObject({ prompt: "Как сказать «девушка»?", answer: "la meuf" });
    expect(set.items[1]).toMatchObject({ answer: "kiffe", skill: null, pairs: [] });
    expect(set.items[2]).toMatchObject({ answer: "arg.", distractors: [] });
    expect(set.items[3]).toMatchObject({ word_id: null, prompt: null, distractors: [], pairs: ["w-thune", "zzz"] });
    expect(set.items[3].tiles).toEqual([{ key: "w-thune", fr: "la thune", ru: "бабки" }]);
  });

  it("round-trips through JSON unchanged (null, not undefined)", () => {
    const set = good();
    expect(JSON.parse(JSON.stringify(set))).toEqual(set);
    for (const item of set.items) for (const value of Object.values(item)) expect(value).not.toBeUndefined();
  });
});

describe("validateSet", () => {
  it("accepts a good set", () => {
    expect(validateSet(good(), ctx)).toEqual({ ok: true, errors: [] });
  });

  it("checks the title and the topic", () => {
    expect(paths({ ...good(), title: "" })).toEqual(["title"]);
    expect(paths({ ...good(), title: "x".repeat(61) })).toEqual(["title"]);
    expect(paths({ ...good(), topic: "x".repeat(121) })).toEqual(["topic"]);
  });

  it("needs 6–20 items", () => {
    const set = good();
    expect(errorAt({ ...set, items: set.items.slice(0, 5) }, "items")).toMatch(/got 5/);
    const many = Array.from({ length: 21 }, (_, i) => ({ ...set.items[0], id: `q${i + 1}` }));
    expect(errorAt({ ...set, items: many }, "items")).toMatch(/got 21/);
    const twenty = many.slice(0, 20);
    expect(paths({ ...set, items: twenty })).toEqual([]);
  });

  it("refuses unknown, deleted and paused words with the item's path", () => {
    expect(errorAt(withInput(0, { word_id: "nope" }), "items[0].word_id")).toBe('no such word "nope"');
    expect(errorAt(withInput(0, { word_id: "w-gone" }), "items[0].word_id")).toBe('no such word "w-gone"');
    expect(errorAt(withInput(0, { word_id: "w-muted" }), "items[0].word_id")).toMatch(/paused/);
  });

  it("needs exactly one of word_id / new_ref, and new_ref must resolve", () => {
    expect(errorAt(withInput(5, { new_ref: "n9" }), "items[5].new_ref")).toBe('no new word with ref "n9"');
    expect(errorAt(withItem(2, { word_id: "w-bagnole", new_ref: "n1" }), "items[2].word_id")).toMatch(/not both/);
    expect(errorAt(withItem(2, { word_id: null, new_ref: null }), "items[2].word_id")).toMatch(/required/);
  });

  it("needs exactly 3 distractors, distinct after searchKey and never the answer", () => {
    expect(errorAt(withInput(0, { distractors: ["машина", "деньги"] }), "items[0].distractors")).toBe("exactly 3 distractors (got 2)");
    expect(errorAt(withInput(0, { distractors: ["машина", "деньги", "бабки", "коп"] }), "items[0].distractors")).toBe(
      "exactly 3 distractors (got 4)",
    );
    expect(errorAt(withInput(0, { distractors: ["машина", " Девушка ", "коп"] }), "items[0].distractors[1]")).toMatch(/equals the answer/);
    expect(errorAt(withInput(4, { distractors: ["ouf", "Óuf", "vénère"] }), "items[4].distractors[1]")).toMatch(/duplicate/);
    expect(errorAt(withInput(4, { distractors: ["ouf", "", "vénère"] }), "items[4].distractors[1]")).toBe("empty");
    expect(errorAt(withInput(4, { distractors: ["ouf", "x".repeat(121), "vénère"] }), "items[4].distractors[1]")).toMatch(/too long/);
    expect(errorAt(withInput(1, { distractors: ["Kiffé", "galéré", "flippé"] }), "items[1].distractors[0]")).toMatch(/equals the answer/);
    expect(DISTRACTORS).toBe(3);
  });

  it("checks choice items: prompt, answer, skill and ask", () => {
    expect(errorAt(withInput(4, { prompt: null }), "items[4].prompt")).toBe("required");
    expect(errorAt(withInput(4, { prompt: "x".repeat(301) }), "items[4].prompt")).toMatch(/too long/);
    expect(errorAt(withInput(4, { answer: null }), "items[4].answer")).toBe("required");
    expect(errorAt(withInput(4, { answer: "x".repeat(121) }), "items[4].answer")).toMatch(/too long/);
    expect(errorAt(withItem(4, { skill: "grammar" as never }), "items[4].skill")).toMatch(/one of/);
    expect(errorAt(withItem(0, { ask: null }), "items[0].ask")).toMatch(/"fr" or "ru"/);
    expect(errorAt(withInput(4, { explain_ru: "x".repeat(201) }), "items[4].explain_ru")).toMatch(/too long/);
  });

  it("needs a cloze with exactly one [[…]] span equal to the answer under normalizeLemma", () => {
    expect(errorAt(withInput(1, { sentence: "J'ai trop kiffé ce concert." }), "items[1].sentence")).toBe("exactly one [[…]] span (got 0)");
    expect(errorAt(withInput(1, { sentence: "J'ai [[trop]] [[kiffé]] ce concert." }), "items[1].sentence")).toBe("exactly one [[…]] span (got 2)");
    expect(errorAt(withInput(1, { sentence: "J'ai trop [[ ]] ce concert." }), "items[1].sentence")).toMatch(/empty/);
    expect(errorAt(withInput(1, { sentence: "J'ai trop [[aimé]] ce concert." }), "items[1].sentence")).toMatch(/differs from the answer/);
    expect(errorAt(withInput(1, { sentence: null }), "items[1].sentence")).toBe("required");
    // Articles, case and final punctuation do not count; accents do.
    expect(paths(withInput(1, { sentence: "C'est [[la meuf]] de Karim.", answer: "Meuf", distractors: ["keuf", "teuf", "reuf"] }))).toEqual([]);
    expect(errorAt(withInput(1, { sentence: "J'ai trop [[kiffe]] ce concert." }), "items[1].sentence")).toMatch(/differs/);
  });

  it("needs a register word with a slang level and the matching answer", () => {
    expect(errorAt(withInput(2, { word_id: "nope" }), "items[2].word")).toMatch(/slang_level/);
    expect(errorAt(withItem(2, { answer: "arg." }), "items[2].answer")).toBe("must be «fam.»");
    expect(errorAt(withItem(2, { distractors: ["arg."] }), "items[2].distractors")).toMatch(/four levels/);
    expect(paths(withInput(2, { new_ref: "n1", word_id: null }))).toEqual([]);
  });

  it("needs 4–6 unique, live pairs words (new words allowed)", () => {
    expect(errorAt(withInput(3, { pairs: ["w-thune", "w-keuf", "w-daron"] }), "items[3].pairs")).toBe("4–6 words (got 3)");
    const seven = ["w-thune", "w-keuf", "w-daron", "w-bouffer", "w-blague", "w-relou", "w-meuf"];
    expect(errorAt(withInput(3, { pairs: seven }), "items[3].pairs")).toBe("4–6 words (got 7)");
    expect(errorAt(withInput(3, { pairs: ["w-thune", "w-keuf", "w-daron", "w-thune"] }), "items[3].pairs[3]")).toMatch(/duplicate/);
    expect(errorAt(withInput(3, { pairs: ["w-thune", "w-keuf", "w-daron", "w-muted"] }), "items[3].pairs[3]")).toMatch(/paused/);
    expect(errorAt(withInput(3, { pairs: ["w-thune", "w-keuf", "w-daron", "nope"] }), "items[3].pairs[3]")).toMatch(/no such word/);
    expect(paths(withInput(3, { pairs: ["w-thune", "w-keuf", "w-daron", "n1"] }))).toEqual([]);
    expect(errorAt(withInput(3, { pairs: ["w-thune", "w-keuf", "w-daron", "w-bagnole"] }), "items[3].pairs[3]")).toBeUndefined();
    // la bagnole and the deleted la caisse are both «тачка»; with two live «тачка» words the tiles clash.
    const clash = contextFromWords([...WORDS, lib("w-tire", "la tire", "тачка")]);
    const set = completeSet({ ...goodInput(), items: goodInput().items.map((it, i) => (i === 3 ? { ...it, pairs: ["w-thune", "w-keuf", "w-bagnole", "w-tire"] } : it)) }, clash);
    expect(validateSet(set, clash).errors.map((e) => e.path)).toEqual(["items[3].pairs[3]"]);
    expect(errorAt(withItem(3, { tiles: [] }), "items[3].tiles")).toMatch(/server/);
    expect(errorAt(withItem(3, { distractors: ["x"] }), "items[3].distractors")).toMatch(/no distractors/);
  });

  it("checks new words: at most 8, unique refs, not already saved", () => {
    const nine = Array.from({ length: 9 }, (_, i) => ({ ...FLEMME, ref: `n${i + 1}`, fr: `mot${i + 1}` }));
    expect(errorAt(completeSet({ ...goodInput(), new_words: nine }, ctx), "new_words")).toMatch(/at most 8/);
    expect(errorAt(completeSet({ ...goodInput(), new_words: [FLEMME, { ...FLEMME, fr: "galérer" }] }, ctx), "new_words[1].ref")).toMatch(/duplicate/);
    expect(errorAt(completeSet({ ...goodInput(), new_words: [FLEMME, { ...FLEMME, ref: "n2" }] }, ctx), "new_words[1].fr")).toMatch(/twice/);
    expect(errorAt(completeSet({ ...goodInput(), new_words: [FLEMME, { ...FLEMME, ref: "n2", fr: "meuf" }] }, ctx), "new_words[1].fr")).toBe(
      "«meuf» is already saved: use word_id w-meuf",
    );
    // A deleted word may come back as a new one.
    expect(paths(completeSet({ ...goodInput(), new_words: [FLEMME, { ...FLEMME, ref: "n2", fr: "la caisse" }] }, ctx))).toEqual([]);
    expect(errorAt(completeSet({ ...goodInput(), new_words: [FLEMME, { ...FLEMME, ref: "n2", fr: "x", ru: "" }] }, ctx), "new_words[1].ru")).toBe("required");
    expect(errorAt(completeSet({ ...goodInput(), new_words: [FLEMME, { ...FLEMME, ref: "", fr: "x" }] }, ctx), "new_words[1].ref")).toBe("required");
    expect(errorAt(completeSet({ ...goodInput(), new_words: [FLEMME, { ...FLEMME, ref: "x".repeat(21), fr: "x" }] }, ctx), "new_words[1].ref")).toMatch(/too long/);
    expect(errorAt({ ...good(), new_words: [{ ...good().new_words[0], slang_level: 5 as never }] }, "new_words[0].slang_level")).toMatch(/0, 1, 2 or 3/);
  });

  it("checks item ids and types", () => {
    expect(errorAt(withItem(1, { id: "q1" }), "items[1].id")).toMatch(/duplicate/);
    expect(errorAt(withItem(1, { id: "" }), "items[1].id")).toBe("required");
    expect(errorAt(withItem(1, { id: "q".repeat(21) }), "items[1].id")).toMatch(/too long/);
    expect(errorAt(withItem(1, { type: "typed" as never }), "items[1].type")).toMatch(/one of choice, cloze, register, pairs/);
  });

  it("reports every problem at once", () => {
    const set = good();
    set.items[0] = { ...set.items[0], word_id: "nope" };
    set.items[4] = { ...set.items[4], distractors: ["ouf"] };
    expect(validateSet(set, ctx)).toMatchObject({ ok: false });
    expect(paths(set)).toEqual(["items[0].word_id", "items[4].distractors"]);
  });
});

describe("warningsFor", () => {
  const codes = (set: Pick<ExerciseSet, "items" | "new_words">) => warningsFor(set).map((w) => w.code);

  it("is quiet for a good set", () => {
    expect(warningsFor(good())).toEqual([]);
  });

  it("warns on fewer than 3 item types", () => {
    const set = good();
    const choices = set.items.filter((i) => i.type === "choice" || i.type === "cloze");
    expect(codes({ ...set, items: choices })).toContain("few_types");
  });

  it("warns when the answer is the longest option in more than 60% of items", () => {
    const set = good();
    set.items[0] = { ...set.items[0], distractors: ["коп", "тачка", "бабки"] };
    set.items[4] = { ...set.items[4], distractors: ["ouf", "zarb", "ouej"] };
    expect(codes(set)).not.toContain("longest_answer"); // 2 of 4
    set.items[1] = { ...set.items[1], distractors: ["vu", "lu", "eu"] };
    expect(warningsFor(set).find((w) => w.code === "longest_answer")?.message).toMatch(/3 of 4/);
  });

  it("warns when an answer shows in a stem", () => {
    const own = withItem(4, { prompt: "Il est relou, ton pote." });
    expect(warningsFor(own)).toContainEqual(expect.objectContaining({ code: "stem_leak", path: "items[4]", message: expect.stringMatching(/own stem/) }));
    const other = withItem(1, { sentence: "Ton pote est relou, j'ai trop [[kiffé]] partir." });
    expect(warningsFor(other)).toContainEqual(expect.objectContaining({ code: "stem_leak", path: "items[4]", message: expect.stringMatching(/items\[1\]/) }));
    // Inside a word does not count, nor does an item about the same word.
    expect(codes(withItem(1, { sentence: "C'est reloud, j'ai trop [[kiffé]]." }))).not.toContain("stem_leak");
    const same = good();
    same.items[1] = { ...same.items[1], word_id: "w-relou", sentence: "Il est [[relou]] avec ses blagues.", answer: "relou" };
    same.items[4] = { ...same.items[4], prompt: "Il est trop [[relou]]…".replace(/\[\[|\]\]/g, "") };
    expect(warningsFor(same).filter((w) => w.code === "stem_leak").map((w) => w.path)).toEqual(["items[4]"]);
  });

  it("warns on the same word in consecutive items (pairs included)", () => {
    const set = good();
    const [a, b, ...rest] = set.items;
    expect(codes({ ...set, items: [a, { ...b, word_id: "w-meuf" }, ...rest] })).toContain("consecutive_word");
    const pairsNext = withItem(4, { word_id: "w-keuf" });
    expect(warningsFor(pairsNext)).toContainEqual(expect.objectContaining({ code: "consecutive_word", path: "items[4]" }));
  });

  it("warns when more than 30% of the words are new", () => {
    const set = good();
    const fresh = Array.from({ length: 4 }, (_, i) => ({ ...set.new_words[0], ref: `n${i + 2}`, fr: `mot${i}` }));
    const items = set.items.map((it, i) => (i === 3 ? { ...it, pairs: ["n2", "n3", "n4", "n5"] } : it));
    expect(warningsFor({ items, new_words: [...set.new_words, ...fresh] })).toContainEqual(
      expect.objectContaining({ code: "many_new_words", message: expect.stringMatching(/^5 of 9/) }),
    );
    expect(codes(set)).not.toContain("many_new_words");
  });
});

describe("options", () => {
  it("puts the answer in every position across seeds, and the correct index points at it", () => {
    const item = good().items[0];
    const positions = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const { options, correct } = optionsFor(item, seededRandom(seed));
      expect(options).toHaveLength(4);
      expect([...options].sort()).toEqual([item.answer!, ...item.distractors].sort());
      expect(options[correct]).toBe(item.answer);
      positions.add(correct);
    }
    expect([...positions].sort()).toEqual([0, 1, 2, 3]);
  });

  it("is deterministic for a seed", () => {
    const item = good().items[1];
    expect(optionsFor(item, seededRandom(7))).toEqual(optionsFor(item, seededRandom(7)));
  });

  it("lists the four register levels in order", () => {
    const set = good();
    expect(optionsFor(set.items[2], seededRandom(3))).toEqual({ options: ["нейтр.", "fam.", "arg.", "vulg."], correct: 1 });
    expect(REGISTER_LEVELS).toHaveLength(4);
    const keuf = completeSet({ ...goodInput(), items: [{ type: "register", word_id: "w-keuf" }] }, ctx).items[0];
    expect(optionsFor(keuf).correct).toBe(2);
  });

  it("has no options for pairs; pairsBoard shuffles both columns", () => {
    const pairs = good().items[3];
    expect(optionsFor(pairs)).toEqual({ options: [], correct: -1 });
    const board = pairsBoard(pairs, seededRandom(5));
    expect([...board.fr].sort((a, b) => a.key.localeCompare(b.key))).toEqual([...pairs.tiles].sort((a, b) => a.key.localeCompare(b.key)));
    expect(board.ru).toHaveLength(4);
    const orders = new Set(Array.from({ length: 10 }, (_, s) => pairsBoard(pairs, seededRandom(s + 1)).fr.map((t) => t.key).join()));
    expect(orders.size).toBeGreaterThan(1);
  });

  it("shuffled keeps every element", () => {
    expect(shuffled([1, 2, 3, 4, 5], seededRandom(9)).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("splits a cloze sentence", () => {
    expect(clozeParts("J'ai trop [[kiffé]] ce concert.")).toEqual({ before: "J'ai trop ", after: " ce concert.", answer: "kiffé" });
    expect(clozeParts("[[Wesh]], ça va ?")).toEqual({ before: "", after: ", ça va ?", answer: "Wesh" });
    expect(clozeParts("pas de trou")).toBeNull();
    expect(clozeParts("[[a]] et [[b]]")).toBeNull();
    expect(clozeParts("vide [[ ]]")).toBeNull();
  });
});

const item = (id: string, word: string, type: ExerciseItem["type"] = "choice"): ExerciseItem => ({
  id,
  type,
  skill: type === "choice" ? "neutral" : null,
  ask: null,
  word_id: word.startsWith("n") ? null : word,
  new_ref: word.startsWith("n") ? word : null,
  prompt: "p",
  sentence: null,
  sentence_ru: null,
  answer: "a",
  distractors: ["b", "c", "d"],
  pairs: [],
  tiles: [],
  explain_ru: null,
  word: null,
});
const pairsItem = (id: string, refs: string[]): ExerciseItem => ({ ...item(id, "x", "pairs"), word_id: null, new_ref: null, pairs: refs });
const ids = (q: QueueEntry[]) => q.map((e) => (e.kind === "intro" ? `+${e.new_ref}` : e.item_id));
const newWord = (ref: string) => ({ ...good().new_words[0], ref });

describe("buildQueue", () => {
  it("keeps the set's order when words do not repeat", () => {
    const set = { items: [item("q1", "a"), item("q2", "b"), item("q3", "c")], new_words: [] };
    expect(buildQueue(set)).toEqual([
      { kind: "item", item_id: "q1", attempt: 1 },
      { kind: "item", item_id: "q2", attempt: 1 },
      { kind: "item", item_id: "q3", attempt: 1 },
    ]);
  });

  it("keeps at least 2 items between repeats of a word where possible", () => {
    const set = { items: [item("q1", "a"), item("q2", "a"), item("q3", "b"), item("q4", "c"), item("q5", "d")], new_words: [] };
    expect(ids(buildQueue(set))).toEqual(["q1", "q3", "q4", "q2", "q5"]);
    // Pairs count for each of their words.
    const withPairs = { items: [item("q1", "a"), pairsItem("q2", ["a", "b", "c", "d"]), item("q3", "e"), item("q4", "f")], new_words: [] };
    expect(ids(buildQueue(withPairs))).toEqual(["q1", "q3", "q4", "q2"]);
  });

  it("falls back to a gap of 1, then to no gap, when nothing else fits", () => {
    expect(ids(buildQueue({ items: [item("q1", "a"), item("q2", "a"), item("q3", "b")], new_words: [] }))).toEqual(["q1", "q3", "q2"]);
    expect(ids(buildQueue({ items: [item("q1", "a"), item("q2", "a"), item("q3", "a")], new_words: [] }))).toEqual(["q1", "q2", "q3"]);
  });

  it("puts a new word's intro card right before its first item, once", () => {
    const set = {
      items: [item("q1", "a"), item("q2", "n1"), item("q3", "b"), item("q4", "c"), item("q5", "n1"), pairsItem("q6", ["d", "n2", "e", "f"])],
      new_words: [newWord("n1"), newWord("n2")],
    };
    expect(ids(buildQueue(set))).toEqual(["q1", "+n1", "q2", "q3", "q4", "q5", "+n2", "q6"]);
    expect(ids(buildQueue(set, { intros: false }))).toEqual(["q1", "q2", "q3", "q4", "q5", "q6"]);
  });

  it("plays only the given items (a mistakes round), optionally shuffled", () => {
    const set = { items: [item("q1", "a"), item("q2", "b"), item("q3", "c"), item("q4", "d")], new_words: [] };
    expect(ids(buildQueue(set, { itemIds: ["q4", "q2"] }))).toEqual(["q2", "q4"]);
    const orders = new Set(Array.from({ length: 12 }, (_, s) => ids(buildQueue(set, { random: seededRandom(s + 1) })).join()));
    expect(orders.size).toBeGreaterThan(1);
    for (const o of orders) expect(o.split(",").sort()).toEqual(["q1", "q2", "q3", "q4"]);
  });
});

describe("requeue", () => {
  const q = (n: number): QueueEntry[] => Array.from({ length: n }, (_, i) => ({ kind: "item", item_id: `q${i + 1}`, attempt: 1 }));

  it("drops a right answer and a seen intro card", () => {
    expect(ids(requeue(q(3), "correct"))).toEqual(["q2", "q3"]);
    expect(ids(requeue([{ kind: "intro", new_ref: "n1" }, ...q(2)], "seen"))).toEqual(["q1", "q2"]);
    expect(ids(requeue([{ kind: "intro", new_ref: "n1" }, ...q(2)], "wrong"))).toEqual(["q1", "q2"]);
    expect(requeue([], "wrong")).toEqual([]);
  });

  it("brings a wrong answer or «Не знаю» back after 3 others with the next attempt", () => {
    for (const outcome of ["wrong", "dont_know"] as const) {
      const next = requeue(q(5), outcome);
      expect(ids(next)).toEqual(["q2", "q3", "q4", "q1", "q5"]);
      expect(next[3]).toEqual({ kind: "item", item_id: "q1", attempt: 2 });
    }
    expect(ids(requeue(q(2), "wrong"))).toEqual(["q2", "q1"]);
    expect(ids(requeue(q(1), "wrong"))).toEqual(["q1"]);
  });

  it("matches advancePractice's Again step", () => {
    expect(ids(requeue(q(6), "wrong"))).toEqual(ids(advancePractice(q(6), 1)));
  });

  it("lets an item go after MAX_ATTEMPTS misses", () => {
    let queue: QueueEntry[] = q(1);
    for (let i = 1; i < MAX_ATTEMPTS; i++) queue = requeue(queue, "wrong");
    expect(queue).toEqual([{ kind: "item", item_id: "q1", attempt: MAX_ATTEMPTS }]);
    expect(requeue(queue, "wrong")).toEqual([]);
  });
});

const answer = (item_id: string, attempt: number, outcome: ExerciseAnswer["outcome"], extra: Partial<ExerciseAnswer> = {}): ExerciseAnswer => ({
  item_id,
  word_id: null,
  new_ref: null,
  attempt,
  outcome,
  chosen: null,
  ms: 1200,
  at: "2026-10-23T10:00:00.000Z",
  ...extra,
});

const run = (answers: ExerciseAnswer[], extra: Partial<ExerciseRun> = {}): Pick<ExerciseRun, "item_ids" | "answers" | "kind"> => ({
  item_ids: [],
  answers,
  kind: "set",
  ...extra,
});

describe("scoring", () => {
  it("counts questions, first tries and accuracy", () => {
    const set = good();
    const answers = [
      answer("q1", 1, "correct"),
      answer("q2", 1, "wrong", { chosen: "bouffé", word_id: "w-kiffer" }),
      answer("q3", 1, "correct"),
      answer("q2", 2, "correct"),
      answer("q4", 1, "dont_know"),
    ];
    expect(scoreRun(run(answers), set)).toEqual({ total: 6, answered: 4, first_try: 2, accuracy: 33 });
    expect(countFirstTry(answers)).toBe(2);
    expect(scoreRun(run([]), set)).toEqual({ total: 6, answered: 0, first_try: 0, accuracy: 0 });
    // A mistakes round counts only its own items.
    expect(scoreRun(run([answer("q2", 1, "correct")], { item_ids: ["q2", "q4"] }), set)).toEqual({ total: 2, answered: 1, first_try: 1, accuracy: 50 });
    expect(scoreRun(run([]), { items: [] })).toEqual({ total: 0, answered: 0, first_try: 0, accuracy: 0 });
  });

  it("does not count a first try that had a miss in it (a pairs board logs its mismatches first)", () => {
    const answers = [
      answer("q4", 1, "wrong", { word_id: "w-keuf", chosen: "бабки" }),
      answer("q4", 1, "correct"),
      answer("q1", 1, "correct"),
    ];
    expect(countFirstTry(answers)).toBe(1);
    expect(scoreRun(run(answers), good()).first_try).toBe(1);
  });

  it("lists the missed items and words, one entry per word, in order of the first miss", () => {
    const set = good();
    const answers = [
      answer("q5", 1, "wrong", { word_id: "w-relou", chosen: "chelou" }),
      answer("q1", 1, "correct", { word_id: "w-meuf" }),
      answer("q6", 1, "dont_know", { new_ref: "n1" }),
      answer("q4", 1, "wrong", { word_id: "w-keuf", chosen: "девушка" }),
      answer("q5", 2, "wrong", { word_id: "w-relou", chosen: "vénère" }),
      answer("q5", 3, "wrong", { word_id: "w-relou", chosen: "chelou" }),
    ];
    expect(missedItemIds(run(answers))).toEqual(["q5", "q6", "q4"]);
    const missed = missedWords(run(answers), set);
    expect(missed.map((m) => m.key)).toEqual(["w-relou", "n1", "w-keuf"]);
    expect(missed[0]).toMatchObject({ word_id: "w-relou", new_ref: null, fr: "relou", ru: "надоедливый", item_ids: ["q5"], chosen: ["chelou", "vénère"] });
    expect(missed[0].word?.verlan).toBe(true);
    expect(missed[1]).toMatchObject({ word_id: null, new_ref: "n1", fr: "avoir la flemme", chosen: [] });
    expect(missed[2]).toMatchObject({ fr: "le keuf", ru: "коп", word: null, chosen: ["девушка"] });
    // The item's word is the fallback when the answer names none.
    expect(missedWords(run([answer("q2", 1, "wrong")]), set).map((m) => m.key)).toEqual(["w-kiffer"]);
    expect(missedWords(run([answer("q1", 1, "correct")]), set)).toEqual([]);
  });
});

describe("resumeQueue", () => {
  const set = {
    items: [item("q1", "a"), item("q2", "n1"), item("q3", "b"), item("q4", "c"), item("q5", "n2")],
    new_words: [newWord("n1"), newWord("n2")],
  };

  it("continues with the unsettled items at their next attempt, without intros already seen", () => {
    const answers = [answer("q1", 1, "correct"), answer("q2", 1, "wrong")];
    const queue = resumeQueue(set, run(answers));
    expect(ids(queue)).toEqual(["q2", "q3", "q4", "+n2", "q5"]);
    expect(queue[0]).toEqual({ kind: "item", item_id: "q2", attempt: 2 });
  });

  it("drops items out of attempts, and is empty when all are settled", () => {
    const answers = [answer("q1", 1, "wrong"), answer("q1", 2, "wrong"), answer("q1", MAX_ATTEMPTS, "dont_know")];
    expect(ids(resumeQueue(set, run(answers)))).toEqual(["+n1", "q2", "q3", "q4", "+n2", "q5"]);
    const all = set.items.map((i) => answer(i.id, 1, "correct"));
    expect(resumeQueue(set, run(all))).toEqual([]);
  });

  it("a mistakes round resumes its own items without intro cards", () => {
    expect(ids(resumeQueue(set, run([answer("q2", 1, "correct")], { kind: "mistakes", item_ids: ["q2", "q5"] })))).toEqual(["q5"]);
  });
});

describe("request texts", () => {
  it("builds the texts of the request sheet", () => {
    expect(buildRequestText({ folders: ["Люди", "Эмоции"], topic: null, size: 12, allowNew: true })).toBe(
      "Сделай упражнение в Карточках: темы «Люди», «Эмоции», 12 вопросов, можно новые слова.",
    );
    expect(buildRequestText({ folders: ["Люди"], topic: null, size: 12, allowNew: false })).toBe(
      "Сделай упражнение в Карточках по теме «Люди», 12 вопросов.",
    );
    expect(buildRequestText({ folders: [], topic: " вечеринка ", size: 12, allowNew: true })).toBe(
      "Сделай упражнение в Карточках на тему «вечеринка», 12 вопросов, можно новые слова.",
    );
    expect(buildRequestText({ folders: [], topic: null, size: 12, allowNew: false })).toBe("Сделай упражнение в Карточках по всем темам, 12 вопросов.");
    expect(buildRequestText({ folders: [], topic: "  ", size: 8, allowNew: false })).toBe("Сделай упражнение в Карточках по всем темам, 8 вопросов.");
  });

  it("combines themes with a custom topic, drops repeats and agrees the number", () => {
    expect(buildRequestText({ folders: ["Еда"], topic: "рынок", size: 16, allowNew: false })).toBe(
      "Сделай упражнение в Карточках по теме «Еда» и на тему «рынок», 16 вопросов.",
    );
    expect(buildRequestText({ folders: ["Еда", "Входящие", "Еда"], topic: "рынок", size: 21, allowNew: false })).toBe(
      "Сделай упражнение в Карточках: темы «Еда», «Входящие» и тема «рынок», 21 вопрос.",
    );
    expect(buildRequestText({ folders: [], topic: null, size: 3, allowNew: false })).toMatch(/3 вопроса\.$/);
  });

  it("asks for the next set with the misses", () => {
    const set = { ...good(), title: "Вечеринка" };
    const missed = missedWords(run([answer("q5", 1, "wrong"), answer("q4", 1, "wrong", { word_id: "w-keuf" }), answer("q5", 2, "wrong")]), set);
    expect(buildFollowUpText(set, missed)).toBe(
      "Сделай следующее упражнение в Карточках после «Вечеринка», 6 вопросов, с упором на ошибки: relou, le keuf, можно новые слова.",
    );
    expect(buildFollowUpText({ ...set, new_words: [] }, [])).toBe("Сделай следующее упражнение в Карточках после «Вечеринка», 6 вопросов.");
  });
});

describe("ids and lookups", () => {
  it("exports the id prefix", () => {
    expect(EXERCISE_ID_PREFIX).toBe("x-");
  });

  it("contextFromWords finds saved words by lemma, live ones only", () => {
    expect(ctx.savedWord?.("MEUF")?.id).toBe("w-meuf");
    expect(ctx.savedWord?.("une meuf.")?.id).toBe("w-meuf");
    expect(ctx.savedWord?.("la caisse")).toBeUndefined();
    expect(ctx.word("w-gone")?.deleted_at).not.toBeNull();
  });
});
