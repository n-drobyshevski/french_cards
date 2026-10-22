"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  getReviewFilterSnapshot,
  parseReviewFilter,
  subscribeReviewFilter,
  writeReviewFilter,
  type ReviewFilter,
} from "./filter";

const serverSnapshot = () => "";

/** The remembered review filter; the server render and hydration use the default. */
export function useReviewFilter(): [ReviewFilter, (next: ReviewFilter) => void] {
  const raw = useSyncExternalStore(subscribeReviewFilter, getReviewFilterSnapshot, serverSnapshot);
  const filter = useMemo(() => parseReviewFilter(raw), [raw]);
  const set = useCallback((next: ReviewFilter) => writeReviewFilter(next), []);
  return [filter, set];
}
