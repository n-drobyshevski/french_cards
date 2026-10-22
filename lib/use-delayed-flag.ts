"use client";

import { useEffect, useRef, useState } from "react";

export interface DelayedFlagOptions {
  /** Waits shorter than this never show the indicator (ms). */
  delay?: number;
  /** Once shown, the indicator stays at least this long, so it never blinks (ms). */
  min?: number;
}

/**
 * Loading indicator timing (MOTION-SPEC §3.1): `active` is the real wait; the returned flag turns on
 * only after `delay` and, once on, stays on for at least `min`. Content never waits for it: render
 * the result as soon as it is there and use the flag only for the indicator itself.
 */
export function useDelayedFlag(active: boolean, { delay = 300, min = 500 }: DelayedFlagOptions = {}): boolean {
  const [shown, setShown] = useState(false);
  const shownAt = useRef(0);

  useEffect(() => {
    if (active) {
      if (shown) return;
      const timer = window.setTimeout(() => {
        shownAt.current = performance.now();
        setShown(true);
      }, delay);
      return () => window.clearTimeout(timer);
    }
    if (!shown) return;
    const left = min - (performance.now() - shownAt.current);
    if (left <= 0) {
      setShown(false);
      return;
    }
    const timer = window.setTimeout(() => setShown(false), left);
    return () => window.clearTimeout(timer);
  }, [active, shown, delay, min]);

  return shown;
}

/** Seconds since `active` turned on, ticking once a second; null while inactive (for «0:04»). */
export function useElapsed(active: boolean): number | null {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) return;
    const start = performance.now();
    const timer = window.setInterval(() => setSeconds(Math.floor((performance.now() - start) / 1000)), 1000);
    return () => {
      window.clearInterval(timer);
      setSeconds(0);
    };
  }, [active]);
  return active ? seconds : null;
}

/** «0:04», «1:12». */
export function formatElapsed(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
