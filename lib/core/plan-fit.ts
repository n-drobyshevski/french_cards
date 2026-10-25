// «План и прогресс»: how the «План повторения» fits the way she actually studies, and the one
// change worth offering (Settings → «План повторения», and the connector's study_summary
// `plan_fit`). Pure: no Dexie, no clock — day keys, logs and today's plan are passed in.
// lib/plan-fit.ts reads them on the device; the connector reads the same from Supabase.
//
// Units are the plan's (lib/core/plan.ts): new words = FR→RU words first answered from New (in
// "together" mode new cards of both directions, `newWordKey`); reviews = interday answers (log
// state Review), which the cap counts. Every count is per STUDY day: a day without a single answer
// is not data — never a 0 in a median, never a trigger (non-punitive rules N1–N7 of the brief).
//
// Not enough data gives `fit: "warming_up"` and the UI shows nothing. Studying less than the plan
// allows is information only: it never leads to a suggestion. The cap is never suggested lower.
import type { ReviewLog } from "../types";
import type { DayPlan, DayPlanSnapshot } from "./plan";
import { addDays, newWordKey, weekStartOf } from "./progress";
import { DEFAULT_REVIEW_CAP, NEW_WORDS_MAX, REVIEW_CAP_MAX, type StudyPlan } from "./study-plan";

/** Synced user_prefs key: this week's suggestion, and «Не сейчас». */
export const PLAN_HINT_PREF = "plan_hint";

/** The window: the last 14 study days… */
export const FIT_WINDOW_DAYS = 14;
/** …within the last 21 calendar days (today included). */
export const FIT_LOG_DAYS = 21;
/** «Верно» is measured over the last 28 days. */
export const FIT_RETENTION_DAYS = 28;
/** The scheduler's request_retention (lib/scheduler.ts TARGET_RETENTION; ts-fsrs stays out of here). */
export const FIT_TARGET = 0.9;
/** Gates: days since the first study day, study days in the window, days since the plan changed. */
export const FIT_MIN_HISTORY_DAYS = 14;
export const FIT_MIN_STUDY_DAYS = 7;
export const FIT_MIN_PLAN_DAYS = 7;
/** With 5–6 study days a suggestion goes to the connector only (`confidence: "low"`). */
export const FIT_LOW_STUDY_DAYS = 5;
/** «Не сейчас» hides a kind of suggestion this long… */
export const FIT_DISMISS_DAYS = 14;
/** …unless its `to` moves by this share or more. */
export const FIT_DISMISS_CHANGE = 0.3;
/** Retention needs at least this many answers to count either way. */
export const FIT_MIN_ANSWERS = 100;
/** Reviews a day 30 days on per extra new word a day (ts-fsrs at R 0.9), before the RU→FR factor. */
export const FIT_N30 = 2.9;
/** History from which the observed ρ replaces FIT_N30 × d. */
export const FIT_RHO_DAYS = 60;

export type FitKind = "warming_up" | "fits" | "room" | "heavy";
export type SuggestionKind = "raise_new" | "lower_new";
/** Why a suggestion was made (codes; the UI and the connector word them). */
export type SuggestionWhy = "full_days" | "low_load" | "retention_ok" | "backlog" | "retention_low" | "load_high" | "cap_hit";
export type FitConfidence = "low" | "medium" | "high";

/** A review log as the fit reads it: the plan-relevant fields and its study day key. */
export type PlanFitLog = Pick<ReviewLog, "word_id" | "direction" | "state" | "rating"> & { day: string };

/** `plan_hint` (synced): the suggestion shown this ISO week, and when «Не сейчас» was tapped. */
export interface PlanHint {
  /** ISO week of the suggestion, "2026-W43" (`isoWeek`). */
  week: string;
  kind: SuggestionKind;
  to: number;
  /** ISO timestamp of «Не сейчас»; null while not dismissed. */
  dismissed_at: string | null;
}

/** Today's plan bits the fit reads (lib/core/plan.ts `DayPlan`). */
export type PlanFitToday = Pick<DayPlan, "forecast7" | "backlog" | "available"> & Partial<Pick<DayPlan, "newLeft">>;

