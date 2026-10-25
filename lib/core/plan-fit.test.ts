import { describe, expect, it } from "vitest";
import { TARGET_RETENTION } from "../scheduler";
import type { DayPlanSnapshot } from "./plan";
import { FIT_TARGET, interdayByDay, isoWeek, newWordsByDay, planFit, type PlanFitInput, type PlanFitLog } from "./plan-fit";
import { addDays } from "./progress";
import { DEFAULT_STUDY_PLAN, type StudyPlan } from "./study-plan";

const TODAY = "2026-10-25";

interface DaySpec {
  /** New FR→RU words. */
  fresh: number;
  /** Interday answers (log state Review). */
  inter: number;
  /** New RU→FR cards (count only in "together" mode). */
  ruFresh?: number;
}

/** One study day's logs: `fresh` new FR→RU words, `ruFresh` new RU→FR cards, `inter` reviews, plus a learning step per new word. */
function dayLogs(day: string, spec: DaySpec): PlanFitLog[] {
  const out: PlanFitLog[] = [];
  for (let i = 0; i < spec.fresh; i++) {
    out.push({ word_id: `${day}-n${i}`, direction: "fr_ru", state: 0, rating: 3, day });
    out.push({ word_id: `${day}-n${i}`, direction: "fr_ru", state: 1, rating: 3, day });
  }
  for (let i = 0; i < (spec.ruFresh ?? 0); i++) out.push({ word_id: `${day}-r${i}`, direction: "ru_fr", state: 0, rating: 3, day });
  for (let i = 0; i < spec.inter; i++) out.push({ word_id: `${day}-o${i}`, direction: i % 2 ? "ru_fr" : "fr_ru", state: 2, rating: 3, day });
  return out;
}

const snap = (over: Partial<DayPlanSnapshot> = {}): DayPlanSnapshot => ({
  ceiling: 10, budget: 10, reason: "limit", cap: 200, due: 60, deferred: 0, forecast7: 64, override: false, ...over,
});

/** Days (offset from today → spec). */
type Days = Record<number, DaySpec>;

/**
 * The brief's surplus sample: plan 10 · до 200, 12 study days in the last two weeks (two days off),
 * 10 new words on 11 of them and 6 on the 16th (the plan held it: load), interday reviews 50–96
 * (typically 58), forecast 64, «Верно» 89 %.
 */
function surplusDays(): Days {
  const inter = [58, 52, 61, 96, 58, 55, 58, 60, 50, 58, 70, 57];
  const offsets = [0, -1, -2, -3, -5, -6, -7, -9, -10, -11, -12, -13]; // -4 (21st) and -8 (17th) off
  const days: Days = {};
  offsets.forEach((o, i) => (days[o] = { fresh: addDays(TODAY, o) === "2026-10-16" ? 6 : 10, inter: inter[i] }));
  return days;
}

function input(days: Days, over: Partial<PlanFitInput> = {}, plan: Partial<StudyPlan> = {}): PlanFitInput {
  const logs = Object.entries(days).flatMap(([o, spec]) => dayLogs(addDays(TODAY, Number(o)), spec));
  return {
    logs,
    todayKey: TODAY,
    plan: { ...DEFAULT_STUDY_PLAN, ...plan },
    planSince: "2026-09-20",
    firstStudyDay: "2026-09-01",
    dayPlans: { "2026-10-16": snap({ budget: 6, reason: "load", forecast7: 105 }) },
    today: { forecast7: 64, backlog: false, available: { fr: 500, ru: 0 }, newLeft: 0 },
    retention28: { rate: 0.89, answers: 300 },
    hint: null,
    ...over,
  };
}

/** Every number in a value is finite. */
function allFinite(v: unknown): boolean {
  if (typeof v === "number") return Number.isFinite(v);
  if (Array.isArray(v)) return v.every(allFinite);
  if (v && typeof v === "object") return Object.values(v).every(allFinite);
  return true;
}

