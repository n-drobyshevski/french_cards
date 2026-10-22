import { describe, expect, it } from "vitest";
import {
  cardMastery,
  cardStatus,
  formatDueIn,
  formatInterval,
  formatStability,
  fromCard,
  grade,
  newReviewState,
  previewDue,
  previewIntervals,
  resetState,
  retrievability,
  snapshot,
  toCard,
  wordStatus,
} from "./scheduler";
import type { ReviewState } from "./types";

const MIN = 60_000;
const DAY = 86_400_000;
const T0 = new Date("2026-10-21T10:00:00.000Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

/** Walks a new card to the Review state: Good (learning) → Good (graduates). */
function matureCard(): ReviewState {
  let s = newReviewState("w1", "fr_ru", T0);
  s = grade(s, 3, T0).state;
  s = grade(s, 3, at(10 * MIN)).state;
  return s;
}

describe("newReviewState / conversion", () => {
  it("creates a New card due now with the composite id", () => {
    const s = newReviewState("w1", "ru_fr", T0);
    expect(s).toMatchObject({
      id: "w1:ru_fr",
      word_id: "w1",
      direction: "ru_fr",
      state: 0,
      reps: 0,
      lapses: 0,
      learning_steps: 0,
      last_review: null,
      due: T0.toISOString(),
      updated_at: T0.toISOString(),
      deleted_at: null,
    });
  });

  it("round-trips ReviewState <-> Card", () => {
    const s = matureCard();
    const card = toCard(s);
    expect(card.due).toBeInstanceOf(Date);
    expect(card.last_review).toBeInstanceOf(Date);
    const back = fromCard(card, s.word_id, s.direction, new Date(s.updated_at));
    expect(back).toEqual(s);
  });

  it("maps a null last_review to undefined", () => {
    expect(toCard(newReviewState("w", "fr_ru", T0)).last_review).toBeUndefined();
  });
});

describe("grade", () => {
  it("moves a new card to Learning and logs the previous snapshot", () => {
    const before = newReviewState("w1", "fr_ru", T0);
    const { state, log } = grade(before, 3, T0);
    expect(state.state).toBe(1);
    expect(state.reps).toBe(1);
    expect(state.last_review).toBe(T0.toISOString());
    expect(new Date(state.due).getTime() - T0.getTime()).toBe(10 * MIN);
    expect(log).toMatchObject({ word_id: "w1", direction: "fr_ru", rating: 3, state: 0, review: T0.toISOString(), deleted_at: null });
    expect(log.prev).toEqual(snapshot(before));
    expect(log.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("graduates to Review after the learning steps", () => {
    const s = matureCard();
    expect(s.state).toBe(2);
    expect(s.scheduled_days).toBeGreaterThanOrEqual(1);
    expect(new Date(s.due).getTime()).toBeGreaterThan(at(10 * MIN + DAY - 1).getTime());
  });

  it("Again on a review card sends it to Relearning and counts a lapse", () => {
    const s = matureCard();
    const when = new Date(s.due);
    const { state, log } = grade(s, 1, when);
    expect(state.state).toBe(3);
    expect(state.lapses).toBe(1);
    expect(log.state).toBe(2);
    expect(new Date(state.due).getTime() - when.getTime()).toBe(10 * MIN);
  });

  it("Hard < Good < Easy for a mature card", () => {
    const s = matureCard();
    const when = new Date(s.due);
    const d = (r: 2 | 3 | 4) => new Date(grade(s, r, when).state.due).getTime();
    expect(d(2)).toBeLessThan(d(3));
    expect(d(3)).toBeLessThan(d(4));
  });

  it("is deterministic for the same input (fuzz is seeded)", () => {
    const s = matureCard();
    const when = new Date(s.due);
    expect(grade(s, 3, when).state).toEqual(grade(s, 3, when).state);
  });

  it("does not mutate its input", () => {
    const s = matureCard();
    const copy = structuredClone(s);
    grade(s, 1, new Date(s.due));
    expect(s).toEqual(copy);
  });
});

describe("preview", () => {
  it("formats the new-card intervals like the mockup", () => {
    const s = newReviewState("w", "fr_ru", T0);
    const p = previewIntervals(s, T0);
    expect(p[1]).toBe("<1 мин");
    expect(p[2]).toBe("6 мин");
    expect(p[3]).toBe("10 мин");
    expect(p[4]).toMatch(/^\d+ д$/);
  });

  it("matches what grade() actually schedules", () => {
    const s = matureCard();
    const when = new Date(s.due);
    const due = previewDue(s, when);
    for (const r of [1, 2, 3, 4] as const) {
      expect(due[r].toISOString()).toBe(grade(s, r, when).state.due);
    }
    const p = previewIntervals(s, when);
    expect(p[1]).toBe("10 мин");
    expect(p[3]).toMatch(/д|нед|мес/);
  });
});

describe("clock skew", () => {
  it("previews and grades a card whose last_review is on a later UTC day than now", () => {
    // Graded Again just after midnight on a device whose clock runs 2 min ahead.
    const ahead = new Date("2026-10-23T00:01:00.000Z");
    const learning = grade(grade(newReviewState("w", "fr_ru", ahead), 3, ahead).state, 1, ahead).state;
    expect(learning.state).not.toBe(0);
    const behind = new Date("2026-10-22T23:59:00.000Z");

    expect(() => previewIntervals(learning, behind)).not.toThrow();
    const next = grade(learning, 3, behind);
    expect(Date.parse(next.state.due)).toBeGreaterThan(behind.getTime());
    expect(next.log.review).toBe(behind.toISOString());
    expect(retrievability(learning, behind)).toBeGreaterThan(0);
  });
});

describe("formatInterval", () => {
  it.each([
    [10_000, "<1 мин"],
    [MIN, "<1 мин"],
    [6 * MIN, "6 мин"],
    [59 * MIN, "59 мин"],
    [60 * MIN, "1 ч"],
    [5 * 60 * MIN, "5 ч"],
    [DAY, "1 д"],
    [9 * DAY, "9 д"],
    [13 * DAY, "13 д"],
    [21 * DAY, "3 нед"],
    [45 * DAY, "6 нед"],
    [60 * DAY, "2 мес"],
    [300 * DAY, "10 мес"],
    [364 * DAY, "11 мес"],
    [365 * DAY, "1 г"],
    [548 * DAY, "1,5 г"],
  ])("%d ms → %s", (ms, out) => {
    expect(formatInterval(ms)).toBe(out);
  });
});

describe("status helpers", () => {
  it("formatDueIn / formatStability", () => {
    const fresh = newReviewState("w", "fr_ru", T0);
    expect(formatDueIn(fresh, T0)).toBe("новая");
    expect(formatStability(fresh)).toBeNull();
    const s = { ...matureCard(), due: at(4 * DAY).toISOString(), stability: 9 };
    expect(formatDueIn(s, T0)).toBe("через 4 д");
    expect(formatDueIn(s, at(5 * DAY))).toBe("сейчас");
    expect(formatStability(s)).toBe("9 д");
  });

  it("cardMastery scales stability to 0..1", () => {
    expect(cardMastery({ state: 0, stability: 50 })).toBe(0);
    expect(cardMastery({ state: 2, stability: 10.5 })).toBeCloseTo(0.5);
    expect(cardMastery({ state: 2, stability: 100 })).toBe(1);
  });

  it("cardStatus / wordStatus", () => {
    const base = { state: 2 as const, stability: 5, lapses: 0, difficulty: 5, reps: 4 };
    expect(cardStatus({ ...base, state: 0 })).toBe("new");
    expect(cardStatus(base)).toBe("learning");
    expect(cardStatus({ ...base, stability: 30 })).toBe("known");
    expect(cardStatus({ ...base, lapses: 2 })).toBe("difficult");
    expect(cardStatus({ ...base, state: 3 })).toBe("difficult");
    expect(cardStatus({ ...base, difficulty: 9 })).toBe("difficult");
    expect(wordStatus([])).toBe("new");
    expect(wordStatus([{ ...base, state: 0 }, { ...base, state: 0 }])).toBe("new");
    expect(wordStatus([{ ...base, stability: 30 }, { ...base, stability: 40 }])).toBe("known");
    expect(wordStatus([{ ...base, stability: 30 }, { ...base, state: 0 }])).toBe("learning");
    expect(wordStatus([{ ...base, stability: 30 }, { ...base, lapses: 3 }])).toBe("difficult");
  });

  it("retrievability is 0 for new cards and decays over time", () => {
    expect(retrievability(newReviewState("w", "fr_ru", T0), T0)).toBe(0);
    const s = matureCard();
    const r1 = retrievability(s, new Date(s.last_review!));
    const r2 = retrievability(s, at(30 * DAY));
    expect(r1).toBeGreaterThan(r2);
  });

  it("resetState returns a New card with the same id", () => {
    const s = matureCard();
    const r = resetState(s, at(DAY));
    expect(r.id).toBe(s.id);
    expect(r.state).toBe(0);
    expect(r.reps).toBe(0);
    expect(r.due).toBe(at(DAY).toISOString());
  });
});
