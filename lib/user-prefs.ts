// Preferences that follow the account: rows of the synced `user_prefs` table (migration 0012),
// one per key, so every device and the Claude connector read the same value. The keys:
// «Чаще в упражнениях» (`exercise_focus`, pure helpers in lib/core/exercise-focus.ts) and
// «План повторения» (`study_plan`, lib/core/study-plan.ts). Also here, device-local: the
// one-day «Всё равно добавить новые» override of the plan.
import { useLiveQuery } from "dexie-react-hooks";
import { DEFAULT_EXERCISE_FOCUS, EXERCISE_FOCUS_PREF, parseExerciseFocus } from "./core/exercise-focus";
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
  await db.transaction("rw", db.user_prefs, async () => {
    const current = await db.user_prefs.get(id);
    if (current && current.deleted_at === null && same(current.value)) return;
    const prevMs = current ? Date.parse(current.updated_at) : NaN;
    const ms = Number.isNaN(prevMs) ? now.getTime() : Math.max(now.getTime(), prevMs + 1);
    const row: UserPref = { id, value, updated_at: new Date(ms).toISOString(), deleted_at: null };
    await db.user_prefs.put(row);
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
