"use client";

// Motion helpers for JS that has to follow the CSS tokens (mockups/MOTION-SPEC.md §2): timers that
// wait for a close animation, reduced-motion checks and the spotlight (paper fade, §5.14). The
// tokens themselves live in app/globals.css; read them here instead of repeating the numbers.
import { useEffect, useRef, type RefObject } from "react";

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** True when the user asked for reduced motion; false on the server. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.(REDUCED_MOTION_QUERY).matches === true;
}

/**
 * A computed CSS duration in ms: «240ms» → 240, «.24s» (the minifier's form) → 240. Null for
 * anything else (empty, a var() the browser could not resolve).
 */
export function parseCssDuration(raw: string): number | null {
  const text = raw.trim();
  const value = parseFloat(text);
  if (!Number.isFinite(value)) return null;
  if (text.endsWith("ms")) return value;
  if (text.endsWith("s")) return value * 1000;
  return null;
}

/**
 * A motion token in ms as the page resolves it now (so shorter under reduced motion), e.g.
 * `tokenMs("--dur-exit", 140)`. `fallback` on the server or when the token is missing.
 */
export function tokenMs(name: `--${string}`, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  return parseCssDuration(getComputedStyle(document.documentElement).getPropertyValue(name)) ?? fallback;
}

/** A phone sheet's close (vaul): --dur-enter 240, 110 under reduced motion. Chain follow-ups (a snackbar) after it. */
export function sheetCloseMs(): number {
  return tokenMs("--dur-enter", 240);
}

/** A desktop dialog's (and a menu's, a snackbar's) exit: --dur-exit 140. */
export function exitMs(): number {
  return tokenMs("--dur-exit", 140);
}

/**
 * Spotlight (paper fade, §5.14): lights `el` with --surface-2 at once and lets it fade to its own
 * background over --dur-spotlight (1200 ms, linear; kept under reduced motion). Calling it again
 * restarts the fade. One region at a time: light a container, not each of its rows.
 * For something that is new on mount, the `spotlight` class alone is enough.
 */
export function spotlight(el: Element | null | undefined): void {
  if (!el) return;
  el.classList.remove("spotlight");
  // Reading layout restarts the animation when the class comes back in the same frame.
  void (el as HTMLElement).offsetWidth;
  el.classList.add("spotlight");
  const done = (event: Event) => {
    if (event.target !== el || (event as AnimationEvent).animationName !== "spotlight") return;
    el.classList.remove("spotlight");
    el.removeEventListener("animationend", done);
  };
  el.addEventListener("animationend", done);
}

/**
 * Lights the element behind the returned ref each time `trigger` changes (not on mount), e.g. a
 * field filled by a pick: `const ref = useSpotlight<HTMLInputElement>(pickId)`. A null/undefined
 * trigger never lights it.
 */
export function useSpotlight<T extends Element>(trigger: unknown): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  const last = useRef(trigger);
  useEffect(() => {
    if (Object.is(last.current, trigger)) return;
    last.current = trigger;
    if (trigger != null) spotlight(ref.current);
  }, [trigger]);
  return ref;
}
