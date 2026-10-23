// Preferences that follow the account: rows of the synced `user_prefs` table (migration 0012),
// one per key, so every device and the Claude connector read the same value. Today the one key
// is «Чаще в упражнениях» (`exercise_focus`, pure helpers in lib/core/exercise-focus.ts).
import { useLiveQuery } from "dexie-react-hooks";
import { DEFAULT_EXERCISE_FOCUS, EXERCISE_FOCUS_PREF, parseExerciseFocus } from "./core/exercise-focus";
import { db } from "./db";
import type { ExerciseFocus, UserPref } from "./types";

export * from "./core/exercise-focus";

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
  await db.transaction("rw", db.user_prefs, async () => {
    const current = await db.user_prefs.get(EXERCISE_FOCUS_PREF);
    if (current && current.deleted_at === null) {
      const stored = parseExerciseFocus(current.value);
      if (stored.target === value.target && stored.share === value.share) return;
    }
    const prevMs = current ? Date.parse(current.updated_at) : NaN;
    const ms = Number.isNaN(prevMs) ? now.getTime() : Math.max(now.getTime(), prevMs + 1);
    const row: UserPref = { id: EXERCISE_FOCUS_PREF, value, updated_at: new Date(ms).toISOString(), deleted_at: null };
    await db.user_prefs.put(row);
  });
}
