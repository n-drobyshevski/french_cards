import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { addDays, dayStartOf } from "./core/progress";
import { db } from "./db";
import { applySuggestion, dismissSuggestion, loadPlanFit, PLAN_HINT_PREF, planFit, rememberSuggestion, undoSuggestion, type PlanFit } from "./plan-fit";
import type { ReviewLog } from "./types";
import { DEFAULT_STUDY_PLAN, getPlanHint, getStudyPlan, recordPlanDay, setStudyPlan } from "./user-prefs";

const TODAY = "2026-10-25";
const NOW = new Date(2026, 9, 25, 12);

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

let n = 0;
/** A live log on study day `day` (at 10:00 + `min`). */
function log(day: string, over: Partial<ReviewLog> = {}, min = 0): ReviewLog {
  const at = new Date(dayStartOf(day).getTime() + (6 * 60 + min) * 60_000).toISOString();
  n++;
  return {
    id: `l${n}`, word_id: `w${n}`, direction: "fr_ru", rating: 3, state: 2, due: at, stability: 5, difficulty: 5, elapsed_days: 1,
    scheduled_days: 3, review: at, prev: null, updated_at: at, deleted_at: null, ...over,
  };
}

/** 8 study days over the last 12 days: 3 new words and 10 reviews each. */
async function studied(): Promise<string[]> {
  const days = [0, -1, -2, -4, -5, -7, -9, -11].map((o) => addDays(TODAY, o));
  const rows: ReviewLog[] = [];
  for (const d of days) {
    for (let i = 0; i < 3; i++) rows.push(log(d, { state: 0 }, i));
    for (let i = 0; i < 10; i++) rows.push(log(d, { state: 2, rating: i === 0 ? 1 : 3 }, 10 + i));
  }
  rows.push(log(addDays(TODAY, -25), { state: 0 })); // the first study day, before the 21 days read
  rows.push(log(addDays(TODAY, -3), { deleted_at: NOW.toISOString() })); // undone: not a study day
  await db.review_log.bulkPut(rows);
  return days;
}

const raise: PlanFit = planFit({
  logs: [],
  todayKey: TODAY,
  plan: DEFAULT_STUDY_PLAN,
  planSince: null,
  firstStudyDay: null,
  today: { forecast7: 0, backlog: false, available: { fr: 0, ru: 0 } },
  retention28: { rate: null, answers: 0 },
});
/** A fit with a suggestion (built by hand: the engine's rules are tested in lib/core/plan-fit.test.ts). */
const withSuggestion = (over: Partial<NonNullable<PlanFit["suggestion"]>> = {}): PlanFit => ({
  ...raise,
  fit: "room",
  suggestion: { kind: "raise_new", from: 10, to: 15, alt: null, forecast30: { now: 64, then: [82, 89] }, why: ["full_days"], confidence: "medium", ...over },
});

