// «План и прогресс» for the connector: study_summary's `plan_fit`, built with the app's own
// lib/core/plan-fit.ts `planFit` (Settings → «План повторения» shows the same numbers). The device
// keys days by its own clock; the server runs in UTC, so every day key here comes from
// MCP_TIMEZONE (lib/mcp/study-day.ts). The connector reads `plan_hint` and never writes it.
import { parseDayPlanSnapshot, parsePlanDayPref, PLAN_DAY_PREF, snapshotForDay, type DayPlanSnapshot } from "@/lib/core/plan";
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
} from "@/lib/core/plan-fit";
import { addDays, retentionOf } from "@/lib/core/progress";
import type { StudyPlan } from "@/lib/core/study-plan";
import type { ProgressDay, ReviewLog, UserPref } from "@/lib/types";
import { studyDayKey, studyDayKeyer, studyDayStartOf } from "./study-day";

/** ρ compares interday answers over 28 days with the new words of 56 (as lib/plan-fit.ts). */
const RHO_LOG_DAYS = 56;

/** The first study day the stored «Прогресс» rows know of (a row with reviews); null without one. */
function firstStoredStudyDay(rows: readonly ProgressDay[]): string | null {
  let first: string | null = null;
  for (const r of rows) if (r.deleted_at === null && r.reviews > 0 && (first === null || r.id < first)) first = r.id;
  return first;
}

/**
 * When the plan fit's logs start: 28 study days back («Верно»), or 56 once the stored rows reach
 * back 60 days (the observed reviews per new word). Independent of `history_days`.
 */
export function planFitLogsFrom(now: Date, timeZone: string, rows: readonly ProgressDay[]): Date {
  const today = studyDayKey(now, timeZone);
  const first = firstStoredStudyDay(rows);
  const withRho = first !== null && addDays(first, FIT_RHO_DAYS) <= today;
  return studyDayStartOf(addDays(today, -((withRho ? RHO_LOG_DAYS : FIT_RETENTION_DAYS) - 1)), timeZone);
}

export interface PlanFitSource {
  now: Date;
  timeZone: string;
  /** The saved plan (never a «what if» `new_per_day`) and its user_prefs row, if any. */
  plan: StudyPlan;
  planRow: UserPref | undefined;
  /** Every user_prefs row (plan_day, plan_hint), tombstones included. */
  prefs: readonly UserPref[];
  /** Every progress_days row, tombstones included. */
  rows: readonly ProgressDay[];
  /** review_log rows since at least `planFitLogsFrom` (more are ignored), tombstones included. */
  logs: readonly ReviewLog[];
  /** Today's plan with the saved plan (lib/core/plan.ts planDay's `day`). */
  today: PlanFitToday;
}

