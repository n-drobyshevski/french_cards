// The «Прогресс» period (Месяц · 3 месяца · Год · Всё), remembered per device in localStorage.
// A per-device convenience: without storage (private mode) it lasts until reload.
import { useSyncExternalStore } from "react";
import type { ProgressRange } from "@/lib/progress";

export const PROGRESS_RANGE_KEY = "kartochki:progress-range";
export const DEFAULT_PROGRESS_RANGE: ProgressRange = "3m";
const RANGES: readonly ProgressRange[] = ["month", "3m", "year", "all"];
const CHANGE_EVENT = "kartochki:progress-range";

let memory: ProgressRange | null = null;

export function parseProgressRange(value: unknown): ProgressRange {
  return RANGES.includes(value as ProgressRange) ? (value as ProgressRange) : DEFAULT_PROGRESS_RANGE;
}

export function readProgressRange(): ProgressRange {
  if (memory) return memory;
  try {
    return parseProgressRange(localStorage.getItem(PROGRESS_RANGE_KEY));
  } catch {
    return DEFAULT_PROGRESS_RANGE;
  }
}

export function writeProgressRange(range: ProgressRange): void {
  memory = range;
  try {
    localStorage.setItem(PROGRESS_RANGE_KEY, range);
  } catch {
    // Private mode: kept in memory only.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

/** The chosen period and its setter; the default («3 месяца») on the server and in the first frame. */
export function useProgressRange(): [ProgressRange, (range: ProgressRange) => void] {
  const range = useSyncExternalStore(subscribe, readProgressRange, () => DEFAULT_PROGRESS_RANGE);
  return [range, writeProgressRange];
}
