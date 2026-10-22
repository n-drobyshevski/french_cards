// Debounced, abortable detection of slang level, example and theme for what the user is typing
// (the manual form) or has pasted («Список»). Results come back through `onResults`; nothing is saved here.
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { EnrichResult, FolderInput, ModelTierInput } from "@/lib/ai/schemas";
import { enrichWords, type EnrichInput } from "@/lib/enrich";

export const FORM_ENRICH_DEBOUNCE_MS = 700;
export const LIST_ENRICH_DEBOUNCE_MS = 800;
/** The indicators («определяется…», «…») wait this long after the words last changed (MOTION-SPEC A6). */
export const ENRICH_INDICATOR_DELAY_MS = 300;

export interface AutoEnrichRequest {
  /** The learner's themes: results also carry a theme pick. */
  folders?: readonly FolderInput[];
  /** Settings «Модель для подсказок». */
  model?: ModelTierInput;
}

export interface AutoEnrichState {
  /** A request for the current words is pending (debouncing or in flight). */
  pending: boolean;
  /** Pending for ENRICH_INDICATOR_DELAY_MS since the words last changed: show the indicators. */
  waiting: boolean;
  /** The request for the current words failed (the fields stay as they are). */
  failed: boolean;
  /** Words whose batch is back / words sent, while waiting (for «Определяем · 4 / 12»). */
  progress: { done: number; total: number } | null;
}

/**
 * Requests `words` once they have been stable for `delayMs`. A new request aborts the previous
 * one. Returns where the current one is.
 */
export function useAutoEnrich<T extends EnrichInput>(
  words: readonly T[] | null,
  { folders, model }: AutoEnrichRequest,
  onResults: (results: ReadonlyMap<string, EnrichResult>, words: readonly T[]) => void,
  delayMs: number,
): AutoEnrichState {
  const key = words && words.length > 0 ? JSON.stringify({ words, folders, model }) : null;
  const [settled, setSettled] = useState<{ key: string; failed: boolean } | null>(null);
  const [shownFor, setShownFor] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ key: string; done: number; total: number } | null>(null);
  const cache = useRef(new Map<string, ReadonlyMap<string, EnrichResult>>());
  const deliver = useEffectEvent((results: ReadonlyMap<string, EnrichResult>, sent: readonly T[]) => onResults(results, sent));

  useEffect(() => {
    if (!key) return;
    const request = JSON.parse(key) as { words: T[]; folders?: FolderInput[]; model?: ModelTierInput };
    const sent = request.words;
    const cached = cache.current.get(key);
    const controller = new AbortController();
    const indicator = cached ? null : setTimeout(() => setShownFor(key), ENRICH_INDICATOR_DELAY_MS);
    const timer = setTimeout(
      () => {
        if (cached) {
          deliver(cached, sent);
          setSettled({ key, failed: false });
          return;
        }
        enrichWords(sent, {
          signal: controller.signal,
          retries: 1,
          folders: request.folders,
          model: request.model,
          onProgress: (done, total) => {
            if (!controller.signal.aborted) setProgress({ key, done, total });
          },
        }).then(
          (results) => {
            if (controller.signal.aborted) return;
            cache.current.set(key, results);
            deliver(results, sent);
            setSettled({ key, failed: false });
          },
          () => {
            if (!controller.signal.aborted) setSettled({ key, failed: true });
          },
        );
      },
      cached ? 0 : delayMs,
    );
    return () => {
      clearTimeout(timer);
      if (indicator) clearTimeout(indicator);
      controller.abort();
    };
  }, [key, delayMs]);

  const pending = key !== null && settled?.key !== key;
  const waiting = pending && shownFor === key;
  return {
    pending,
    waiting,
    failed: key !== null && settled?.key === key && settled.failed,
    progress: waiting ? (progress?.key === key ? { done: progress.done, total: progress.total } : { done: 0, total: words?.length ?? 0 }) : null,
  };
}