describe("counting per study day (plan units)", () => {
  it("counts FR→RU words first answered from New, or every new card in «together» mode, and interday answers", () => {
    const logs = dayLogs("2026-10-20", { fresh: 3, inter: 5, ruFresh: 2 });
    expect(newWordsByDay(logs, false).get("2026-10-20")).toBe(3);
    expect(newWordsByDay(logs, true).get("2026-10-20")).toBe(5);
    expect(interdayByDay(logs).get("2026-10-20")).toBe(5);
    // A word answered twice from New (a learning step is not New) counts once; days without any are absent.
    expect(newWordsByDay([...logs, { word_id: "2026-10-20-n0", direction: "fr_ru", state: 0, rating: 1, day: "2026-10-20" }], false).get("2026-10-20")).toBe(3);
    expect(newWordsByDay(logs, false).has("2026-10-21")).toBe(false);
  });

  it("keys ISO weeks from Monday, across the new year", () => {
    expect(isoWeek("2026-10-25")).toBe("2026-W43"); // a Sunday
    expect(isoWeek("2026-10-26")).toBe("2026-W44");
    expect(isoWeek("2027-01-01")).toBe("2026-W53");
  });

  it("uses the scheduler's target", () => {
    expect(FIT_TARGET).toBe(TARGET_RETENTION);
  });
});

describe("planFit: gates (warming up shows nothing)", () => {
  it("needs 5 days since the first study day", () => {
    expect(planFit(input(surplusDays(), { firstStudyDay: addDays(TODAY, -4) }))).toMatchObject({ fit: "warming_up", suggestion: null });
    expect(planFit(input(surplusDays(), { firstStudyDay: addDays(TODAY, -5) })).fit).toBe("room");
  });

  it("needs 5 study days in the window; from 5 a suggestion shows (medium, preliminary in the copy under 7)", () => {
    const five: Days = { 0: { fresh: 10, inter: 58 }, [-1]: { fresh: 10, inter: 58 }, [-3]: { fresh: 10, inter: 58 }, [-6]: { fresh: 10, inter: 58 }, [-9]: { fresh: 10, inter: 58 } };
    const fit = planFit(input(five, { dayPlans: {} }));
    expect(fit.fit).toBe("room");
    expect(fit.window.active).toBe(5);
    expect(fit.suggestion).toMatchObject({ kind: "raise_new", confidence: "medium" });
    const four = Object.fromEntries(Object.entries(five).slice(0, 4));
    expect(planFit(input(four, { dayPlans: {} }))).toMatchObject({ fit: "warming_up", suggestion: null });
  });

  it("holds the suggestion (not the facts) 7 days after the plan changed, unless the kept days show the same ceiling and cap", () => {
    // A stepper tap 3 days ago: the line still shows the window (against today's ceiling), no suggestion yet.
    const recent = planFit(input(surplusDays(), { planSince: addDays(TODAY, -3) }));
    expect(recent).toMatchObject({ fit: "room", suggestion: null, dismissedUntil: null });
    expect(recent.newWords).toMatchObject({ typical: 10, planDays: 12 });
    // The order of new words changed 3 days ago (or an undo): the kept days before had 10 · до 200.
    // (The 21st and the 17th are days off; the 15th, studied without a kept plan, stops the walk.)
    const same = Object.fromEntries([-5, -6, -7, -9, -10].map((o) => [addDays(TODAY, o), snap()]));
    const fit = planFit(input(surplusDays(), { planSince: addDays(TODAY, -3), dayPlans: same }));
    expect(fit.planSince).toBe(addDays(TODAY, -10));
    expect(fit.fit).toBe("room");
    // A kept day with another ceiling stops the walk back.
    const changed = { ...same, [addDays(TODAY, -5)]: snap({ ceiling: 8, budget: 8 }) };
    expect(planFit(input(surplusDays(), { planSince: addDays(TODAY, -3), dayPlans: changed }))).toMatchObject({ planSince: addDays(TODAY, -3), suggestion: null });
  });

  it("counts today only once its new words are done", () => {
    const fit = planFit(input(surplusDays(), { today: { forecast7: 64, backlog: false, available: { fr: 500, ru: 0 }, newLeft: 4 } }));
    expect(fit.window).toMatchObject({ active: 11, to: addDays(TODAY, -1) });
  });
});

