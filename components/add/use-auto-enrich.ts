// Debounced, abortable detection of slang level, example and theme for what the user is typing
// (the manual form) or has pasted («Список»). Results come back through `onResults`; nothing is saved here.
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { EnrichResult, FolderInput, ModelTierInput } from "@/lib/ai/schemas";
import { enrichWords, type EnrichInput } from "@/lib/enrich";

export const FORM_ENRICH_DEBOUNCE_MS = 700;
export const LIST_ENRICH_DEBOUNCE_MS = 800;

export interface AutoEnrichRequest {
  /** The learner's themes: results also carry a theme pick. */
  folders?: readonly FolderInput[];
  /** Settings «Модель для подсказок». */
  model?: ModelTierInput;
}

/**
 * Requests `words` once they have been stable for `delayMs`. A new request aborts the previous
 * one. Returns whether the current one is pending.
 */
export function useAutoEnrich<T extends EnrichInput>(
  words: readonly T[] | null,
  { folders, model }: AutoEnrichRequest,
  onResults: (results: ReadonlyMap<string, EnrichResult>, words: readonly T[]) => void,
  delayMs: number,
): boolean {
  const key = words && words.length > 0 ? JSON.stringify({ words, folders, model }) : null;
  const [settled, setSettled] = useState<string | null>(null);
  const cache = useRef(new Map<string, ReadonlyMap<string, EnrichResult>>());
  const deliver = useEffectEvent((results: ReadonlyMap<string, EnrichResult>, sent: readonly T[]) => onResults(results, sent));

  useEffect(() => {
    if (!key) return;
    const request = JSON.parse(key) as { words: T[]; folders?: FolderInput[]; model?: ModelTierInput };
    const sent = request.words;
    const cached = cache.current.get(key);
    const controller = new AbortController();
    const timer = setTimeout(
      () => {
        if (cached) {
          deliver(cached, sent);
          setSettled(key);
          return;
        }
        enrichWords(sent, { signal: controller.signal, retries: 1, folders: request.folders, model: request.model }).then(
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
