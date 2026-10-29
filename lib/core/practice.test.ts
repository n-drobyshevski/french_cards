import { describe, expect, it } from "vitest";
import { grade, newReviewState, type Rating } from "../scheduler";
import type { Direction, ReviewLog, ReviewState, Word } from "../types";
import { advancePractice, PRACTICE_ALL_MAX, PRACTICE_LIMIT, practiceQueue, type PracticeQueueInput } from "./practice";
import { buildWord } from "./words";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** The study day starts at 04:00Z; "now" is noon. */
const START = new Date("2026-10-21T04:00:00.000Z");
const NOW = new Date("2026-10-21T12:00:00.000Z");
const OLD = new Date("2026-09-01T00:00:00.000Z");
const at = (ms: number) => new Date(NOW.getTime() + ms);

/** A small library: words, their cards and the review log, graded by hand. */
class World {
  words = new Map<string, Word>();
  states = new Map<string, ReviewState>();
  logs: ReviewLog[] = [];

  add(fr: string, both = false): Word {
    const id = `w-${fr}`;
    const word = buildWord({ id, fr, ru: `ru-${fr}`, both_directions: both }, OLD);
    this.words.set(id, word);
    for (const d of both ? (["fr_ru", "ru_fr"] as const) : (["fr_ru"] as const)) this.states.set(`${id}:${d}`, newReviewState(id, d, OLD));
    return word;
  }

  /** A learned card with the given weakness. */
  learned(w: Word, extra: Partial<ReviewState> = {}, direction: Direction = "fr_ru"): ReviewState {
    const id = `${w.id}:${direction}`;
    const s: ReviewState = { ...this.states.get(id)!, state: 2, stability: 10, difficulty: 5, reps: 4, last_review: OLD.toISOString(), due: at(5 * DAY).toISOString(), ...extra };
    this.states.set(id, s);
    return s;
  }

  grade(w: Word, rating: Rating, when: Date, direction: Direction = "fr_ru"): ReviewLog {
    const res = grade(this.states.get(`${w.id}:${direction}`)!, rating, when);
    this.states.set(res.state.id, res.state);
    this.logs.push(res.log);
    return res.log;
  }

  input(over: Partial<PracticeQueueInput>): PracticeQueueInput {
    return { scope: "recent", words: this.words, states: [...this.states.values()], logs: this.logs, ...over };
  }
}

const keys = (items: { key: string }[]) => items.map((i) => i.key);