export interface PlanFitInput {
  /** Live logs of at least the last 21 days (older ones are ignored), each with its study day. */
  logs: readonly PlanFitLog[];
  todayKey: string;
  plan: StudyPlan;
  /** Day the stored plan last changed (user_prefs `study_plan` updated_at); null = never saved. */
  planSince: string | null;
  /** The first study day with a live answer; null before any. */
  firstStudyDay: string | null;
  /** The kept day plans (progress_days.plan, `plan_day` for today), by day; missing = unknown. */
  dayPlans?: Readonly<Record<string, DayPlanSnapshot | null | undefined>>;
  today: PlanFitToday;
  /** «Верно» over the last 28 days (lib/core/progress.ts firstReviewsPerDay + retentionOf). */
  retention28: { rate: number | null; answers: number };
  hint?: PlanHint | null;
  /**
   * The study day of a timestamp (ms), keyed as `logs` are: the app's `dayKey`, the connector's zone
   * keyer. Reads the day of «Не сейчас» (`hint.dismissed_at`); without it, the UTC date.
   */
  dayOf?: (at: number) => string;
  /**
   * With ≥ 60 days of history: interday answers over the last 28 days and new words (plan units)
   * over the last 56, for the observed reviews per new word. Omit otherwise.
   */
  rho?: { interday28: number; newWords56: number } | null;
}

export interface PlanSuggestion {
  kind: SuggestionKind;
  /** The plan's new words now… */
  from: number;
  /** …and the suggested value. */
  to: number;
  /** A second option with a lower suggestion: a cap 50 higher, when she does the whole cap and retention holds. */
  alt: { review_cap: number } | null;
  /** Reviews a day: now (the 7-day forecast) and ≈ 30 days after the change [lo, hi]. */
  forecast30: { now: number; then: [number, number] };
  why: SuggestionWhy[];
  /** "low" (5–6 study days) is for the connector only («пока мало данных»); Settings shows medium and high. */
  confidence: FitConfidence;
}

export interface PlanFit {
  /** ISO week of `todayKey` (the suggestion stays the same all week). */
  week: string;
  /** The last ≤ 14 study days within 21 days; `from`/`to` are its first and last study day. */
  window: { days: number; active: number; from: string | null; to: string | null };
  /** Since when the current ceiling and cap hold (the stored stamp, moved back over kept days with the same plan). */
  planSince: string | null;
  newWords: {
    plan: number;
    /** What `plan` counts: words (FR→RU), or cards in "together" mode. */
    unit: "words" | "cards";
    /** Median per study day under the current plan; null without such a day. */
    typical: number | null;
    p60: number | null;
    max: number | null;
    /** Study days that took all `plan` new words («Все 10 — в 11 из 12 учебных дней»). */
    fullDays: number;
    /** Study days that took the day's whole budget (the plan's own ceiling, or what it allowed that day). */
    budgetDays: number;
    /** Study days under the current plan: the base of `typical`, `fullDays`, `budgetDays`. */
    planDays: number;
    /** Study days the plan held new words back, by reason; `known` = study days with a kept plan. */
    held: { load: number; accuracy: number; backlog: number; known: number };
  };
  reviews: {
    cap: number | null;
    /** Median interday answers per study day. */
    typical: number | null;
    /** Median of every answer per study day (the ledger shows the mean of these). */
    allTypical: number | null;
    max: number | null;
    /** Mean reviews a day over the next 7 days, whole. */
    forecast7: number;
    /** Study days with more reviews due than the cap. */
    backlogDays: number;
    /** Study days that did the whole cap. */
    capHitDays: number;
  };
  retention: { rate: number | null; target: number; answers: number };
  fit: FitKind;
  /** null: nothing to offer, or hidden by «Не сейчас» (`dismissedUntil`). With `fit: "warming_up"` only a "low" one. */
  suggestion: PlanSuggestion | null;
  /** Day key until which «Не сейчас» hides the current suggestion; null when not hidden. */
  dismissedUntil: string | null;
}

// ---------------------------------------------------------------------------------------------
// Counting per study day

/** Live logs with their study days (`keyOf`: lib/core/progress.ts dayKey, or the connector's zone keyer). */
export function fitLogs(
  logs: readonly Pick<ReviewLog, "word_id" | "direction" | "state" | "rating" | "review" | "deleted_at">[],
  keyOf: (at: number) => string,
): PlanFitLog[] {
  const out: PlanFitLog[] = [];
  for (const l of logs) {
    const at = Date.parse(l.review);
    if (l.deleted_at !== null || Number.isNaN(at)) continue;
    out.push({ word_id: l.word_id, direction: l.direction, state: l.state, rating: l.rating, day: keyOf(at) });
  }
  return out;
}

