import { describe, expect, it } from "vitest";
import type { ExerciseAnswer, ExerciseItem, ExerciseRun, ExerciseSet } from "@/lib/types";
import { setPendingExercise, takePendingExercise } from "./exercise-request";
import {
  firstTryMarks,
  isWaiting,
  levelHint,
  nNew,
  nQuestions,
  nSets,
  nWebWords,
  repeatsTitle,
  requestSummary,
  resumeProgress,
  setKind,
  setThemesLine,
  shortDate,
  similarRequest,
  tileLines,
  tileState,
  WAITING_MAX_MS,
  type LastRequest,
} from "./list-format";

const item = (id: string): ExerciseItem => ({
  id,
  type: "choice",
  skill: "meaning",
  ask: "fr",
  tense: null,
  person: null,
  word_id: `w-${id}`,
  new_ref: null,
  prompt: "meuf",
  sentence: null,
  sentence_ru: null,
  answer: "девушка",
  distractors: ["a", "b", "c"],
  pairs: [],
  tiles: [],
  explain_ru: null,
  word: null,
});

const set = (over: Partial<ExerciseSet> = {}): ExerciseSet => ({
  id: "x-1",
  title: "Вечеринка",
  topic: null,
  folders: [],
  items: ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8"].map(item),
  new_words: [],
  scope: null,
  level: null,
  level_auto: false,
  source: "chat",
  created_at: "2026-10-22T10:00:00.000Z",
  updated_at: "2026-10-22T10:00:00.000Z",
  deleted_at: null,
  ...over,
});

const answer = (item_id: string, outcome: ExerciseAnswer["outcome"], attempt = 1): ExerciseAnswer => ({
  item_id,
  word_id: `w-${item_id}`,
  new_ref: null,
  attempt,
  outcome,
  chosen: null,
  ms: 900,
  at: "2026-10-22T11:00:00.000Z",
});

const run = (answers: ExerciseAnswer[], finished: boolean): ExerciseRun => ({
  id: "r-1",
  set_id: "x-1",
  kind: "set",
  item_ids: [],
  started_at: "2026-10-22T11:00:00.000Z",
  finished_at: finished ? "2026-10-22T11:05:00.000Z" : null,
  answers,
  total: 8,
  first_try: 0,
  updated_at: "2026-10-22T11:05:00.000Z",
  deleted_at: null,
});

describe("counts", () => {
  it("agrees Russian numbers", () => {
    expect(nQuestions(12)).toBe("12 вопросов");
    expect(nQuestions(21)).toBe("21 вопрос");
    expect(nQuestions(3)).toBe("3 вопроса");
    expect(nSets(5)).toBe("5 наборов");
    expect(nSets(4)).toBe("4 набора");
    expect(nSets(1)).toBe("1 набор");
    expect(nNew(1)).toBe("1 новый");
    expect(nNew(2)).toBe("2 новых");
    expect(nNew(11)).toBe("11 новых");
  });

  it("prints the day and month", () => {
    expect(shortDate(new Date(2026, 9, 2, 12).toISOString())).toBe("02.10");
    expect(shortDate("nope")).toBe("");
  });
});

describe("setThemesLine", () => {
  const names = new Map([
    ["f-people", "Люди"],
    ["f-emo", "Эмоции"],
  ]);

  it("names the themes, «Входящие» included, skipping deleted ones", () => {
    expect(setThemesLine(set({ folders: ["f-people", "f-emo"] }), names)).toBe("Люди, Эмоции");
    expect(setThemesLine(set({ folders: ["inbox", "f-gone"] }), names)).toBe("Входящие");
  });

  it("says «Своя тема» and counts the web words", () => {
    const fresh = Array.from({ length: 3 }, (_, i) => ({
      ref: `n${i}`,
      fr: `mot${i}`,
      ru: "слово",
      note: null,
      example_fr: null,
      example_ru: null,
      pos: "noun" as const,
      gender: "m" as const,
      slang_level: 1 as const,
      verlan: false,
      origin: null,
      source_url: null,
    }));
    expect(setThemesLine(set({ topic: "вечеринка", new_words: fresh }), names)).toBe("Своя тема · +3 слова");
    expect(setThemesLine(set({ topic: "вечеринка", folders: ["f-people"] }), names)).toBe("Люди · своя тема");
    expect(setThemesLine(set(), names)).toBe("Все темы");
  });

  it("names a scoped set by its words, not its themes", () => {
    expect(setThemesLine(set({ scope: "difficult", folders: ["f-people"] }), names)).toBe("Трудные · все темы");
    expect(setThemesLine(set({ scope: "due" }), names)).toBe("К повторению · все темы");
    expect(setThemesLine(set({ scope: "both" }), names)).toBe("Трудные и к повторению");
    // A row synced before the column existed has no scope at all.
    const { scope: _drop, ...legacy } = set();
    void _drop;
    expect(setThemesLine(legacy, names)).toBe("Все темы");
  });
});

