"use client";

// Streaming AI results (MOTION-SPEC §3.6, §3.8): rows or groups that arrive write in with a 4 px
// rise, staggered within one arrival; a rate-limit wait counts down in the open.
import { useEffect, useState, type CSSProperties } from "react";

/**
 * The index of the first item that arrived with the latest render, so items arriving in the same
 * frame stagger 40 ms and older ones do not replay.
 */
export function useArrivals(count: number): number {
  const [seen, setSeen] = useState({ count, base: count });
  if (seen.count !== count) {
    const next = { count, base: count > seen.count ? seen.count : count };
    setSeen(next);
    return next.base;
  }
  return seen.base;
}

/**
 * Inline style for a streamed item: 4 px rise + fade, `--dur-enter`, staggered 40 ms within one
 * arrival up to `cap` (200 ms for rows, 300 ms for sort-plan groups). An item that has already
 * arrived gets no delay, so its finished animation never restarts.
 */
export function arrivalStyle(index: number, base: number, cap = 200): CSSProperties {
  const delay = index >= base ? Math.min((index - base) * 40, cap) : 0;
  return { animation: `enter-rise var(--dur-enter) var(--ease-enter) ${delay}ms both` };
}

/**
 * Whole seconds left until `at` (ms, Date.now), ticking; 0 once it has passed; null without `at`
 * and for the first frame after `at` changes (the clock is read outside render).
 */
export function useCountdown(at: number | null | undefined): number | null {
  const [left, setLeft] = useState<{ at: number | null | undefined; seconds: number } | null>(null);
  useEffect(() => {
    if (!at) return;
    const tick = () => setLeft({ at, seconds: Math.max(0, Math.ceil((at - Date.now()) / 1000)) });
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 250);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [at]);
  return at && left?.at === at ? left.seconds : null;
}
