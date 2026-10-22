// Keyboard shortcuts for the review screen: Space/Enter flip (both ways), 1/2/3 grade, ←/→ = Не знаю/Знаю, Z undo,
// E «Изменить карточку» on the answer side.
// Desktop adds P «Ещё практика» on «Готово на сегодня» and Esc «Закончить практику» (DESKTOP-SPEC §4).
import type { Rating } from "@/lib/scheduler";

export type ReviewKeyAction =
  | { type: "flip" }
  | { type: "unflip" }
  | { type: "grade"; rating: Rating }
  | { type: "undo" }
  | { type: "edit" }
  | { type: "practice" }
  | { type: "end-practice" };

export interface KeyLike {
  key: string;
  code: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
  isComposing?: boolean;
  keyCode?: number;
}

export interface ReviewKeyContext {
  /** Answer side is showing. */
  revealed: boolean;
  gradeButtons: 2 | 3;
  /** Single-letter keys (Z, P) are on (settings.shortcuts on desktop; always on phones). Default true. */
  letters?: boolean;
  /** Desktop keys: P on the done screen, Esc in practice. Default false (phones). */
  desktop?: boolean;
  /** «Готово на сегодня» is showing. */
  done?: boolean;
  /** A practice round is running. */
  practice?: boolean;
}

const DIGIT = /^(?:Digit|Numpad)([1-4])$/;

/** Maps a key press to a review action, or null when the screen should ignore it. */
export function reviewKeyAction(ev: KeyLike, ctx: ReviewKeyContext): ReviewKeyAction | null {
  if (ev.altKey || ev.ctrlKey || ev.metaKey || ev.repeat) return null;
  // Dead keys (^ ¨), compose and IME input.
  if (ev.isComposing || ev.keyCode === 229) return null;
  const letters = ctx.letters ?? true;
  // `code` keeps shortcuts working on the Russian layout (Z is «я» there).
  if (ev.code === "KeyZ") return letters ? { type: "undo" } : null;
  if (ctx.desktop) {
    if (ev.code === "KeyP") return letters && ctx.done && !ev.shiftKey ? { type: "practice" } : null;
    if (ev.key === "Escape") return ctx.practice ? { type: "end-practice" } : null;
  }
  if (ctx.done) return null;
  if (ev.code === "KeyE") return letters && ctx.revealed && !ev.shiftKey ? { type: "edit" } : null;
  if (ev.key === " " || ev.code === "Space" || ev.key === "Enter" || ev.code === "NumpadEnter") {
    return ctx.revealed ? { type: "unflip" } : { type: "flip" };
  }
  if (!ctx.revealed) return null;
  if (ev.key === "ArrowLeft") return { type: "grade", rating: 1 };
  if (ev.key === "ArrowRight") return { type: "grade", rating: 3 };
  const digit = DIGIT.exec(ev.code)?.[1] ?? (/^[1-4]$/.test(ev.key) ? ev.key : null);
  if (!digit) return null;
  const n = Number(digit);
  if (ctx.gradeButtons === 2) {
    if (n === 1) return { type: "grade", rating: 1 };
    if (n === 2 || n === 3) return { type: "grade", rating: 3 };
    return null;
  }
  if (n === 4) return null;
  return { type: "grade", rating: n as Rating };
}

interface TargetLike {
  tagName?: string;
  isContentEditable?: boolean;
  getAttribute?: (name: string) => string | null;
  closest?: (selector: string) => unknown;
}

const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);
const INTERACTIVE =
  "button, a[href], input, textarea, select, summary, [role='button'], [role='switch'], [role='radio'], [role='checkbox'], [role='option'], [role='menuitem']";

/** True when keys should go to a text field instead of the review screen. */
export function isTypingTarget(target: unknown): boolean {
  const el = target as TargetLike | null;
  if (!el || typeof el !== "object") return false;
  if (el.isContentEditable) return true;
  if (el.tagName && TYPING_TAGS.has(el.tagName.toUpperCase())) return true;
  return el.getAttribute?.("role") === "textbox";
}

/** True when the target is (inside) a control that handles Space/Enter itself: a button, link, field. */
export function isInteractiveTarget(target: unknown): boolean {
  const el = target as TargetLike | null;
  if (!el || typeof el !== "object" || typeof el.closest !== "function") return false;
  return !!el.closest(INTERACTIVE);
}

/**
 * True when Space/Enter should go to the focused control rather than flip the card: it is a control
 * reached with the keyboard. A button that merely kept focus after a tap or click (e.g. the
 * direction chip) does not swallow the flip.
 */
export function keepsActivationKeys(target: unknown, focusedByPointer: boolean): boolean {
  return !focusedByPointer && isInteractiveTarget(target);
}
