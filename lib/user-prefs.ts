// Preferences that follow the account: rows of the synced `user_prefs` table (migration 0012),
// one per key, so every device and the Claude connector read the same value. The keys:
// «Чаще в упражнениях» (`exercise_focus`, pure helpers in lib/core/exercise-focus.ts) and
// «План повторения» (`study_plan`, lib/core/study-plan.ts), the day's plan as it was (`plan_day`,
// lib/core/plan.ts) and this week's plan suggestion (`plan_hint`, lib/core/plan-fit.ts). Also here,
// device-local: the one-day «Всё равно добавить новые» override of the plan.
import { useLiveQuery } from "dexie-react-hooks";
import { DEFAULT_EXERCISE_FOCUS, EXERCISE_FOCUS_PREF, parseExerciseFocus } from "./core/exercise-focus";
import { nextPlanDayPref, parsePlanDayPref, PLAN_DAY_PREF, type DayPlanSnapshot, type PlanDayPref } from "./core/plan";
import { parsePlanHint, PLAN_HINT_PREF, type PlanHint } from "./core/plan-fit";
import { migrateStudyPlan, parseStudyPlan, sameStudyPlan, STUDY_PLAN_PREF, type StudyPlan } from "./core/study-plan";
import { db } from "./db";
import { getSettings } from "./settings";
import { DEFAULT_SETTINGS, type ExerciseFocus, type UserPref } from "./types";

export * from "./core/exercise-focus";
export * from "./core/study-plan";

/** The stored focus; the default when there is no row (or it was deleted). */
export async function getExerciseFocus(): Promise<ExerciseFocus> {
  const row = await db.user_prefs.get(EXERCISE_FOCUS_PREF);
  return row && row.deleted_at === null ? parseExerciseFocus(row.value) : DEFAULT_EXERCISE_FOCUS;
}

/** «Чаще в упражнениях», live; undefined while loading. */
export function useExerciseFocus(): ExerciseFocus | undefined {
  return useLiveQuery(() => getExerciseFocus(), []);
}

/**
 * Saves the focus (the outbox pushes the row). `updated_at` is stamped past the stored one, so the
 * choice wins last-write-wins even against a row synced from a device whose clock runs ahead.
 * Writing the value already stored is a no-op.
 */
export async function setExerciseFocus(next: ExerciseFocus, now = new Date()): Promise<void> {
  const value = parseExerciseFocus(next);
  await writePref(EXERCISE_FOCUS_PREF, value, (stored) => {
    const s = parseExerciseFocus(stored);
    return s.target === value.target && s.share === value.share;
  }, now);
}

/**
 * Puts a pref row, stamped past the stored `updated_at` (so it wins last-write-wins even against a
 * row from a device whose clock runs ahead). Nothing is written when `same(stored value)` holds.
 */
async function writePref(id: string, value: unknown, same: (stored: unknown) => boolean, now: Date): Promise<void> {
  await updatePref(id, (stored) => (stored !== undefined && same(stored) ? undefined : value), now);
}

/**
 * Puts the value `next(stored value)` returns (stored: undefined without a live row), stamped as in
 * `writePref`; nothing is written when it returns undefined. Returns whether a row was written.
 */
async function updatePref(id: string, next: (stored: unknown) => unknown, now: Date): Promise<boolean> {
  return db.transaction("rw", db.user_prefs, async () => {
    const current = await db.user_prefs.get(id);
    const value = next(current && current.deleted_at === null ? current.value : undefined);
    if (value === undefined) return false;
    const prevMs = current ? Date.parse(current.updated_at) : NaN;
    const ms = Number.isNaN(prevMs) ? now.getTime() : Math.max(now.getTime(), prevMs + 1);
    const row: UserPref = { id, value, updated_at: new Date(ms).toISOString(), deleted_at: null };
    await db.user_prefs.put(row);
    return true;
  });
}

// --- «План повторения» ------------------------------------------------------------------------

/**
 * The stored plan. Without a live row: the plan migrated from this device's «Новых карточек в
 * день» (`Settings.new_per_day`, cards): `new_words = ceil(new_per_day / 2)`, the rest the defaults.
 */
export async function getStudyPlan(): Promise<StudyPlan> {
  const [row, settings] = await Promise.all([db.user_prefs.get(STUDY_PLAN_PREF), getSettings()]);
  const fallback = migrateStudyPlan(settings.new_per_day);
  return row && row.deleted_at === null ? parseStudyPlan(row.value, fallback) : fallback;
}

/**
 * Without a live `study_plan` row, saves the plan this device migrates from its «Новых карточек в
 * день», so Claude's `study_summary` (which can't see device settings and migrates the default)
 * plans the same day. Only when that number isn't the default, and only after a pull (lib/sync.ts),
 * so a row another device saved is never overwritten unseen.
 */
export async function saveMigratedStudyPlan(now = new Date()): Promise<void> {
  const [row, settings] = await Promise.all([db.user_prefs.get(STUDY_PLAN_PREF), getSettings()]);
  if ((row && row.deleted_at === null) || settings.new_per_day === DEFAULT_SETTINGS.new_per_day) return;
  // A live row that lands meanwhile (a pull) wins: nothing is written then.
  await writePref(STUDY_PLAN_PREF, migrateStudyPlan(settings.new_per_day), () => true, now);
}