/** New words per study day in plan units (`together`: the plan's "together" mode). Days without any are absent. */
export function newWordsByDay(logs: readonly PlanFitLog[], together: boolean): Map<string, number> {
  const sets = new Map<string, Set<string>>();
  for (const l of logs) {
    const k = newWordKey(l, together);
    if (k === null) continue;
    let set = sets.get(l.day);
    if (!set) sets.set(l.day, (set = new Set()));
    set.add(k);
  }
  return new Map([...sets].map(([day, set]) => [day, set.size]));
}

/** Interday answers per study day (log state Review: what the cap counts). Days without any are absent. */
export function interdayByDay(logs: readonly PlanFitLog[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of logs) if (l.state === 2) out.set(l.day, (out.get(l.day) ?? 0) + 1);
  return out;
}

/** Every answer per study day. */
export function answersByDay(logs: readonly PlanFitLog[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of logs) out.set(l.day, (out.get(l.day) ?? 0) + 1);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Helpers

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO 8601 week of a day key: "2026-W43" (weeks start on Monday). */
export function isoWeek(key: string): string {
  const thursday = addDays(weekStartOf(key), 3);
  const [y, m, d] = thursday.split("-").map(Number);
  const dayOfYear = (Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86_400_000;
  return `${y}-W${pad(Math.floor(dayOfYear / 7) + 1)}`;
}

/** Whole calendar days from `a` to `b` (b − a). */
function daysFrom(a: string, b: string): number {
  const ms = (k: string) => {
    const [y, m, d] = k.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((ms(b) - ms(a)) / 86_400_000);
}

/** Rates compare with a little slack (0.9 − 0.01 is 0.8900000000000001). */
const EPS = 1e-9;

const finite = (x: unknown, dflt = 0) => (typeof x === "number" && Number.isFinite(x) ? x : dflt);

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return Math.round(s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2);
}

/** Nearest-rank percentile. */
function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))];
}

const isBacklog = (s: DayPlanSnapshot) => s.cap !== null && s.due > s.cap;

/**
 * Since when the current ceiling and cap hold. The stored stamp moves with any change of the plan
 * (the order of new words too, or an undo); kept days before it with the same ceiling and cap count
 * as the same plan, so the stamp moves back over them. Days off are skipped; a study day without a
 * kept plan (`studied`) stops the walk, since its plan is unknown.
 */
export function effectivePlanSince(
  planSince: string | null,
  dayPlans: Readonly<Record<string, DayPlanSnapshot | null | undefined>>,
  plan: Pick<StudyPlan, "new_words" | "review_cap">,
  studied: (day: string) => boolean = () => false,
): string | null {
  if (planSince === null) return null;
  let since = planSince;
  for (let i = 1, d = addDays(planSince, -1); i <= FIT_LOG_DAYS; i++, d = addDays(d, -1)) {
    const s = dayPlans[d];
    if (!s) {
      if (studied(d)) break;
      continue;
    }
    if (s.ceiling !== plan.new_words || s.cap !== plan.review_cap) break;
    since = d;
  }
  return since;
}

export function parsePlanHint(value: unknown): PlanHint | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.week !== "string" || !/^\d{4}-W\d{2}$/.test(v.week)) return null;
  if (v.kind !== "raise_new" && v.kind !== "lower_new") return null;
  if (typeof v.to !== "number" || !Number.isFinite(v.to)) return null;
  const at = typeof v.dismissed_at === "string" && !Number.isNaN(Date.parse(v.dismissed_at)) ? v.dismissed_at : null;
  return { week: v.week, kind: v.kind, to: v.to, dismissed_at: at };
}

// ---------------------------------------------------------------------------------------------
// The fit

const EMPTY_HELD = { load: 0, accuracy: 0, backlog: 0, known: 0 };