/** The app's `planFit` on the server's data, with the zone's study days. */
export function serverPlanFit(src: PlanFitSource): PlanFit {
  const { timeZone } = src;
  const todayKey = studyDayKey(src.now, timeZone);
  const from = planFitLogsFrom(src.now, timeZone, src.rows).getTime();
  const keyOf = studyDayKeyer(timeZone);
  const timed = src.logs
    .filter((l) => l.deleted_at === null)
    .map((log) => ({ log, at: Date.parse(log.review) }))
    .filter(({ at }) => !Number.isNaN(at) && at >= from)
    .sort((a, b) => a.at - b.at)
    .map(({ log, at }) => ({ log, day: keyOf(at) }))
    .filter(({ day }) => day <= todayKey);
  const raw = timed.map(({ log }) => log);
  const logs = fitLogs(raw, keyOf);

  // The first study day: the stored rows', or the first live log read here, whichever is older.
  const storedFirst = firstStoredStudyDay(src.rows);
  const loggedFirst = timed[0]?.day ?? null;
  const firstStudyDay = storedFirst === null ? loggedFirst : loggedFirst === null || storedFirst < loggedFirst ? storedFirst : loggedFirst;

  // «Верно»: the first live log of each card per study day over 28 days, when it came as a review card.
  const retentionFrom = addDays(todayKey, -(FIT_RETENTION_DAYS - 1));
  const first = new Map<string, { log: ReviewLog; day: string }>();
  for (const t of timed) {
    if (t.day < retentionFrom) continue;
    const key = `${t.day}|${t.log.word_id}:${t.log.direction}`;
    if (!first.has(key)) first.set(key, t);
  }
  const retention = retentionOf([...first.values()].filter(({ log }) => log.state === 2 || log.state === 3));

  // Kept day plans: the stored rows' (migration 0017), then `plan_day` for today and the day before.
  const windowFrom = addDays(todayKey, -(FIT_LOG_DAYS - 1));
  const dayPlans: Record<string, DayPlanSnapshot | null> = {};
  for (const r of src.rows) if (r.deleted_at === null && r.id >= windowFrom && r.id <= todayKey) dayPlans[r.id] = parseDayPlanSnapshot(r.plan);
  const livePref = (id: string) => src.prefs.find((p) => p.id === id && p.deleted_at === null);
  const kept = parsePlanDayPref(livePref(PLAN_DAY_PREF)?.value);
  for (const d of [kept?.day, kept?.prev?.day]) {
    if (d && d >= windowFrom && d <= todayKey && !dayPlans[d]) dayPlans[d] = snapshotForDay(kept, d);
  }

  const withRho = firstStudyDay !== null && addDays(firstStudyDay, FIT_RHO_DAYS) <= todayKey;
  const rho = withRho
    ? {
        interday28: logs.filter((l) => l.day >= retentionFrom && l.state === 2).length,
        newWords56: [...newWordsByDay(logs, src.plan.ru_fr === "together").values()].reduce((a, b) => a + b, 0),
      }
    : null;

  const stamp = src.planRow ? Date.parse(src.planRow.updated_at) : NaN;
  return planFit({
    logs,
    todayKey,
    plan: src.plan,
    planSince: Number.isNaN(stamp) ? null : studyDayKey(stamp, timeZone),
    firstStudyDay,
    dayPlans,
    today: src.today,
    retention28: { rate: retention.rate, answers: retention.total },
    hint: parsePlanHint(livePref(PLAN_HINT_PREF)?.value),
    dayOf: (at) => studyDayKey(at, timeZone),
    rho,
  });
}

const num = (x: number | null) => (x === null || !Number.isFinite(x) ? null : x);
const round2 = (x: number | null) => (x === null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);

/** study_summary's `plan_fit`: snake_case, compact, null (never NaN) for what is unknown. */
export function planFitView(fit: PlanFit) {
  const n = fit.newWords;
  const r = fit.reviews;
  const s = fit.suggestion;
  return {
    window_days: fit.window.days,
    active_days: fit.window.active,
    plan_since: fit.planSince,
    new_words: {
      plan: n.plan,
      unit: n.unit,
      typical: num(n.typical),
      max: num(n.max),
      full_days: n.fullDays,
      plan_days: n.planDays,
      // Known only for days whose plan the app kept (migration 0017); null when none was.
      held_days: n.held.known > 0 ? { load: n.held.load, accuracy: n.held.accuracy, backlog: n.held.backlog, known: n.held.known } : null,
    },
    reviews: {
      cap: r.cap,
      typical: num(r.typical),
      all_answers_typical: num(r.allTypical),
      max: num(r.max),
      forecast_7d: r.forecast7,
      backlog_days: r.backlogDays,
      cap_hit_days: r.capHitDays,
    },
    retention: { rate: round2(fit.retention.rate), target: fit.retention.target, answers: fit.retention.answers },
    fit: fit.fit,
    suggestion: s
      ? {
          kind: s.kind,
          new_words: s.to,
          ...(s.alt ? { or_review_cap: s.alt.review_cap } : {}),
          forecast_30d: { now: s.forecast30.now, then: s.forecast30.then },
          why: s.why,
          confidence: s.confidence,
        }
      : null,
    dismissed_until: fit.dismissedUntil,
  };
}
