// Debounced, abortable detection of slang level and example for what the user is typing (the
// manual form) or has pasted («Список»). Results come back through `onResults`; nothing is saved here.
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { EnrichResult } from "@/lib/ai/schemas";
import { enrichWords, type EnrichInput } from "@/lib/enrich";

export const FORM_ENRICH_DEBOUNCE_MS = 700;
export const LIST_ENRICH_DEBOUNCE_MS = 800;

/**
 * Requests `words` once they have been stable for `delayMs`. A new list aborts the previous
 * request. Returns whether a request for the current list is still pending.
 */
export function useAutoEnrich<T extends EnrichInput>(
  words: readonly T[] | null,
  onResults: (results: ReadonlyMap<string, EnrichResult>, words: readonly T[]) => void,
  delayMs: number,
): boolean {
  const key = words && words.length > 0 ? JSON.stringify(words) : null;
  const [settled, setSettled] = useState<string | null>(null);
  const cache = useRef(new Map<string, ReadonlyMap<string, EnrichResult>>());
  const deliver = useEffectEvent((results: ReadonlyMap<string, EnrichResult>, sent: readonly T[]) => onResults(results, sent));

  useEffect(() => {
    if (!key) return;
    const sent = JSON.parse(key) as T[];
    const cached = cache.current.get(key);
    const controller = new AbortController();
    const timer = setTimeout(
      () => {
        if (cached) {
          deliver(cached, sent);
          setSettled(key);
          return;
        }
        enrichWords(sent, { signal: controller.signal, retries: 1 }).then(
          (results) => {
            if (controller.signal.aborted) return;
            cache.current.set(key, results);
            deliver(results, sent);
            setSettled(key);
          },
          () => {
            if (!controller.signal.aborted) setSettled(key);
          },
        );
      },
      cached ? 0 : delayMs,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, delayMs]);

  return key !== null && settled !== key;
}