describe("tileState", () => {
  it("a set never played is new, with the red band and no progress", () => {
    expect(tileState(set(), undefined)).toEqual({
      label: "Новый",
      short: null,
      tone: "new",
      progress: 0,
      fresh: true,
      resumeRunId: null,
      marks: [],
      said: "Ещё не играли",
    });
  });

  it("an unfinished run is «Прервано answered/total» and resumable", () => {
    const r = run([answer("q1", "correct"), answer("q2", "wrong"), answer("q3", "correct"), answer("q4", "dont_know"), answer("q5", "correct")], false);
    expect(tileState(set(), r)).toEqual({
      label: "Прервано 5/8",
      short: "5/8",
      tone: "ink",
      progress: 5 / 8,
      fresh: false,
      resumeRunId: "r-1",
      marks: ["first", "miss", "first", "miss", "first", "future", "future", "future"],
      said: "Прервано, отвечено 5 из 8",
    });
    expect(resumeProgress(r, set())).toEqual({ answered: 5, total: 8, progress: 5 / 8 });
  });

  it("a finished run shows first-try / total with a full line", () => {
    const answers = ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8"].map((id, i) => answer(id, i === 0 ? "wrong" : "correct"));
    expect(tileState(set(), run([...answers, answer("q1", "correct", 2)], true))).toMatchObject({
      label: "7/8",
      progress: 1,
      resumeRunId: null,
      marks: ["miss", "first", "first", "first", "first", "first", "first", "first"],
      said: "В прошлый раз 7 из 8 с первого раза, ошибка 1",
    });
  });

  it("a run left on its last, answered card reads as finished", () => {
    const answers = ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8"].map((id) => answer(id, "correct"));
    expect(tileState(set(), run(answers, false))).toMatchObject({ label: "8/8", progress: 1, resumeRunId: null, said: "В прошлый раз 8 из 8 с первого раза" });
  });

  it("another device's interrupted run is shown but not resumed here", () => {
    const r = run([answer("q1", "correct")], false);
    expect(tileState(set(), r, new Set())).toMatchObject({ label: "Прервано 1/8", resumeRunId: null });
    expect(tileState(set(), r, new Set(["r-1"]))).toMatchObject({ resumeRunId: "r-1" });
  });
});

