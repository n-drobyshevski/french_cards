"use client";

import { useSyncExternalStore } from "react";

const STEP_MS = 30_000;

function subscribe(onChange: () => void): () => void {
  const timer = window.setInterval(onChange, STEP_MS);
  return () => window.clearInterval(timer);
}

const snapshot = () => Math.floor(Date.now() / STEP_MS) * STEP_MS;
const serverSnapshot = () => 0;

/** Current time rounded to 30 s, re-rendering as it advances (for «только что» / «5 мин назад»). 0 during SSR. */
export function useClock(): number {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
