import { describe, expect, it } from "vitest";
import { buildQueue, optionsFor, type QueueEntry } from "@/lib/core/exercises";
import type { ExerciseItem, ExerciseSet } from "@/lib/types";
import {
  EMPTY_PAIRS,
  EMPTY_PLAYER,
  answerRow,
  attemptRandom,
  counterLabel,
  formatCounter,
  hashString,
  isRussian,
  pairsTap,
  playerReducer,
  progressOf,
  resultAnnouncement,
  resultTone,
  tileVerdict,
  tileWord,
  type PlayerState,
} from "./player-state";

const item = (id: string, word_id: string | null, extra: Partial<ExerciseItem> = {}): ExerciseItem => ({
  id,
  type: "choice",
  skill: "meaning",
  ask: "fr",
  word_id,
  new_ref: null,
  prompt: "relou",
  sentence: null,
  sentence_ru: null,
  answer: "надоедливый",
  distractors: ["классный", "странный", "ленивый"],
  pairs: [],
  tiles: [],
  explain_ru: null,
  word: null,
  ...extra,
});

const set: Pick<ExerciseSet, "items" | "new_words"> = {
  items: [item("q1", "w1"), item("q2", "w2"), item("q3", "w3"), item("q4", null, { new_ref: "n1" })],
  new_words: [
    {
      ref: "n1",
      fr: "avoir la flemme",
      ru: "лениться",
      note: null,
      example_fr: null,
      example_ru: null,
      pos: "expression",
      gender: "none",
      slang_level: 1,
      verlan: false,
      origin: null,
      source_url: null,
    },
  ],
};

const load = (queue: QueueEntry[], total: number) => playerReducer(EMPTY_PLAYER, { type: "load", queue, total });

describe("playerReducer", () => {
  it("loads a queue and counts steps", () => {
    const s = load(buildQueue(set), 4);
    expect(s.queue[0]).toEqual({ kind: "item", item_id: "q1", attempt: 1 });
    expect(s.result).toBeNull();
    expect(s.step).toBe(1);
  });

  it("takes one answer per card and ignores the next tap", () => {
    let s = load(buildQueue(set), 4);
    s = playerReducer(s, { type: "answer", outcome: "wrong", pick: 2 });
    expect(s.result).toEqual({ outcome: "wrong", pick: 2 });
    const again = playerReducer(s, { type: "answer", outcome: "correct", pick: 1 });
    expect(again).toBe(s);
  });

  it("keeps a pairs board's misses on the result", () => {
    const s = playerReducer(load(buildQueue(set), 4), { type: "answer", outcome: "correct", pick: null, misses: 2 });
    expect(s.result).toEqual({ outcome: "correct", pick: null, misses: 2 });
  });

  it("does not move on before the card is answered", () => {
    const s = load(buildQueue(set), 4);
    expect(playerReducer(s, { type: "next" })).toBe(s);
  });

  it("drops a right answer and requeues a miss with the next attempt", () => {
    let s = load(buildQueue(set), 4);
    s = playerReducer(playerReducer(s, { type: "answer", outcome: "correct", pick: 0 }), { type: "next" });
    expect(s.queue.some((e) => e.kind === "item" && e.item_id === "q1")).toBe(false);
    expect(s.result).toBeNull();
    s = playerReducer(playerReducer(s, { type: "answer", outcome: "dont_know", pick: null }), { type: "next" });
    const back = s.queue.find((e) => e.kind === "item" && e.item_id === "q2");
    expect(back).toEqual({ kind: "item", item_id: "q2", attempt: 2 });
  });

  it("moves past an intro card without an answer", () => {
    const queue = buildQueue(set, { itemIds: ["q4"] });
    expect(queue[0]).toEqual({ kind: "intro", new_ref: "n1" });
    const s = playerReducer(load(queue, 1), { type: "next" });
    expect(s.queue).toEqual([{ kind: "item", item_id: "q4", attempt: 1 }]);
    expect(s.step).toBe(2);
  });
});

