// Desktop keys of the exercise player (DESKTOP-SPEC §4 «Упражнения», D-Exercise-Player): 1–4 pick an
// option (the tap equivalent: it answers at once), 0 «Не знаю», Enter «Дальше» (on a right answer it
// skips the 1 s hairline; on a new word's card it is «Понятно»), Esc «Выйти» (the run is saved).
// On the done screen: C «Попросить следующий набор» (single-letter keys only), Esc «Готово».
// Bound by `code`, so they work on the Russian layout. Pure mapping; ExercisePlayer wires it up and
// applies the typing / open-layer / input-guard rules shared with the review screen.
import type { KeyLike } from "@/components/review/keys";

export { isTypingTarget, keepsActivationKeys } from "@/components/review/keys";

/** Keys pressed this soon after a view appears (the player, the done screen) do nothing (DESKTOP-SPEC §4 input guard). */
export const INPUT_GUARD_MS = 400;

/**
 * After a tap or key answers, keys and taps on the result wait this long (the stamp landing:
 * 70 + 160 ms, MOTION-SPEC §5.15) and are ignored, never queued.
 */
export const RESULT_LOCK_MS = 230;

export type ExerciseKeyAction =
  | { type: "pick"; index: number }
  | { type: "dont-know" }
  | { type: "next" }
  | { type: "leave" }
  | { type: "follow-up" };

export interface ExerciseKeyContext {
  /** intro: a new word's card; question: asked; answered: the result is showing; done: the done screen. */
  phase: "intro" | "question" | "answered" | "done";
  /** Option tiles on the card (0 on a pairs board). */
  options: number;
  /** Single-letter keys are on (settings.shortcuts). Default true. */
  letters?: boolean;
}

const DIGIT = /^(?:Digit|Numpad)([0-9])$/;

const isEnter = (ev: KeyLike) => ev.key === "Enter" || ev.code === "Enter" || ev.code === "NumpadEnter";

/** Maps a key press to a player action, or null when the player should leave it alone. */
export function exerciseKeyAction(ev: KeyLike, ctx: ExerciseKeyContext): ExerciseKeyAction | null {
  if (ev.altKey || ev.ctrlKey || ev.metaKey || ev.repeat) return null;
  // Dead keys (^ ¨), compose and IME input.
  if (ev.isComposing || ev.keyCode === 229) return null;
  if (ev.key === "Escape") return { type: "leave" };
  if (ctx.phase === "done") {
    return ev.code === "KeyC" && !ev.shiftKey && (ctx.letters ?? true) ? { type: "follow-up" } : null;
  }
  if (ctx.phase === "intro") return isEnter(ev) || ev.code === "Space" || ev.key === " " ? { type: "next" } : null;
  if (ctx.phase === "answered") return isEnter(ev) ? { type: "next" } : null;
  if (ev.shiftKey) return null;
  const digit = DIGIT.exec(ev.code)?.[1] ?? (/^[0-9]$/.test(ev.key) ? ev.key : null);
  if (digit === null) return null;
  const n = Number(digit);
  if (n === 0) return { type: "dont-know" };
  return n <= Math.min(4, ctx.options) ? { type: "pick", index: n - 1 } : null;
}
