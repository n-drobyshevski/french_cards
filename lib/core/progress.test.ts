// A DST zone, so the 23 h / 25 h study days are real. Set before any Date is made; restored after.
const previousTz = process.env.TZ;
process.env.TZ = "Europe/Paris";

import { afterAll, describe, expect, it } from "vitest";
import { grade, newReviewState, type Rating } from "../scheduler";
import type { Direction, ExerciseRun, Folder, ReviewLog, ReviewState, Word } from "../types";
import {
  activityByDay,
  addDays,
  countsFromStates,
  dayEndOf,
  dayKey,
  dayPoint,
  dayStartOf,
  daysBetween,
  firstReviewsPerDay,
  isActive,
  replayCounts,
  retentionSummary,
  retrievabilityAt,
  streaks,
  weekStartOf,
  type DayCounts,
} from "./progress";
import { buildWord, pausedFolderIds } from "./words";

afterAll(() => {
  if (previousTz === undefined) delete process.env.TZ;
  else process.env.TZ = previousTz;
});

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NO_PAUSE: ReadonlySet<string> = new Set();

/** Local wall-clock time in Paris. */
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min);

const word = (id: string, created: Date, patch: Partial<Word> = {}): Word => ({ ...buildWord({ fr: id, ru: id, id, created_at: created.toISOString() }, created), ...patch });

function log(wordId: string, review: Date, patch: Partial<ReviewLog> = {}): ReviewLog {
  return {
    id: `${wordId}-${review.toISOString()}`,
    word_id: wordId,
    direction: "fr_ru",
    rating: 3,
    state: 2,
    due: review.toISOString(),
    stability: 10,
    difficulty: 5,
    elapsed_days: 1,
    scheduled_days: 10,
    review: review.toISOString(),
    prev: null,
    updated_at: review.toISOString(),
    deleted_at: null,
    ...patch,
  };
}

/** A little library graded over several days with the real scheduler: words, cards, logs and each day's end state. */
function simulate(days: number, start: Date) {
  const words: Word[] = [];
  const states = new Map<string, ReviewState>();
  const logs: ReviewLog[] = [];
  const snapshots = new Map<string, { states: ReviewState[]; words: Word[] }>();
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (let d = 0; d < days; d++) {
    const key = addDays(dayKey(start), d);
    const morning = dayStartOf(key).getTime() + 5 * HOUR;
    // Two new words a day, one with a single direction.
    for (let i = 0; i < 2; i++) {
      const created = new Date(morning + i * 60_000);
      const w = word(`w${d}-${i}`, created, { both_directions: i === 0 });
      words.push(w);
      for (const dir of (i === 0 ? ["fr_ru", "ru_fr"] : ["fr_ru"]) as Direction[]) {
        const s = newReviewState(w.id, dir, created);
        states.set(s.id, s);
      }
    }
    // Grade every card due by the evening, a few of them twice (a miss and a retry).
    let t = morning + HOUR;
    for (const s of [...states.values()]) {
      if (Date.parse(s.due) > t + 10 * HOUR) continue;
      const r = rand();
      const rating: Rating = r < 0.2 ? 1 : r < 0.3 ? 2 : r < 0.9 ? 3 : 4;
      let next = grade(s, rating, new Date((t += 60_000)));
      logs.push(next.log);
      if (rating === 1) {
        next = grade(next.state, 3, new Date((t += 10 * 60_000)));
        logs.push(next.log);
      }
      states.set(s.id, next.state);
    }
    // A late-night review after midnight still belongs to this study day.
    const late = [...states.values()].find((s) => s.state !== 0);
    if (late && d % 3 === 1) {
      const next = grade(late, 3, new Date(dayEndOf(key).getTime() - 30 * 60_000));
      logs.push(next.log);
      states.set(late.id, next.state);
    }
    snapshots.set(key, { states: [...states.values()], words: [...words] });
  }
  return { words, states: [...states.values()], logs, snapshots };
}

const round = (c: DayCounts) => ({ ...c, memorized: Math.round(c.memorized * 1000) / 1000 });