describe("progressOf", () => {
  it("counts the questions met, the current one included, and the repeats", () => {
    const state: Pick<PlayerState, "queue" | "total"> = {
      total: 12,
      queue: [
        { kind: "item", item_id: "q11", attempt: 2 },
        { kind: "item", item_id: "q12", attempt: 1 },
      ],
    };
    // Exercise-S-Requeue: «11 / 12 +1» on the repeat with one new question left.
    expect(progressOf(state)).toEqual({ position: 11, total: 12, repeats: 1, ratio: 11 / 12 });
  });

  it("moves on after a miss", () => {
    const queue: QueueEntry[] = [
      { kind: "item", item_id: "q2", attempt: 1 },
      { kind: "item", item_id: "q3", attempt: 1 },
      { kind: "item", item_id: "q1", attempt: 2 },
    ];
    expect(progressOf({ total: 3, queue })).toEqual({ position: 2, total: 3, repeats: 1, ratio: 1 / 3 });
  });

  it("gives a new word's card the place of its question, and reads full at the end", () => {
    expect(progressOf({ total: 4, queue: [{ kind: "intro", new_ref: "n1" }, { kind: "item", item_id: "q4", attempt: 1 }] })).toMatchObject({
      position: 4,
      ratio: 3 / 4,
    });
    expect(progressOf({ total: 4, queue: [] })).toEqual({ position: 4, total: 4, repeats: 0, ratio: 1 });
    expect(progressOf({ total: 0, queue: [] })).toMatchObject({ position: 0, ratio: 0 });
  });

  it("formats the counter with two digits", () => {
    expect(formatCounter(7, 12)).toBe("07 / 12");
    expect(formatCounter(11, 120)).toBe("11 / 120");
  });
});

describe("attemptRandom", () => {
  it("is stable for one attempt and changes with the next", () => {
    const it1 = item("q1", "w1");
    const a = optionsFor(it1, attemptRandom("run-1", "q1", 1));
    const b = optionsFor(it1, attemptRandom("run-1", "q1", 1));
    expect(a).toEqual(b);
    const orders = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((n) => optionsFor(it1, attemptRandom("run-1", "q1", n)).options.join("|")));
    expect(orders.size).toBeGreaterThan(1);
  });

  it("hashes strings to 32-bit unsigned ints", () => {
    expect(hashString("")).toBe(0x811c9dc5);
    expect(hashString("a")).not.toBe(hashString("b"));
    expect(hashString("run:q1:1")).toBeGreaterThanOrEqual(0);
  });
});

describe("tileVerdict", () => {
  it("marks the right tile, the wrong pick and dims the rest", () => {
    expect(tileVerdict(0, 1, null)).toBe("idle");
    const r = { outcome: "wrong" as const, pick: 2 };
    expect([0, 1, 2, 3].map((i) => tileVerdict(i, 1, r))).toEqual(["dim", "right", "wrong", "dim"]);
    expect([0, 1].map((i) => tileVerdict(i, 1, { outcome: "dont_know", pick: null }))).toEqual(["dim", "right"]);
  });
});

describe("answerRow and tileWord", () => {
  it("builds the saved answer", () => {
    const at = new Date("2026-10-23T10:00:00Z");
    expect(answerRow(item("q1", "w1"), 2, "wrong", "странный", 1234.6, at)).toEqual({
      item_id: "q1",
      word_id: "w1",
      new_ref: null,
      attempt: 2,
      outcome: "wrong",
      chosen: "странный",
      ms: 1235,
      at: "2026-10-23T10:00:00.000Z",
    });
  });

  it("names a pairs tile's word for the answer", () => {
    expect(tileWord(set, "n1")).toEqual({ word_id: null, new_ref: "n1" });
    expect(tileWord(set, "w9")).toEqual({ word_id: "w9", new_ref: null });
    const row = answerRow(item("p1", null, { type: "pairs" }), 1, "wrong", "коп", null, new Date(0), tileWord(set, "n1"));
    expect(row).toMatchObject({ word_id: null, new_ref: "n1", ms: null });
  });

  it("tells Russian from French", () => {
    expect(isRussian("надоедливый")).toBe(true);
    expect(isRussian("C'était ouf")).toBe(false);
  });
});