describe("planFit: raising new words", () => {
  it("offers 15 on the surplus sample, with the load staying under half the cap", () => {
    const fit = planFit(input(surplusDays()));
    expect(fit.window).toEqual({ days: 14, active: 12, from: addDays(TODAY, -13), to: TODAY });
    expect(fit.newWords).toMatchObject({ plan: 10, unit: "words", typical: 10, max: 10, fullDays: 11, budgetDays: 12, planDays: 12 });
    expect(fit.newWords.held).toEqual({ load: 1, accuracy: 0, backlog: 0, known: 1 });
    expect(fit.reviews).toMatchObject({ cap: 200, typical: 58, max: 96, forecast7: 64, backlogDays: 0, capHitDays: 0 });
    expect(fit.retention).toEqual({ rate: 0.89, target: 0.9, answers: 300 });
    expect(fit.fit).toBe("room");
    expect(fit.suggestion).toEqual({
      kind: "raise_new",
      from: 10,
      to: 15,
      alt: null,
      forecast30: { now: 64, then: [82, 89] },
      why: ["full_days", "low_load", "retention_ok"],
      confidence: "high",
    });
    expect(fit.week).toBe("2026-W43");
  });

  it("trims the step to what keeps the load throttle off, or offers nothing", () => {
    expect(planFit(input(surplusDays(), { today: { forecast7: 85, backlog: false, available: { fr: 500, ru: 0 }, newLeft: 0 } })).suggestion).toMatchObject({ to: 13 });
    const none = planFit(input(surplusDays(), { today: { forecast7: 95, backlog: false, available: { fr: 500, ru: 0 }, newLeft: 0 } }));
    expect(none).toMatchObject({ fit: "fits", suggestion: null });
  });

  it("needs enough new words left, retention and no backlog", () => {
    expect(planFit(input(surplusDays(), { today: { forecast7: 64, backlog: false, available: { fr: 100, ru: 0 }, newLeft: 0 } })).suggestion).toBeNull();
    expect(planFit(input(surplusDays(), { retention28: { rate: 0.86, answers: 300 } })).suggestion).toBeNull();
    expect(planFit(input(surplusDays(), { retention28: { rate: 0.95, answers: 60 } })).suggestion).toBeNull(); // too few answers
  });

  it("never goes past 30", () => {
    const days: Days = Object.fromEntries(Object.entries(surplusDays()).map(([o, s]) => [o, { ...s, fresh: 27 }]));
    const fit = planFit(input(days, { dayPlans: {}, today: { forecast7: 10, backlog: false, available: { fr: 900, ru: 0 }, newLeft: 0 } }, { new_words: 27 }));
    expect(fit.suggestion).toMatchObject({ kind: "raise_new", from: 27, to: 30 });
    const top = planFit(input(Object.fromEntries(Object.entries(days).map(([o, s]) => [o, { ...s, fresh: 30 }])), { dayPlans: {} }, { new_words: 30 }));
    expect(top.suggestion).toBeNull();
  });

  it("counts cards in «together» mode, and only FR→RU words otherwise", () => {
    const days: Days = Object.fromEntries(Object.entries(surplusDays()).map(([o, s]) => [o, { ...s, fresh: 5, ruFresh: 5 }]));
    const after = planFit(input(days, { dayPlans: {} }));
    expect(after.newWords).toMatchObject({ unit: "words", typical: 5, fullDays: 0 });
    expect(after.suggestion).toBeNull();
    const together = planFit(input(days, { dayPlans: {}, today: { forecast7: 64, backlog: false, available: { fr: 300, ru: 200 }, newLeft: 0 } }, { ru_fr: "together" }));
    expect(together.newWords).toMatchObject({ unit: "cards", typical: 10, fullDays: 12 });
    // Each unit is one card: +5 cards ≈ 5 × 2.9 reviews a day.
    expect(together.suggestion).toMatchObject({ kind: "raise_new", to: 15, forecast30: { now: 64, then: [76, 81] } });
  });

  it("uses the observed reviews per new word once there are 60 days of history", () => {
    const fit = planFit(input(surplusDays(), { firstStudyDay: addDays(TODAY, -90), rho: { interday28: 28 * 80, newWords56: 56 * 10 } }));
    // ρ = 80 / 10 = 8 reviews a day per new word a day: +5 → +40 (±15 %) and +4 go over 100, +3 → +24 fits.
    expect(fit.suggestion).toMatchObject({ to: 13, forecast30: { now: 64, then: [84, 92] } });
  });
});