describe("study days", () => {
  it("starts a study day at 04:00: earlier belongs to the previous day", () => {
    expect(dayKey(at(2026, 10, 21, 3, 59))).toBe("2026-10-20");
    expect(dayKey(at(2026, 10, 21, 4, 0))).toBe("2026-10-21");
    expect(dayKey(at(2026, 10, 21, 23, 59))).toBe("2026-10-21");
    expect(dayKey(at(2026, 11, 1, 1))).toBe("2026-10-31");
    expect(dayKey(at(2027, 1, 1, 2))).toBe("2026-12-31");
    expect(dayStartOf("2026-10-21")).toEqual(at(2026, 10, 21, 4));
    expect(dayEndOf("2026-10-21")).toEqual(at(2026, 10, 22, 4));
  });

  it("keeps 04:00 across DST changes (25 h in October, 23 h in March)", () => {
    expect(dayEndOf("2026-10-24").getTime() - dayStartOf("2026-10-24").getTime()).toBe(25 * HOUR);
    expect(dayEndOf("2026-03-28").getTime() - dayStartOf("2026-03-28").getTime()).toBe(23 * HOUR);
    expect(dayEndOf("2026-10-25").getTime() - dayStartOf("2026-10-25").getTime()).toBe(24 * HOUR);
    const year = daysBetween("2026-01-01", "2026-12-31");
    expect(year).toHaveLength(365);
    expect(new Set(year).size).toBe(365);
    for (const k of year) {
      expect(dayStartOf(k).getHours()).toBe(4);
      expect(dayKey(dayStartOf(k))).toBe(k);
      expect(dayKey(dayEndOf(k).getTime() - 1)).toBe(k);
      expect(dayKey(dayEndOf(k))).toBe(addDays(k, 1));
    }
  });

  it("does calendar arithmetic on keys", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(daysBetween("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(daysBetween("2026-11-02", "2026-11-01")).toEqual([]);
    expect(weekStartOf("2026-10-25")).toBe("2026-10-19"); // a Sunday
    expect(weekStartOf("2026-10-19")).toBe("2026-10-19");
  });
});

describe("retrievabilityAt", () => {
  it("is the target retention after S days", () => {
    const last = at(2026, 10, 1);
    for (const s of [1, 5, 21, 100]) expect(retrievabilityAt(s, last.toISOString(), last.getTime() + s * DAY)).toBeCloseTo(0.9, 5);
  });

  it("uses fractional days and decays", () => {
    const last = at(2026, 10, 1).getTime();
    const half = retrievabilityAt(10, last, last + 0.5 * DAY);
    expect(half).toBeLessThan(1);
    expect(half).toBeGreaterThan(retrievabilityAt(10, last, last + DAY));
    expect(retrievabilityAt(10, last, last)).toBe(1);
    expect(retrievabilityAt(10, null, last)).toBe(0);
    expect(retrievabilityAt(0, last, last + DAY)).toBe(0);
  });
});

describe("replayCounts", () => {
  it("rebuilds every past day exactly as the cards were at its end", () => {
    const sim = simulate(12, at(2026, 10, 10, 9));
    const days = [...sim.snapshots.keys()];
    const replay = replayCounts({ days, words: sim.words, states: sim.states, logs: sim.logs, pausedFolderIds: NO_PAUSE });
    for (const day of days) {
      const snap = sim.snapshots.get(day)!;
      const live = countsFromStates(snap.words, snap.states, NO_PAUSE, dayEndOf(day));
      expect(round(replay.get(day)!), day).toEqual(round(live));
    }
    // Something was learned, something is still new, something was hard.
    const last = replay.get(days.at(-1)!)!;
    expect(last.total).toBe(24);
    expect(last.learning + last.known).toBeGreaterThan(0);
    expect(last.memorized).toBeGreaterThan(0);
  });

  it("matches wordStatus on the current state for today", () => {
    const sim = simulate(6, at(2026, 9, 1, 9));
    const now = at(2026, 9, 7, 20);
    const today = dayKey(now);
    const replay = replayCounts({ days: [today], words: sim.words, states: sim.states, logs: sim.logs, pausedFolderIds: NO_PAUSE }).get(today)!;
    const live = countsFromStates(sim.words, sim.states, NO_PAUSE, dayEndOf(today));
    expect(round(replay)).toEqual(round(live));
  });

  it("counts a word only between its creation and its deletion; paused words apart", () => {
    const d1 = at(2026, 10, 20, 10);
    const a = word("a", d1);
    const b = word("b", at(2026, 10, 21, 10), { deleted_at: at(2026, 10, 22, 10).toISOString() });
    const c = word("c", d1, { folder_id: "f1" });
    const folders = [{ id: "f1", muted: true, deleted_at: null }] as Folder[];
    const counts = replayCounts({
      days: ["2026-10-20", "2026-10-21", "2026-10-22"],
      words: [a, b, c],
      states: [],
      logs: [],
      pausedFolderIds: pausedFolderIds(folders),
    });
    expect(counts.get("2026-10-20")).toMatchObject({ total: 2, fresh: 1, paused: 1 });
    expect(counts.get("2026-10-21")).toMatchObject({ total: 3, fresh: 2, paused: 1 });
    expect(counts.get("2026-10-22")).toMatchObject({ total: 2, fresh: 1, paused: 1 });
  });

  it("ignores tombstoned (undone) logs", () => {
    const w = word("a", at(2026, 10, 1), { both_directions: false });
    const s = newReviewState("a", "fr_ru", at(2026, 10, 1));
    const undone = log("a", at(2026, 10, 2), { state: 0, stability: 30, deleted_at: at(2026, 10, 2, 13).toISOString() });
    const counts = replayCounts({ days: ["2026-10-02"], words: [w], states: [s], logs: [undone], pausedFolderIds: NO_PAUSE }).get("2026-10-02")!;
    expect(counts).toMatchObject({ total: 1, fresh: 1, known: 0, memorized: 0 });
    expect(activityByDay({ logs: [undone] }).size).toBe(0);
  });

  it("takes the state after a log from the next log's snapshot", () => {
    const w = word("a", at(2026, 10, 1), { both_directions: false });
    const first = log("a", at(2026, 10, 2), { state: 1, rating: 3, stability: 25 });
    const second = log("a", at(2026, 10, 5), {
      state: 2,
      stability: 30,
      prev: { ...newReviewState("a", "fr_ru"), state: 2, stability: 25, reps: 3, lapses: 0, last_review: first.review },
    });
    const current = { ...newReviewState("a", "fr_ru"), state: 1 as const, stability: 30, reps: 4 };
    const counts = replayCounts({ days: ["2026-10-03", "2026-10-06"], words: [w], states: [current], logs: [second, first], pausedFolderIds: NO_PAUSE });
    expect(counts.get("2026-10-03")).toMatchObject({ known: 1 }); // review state, S 25 ≥ 21
    expect(counts.get("2026-10-06")).toMatchObject({ learning: 1, known: 0 }); // the current card is learning
  });

  it("drops a card from the day its direction was turned off, like today's count", () => {
    const created = at(2026, 10, 1, 9);
    const w = word("a", created, { both_directions: false }); // ru_fr turned off on the 3rd
    const fr = grade(newReviewState("a", "fr_ru", created), 4, at(2026, 10, 1, 10));
    const ru = grade(newReviewState("a", "ru_fr", created), 1, at(2026, 10, 1, 11));
    const retired = { ...ru.state, deleted_at: at(2026, 10, 3, 12).toISOString() };
    const input = { words: [w], states: [fr.state, retired], logs: [fr.log, ru.log], pausedFolderIds: NO_PAUSE };
    const counts = replayCounts({ ...input, days: ["2026-10-02", "2026-10-03"] });
    expect(counts.get("2026-10-02")).toMatchObject({ total: 1, difficult: 0, learning: 1 });
    expect(round(counts.get("2026-10-03")!)).toEqual(round(countsFromStates([w], input.states, NO_PAUSE, dayEndOf("2026-10-03"))));
  });

  it("counts a card reset to New as new from the reset on", () => {
    const created = at(2026, 10, 1, 9);
    const w = word("a", created, { both_directions: false });
    const g = grade(newReviewState("a", "fr_ru", created), 4, at(2026, 10, 1, 10));
    const reset = newReviewState("a", "fr_ru", at(2026, 10, 3, 12)); // resetProgress on the 3rd
    const counts = replayCounts({ days: ["2026-10-02", "2026-10-03"], words: [w], states: [reset], logs: [g.log], pausedFolderIds: NO_PAUSE });
    expect(counts.get("2026-10-02")).toMatchObject({ learning: 1, fresh: 0 });
    expect(counts.get("2026-10-02")!.memorized).toBeGreaterThan(0);
    expect(counts.get("2026-10-03")).toMatchObject({ learning: 0, fresh: 1, memorized: 0 });
  });

  it("keeps progress carried over without a log (Anki import) from the word's creation", () => {
    const created = at(2026, 10, 1, 9);
    const w = word("a", created, { both_directions: false });
    const carried: ReviewState = { ...newReviewState("a", "fr_ru", created), state: 2, stability: 40, difficulty: 4, reps: 6, last_review: at(2026, 9, 20).toISOString() };
    const counts = replayCounts({ days: ["2026-09-30", "2026-10-02"], words: [w], states: [carried], logs: [], pausedFolderIds: NO_PAUSE });
    expect(counts.get("2026-09-30")).toMatchObject({ total: 0 });
    expect(round(counts.get("2026-10-02")!)).toEqual(round(countsFromStates([w], [carried], NO_PAUSE, dayEndOf("2026-10-02"))));
    expect(counts.get("2026-10-02")).toMatchObject({ known: 1, fresh: 0 });
  });
});

describe("activityByDay", () => {
  it("counts reviews, misses, new cards, added words and finished runs per study day", () => {
    const d = (h: number, min = 0) => at(2026, 10, 21, h, min);
    const logs = [
      log("a", d(10), { state: 0, rating: 3 }),
      log("a", d(10, 5), { direction: "ru_fr", state: 0, rating: 1 }),
      log("a", d(10, 6), { direction: "ru_fr", state: 1, rating: 3 }),
      log("b", d(11), { rating: 1 }),
      log("c", at(2026, 10, 22, 2), { rating: 1 }), // 02:00 → still the 21st
      log("x", d(12), { rating: 1, deleted_at: d(12, 1).toISOString() }),
    ];
    const words = [word("a", d(9)), word("gone", d(9), { deleted_at: d(9, 30).toISOString() }), word("old", at(2026, 10, 20))];
    const runs = [
      { finished_at: d(15).toISOString(), deleted_at: null },
      { finished_at: null, deleted_at: null },
      { finished_at: at(2026, 10, 23).toISOString(), deleted_at: null },
    ] as ExerciseRun[];
    const byDay = activityByDay({ logs, words, runs });
    expect(byDay.get("2026-10-21")).toEqual({ reviews: 5, again: 3, new_introduced: 2, new_words: 1, added: 2, exercises: 1, mistakes: ["c", "b", "a"] });
    // In plan units: one FR→RU word; the plan's "together" mode counts both new cards.
    expect(activityByDay({ logs, together: true }).get("2026-10-21")).toMatchObject({ new_introduced: 2, new_words: 2 });
    expect(byDay.get("2026-10-20")).toMatchObject({ added: 1, reviews: 0 });
    expect(byDay.get("2026-10-23")).toMatchObject({ reviews: 0, exercises: 1 });
    expect(isActive(byDay.get("2026-10-23")!)).toBe(true);
    expect(isActive(byDay.get("2026-10-20")!)).toBe(false);
  });

  it("builds a screen point with the share of right answers", () => {
    const counts = { known: 1, learning: 2, fresh: 3, difficult: 1, paused: 0, total: 6, memorized: 2.5 };
    const p = dayPoint("2026-10-21", counts, { reviews: 10, again: 2, new_introduced: 1, new_words: 1, added: 0, exercises: 0 }, "today");
    expect(p).toMatchObject({ day: "2026-10-21", known: 1, correct: 0.8, active: true, source: "today" });
    expect(dayPoint("2026-10-21", counts, { reviews: 0, again: 0, new_introduced: 0, new_words: 0, added: 0, exercises: 1 }, "live")).toMatchObject({ correct: null, active: true });
  });
});

describe("retention", () => {
  it("counts only the first review-state log of a card per study day", () => {
    const d = (day: number, h: number, min = 0) => at(2026, 10, day, h, min);
    const logs = [
      log("a", d(20, 10), { state: 2, rating: 1 }), // first of the day: a miss
      log("a", d(20, 10, 12), { state: 3, rating: 3 }), // same-day relearning retry: not counted
      log("a", d(21, 10), { state: 3, rating: 3 }), // relearning carried to the next day: counted
      log("b", d(20, 9), { state: 1, rating: 3 }), // learning first: the day's later review isn't counted
      log("b", d(20, 15), { state: 2, rating: 1 }),
      log("c", d(20, 11), { state: 2, rating: 3, prev: { ...newReviewState("c", "fr_ru"), state: 2, stability: 40 } }), // mature
      log("d", d(20, 12), { state: 2, rating: 1, deleted_at: d(20, 13).toISOString() }), // undone
    ];
    expect(firstReviewsPerDay(logs).map((p) => [p.log.word_id, p.day])).toEqual(
      expect.arrayContaining([
        ["a", "2026-10-20"],
        ["a", "2026-10-21"],
        ["c", "2026-10-20"],
      ]),
    );
    expect(firstReviewsPerDay(logs)).toHaveLength(3);
    const r = retentionSummary(logs, "2026-10-25", 0.9);
    expect(r.target).toBe(0.9);
    expect(r.last7).toMatchObject({ total: 3, passed: 2, young: { total: 2, passed: 1 }, mature: { total: 1, passed: 1 } });
    expect(r.last7.rate).toBeCloseTo(2 / 3);
    expect(r.month).toEqual([expect.objectContaining({ month: "2026-10", total: 3, passed: 2 })]);
    expect(retentionSummary(logs, "2026-11-30", 0.9).last7).toMatchObject({ total: 0, rate: null });
  });
});

describe("streaks", () => {
  const range = (from: string, to: string) => daysBetween(from, to);

  it("counts today when it is active", () => {
    expect(streaks(range("2026-10-20", "2026-10-25"), "2026-10-25")).toMatchObject({ current: 6, currentFrom: "2026-10-20", best: 6 });
  });

  it("keeps the streak while today is not studied yet", () => {
    expect(streaks(range("2026-10-20", "2026-10-24"), "2026-10-25")).toMatchObject({ current: 5, best: 5 });
  });

  it("breaks after a missed day and remembers the best run", () => {
    const days = [...range("2026-09-10", "2026-09-28"), ...range("2026-10-14", "2026-10-23")];
    expect(streaks(days, "2026-10-25")).toEqual({ current: 0, currentFrom: null, best: 19, bestFrom: "2026-09-10", bestTo: "2026-09-28" });
    expect(streaks([...days, "2026-10-25"], "2026-10-25")).toMatchObject({ current: 1, best: 19 });
    expect(streaks([], "2026-10-25")).toEqual({ current: 0, currentFrom: null, best: 0, bestFrom: null, bestTo: null });
  });

  it("makes a day with only a finished exercise run active", () => {
    const runs = [{ finished_at: at(2026, 10, 24, 20).toISOString(), deleted_at: null }] as ExerciseRun[];
    const logs = [log("a", at(2026, 10, 23, 10))];
    const active = [...activityByDay({ logs, runs })].filter(([, a]) => isActive(a)).map(([k]) => k);
    expect(streaks(active, "2026-10-25")).toMatchObject({ current: 2, best: 2 });
  });
});