/** «План повторения», live; undefined while loading. */
export function useStudyPlan(): StudyPlan | undefined {
  return useLiveQuery(() => getStudyPlan(), []);
}

/** Saves the plan (synced: every device and Claude see it). Writing the stored plan again is a no-op. */
export async function setStudyPlan(next: StudyPlan, now = new Date()): Promise<void> {
  const value = parseStudyPlan(next);
  await writePref(STUDY_PLAN_PREF, value, (stored) => isComplete(stored) && sameStudyPlan(parseStudyPlan(stored), value), now);
}

/** A stored value that already has every field (an older, partial row is rewritten in full). */
const isComplete = (v: unknown) =>
  v !== null && typeof v === "object" && ["new_words", "review_cap", "new_order", "mix", "ru_fr"].every((k) => k in (v as object));

// --- The day's plan, kept (`plan_day`) ----------------------------------------------------------

/** The stored `plan_day` (today's snapshot and the previous day's); null without a live row. */
export async function getPlanDay(): Promise<PlanDayPref | null> {
  const row = await db.user_prefs.get(PLAN_DAY_PREF);
  return row && row.deleted_at === null ? parsePlanDayPref(row.value) : null;
}

/**
 * Keeps the plan of study day `day` ("YYYY-MM-DD"): the first plan of a day moves the stored one to
 * `prev`; a later one rewrites it only when it differs (the plan or the override changed). Synced.
 * Returns whether it wrote. lib/session.ts `loadSession` calls it (outside its live query).
 */
export async function recordPlanDay(day: string, snap: DayPlanSnapshot, now = new Date()): Promise<boolean> {
  return updatePref(PLAN_DAY_PREF, (stored) => nextPlanDayPref(stored === undefined ? null : parsePlanDayPref(stored), day, snap) ?? undefined, now);
}

/**
 * `recordPlanDay` as the app calls it: the first plan of a new day (the stored `plan_day` is older,
 * or missing) waits for `pull` to settle first. Sync pushes before it pulls and `plan_day` is
 * last-write-wins, so a device opened in the morning would otherwise push its own stale day over
 * the one another device kept yesterday (its `prev`) before `ensureProgressDays` copied it. A
 * failed or offline pull writes anyway.
 */
export async function recordPlanDayAfterPull(day: string, snap: DayPlanSnapshot, pull: () => Promise<unknown>, now?: Date): Promise<boolean> {
  const stored = await getPlanDay();
  if (!stored || stored.day < day) await pull().catch(() => {});
  return recordPlanDay(day, snap, now ?? new Date());
}

// --- This week's plan suggestion (`plan_hint`) ------------------------------------------------------

/** The stored `plan_hint`; null without a live row. */
export async function getPlanHint(): Promise<PlanHint | null> {
  const row = await db.user_prefs.get(PLAN_HINT_PREF);
  return row && row.deleted_at === null ? parsePlanHint(row.value) : null;
}

/** Saves `plan_hint` (synced); the same value again is a no-op. */
export async function setPlanHint(hint: PlanHint, now = new Date()): Promise<void> {
  await writePref(PLAN_HINT_PREF, hint, (stored) => {
    const s = parsePlanHint(stored);
    return !!s && s.week === hint.week && s.kind === hint.kind && s.to === hint.to && s.dismissed_at === hint.dismissed_at;
  }, now);
}

// --- «Всё равно добавить новые» (device-local, one study day) ------------------------------------

/** Its own row in the device-local settings table (like lib/sync.ts's "sync" row): never synced or backed up. */
export const PLAN_OVERRIDE_ID = "plan_override";

interface PlanOverrideRow {
  id: typeof PLAN_OVERRIDE_ID;
  /** The study day (its 04:00 start, ISO) the override is on for; null = off. */
  new_override_day: string | null;
}

const overrideTable = () => db.table<PlanOverrideRow, string>("settings");

/** The study day (start, ISO) «Всё равно добавить новые» was picked for, or null. */
export async function getNewOverrideDay(): Promise<string | null> {
  return (await overrideTable().get(PLAN_OVERRIDE_ID))?.new_override_day ?? null;
}

/** Whether «Всё равно добавить новые» is on for the study day starting at `dayStart`. */
export async function isNewOverrideOn(dayStart: Date): Promise<boolean> {
  return (await getNewOverrideDay()) === dayStart.toISOString();
}

/** Turns the override on for the study day starting at `dayStart` (lib/session `startOfStudyDay`); null turns it off. */
export async function setNewOverride(dayStart: Date | null): Promise<void> {
  await overrideTable().put({ id: PLAN_OVERRIDE_ID, new_override_day: dayStart ? dayStart.toISOString() : null });
}

/** The override for the study day starting at `dayStart`, live; undefined while loading. */
export function useNewOverride(dayStart: Date): boolean | undefined {
  const key = dayStart.toISOString();
  return useLiveQuery(async () => (await getNewOverrideDay()) === key, [key]);
}