describe("phone tiles (E1 A)", () => {
  const names = new Map([
    ["f-people", "Люди"],
    ["f-emo", "Эмоции"],
    ["f-police", "Полиция"],
    ["f-daily", "Повседневное"],
  ]);
  const typed = (types: ExerciseItem["type"][]) => types.map((type, i) => ({ ...item(`q${i}`), type }));
  const web = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      ref: `n${i}`,
      fr: `mot${i}`,
      ru: "слово",
      note: null,
      example_fr: null,
      example_ru: null,
      pos: "noun" as const,
      gender: "m" as const,
      slang_level: 1 as const,
      verlan: false,
      origin: null,
      source_url: null,
    }));

  it("names the kind when one kind makes up the set", () => {
    expect(setKind(typed(["conjugate", "conjugate", "conjugate", "choice"]))).toBe("спряжение");
    expect(setKind(typed(["cloze", "cloze", "cloze", "choice", "pairs"]))).toBe("пропуски");
    expect(setKind(typed(["pairs", "pairs", "choice"]))).toBe("пары");
    expect(setKind(typed(["register", "register", "register", "choice"]))).toBe("регистр");
    expect(setKind(typed(["choice", "cloze", "register", "pairs"]))).toBeNull();
    expect(setKind(typed(["choice", "choice", "cloze"]))).toBeNull();
    expect(setKind([])).toBeNull();
  });

  it("knows when a theme repeats the title", () => {
    expect(repeatsTitle("Полиция", "Полиция")).toBe(true);
    expect(repeatsTitle("Еда и кафе", "еда и кафе")).toBe(true);
    expect(repeatsTitle("Сленг: люди", "Люди")).toBe(true);
    expect(repeatsTitle("Глаголы: passé composé", "Повседневное")).toBe(false);
  });

  it("says the kind and the themes, leaving out what the title says", () => {
    const verbs = set({ title: "Глаголы: passé composé", folders: ["f-daily"], items: typed(Array(8).fill("conjugate")) });
    expect(tileLines(verbs, names)).toEqual({ text: "спряжение, Повседневное", spoken: "спряжение, Повседневное, 8 вопросов" });
    expect(tileLines(set({ title: "Полиция", folders: ["f-police"] }), names)).toEqual({ text: "", spoken: "8 вопросов" });
    expect(tileLines(set({ title: "Сленг на каждый день", folders: ["f-people", "f-emo"] }), names).text).toBe("Люди, Эмоции");
    expect(tileLines(set({ title: "Вечеринка" }), names).text).toBe("все темы");
  });

  it("counts the web words and keeps an own topic only when the title does not say it", () => {
    const food = set({ title: "Еда и кафе", topic: "еда и кафе", items: Array.from({ length: 12 }, (_, i) => item(`q${i}`)), new_words: web(3) });
    expect(tileLines(food, names)).toEqual({ text: "+ 3 новых слова из веба", spoken: "12 вопросов, 3 новых слова из веба" });
    expect(tileLines(set({ title: "Вечер пятницы", topic: "вечеринка" }), names).text).toBe("вечеринка");
    expect(nWebWords(1)).toBe("1 новое слово из веба");
    expect(nWebWords(5)).toBe("5 новых слов из веба");
  });

  it("names a scoped set by its words", () => {
    expect(tileLines(set({ title: "Трудные слова", scope: "difficult" }), names).text).toBe("Трудные · все темы");
  });

  it("marks each question's first answer, then the ones still ahead", () => {
    const r = run([answer("q1", "correct"), answer("q2", "wrong"), answer("q2", "correct", 2), answer("zz", "correct")], false);
    expect(firstTryMarks(r, set(), 4)).toEqual(["first", "miss", "future", "future"]);
  });
});