export function planFit(input: PlanFitInput): PlanFit {
  const { plan, todayKey } = input;
  const dayPlans = input.dayPlans ?? {};
  const together = plan.ru_fr === "together";
  const ceiling = plan.new_words;
  const cap = plan.review_cap;
  const loadCap = cap ?? DEFAULT_REVIEW_CAP;
  const forecast7 = Math.max(0, finite(input.today.forecast7));
  const week = isoWeek(todayKey);

  // --- The window: the last 14 study days within 21 days. Today counts once its new words are done.
  const oldest = addDays(todayKey, -(FIT_LOG_DAYS - 1));
  const logs = input.logs.filter((l) => l.day >= oldest && l.day <= todayKey);
  const answers = answersByDay(logs);
  const todayDone = input.today.newLeft === undefined || input.today.newLeft <= 0;
  const studyDays = [...answers.keys()]
    .filter((d) => d < todayKey || todayDone)
    .sort()
    .slice(-FIT_WINDOW_DAYS);
  const active = studyDays.length;
  const newWords = newWordsByDay(logs, together);
  const interday = interdayByDay(logs);
  const planSince = effectivePlanSince(input.planSince, dayPlans, plan, (d) => answers.has(d));
  // A plan changed less than a week ago holds the suggestion back, never the facts: its own days
  // are counted once there are a few, else the whole window is (against today's ceiling).
  const planOk = input.planSince === null || daysFrom(planSince ?? input.planSince, todayKey) >= FIT_MIN_PLAN_DAYS;

  // --- New words, against the current plan (study days on or after planSince).
  const ownDays = studyDays.filter((d) => planSince === null || d >= planSince);
  const planDays = planOk || ownDays.length >= FIT_LOW_STUDY_DAYS ? ownDays : studyDays;
  const nw = (d: string) => newWords.get(d) ?? 0;
  const planValues = planDays.map(nw);
  const fullDays = planDays.filter((d) => nw(d) >= ceiling).length;
  const budgetDays = planDays.filter((d) => {
    const s = dayPlans[d];
    const budget = s ? Math.min(s.budget, ceiling) : ceiling;
    return nw(d) >= ceiling || (s ? budget > 0 && nw(d) >= budget : false);
  }).length;
  const held = { ...EMPTY_HELD };
  for (const d of studyDays) {
    const s = dayPlans[d];
    if (!s) continue;
    held.known++;
    if (s.override || s.budget >= s.ceiling) continue;
    if (s.reason === "backlog" || s.reason === "load" || s.reason === "accuracy") held[s.reason]++;
  }

  // --- Reviews.
  const interValues = studyDays.map((d) => interday.get(d) ?? 0);
  const backlogDays = studyDays.filter((d) => {
    const s = d === todayKey ? null : dayPlans[d];
    return d === todayKey ? input.today.backlog : !!s && isBacklog(s);
  }).length;
  const capHitDays = cap === null ? 0 : interValues.filter((n) => n >= cap).length;

  const retention = {
    rate: input.retention28.rate === null || !Number.isFinite(input.retention28.rate) ? null : input.retention28.rate,
    target: FIT_TARGET,
    answers: Math.max(0, Math.round(finite(input.retention28.answers))),
  };

  const base: PlanFit = {
    week,
    window: { days: FIT_WINDOW_DAYS, active, from: studyDays[0] ?? null, to: studyDays[active - 1] ?? null },
    planSince,
    newWords: {
      plan: ceiling,
      unit: together ? "cards" : "words",
      typical: median(planValues),
      p60: percentile(planValues, 0.6),
      max: planValues.length ? Math.max(...planValues) : null,
      fullDays,
      budgetDays,
      planDays: planDays.length,
      held,
    },
    reviews: {
      cap,
      typical: median(interValues),
      allTypical: median(studyDays.map((d) => answers.get(d) ?? 0)),
      max: interValues.length ? Math.max(...interValues) : null,
      forecast7: Math.round(forecast7),
      backlogDays,
      capHitDays,
    },
    retention,
    fit: "warming_up",
    suggestion: null,
    dismissedUntil: null,
  };

  // --- Gates.
  const historyOk = input.firstStudyDay !== null && daysFrom(input.firstStudyDay, todayKey) >= FIT_MIN_HISTORY_DAYS;
  if (!historyOk || active < FIT_LOW_STUDY_DAYS) return base;
  const enough = active >= FIT_MIN_STUDY_DAYS;

  // --- Thresholds.
  const counted = retention.rate !== null && retention.answers >= FIT_MIN_ANSWERS;
  const retOk = counted && retention.rate! >= FIT_TARGET - 0.03 - EPS;
  const retLow = counted && retention.rate! < FIT_TARGET - 0.05 - EPS;
  const lowerWhy: SuggestionWhy[] = [];
  // A backlog lowers only with the coming week loaded too (past where planDay's load throttle
  // starts): a pile of overdue reviews after days away clears by itself (new words already wait
  // on backlog days), and fewer new words would only shrink the load ahead. Days off never lead here.
  if (backlogDays >= 3 && forecast7 > 0.5 * loadCap) lowerWhy.push("backlog");
  if (retLow) lowerWhy.push("retention_low");
  if (forecast7 > 0.8 * loadCap) lowerWhy.push("load_high");

  // Observed reviews per extra new word a day, once there is enough history; else the model's.
  const d = plan.ru_fr === "after" ? 1.5 : 1; // "together" counts cards, "recognition" has no RU→FR
  let k = FIT_N30 * d;
  const rho = input.rho;
  if (rho && daysFrom(input.firstStudyDay!, todayKey) >= FIT_RHO_DAYS && finite(rho.newWords56) > 0) {
    const observed = finite(rho.interday28) / 28 / (finite(rho.newWords56) / 56);
    if (Number.isFinite(observed) && observed > 0) k = Math.min(3 * FIT_N30, Math.max(1, observed));
  }
  const project = (to: number): PlanSuggestion["forecast30"] => {
    const delta = (to - ceiling) * k;
    const a = Math.max(0, Math.round(forecast7 + 0.85 * delta));
    const b = Math.max(0, Math.round(forecast7 + 1.15 * delta));
    return { now: Math.round(forecast7), then: [Math.min(a, b), Math.max(a, b)] };
  };

  let fit: FitKind = "fits";
  let suggestion: PlanSuggestion | null = null;
  const availableNew = together ? finite(input.today.available.fr) + finite(input.today.available.ru) : finite(input.today.available.fr);

  if (lowerWhy.length > 0) {
    fit = "heavy";
    if (ceiling > 3) {
      const to = Math.max(3, Math.round(ceiling * 0.6));
      const altCap = cap !== null && capHitDays >= 3 && retOk ? Math.min(REVIEW_CAP_MAX, cap + 50) : null;
      const strong =
        backlogDays >= 5 || forecast7 > 0.9 * loadCap || (retention.rate !== null && retention.answers >= 150 && retention.rate < FIT_TARGET - 0.08 - EPS);
      suggestion = {
        kind: "lower_new",
        from: ceiling,
        to,
        alt: altCap !== null && altCap > cap! ? { review_cap: altCap } : null,
        forecast30: project(to),
        why: altCap !== null && altCap > cap! ? [...lowerWhy, "cap_hit"] : lowerWhy,
        confidence: !enough ? "low" : active >= 10 && strong ? "high" : "medium",
      };
    }
  } else {
    const roomy =
      planDays.length >= FIT_LOW_STUDY_DAYS &&
      budgetDays >= 0.7 * planDays.length &&
      retOk &&
      backlogDays === 0 &&
      !input.today.backlog &&
      forecast7 <= 0.6 * loadCap &&
      ceiling < NEW_WORDS_MAX;
    if (roomy) {
      for (const step of [5, 4, 3]) {
        const to = Math.min(NEW_WORDS_MAX, ceiling + step);
        if (to <= ceiling || availableNew < 14 * to) continue;
        const forecast30 = project(to);
        if (forecast30.then[1] > 0.5 * loadCap) continue;
        const strong =
          budgetDays >= 0.9 * planDays.length && forecast7 <= 0.4 * loadCap && retention.answers >= 150 && retention.rate! >= FIT_TARGET - 0.01 - EPS;
        fit = "room";
        suggestion = {
          kind: "raise_new",
          from: ceiling,
          to,
          alt: null,
          forecast30,
          why: ["full_days", "low_load", "retention_ok"],
          confidence: !enough ? "low" : active >= 10 && strong ? "high" : "medium",
        };
        break;
      }
    }
  }

  // --- This week's suggestion stays put; «Не сейчас» hides its kind for 14 days.
  let dismissedUntil: string | null = null;
  const hint = input.hint ?? null;
  if (suggestion && hint) {
    if (hint.dismissed_at) {
      const at = Date.parse(hint.dismissed_at);
      const dismissedDay = input.dayOf ? input.dayOf(at) : hint.dismissed_at.slice(0, 10);
      const until = addDays(dismissedDay, FIT_DISMISS_DAYS);
      const similar = hint.kind === suggestion.kind && Math.abs(suggestion.to - hint.to) < FIT_DISMISS_CHANGE * Math.max(1, hint.to);
      if (todayKey < until && similar) {
        dismissedUntil = until;
        suggestion = null;
      }
    } else if (hint.week === week && hint.kind === suggestion.kind && hint.to !== suggestion.to) {
      // Still a value the rules allow today (a raise stays load-safe); otherwise today's own.
      const valid =
        suggestion.kind === "raise_new"
          ? hint.to > ceiling && hint.to <= NEW_WORDS_MAX && availableNew >= 14 * hint.to && project(hint.to).then[1] <= 0.5 * loadCap
          : hint.to >= 3 && hint.to < ceiling;
      if (valid) suggestion = { ...suggestion, to: hint.to, forecast30: project(hint.to) };
    }
  }

  return { ...base, fit: enough ? fit : "warming_up", suggestion: planOk ? suggestion : null, dismissedUntil: planOk ? dismissedUntil : null };
}