describe("loadPlanFit", () => {
  it("reads the window, the plan's age, the kept day plans and «Верно» from the device", async () => {
    await setStudyPlan({ ...DEFAULT_STUDY_PLAN, new_words: 3 }, new Date(2026, 9, 1, 9));
    const days = await studied();
    const kept = { ceiling: 3, budget: 2, reason: "load" as const, cap: 200, due: 30, deferred: 0, forecast7: 120, override: false };
    await db.progress_days.put({
      id: days[3], known: 0, learning: 0, fresh: 0, difficult: 0, paused: 0, total: 0, memorized: 0, reviews: 13, again: 1,
      new_introduced: 3, added: 0, source: "live", algo: "", plan: kept, updated_at: NOW.toISOString(), deleted_at: null,
    });
    // Yesterday's row isn't written yet: its plan comes from `plan_day`'s `prev`.
    await recordPlanDay(days[1], { ...kept, reason: "accuracy" }, new Date(2026, 9, 24, 9));
    await recordPlanDay(TODAY, { ...kept, budget: 3, reason: "limit" }, NOW);

    const fit = await loadPlanFit(NOW);
    expect(fit.window).toEqual({ days: 14, active: 8, from: days[7], to: TODAY });
    expect(fit.planSince).toBe("2026-10-01");
    expect(fit.newWords).toMatchObject({ plan: 3, unit: "words", typical: 3, fullDays: 8, planDays: 8 });
    expect(fit.newWords.held).toEqual({ load: 1, accuracy: 1, backlog: 0, known: 3 });
    expect(fit.reviews).toMatchObject({ cap: 200, typical: 10, allTypical: 13, max: 10, forecast7: 0, backlogDays: 0 });
    expect(fit.retention).toEqual({ rate: 0.9, target: 0.9, answers: 80 });
    // Under 100 answers retention says nothing, so there is nothing to offer; the library is empty anyway.
    expect(fit).toMatchObject({ fit: "fits", suggestion: null, week: "2026-W43" });
  });

  it("warms up before two weeks of history", async () => {
    await db.review_log.bulkPut([0, -1, -2].map((o) => log(addDays(TODAY, o), { state: 0 })));
    expect(await loadPlanFit(NOW)).toMatchObject({ fit: "warming_up", suggestion: null });
  });
});

describe("applying and dismissing a suggestion", () => {
  it("«Поставить 15» saves the plan, «Вернуть» puts the previous one back", async () => {
    await setStudyPlan({ ...DEFAULT_STUDY_PLAN, review_cap: 150 }, new Date(2026, 9, 1));
    const applied = await applySuggestion(withSuggestion(), "new_words", NOW);
    expect(applied).toEqual({ previous: { ...DEFAULT_STUDY_PLAN, review_cap: 150 }, next: { ...DEFAULT_STUDY_PLAN, review_cap: 150, new_words: 15 } });
    expect(await getStudyPlan()).toMatchObject({ new_words: 15, review_cap: 150 });
    await undoSuggestion(applied!.previous, new Date(NOW.getTime() + 1000));
    expect(await getStudyPlan()).toEqual({ ...DEFAULT_STUDY_PLAN, review_cap: 150 });
  });

  it("applies the second option's cap, and nothing without a suggestion", async () => {
    await setStudyPlan(DEFAULT_STUDY_PLAN, new Date(2026, 9, 1));
    const lower = withSuggestion({ kind: "lower_new", to: 6, alt: { review_cap: 250 } });
    expect((await applySuggestion(lower, "review_cap", NOW))?.next).toMatchObject({ new_words: 10, review_cap: 250 });
    expect(await applySuggestion(withSuggestion(), "review_cap", NOW)).toBeNull(); // no second option
    expect(await applySuggestion(raise, "new_words", NOW)).toBeNull();
  });

  it("keeps this week's suggestion in plan_hint once, and «Не сейчас» marks it dismissed", async () => {
    await rememberSuggestion(withSuggestion({ confidence: "low" }), NOW);
    expect(await getPlanHint()).toBeNull(); // a low one is for the connector only
    await rememberSuggestion(withSuggestion(), NOW);
    expect(await getPlanHint()).toEqual({ week: "2026-W43", kind: "raise_new", to: 15, dismissed_at: null });
    const stamp = (await db.user_prefs.get(PLAN_HINT_PREF))!.updated_at;
    await rememberSuggestion(withSuggestion(), new Date(NOW.getTime() + 60_000));
    expect((await db.user_prefs.get(PLAN_HINT_PREF))!.updated_at).toBe(stamp); // unchanged: not written again
    expect((await db.outbox.toArray()).map((o) => o.key)).toContain(`user_prefs:${PLAN_HINT_PREF}`);

    await dismissSuggestion(withSuggestion(), NOW);
    expect(await getPlanHint()).toEqual({ week: "2026-W43", kind: "raise_new", to: 15, dismissed_at: NOW.toISOString() });
    await dismissSuggestion(raise, NOW); // nothing to dismiss
    expect((await getPlanHint())!.dismissed_at).toBe(NOW.toISOString());
  });
});