describe("requests", () => {
  it("summarises a request for the waiting line", () => {
    expect(requestSummary({ folders: [], topic: " вечеринка ", size: 12 })).toBe("«вечеринка», 12 вопросов");
    expect(requestSummary({ folders: ["Люди", "Эмоции"], topic: null, size: 8 })).toBe("«Люди», «Эмоции», 8 вопросов");
    expect(requestSummary({ folders: [], topic: null, size: 16 })).toBe("все темы, 16 вопросов");
  });

  it("asks for a similar set with the same themes, size and new words", () => {
    const names = new Map([["f-people", "Люди"]]);
    expect(similarRequest(set({ folders: ["f-people"] }), names)).toEqual({
      text: "Сделай упражнение в Карточках по теме «Люди», 8 вопросов.",
      summary: "«Люди», 8 вопросов",
    });
    expect(similarRequest(set({ topic: "вечеринка" }), names).text).toBe("Сделай упражнение в Карточках на тему «вечеринка», 8 вопросов.");
  });

  it("«Уровень набора»: a picked level is asked again and named on the tile; «Авто» reads «примерно»", () => {
    const names = new Map([["f-people", "Люди"]]);
    expect(similarRequest(set({ folders: ["f-people"], level: "B2" }), names)).toEqual({
      text: "Сделай упражнение в Карточках по теме «Люди», 8 вопросов, уровень B2.",
      summary: "«Люди», 8 вопросов, B2",
    });
    expect(similarRequest(set({ folders: ["f-people"], level: "B2", level_auto: true }), names).text).toBe("Сделай упражнение в Карточках по теме «Люди», 8 вопросов.");
    expect(tileLines(set({ title: "Полиция", level: "B1" }), names).spoken).toBe("все темы, 8 вопросов, уровень B1");
    expect(tileLines(set({ title: "Полиция", level: "A2", level_auto: true }), names).spoken).toBe("все темы, 8 вопросов, уровень примерно A2");
    expect(levelHint(null, "B1")).toMatch(/сейчас ≈B1/);
    expect(levelHint(null, null)).not.toMatch(/≈/);
    expect(levelHint("B2", "B1")).toMatch(/^B2 — /);
  });

  it("summarises and repeats a scoped request", () => {
    const names = new Map([["f-people", "Люди"]]);
    expect(requestSummary({ folders: ["Люди"], topic: "x", size: 12, scope: "difficult" })).toBe("трудные слова, 12 вопросов");
    expect(requestSummary({ folders: [], topic: null, size: 8, scope: "due" })).toBe("слова к повторению, 8 вопросов");
    expect(requestSummary({ folders: [], topic: null, size: 12, scope: "both" })).toBe("трудные и к повторению, 12 вопросов");
    expect(similarRequest(set({ scope: "due", folders: ["f-people"] }), names)).toEqual({
      text: "Сделай упражнение в Карточках по словам к повторению из всех тем, 8 вопросов.",
      summary: "слова к повторению, 8 вопросов",
    });
  });

  it("summarises and repeats a verb test, without new words", () => {
    const names = new Map([["f-people", "Люди"]]);
    expect(requestSummary({ folders: ["Люди"], topic: null, size: 8, conjugation: true })).toBe("спряжение, «Люди», 8 вопросов");
    const items = set().items.map((it, i) => (i < 6 ? { ...it, type: "conjugate" as const, tense: "futur" as const, person: "tu" as const } : it));
    const newWord = { ref: "n1", fr: "x", ru: "y", note: null, example_fr: null, example_ru: null, pos: "verb" as const, gender: "none" as const, slang_level: 0 as const, verlan: false, origin: null, source_url: null };
    expect(similarRequest(set({ folders: ["f-people"], items, new_words: [newWord] }), names)).toEqual({
      text: "Сделай упражнение на спряжение глаголов в Карточках по теме «Люди», 8 вопросов.",
      summary: "спряжение, «Люди», 8 вопросов",
    });
  });
});

describe("isWaiting", () => {
  const now = Date.parse("2026-10-23T12:00:00.000Z");
  const last = (over: Partial<LastRequest> = {}): LastRequest => ({
    text: "…",
    summary: "«вечеринка», 12 вопросов",
    at: "2026-10-23T11:00:00.000Z",
    newest: "2026-10-22T10:00:00.000Z",
    ...over,
  });

  it("waits until a set newer than the newest at copy time arrives", () => {
    expect(isWaiting(last(), [set()], now)).toBe(true);
    expect(isWaiting(last(), [set(), set({ id: "x-2", created_at: "2026-10-23T11:30:00.000Z" })], now)).toBe(false);
  });

  it("with no sets at copy time, any set ends the wait", () => {
    expect(isWaiting(last({ newest: null }), [], now)).toBe(true);
    expect(isWaiting(last({ newest: null }), [set()], now)).toBe(false);
  });

  it("stops after a day, and without a request", () => {
    expect(isWaiting(last({ at: new Date(now - WAITING_MAX_MS - 1).toISOString() }), [set()], now)).toBe(false);
    expect(isWaiting(null, [], now)).toBe(false);
  });
});

describe("exercise-request hand-over", () => {
  it("is taken once", () => {
    const ids = ["q1", "q2"];
    setPendingExercise({ setId: "x-1", kind: "mistakes", itemIds: ids, runId: "r-1" });
    ids.push("q3");
    expect(takePendingExercise()).toEqual({ setId: "x-1", kind: "mistakes", itemIds: ["q1", "q2"], runId: "r-1" });
    expect(takePendingExercise()).toBeNull();
  });
});