describe("planFit: lowering, and what never lowers", () => {
  const heavyToday = { forecast7: 120, backlog: true, available: { fr: 500, ru: 0 }, newLeft: 0 };

  it("offers fewer new words after a backlog on 3 study days", () => {
    const days = surplusDays();
    const backlog = Object.fromEntries([-1, -2, -3].map((o) => [addDays(TODAY, o), snap({ due: 260, deferred: 60, budget: 0, reason: "backlog" })]));
    const fit = planFit(input(days, { dayPlans: backlog, today: heavyToday }));
    expect(fit.reviews.backlogDays).toBe(4); // today too
    expect(fit.newWords.held).toMatchObject({ backlog: 3, known: 3 });
    expect(fit.fit).toBe("heavy");
    expect(fit.suggestion).toMatchObject({ kind: "lower_new", from: 10, to: 6, alt: null, why: ["backlog"] });
    expect(fit.suggestion!.forecast30.then[1]).toBeLessThan(120);
  });

  it("lets a backlog after days away clear by itself while the week ahead is light", () => {
    const days = surplusDays();
    const backlog = Object.fromEntries([-1, -2, -3].map((o) => [addDays(TODAY, o), snap({ due: 260, deferred: 60, budget: 0, reason: "backlog" })]));
    const fit = planFit(input(days, { dayPlans: backlog, today: { ...heavyToday, forecast7: 64 } }));
    expect(fit.reviews.backlogDays).toBe(4);
    expect(fit).toMatchObject({ fit: "fits", suggestion: null });
  });

  it("offers fewer new words when «Верно» falls 5 points under the target", () => {
    const fit = planFit(input(surplusDays(), { retention28: { rate: 0.84, answers: 200 } }));
    expect(fit).toMatchObject({ fit: "heavy", suggestion: { kind: "lower_new", to: 6, why: ["retention_low"] } });
  });

  it("offers fewer new words when the coming week is over 0.8 of the cap", () => {
    const fit = planFit(input(surplusDays(), { today: { forecast7: 172, backlog: false, available: { fr: 500, ru: 0 }, newLeft: 0 } }));
    expect(fit.suggestion).toMatchObject({ kind: "lower_new", to: 6, why: ["load_high"], forecast30: { now: 172 } });
  });

  it("adds a cap 50 higher when she does the whole cap and retention holds", () => {
    const days: Days = Object.fromEntries(Object.entries(surplusDays()).map(([o, s], i) => [o, { ...s, inter: i < 4 ? 200 : s.inter }]));
    const backlog = Object.fromEntries([-1, -2, -3].map((o) => [addDays(TODAY, o), snap({ due: 260, budget: 0, reason: "backlog" })]));
    const fit = planFit(input(days, { dayPlans: backlog, today: heavyToday }));
    expect(fit.reviews.capHitDays).toBe(4);
    expect(fit.suggestion).toMatchObject({ kind: "lower_new", to: 6, alt: { review_cap: 250 }, why: ["backlog", "cap_hit"] });
    // Not when retention is the problem.
    expect(planFit(input(days, { dayPlans: backlog, today: heavyToday, retention28: { rate: 0.84, answers: 200 } })).suggestion!.alt).toBeNull();
  });

  it("never suggests anything for studying less than the plan allows", () => {
    const days: Days = Object.fromEntries(Object.entries(surplusDays()).map(([o, s]) => [o, { ...s, fresh: 4 }]));
    const fit = planFit(input(days, { dayPlans: {} }));
    expect(fit.newWords).toMatchObject({ typical: 4, fullDays: 0 });
    expect(fit).toMatchObject({ fit: "fits", suggestion: null });
    // Not even with very few new words and lots of room.
    const little = planFit(input(Object.fromEntries(Object.entries(days).map(([o, s]) => [o, { ...s, fresh: 1, inter: 5 }])), { dayPlans: {}, today: { forecast7: 5, backlog: false, available: { fr: 500, ru: 0 }, newLeft: 0 } }));
    expect(little.suggestion).toBeNull();
  });

  it("never goes under 3, and offers nothing at 3", () => {
    const fit = planFit(input(surplusDays(), { retention28: { rate: 0.8, answers: 200 } }, { new_words: 4 }));
    expect(fit.suggestion).toMatchObject({ kind: "lower_new", to: 3 });
    expect(planFit(input(surplusDays(), { retention28: { rate: 0.8, answers: 200 } }, { new_words: 3 }))).toMatchObject({ fit: "heavy", suggestion: null });
  });
});

