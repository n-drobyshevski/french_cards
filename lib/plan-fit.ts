// «План и прогресс» on the device: reads what lib/core/plan-fit.ts `planFit` needs (the last weeks
// of review_log, the plan and when it changed, the kept day plans, today's plan, «Верно» and this
// week's `plan_hint`), and applies or dismisses its suggestion. Settings → «План повторения» shows
// it (`usePlanFit`); nothing here is ever applied without a tap.
import { useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { parsePlanDayPref, PLAN_DAY_PREF, snapshotForDay, type DayPlanSnapshot } from "./core/plan";
import {
  FIT_LOG_DAYS,
  FIT_RETENTION_DAYS,
  FIT_RHO_DAYS,
  fitLogs,
  newWordsByDay,
  parsePlanHint,
  PLAN_HINT_PREF,
  planFit,
  type PlanFit,
  type PlanFitToday,
} from "./core/plan-fit";
import { addDays, dayKey, dayStartOf, dayEndOf, firstReviewsPerDay, retentionOf } from "./core/progress";
import { migrateStudyPlan, parseStudyPlan, STUDY_PLAN_PREF, type StudyPlan } from "./core/study-plan";
import { db as defaultDb, type KartochkiDB } from "./db";
import { loadSession } from "./session";
import { DEFAULT_SETTINGS, type ReviewLog } from "./types";
import { getPlanHint, getStudyPlan, setPlanHint, setStudyPlan } from "./user-prefs";

export * from "./core/plan-fit";

const LOG_PAGE = 200;
/** ρ compares interday answers over 28 days with the new words of 56. */
const RHO_LOG_DAYS = 56;

/** The study day of the first live answer; null before any. */
async function firstStudyDay(database: KartochkiDB): Promise<string | null> {
  for (let offset = 0; ; offset += LOG_PAGE) {
    const page = await database.review_log.orderBy("review").offset(offset).limit(LOG_PAGE).toArray();
    const first = page.find((l) => l.deleted_at === null && !Number.isNaN(Date.parse(l.review)));
    if (first) return dayKey(first.review);
    if (page.length < LOG_PAGE) return null;
  }
}

/** Live review_log rows of the study days [from, to]. */
async function logsOfDays(database: KartochkiDB, from: string, to: string): Promise<ReviewLog[]> {
  const rows = await database.review_log.where("review").between(dayStartOf(from).toISOString(), dayEndOf(to).toISOString(), true, false).toArray();
  return rows.filter((l) => l.deleted_at === null);
}

/** Today's plan, as the review screen plans it (without the Lexique order, which changes no number). */
async function todayPlan(now: Date): Promise<PlanFitToday> {
  const { day } = await loadSession({}, now, undefined, { level: () => null, freq: () => null });
  return { forecast7: day.forecast7, backlog: day.backlog, available: day.available, newLeft: day.newLeft };
}

/**
 * The plan's fit and suggestion now (use inside useLiveQuery). `database` is read for everything
 * but today's plan, which lib/session.ts `loadSession` reads from the app's database.
 */
export async function loadPlanFit(now: Date = new Date(), database: KartochkiDB = defaultDb): Promise<PlanFit> {
  const today = dayKey(now);
  const windowFrom = addDays(today, -(FIT_LOG_DAYS - 1));
  const [planRow, settings, hintRow, dayRow, first, rows, todayBits] = await Promise.all([
    database.user_prefs.get(STUDY_PLAN_PREF),
    database.settings.get("settings"),
    database.user_prefs.get(PLAN_HINT_PREF),
    database.user_prefs.get(PLAN_DAY_PREF),
    firstStudyDay(database),
    database.progress_days.where("id").between(windowFrom, today, true, true).toArray(),
    todayPlan(now),
  ]);
  const livePlan = planRow && planRow.deleted_at === null ? planRow : undefined;
  const plan: StudyPlan = parseStudyPlan(livePlan?.value, migrateStudyPlan(settings?.new_per_day ?? DEFAULT_SETTINGS.new_per_day));
  const planSince = livePlan && !Number.isNaN(Date.parse(livePlan.updated_at)) ? dayKey(livePlan.updated_at) : null;

  const withRho = first !== null && addDays(first, FIT_RHO_DAYS) <= today;
  const raw = await logsOfDays(database, addDays(today, -((withRho ? RHO_LOG_DAYS : FIT_RETENTION_DAYS) - 1)), today);
  const logs = fitLogs(raw, (at) => dayKey(at));

  const retentionFrom = addDays(today, -(FIT_RETENTION_DAYS - 1));
  const retention = retentionOf(firstReviewsPerDay(raw).filter((p) => p.day >= retentionFrom && p.day <= today));

  // Kept day plans: the stored rows', then `plan_day` (today's, and the day before when its row isn't written yet).
  const dayPlans: Record<string, DayPlanSnapshot | null> = {};
  for (const r of rows) if (r.deleted_at === null) dayPlans[r.id] = r.plan ?? null;
  const kept = dayRow && dayRow.deleted_at === null ? parsePlanDayPref(dayRow.value) : null;
  for (const d of [kept?.day, kept?.prev?.day]) {
    if (d && d >= windowFrom && d <= today && !dayPlans[d]) dayPlans[d] = snapshotForDay(kept, d);
  }

  let rho: { interday28: number; newWords56: number } | null = null;
  if (withRho) {
    const together = plan.ru_fr === "together";
    rho = {
      interday28: logs.filter((l) => l.day >= retentionFrom && l.state === 2).length,
      newWords56: [...newWordsByDay(logs, together).values()].reduce((a, b) => a + b, 0),
    };
  }

  return planFit({
    logs,
    todayKey: today,
    plan,
    planSince,
    firstStudyDay: first,
    dayPlans,
    today: todayBits,
    retention28: { rate: retention.rate, answers: retention.total },
    hint: hintRow && hintRow.deleted_at === null ? parsePlanHint(hintRow.value) : null,
    dayOf: (at) => dayKey(at),
    rho,
  });
}

/**
 * The fit, live; undefined while loading. A suggestion shown (medium or high confidence) is kept
 * in `plan_hint` for its ISO week, so it stays the same until Monday.
 */
export function usePlanFit(): PlanFit | undefined {
  const fit = useLiveQuery(() => loadPlanFit(), []);
  useEffect(() => {
    if (fit) rememberSuggestion(fit).catch((error: unknown) => console.warn("«План и прогресс»: the suggestion was not kept", error));
  }, [fit]);
  return fit;
}

/** Keeps the suggestion shown this week in `plan_hint` (a no-op when already kept, or for a "low" one). */
export async function rememberSuggestion(fit: PlanFit, now: Date = new Date()): Promise<void> {
  const s = fit.suggestion;
  if (!s || s.confidence === "low") return;
  const hint = await getPlanHint();
  if (hint && !hint.dismissed_at && hint.week === fit.week && hint.kind === s.kind && hint.to === s.to) return;
  await setPlanHint({ week: fit.week, kind: s.kind, to: s.to, dismissed_at: null }, now);
}

export interface AppliedSuggestion {
  /** The plan before: hand it to `undoSuggestion` («Вернуть»). */
  previous: StudyPlan;
  next: StudyPlan;
}

/**
 * «Поставить 15»: saves the suggested new words a day (or, with "review_cap", the second option's
 * cap). Returns the plans before and after for the undo snackbar; null when there is no suggestion
 * (or no such option).
 */
export async function applySuggestion(fit: PlanFit, option: "new_words" | "review_cap" = "new_words", now: Date = new Date()): Promise<AppliedSuggestion | null> {
  const s = fit.suggestion;
  if (!s || (option === "review_cap" && !s.alt)) return null;
  const previous = await getStudyPlan();
  const next: StudyPlan = option === "review_cap" ? { ...previous, review_cap: s.alt!.review_cap } : { ...previous, new_words: s.to };
  await setStudyPlan(next, now);
  return { previous, next };
}

/** «Вернуть»: the plan as it was before `applySuggestion`. */
export async function undoSuggestion(previous: StudyPlan, now: Date = new Date()): Promise<void> {
  await setStudyPlan(previous, now);
}

/** «Не сейчас»: hides this kind of suggestion for 14 days (unless its value moves by 30 % or the kind flips). */
export async function dismissSuggestion(fit: PlanFit, now: Date = new Date()): Promise<void> {
  const s = fit.suggestion;
  if (!s) return;
  await setPlanHint({ week: fit.week, kind: s.kind, to: s.to, dismissed_at: now.toISOString() }, now);
}
