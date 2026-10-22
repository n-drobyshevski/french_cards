"use client";

// Floating bottom UI (the app snackbar, the install hint) sits just above the tab bar. Screens
// with their own bottom action bar (grade buttons, «Повторить тему», «Добавить
// N слов») register it here, and --bottom-clearance is set to the distance from the viewport
// bottom to the top of the highest visible bar plus a gap, so floating UI stays above it.

export const BOTTOM_CLEARANCE_VAR = "--bottom-clearance";
/** Gap between a bar and floating UI above it. */
export const CLEARANCE_GAP = 8;
/** Bars whose bottom edge is farther than this from the viewport bottom are in the page flow, not docked. */
const DOCKED_WITHIN = 200;

const bars = new Set<HTMLElement>();
let frame = 0;
let observer: ResizeObserver | null = null;

/** Clearance in px for bars with these client rects in a viewport `viewportHeight` tall (0 = none). */
export function clearanceFor(rects: readonly Pick<DOMRect, "top" | "bottom" | "height">[], viewportHeight: number): number {
  let top = viewportHeight;
  for (const r of rects) {
    if (r.height <= 0 || r.top >= viewportHeight || viewportHeight - r.bottom > DOCKED_WITHIN) continue;
    top = Math.min(top, r.top);
  }
  return top < viewportHeight ? Math.ceil(viewportHeight - top) + CLEARANCE_GAP : 0;
}

function apply() {
  frame = 0;
  const rects = [...bars].filter((el) => el.isConnected).map((el) => el.getBoundingClientRect());
  const px = clearanceFor(rects, window.innerHeight);
  const root = document.documentElement.style;
  if (px > 0) root.setProperty(BOTTOM_CLEARANCE_VAR, `${px}px`);
  else root.removeProperty(BOTTOM_CLEARANCE_VAR);
}

function schedule() {
  if (!frame) frame = requestAnimationFrame(apply);
}

function track(el: HTMLElement): () => void {
  bars.add(el);
  if (bars.size === 1) {
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
  }
  observer?.observe(el);
  schedule();
  return () => {
    bars.delete(el);
    observer?.unobserve(el);
    if (bars.size === 0) {
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, { capture: true });
      observer?.disconnect();
      observer = null;
    }
    schedule();
  };
}

/**
 * Callback ref for a page's bottom action bar, so the app snackbar and install hint float above
 * it instead of covering it: `<div ref={bottomBarRef}>`. Tracking stops when the element unmounts.
 */
export function bottomBarRef(el: HTMLElement | null): (() => void) | undefined {
  if (!el) return undefined;
  return track(el);
}

/** CSS `bottom` for floating UI: `base` above the shell, or above a registered action bar. */
export const floatingBottom = (base: string) => `max(${base}, var(${BOTTOM_CLEARANCE_VAR}, 0px))`;