describe("pairsTap", () => {
  it("selects a French tile, then matches its translation", () => {
    let r = pairsTap(EMPTY_PAIRS, "fr", "a", 2);
    expect(r.state.selected).toBe("a");
    r = pairsTap(r.state, "ru", "a", 2);
    expect(r.event).toEqual({ type: "match", key: "a", complete: false });
    expect(r.state).toMatchObject({ selected: null, matched: ["a"] });
    r = pairsTap(pairsTap(r.state, "fr", "b", 2).state, "ru", "b", 2);
    expect(r.event).toEqual({ type: "match", key: "b", complete: true });
  });

  it("logs a miss and flashes both tiles", () => {
    const r = pairsTap(pairsTap(EMPTY_PAIRS, "fr", "a", 3).state, "ru", "b", 3);
    expect(r.event).toEqual({ type: "miss", fr: "a", ru: "b" });
    expect(r.state).toMatchObject({ selected: null, misses: 1, flash: { fr: "a", ru: "b", seq: 1 } });
    const again = pairsTap(pairsTap(r.state, "fr", "a", 3).state, "ru", "c", 3);
    expect(again.state.flash?.seq).toBe(2);
  });

  it("ignores Russian taps without a selection, matched tiles, and unselects on a second tap", () => {
    expect(pairsTap(EMPTY_PAIRS, "ru", "a", 2).event).toBeNull();
    const matched = { ...EMPTY_PAIRS, matched: ["a"] };
    expect(pairsTap(matched, "fr", "a", 2).state).toBe(matched);
    const sel = pairsTap(EMPTY_PAIRS, "fr", "a", 2).state;
    expect(pairsTap(sel, "fr", "a", 2).state.selected).toBeNull();
  });
});

describe("result announcement", () => {
  it("reads the tone of an answer", () => {
    expect(resultTone(null)).toBeNull();
    expect(resultTone({ outcome: "correct", pick: 0 })).toBe("right");
    expect(resultTone({ outcome: "correct", pick: null, misses: 0 })).toBe("right");
    expect(resultTone({ outcome: "correct", pick: null, misses: 2 })).toBe("pairs");
    expect(resultTone({ outcome: "wrong", pick: 1 })).toBe("wrong");
    expect(resultTone({ outcome: "dont_know", pick: null })).toBe("wrong");
  });

  it("says the verdict, and the right answer on a miss", () => {
    expect(resultAnnouncement(null)).toBe("");
    expect(resultAnnouncement("right")).toBe("Верно.");
    expect(resultAnnouncement("wrong", 0, "la meuf")).toBe("Неверно. Ответ: la meuf.");
    expect(resultAnnouncement("wrong")).toBe("Неверно.");
    expect(resultAnnouncement("pairs", 2)).toBe("Все пары найдены, ошибок: 2.");
  });
});

describe("counterLabel", () => {
  it("reads the counter with the repeats in the right form", () => {
    expect(counterLabel({ position: 7, total: 12, repeats: 0 })).toBe("Вопрос 7 из 12");
    expect(counterLabel({ position: 7, total: 12, repeats: 1 })).toBe("Вопрос 7 из 12, плюс 1 повтор");
    expect(counterLabel({ position: 7, total: 12, repeats: 3 })).toBe("Вопрос 7 из 12, плюс 3 повтора");
    expect(counterLabel({ position: 7, total: 12, repeats: 5 })).toBe("Вопрос 7 из 12, плюс 5 повторов");
  });
});
