import { describe, expect, it } from "vitest";
import type { ExerciseAnswer, ExerciseItem, ExerciseRun, ExerciseSet } from "@/lib/types";
import { setPendingExercise, takePendingExercise } from "./exercise-request";
import {
  isWaiting,
  nNew,
  nQuestions,
  nSets,
  requestSummary,
  resumeProgress,
  setThemesLine,
  shortDate,
  similarRequest,
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
    expect(tileState(set(), undefined)).toEqual({ label: "Новый", tone: "new", progress: 0, fresh: true, resumeRunId: null });
  });

  it("an unfinished run is «Прервано answered/total» and resumable", () => {
    const r = run([answer("q1", "correct"), answer("q2", "wrong"), answer("q3", "correct"), answer("q4", "dont_know"), answer("q5", "correct")], false);
    expect(tileState(set(), r)).toEqual({ label: "Прервано 5/8", tone: "ink", progress: 5 / 8, fresh: false, resumeRunId: "r-1" });
    expect(resumeProgress(r, set())).toEqual({ answered: 5, total: 8, progress: 5 / 8 });
  });

  it("a finished run shows first-try / total with a full line", () => {
    const answers = ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8"].map((id, i) => answer(id, i === 0 ? "wrong" : "correct"));
    expect(tileState(set(), run([...answers, answer("q1", "correct", 2)], true))).toMatchObject({ label: "7/8", progress: 1, resumeRunId: null });
  });

  it("a run left on its last, answered card reads as finished", () => {
    const answers = ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8"].map((id) => answer(id, "correct"));
    expect(tileState(set(), run(answers, false))).toMatchObject({ label: "8/8", progress: 1, resumeRunId: null });
  });

  it("another device's interrupted run is shown but not resumed here", () => {
    const r = run([answer("q1", "correct")], false);
    expect(tileState(set(), r, new Set())).toMatchObject({ label: "Прервано 1/8", resumeRunId: null });
    expect(tileState(set(), r, new Set(["r-1"]))).toMatchObject({ resumeRunId: "r-1" });
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