describe("practiceQueue", () => {
  it("'today' lists the cards failed since the day's start, most recent first, once each", () => {
    const w = new World();
    const a = w.add("a");
    const b = w.add("b");
    const c = w.add("c");
    const y = w.add("yesterday");
    w.grade(y, 1, at(-DAY));
    w.grade(a, 1, at(-3 * HOUR));
    w.grade(b, 1, at(-2 * HOUR));
    w.grade(a, 1, at(-HOUR));
    w.grade(c, 2, at(-HOUR));
    const q = practiceQueue(w.input({ scope: "today", from: START }));
    expect(keys(q)).toEqual(["w-a:fr_ru", "w-b:fr_ru"]);
    expect(q[0]).toMatchObject({ word: { fr: "a" }, direction: "fr_ru", isNew: false });
    expect(q[0].state).toBe(w.states.get("w-a:fr_ru"));
  });

  it("skips undone reviews, tombstoned cards, other words and the other side", () => {
    const w = new World();
    const a = w.add("a");
    const b = w.add("b", true);
    const c = w.add("c");
    const gone = w.add("gone");
    const undone = w.grade(a, 1, at(-HOUR));
    w.grade(b, 1, at(-HOUR), "ru_fr");
    w.grade(b, 1, at(-HOUR), "fr_ru");
    w.grade(c, 1, at(-HOUR));
    w.grade(gone, 1, at(-HOUR));
    w.logs = w.logs.map((l) => (l === undone ? { ...l, deleted_at: NOW.toISOString() } : l));
    w.states.set("w-c:fr_ru", { ...w.states.get("w-c:fr_ru")!, deleted_at: NOW.toISOString() });
    w.words.delete(gone.id);
    expect(keys(practiceQueue(w.input({ scope: "today", from: START })))).toEqual(["w-b:ru_fr", "w-b:fr_ru"]);
    expect(keys(practiceQueue(w.input({ scope: "today", from: START, direction: "fr_ru" })))).toEqual(["w-b:fr_ru"]);
  });

  it("'recent' takes failed and hard cards of the window, then the weakest learned ones, up to the limit", () => {
    const w = new World();
    const a = w.add("a");
    const b = w.add("b");
    const weak = w.add("weak");
    const shaky = w.add("shaky");
    const strong = w.add("strong");
    w.add("fresh");
    const old = w.add("old");
    w.grade(old, 1, at(-10 * DAY));
    w.learned(old, { stability: 40, lapses: 0 });
    w.grade(a, 2, at(-3 * DAY));
    w.grade(b, 3, at(-DAY));
    w.learned(weak, { stability: 2, lapses: 3 });
    w.learned(shaky, { stability: 1, lapses: 1 });
    w.learned(strong, { stability: 40, lapses: 0 });
    const from = at(-7 * DAY);
    expect(keys(practiceQueue(w.input({ scope: "recent", from, limit: 3 })))).toEqual(["w-a:fr_ru", "w-weak:fr_ru", "w-shaky:fr_ru"]);
    const all = practiceQueue(w.input({ scope: "recent", from }));
    expect(all.map((i) => i.word.fr)).not.toContain("fresh");
    expect(all.map((i) => i.word.fr).slice(0, 3)).toEqual(["a", "weak", "shaky"]);
    expect(all).toHaveLength(6);
  });

  it("'recent' without `from` counts every log it is given", () => {
    const w = new World();
    const old = w.add("old");
    w.grade(old, 1, at(-30 * DAY));
    w.learned(old, { stability: 40 });
    const fresh = w.add("weak");
    w.learned(fresh, { stability: 2, lapses: 1 });
    expect(keys(practiceQueue(w.input({ scope: "recent" })))).toEqual(["w-old:fr_ru", "w-weak:fr_ru"]);
  });

  it("'all' shuffles every card of the words, new ones included, with the random source, capped", () => {
    const w = new World();
    for (const fr of ["a", "b", "c"]) w.add(fr, true);
    w.learned(w.words.get("w-b")!);
    const one = keys(practiceQueue(w.input({ scope: "all", random: () => 0 })));
    const other = keys(practiceQueue(w.input({ scope: "all", random: () => 0.99 })));
    expect(one).toHaveLength(6);
    expect(one).not.toEqual(other);
    expect([...one].sort()).toEqual([...other].sort());
    expect(practiceQueue(w.input({ scope: "all", direction: "ru_fr", random: () => 0 })).every((i) => i.direction === "ru_fr")).toBe(true);
    expect(practiceQueue(w.input({ scope: "all", limit: 4 }))).toHaveLength(4);
    const q = practiceQueue(w.input({ scope: "all", random: () => 0 }));
    expect(q.filter((i) => i.isNew)).toHaveLength(5);
  });

  it("defaults the round size to PRACTICE_LIMIT, and PRACTICE_ALL_MAX for 'all'", () => {
    const w = new World();
    for (let i = 0; i < PRACTICE_ALL_MAX + 5; i++) {
      const word = w.add(`x${String(i).padStart(3, "0")}`);
      w.grade(word, 1, at(-HOUR + i));
    }
    expect(practiceQueue(w.input({ scope: "today", from: START }))).toHaveLength(PRACTICE_LIMIT);
    expect(practiceQueue(w.input({ scope: "all" }))).toHaveLength(PRACTICE_ALL_MAX);
  });

  it("never changes its inputs", () => {
    const w = new World();
    const a = w.add("a", true);
    w.grade(a, 1, at(-HOUR));
    const states = [...w.states.values()];
    const before = structuredClone({ states, logs: w.logs });
    practiceQueue({ scope: "all", words: w.words, states, logs: w.logs, random: () => 0 });
    practiceQueue({ scope: "today", words: w.words, states, logs: w.logs, from: START });
    expect({ states, logs: w.logs }).toEqual(before);
  });
});

describe("advancePractice", () => {
  it("brings «Не знаю» back after 3 others, puts «Сложно» last and drops «Знаю»", () => {
    const q = ["a", "b", "c", "d", "e"];
    expect(advancePractice(q, 1)).toEqual(["b", "c", "d", "a", "e"]);
    expect(advancePractice(["a", "b"], 1)).toEqual(["b", "a"]);
    expect(advancePractice(q, 2)).toEqual(["b", "c", "d", "e", "a"]);
    expect(advancePractice(q, 3)).toEqual(["b", "c", "d", "e"]);
    expect(advancePractice(q, 4)).toEqual(["b", "c", "d", "e"]);
    expect(advancePractice([], 1)).toEqual([]);
  });
});
