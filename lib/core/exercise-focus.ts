// «Чаще в упражнениях» (Settings → «Упражнения»): the user asks Claude to put more of their
// difficult words, or the words due for review, into exercise sets. Stored in the synced
// `user_prefs` row `exercise_focus`, so the connector applies it even to a request typed in the
// chat. Pure: shared by the app (Settings, the request builder) and the connector.
import type { ExerciseFocus, ExerciseFocusShare, ExerciseFocusTarget } from "../types";

export const EXERCISE_FOCUS_PREF = "exercise_focus";

export const DEFAULT_EXERCISE_FOCUS: ExerciseFocus = { target: "normal", share: "half" };

export const FOCUS_TARGETS: readonly ExerciseFocusTarget[] = ["normal", "difficult", "due", "both"];
export const FOCUS_SHARES: readonly ExerciseFocusShare[] = ["some", "half", "most"];

export const FOCUS_TARGET_LABELS: Record<ExerciseFocusTarget, string> = {
  normal: "Обычно",
  difficult: "Трудные",
  due: "К повторению",
  both: "Трудные и к повторению",
};

export const FOCUS_SHARE_LABELS: Record<ExerciseFocusShare, string> = {
  some: "Немного",
  half: "Половина",
  most: "Почти все",
};

/** The least share of a set's questions about focus words, when there are enough of them. */
export const FOCUS_SHARE_MIN: Record<ExerciseFocusShare, number> = { some: 0.25, half: 0.5, most: 0.8 };

/** A stored value read back safely: anything unknown falls back to the default. */
export function parseExerciseFocus(value: unknown): ExerciseFocus {
  const v = (value ?? {}) as Partial<ExerciseFocus>;
  return {
    target: FOCUS_TARGETS.includes(v.target as ExerciseFocusTarget) ? (v.target as ExerciseFocusTarget) : DEFAULT_EXERCISE_FOCUS.target,
    share: FOCUS_SHARES.includes(v.share as ExerciseFocusShare) ? (v.share as ExerciseFocusShare) : DEFAULT_EXERCISE_FOCUS.share,
  };
}

/** How many of `total` questions should be about focus words (0 when the focus is off). */
export function focusMinItems(focus: ExerciseFocus, total: number): number {
  return focus.target === "normal" ? 0 : Math.ceil(total * FOCUS_SHARE_MIN[focus.share]);
}

/** Whether a word counts for the focus: `difficult` (its card status) and/or `due` today. */
export function matchesFocus(target: ExerciseFocusTarget, word: { difficult: boolean; due: boolean }): boolean {
  if (target === "difficult") return word.difficult;
  if (target === "due") return word.due;
  if (target === "both") return word.difficult || word.due;
  return false;
}

/** «половина набора»: the share as the summaries say it (the request builder line, the Settings index). */
export const FOCUS_SHARE_PHRASES: Record<ExerciseFocusShare, string> = { some: "немного", half: "половина набора", most: "почти весь набор" };
const TARGET_RU: Record<Exclude<ExerciseFocusTarget, "normal">, string> = {
  difficult: "трудные",
  due: "к повторению",
  both: "трудные и к повторению",
};

/** The one-line summary («Чаще трудные · половина набора»), null when the focus is off. */
export function focusSummary(focus: ExerciseFocus): string | null {
  if (focus.target === "normal") return null;
  return `Чаще ${TARGET_RU[focus.target]} · ${FOCUS_SHARE_PHRASES[focus.share]}`;
}