describe("planFit: days without study are not data", () => {
  it("gives the same answer when days off are inserted between the study days", () => {
    const base = surplusDays();
    // The same 12 study days, spread over 20 calendar days (still within the 21-day window).
    const offsets = Object.keys(base).map(Number).sort((a, b) => b - a);
    const spread = [0, -1, -3, -5, -6, -8, -10, -12, -14, -16, -18, -19];
    const moved: Days = {};
    const movedPlans: Record<string, DayPlanSnapshot> = {};
    offsets.forEach((o, i) => {
      moved[spread[i]] = base[o];
      if (addDays(TODAY, o) === "2026-10-16") movedPlans[addDays(TODAY, spread[i])] = snap({ budget: 6, reason: "load" });
    });
    // Days off may even have a kept plan (the app was opened): it changes nothing.
    const offDays = Object.fromEntries([-2, -4, -7, -9].map((o) => [addDays(TODAY, o), snap()]));
    const a = planFit(input(base));
    const b = planFit(input(moved, { dayPlans: { ...movedPlans, ...offDays } }));
    expect({ ...b, window: { ...b.window, from: null } }).toEqual({ ...a, window: { ...a.window, from: null } });
    // Days off don't count in any base: «за 12 учебных дней», never «из 14».
    expect(b.window.active).toBe(12);
    expect(b.newWords.planDays).toBe(12);
  });
});

describe("planFit: the week's suggestion and «Не сейчас»", () => {
  it("hides a dismissed kind for 14 days unless its value moves by 30 % or more", () => {
    const dismissed = { week: "2026-W42", kind: "raise_new" as const, to: 14, dismissed_at: "2026-10-20T10:00:00.000Z" };
    const hidden = planFit(input(surplusDays(), { hint: dismissed }));
    expect(hidden).toMatchObject({ fit: "room", suggestion: null, dismissedUntil: "2026-11-03" });
    expect(planFit(input(surplusDays(), { hint: { ...dismissed, to: 11 } })).suggestion).toMatchObject({ to: 15 });
    expect(planFit(input(surplusDays(), { hint: { ...dismissed, kind: "lower_new" } })).suggestion).toMatchObject({ to: 15 });
    expect(planFit(input(surplusDays(), { hint: { ...dismissed, dismissed_at: "2026-10-05T10:00:00.000Z" } })).suggestion).toMatchObject({ to: 15 });
    // The day of «Не сейчас» is a study day (before 04:00 it is still the day before), keyed as the logs are.
    const late = { ...dismissed, dismissed_at: "2026-10-20T00:30:00.000Z" };
    expect(planFit(input(surplusDays(), { hint: late, dayOf: () => "2026-10-19" })).dismissedUntil).toBe("2026-11-02");
  });

  it("keeps this week's value while the rules still allow it", () => {
    const hint = { week: "2026-W43", kind: "raise_new" as const, to: 14, dismissed_at: null };
    expect(planFit(input(surplusDays(), { hint })).suggestion).toMatchObject({ to: 14, forecast30: { now: 64, then: [79, 84] } });
    expect(planFit(input(surplusDays(), { hint: { ...hint, week: "2026-W42" } })).suggestion).toMatchObject({ to: 15 });
    expect(planFit(input(surplusDays(), { hint: { ...hint, to: 25 } })).suggestion).toMatchObject({ to: 15 }); // no longer load-safe
  });
});

describe("planFit: never NaN or Infinity", () => {
  it("stays finite on empty, junk or extreme input", () => {
    const cases: PlanFitInput[] = [
      input({}, { dayPlans: {} }),
      input(surplusDays(), { today: { forecast7: Number.NaN, backlog: false, available: { fr: Number.NaN, ru: Infinity }, newLeft: 0 }, retention28: { rate: Number.NaN, answers: Number.NaN } }),
      input(surplusDays(), { firstStudyDay: addDays(TODAY, -90), rho: { interday28: 50, newWords56: 0 } }),
      input(surplusDays(), { firstStudyDay: addDays(TODAY, -90), rho: { interday28: Infinity, newWords56: 1 } }),
      input(surplusDays(), {}, { review_cap: null }),
      input(surplusDays(), { firstStudyDay: null, planSince: null }),
    ];
    for (const c of cases) {
      const fit = planFit(c);
      expect(allFinite(fit)).toBe(true);
      expect(JSON.parse(JSON.stringify(fit))).toEqual(fit);
    }
    expect(planFit(cases[0])).toMatchObject({ fit: "warming_up", newWords: { typical: null, max: null }, reviews: { typical: null } });
  });
});
