"use client";

// «Контекст»: look a word up the way Reverso Context does. Two requests per query: the dictionary
// part (/api/ai/lookup, fast) and real sentences from the web (/api/ai/context, 10–20 s). Both
// land in the device-local `lookups` table, which is the history and lets a repeat query (and the
// offline screen) open without spending another web search.
import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useRef, useState } from "react";
import { AiClientError, postAiJson, type AiClientErrorCode } from "./ai-client";
import type { ContextResponse, LookupResponse } from "./ai/schemas";
import { CONTEXT_MEANINGS_MAX } from "./ai/schemas";
import { searchKey } from "./core/text";
import { db, type LookupEntry } from "./db";
import { getSettings } from "./settings";

/** Queries kept in the history (older ones are dropped on save). */
export const HISTORY_MAX = 50;
export const QUERY_MAX = 80;

const MESSAGES: Record<AiClientErrorCode, string> = {
  offline: "Нет сети — открываются только прошлые запросы",
  auth: "Войдите, чтобы искать",
  unavailable: "Поиск сейчас недоступен",
  rate_limited: "Слишком много запросов — попробуйте через минуту",
  upstream: "Не получилось найти — попробуйте ещё раз",
  aborted: "Поиск остановлен",
};

export class ContextError extends AiClientError {
  constructor(code: AiClientErrorCode) {
    super(code, MESSAGES[code]);
    this.name = "ContextError";
  }
}

const fail = (code: AiClientErrorCode) => new ContextError(code);

/** The trimmed query, or "" when there is nothing to look up. */
export const cleanQuery = (q: string) => q.replace(/\s+/g, " ").trim().slice(0, QUERY_MAX);
export const queryKey = (q: string) => searchKey(cleanQuery(q));

type RequestOpts = { signal?: AbortSignal; fetchImpl?: typeof fetch; model?: "fast" | "accurate"; onRetry?: (s: number) => void };

export function requestLookup(q: string, opts: RequestOpts = {}): Promise<LookupResponse> {
  return postAiJson<LookupResponse>("/api/ai/lookup", { q: cleanQuery(q), ...(opts.model && { model: opts.model }) }, fail, {
    ...opts,
    retries: 1,
  });
}

export function requestContext(lookup: Pick<LookupResponse, "fr" | "translations">, opts: RequestOpts = {}): Promise<ContextResponse> {
  const meanings = lookup.translations.map((t) => t.ru).slice(0, CONTEXT_MEANINGS_MAX);
  return postAiJson<ContextResponse>(
    "/api/ai/context",
    { fr: lookup.fr.slice(0, 120), meanings, ...(opts.model && { model: opts.model }) },
    fail,
    { ...opts, retries: 1 },
  );
}

// ---- history (device-local) ----

export function getLookup(q: string): Promise<LookupEntry | undefined> {
  const key = queryKey(q);
  return key ? db.lookups.get(key) : Promise.resolve(undefined);
}

/** Saves (or refreshes) an entry and drops the oldest ones past HISTORY_MAX. */
export async function saveLookup(entry: Omit<LookupEntry, "key" | "at">, now = new Date()): Promise<LookupEntry> {
  const row: LookupEntry = { ...entry, q: cleanQuery(entry.q), key: queryKey(entry.q), at: now.toISOString() };
  await db.transaction("rw", db.lookups, async () => {
    await db.lookups.put(row);
    const count = await db.lookups.count();
    if (count > HISTORY_MAX) {
      const old = await db.lookups.orderBy("at").limit(count - HISTORY_MAX).primaryKeys();
      await db.lookups.bulkDelete(old);
    }
  });
  return row;
}

/** Moves an entry to the top of the history (opened again). */
export async function touchLookup(key: string, now = new Date()): Promise<void> {
  await db.lookups.update(key, { at: now.toISOString() });
}

export const deleteLookup = (key: string) => db.lookups.delete(key);
export const clearHistory = () => db.lookups.clear();

/** History, newest first. `undefined` while loading. */
export function useLookupHistory(limit = HISTORY_MAX): LookupEntry[] | undefined {
  return useLiveQuery(() => db.lookups.orderBy("at").reverse().limit(limit).toArray(), [limit]);
}

// ---- the screen's state ----

export type Phase = "idle" | "loading" | "done" | "error";

export interface ContextSearchState {
  /** The query being shown (cleaned), "" when none. */
  q: string;
  lookupPhase: Phase;
  lookup: LookupResponse | null;
  /** «Ищем в вебе»: "idle" until the lookup is done (or when it found nothing), "done" also after «Стоп» with no examples. */
  contextPhase: Phase | "stopped";
  context: ContextResponse | null;
  /** Shown under the failed part. */
  error: string | null;
  /** Seconds left of a rate-limit wait. */
  retryIn: number | null;
  /** The results came from the history (no request made). */
  cached: boolean;
}

const EMPTY: ContextSearchState = {
  q: "",
  lookupPhase: "idle",
  lookup: null,
  contextPhase: "idle",
  context: null,
  error: null,
  retryIn: null,
  cached: false,
};

const messageOf = (e: unknown) => (e instanceof AiClientError ? e.message : MESSAGES.upstream);

/**
 * Drives one query: the history first, then the lookup, then the web search. `search(q)` starts
 * (or reopens) a query, `stop()` ends the web search keeping what the lookup found, `retry()`
 * repeats the part that failed, `refresh()` ignores the history and asks again.
 */
export function useContextSearch() {
  const [state, setState] = useState<ContextSearchState>(EMPTY);
  const abort = useRef<AbortController | null>(null);
  const run = useRef(0);

  useEffect(() => () => abort.current?.abort(), []);

  const searchWeb = useCallback(async (q: string, lookup: LookupResponse, id: number, controller: AbortController) => {
    setState((s) => ({ ...s, contextPhase: "loading", error: null, retryIn: null }));
    try {
      const { ai_model } = await getSettings();
      const context = await requestContext(lookup, {
        signal: controller.signal,
        model: ai_model,
        onRetry: (seconds) => run.current === id && setState((s) => ({ ...s, retryIn: seconds })),
      });
      if (run.current !== id) return;
      await saveLookup({ q, lookup, context });
      setState((s) => ({ ...s, contextPhase: "done", context, retryIn: null }));
    } catch (error) {
      if (run.current !== id) return;
      if (controller.signal.aborted) {
        setState((s) => ({ ...s, contextPhase: "stopped", retryIn: null }));
        return;
      }
      setState((s) => ({ ...s, contextPhase: "error", error: messageOf(error), retryIn: null }));
    }
  }, []);

  const start = useCallback(
    async (raw: string, { fresh = false }: { fresh?: boolean } = {}) => {
      abort.current?.abort();
      const q = cleanQuery(raw);
      const id = ++run.current;
      if (!q) {
        setState(EMPTY);
        return;
      }
      const controller = new AbortController();
      abort.current = controller;
      const saved = fresh ? undefined : await getLookup(q);
      if (run.current !== id) return;
      if (saved) {
        void touchLookup(saved.key);
        setState({ ...EMPTY, q, lookupPhase: "done", lookup: saved.lookup, contextPhase: saved.context ? "done" : "idle", context: saved.context, cached: true });
        if (!saved.context && saved.lookup.found) void searchWeb(q, saved.lookup, id, controller);
        return;
      }
      setState({ ...EMPTY, q, lookupPhase: "loading" });
      let lookup: LookupResponse;
      try {
        const { ai_model } = await getSettings();
        lookup = await requestLookup(q, {
          signal: controller.signal,
          model: ai_model,
          onRetry: (seconds) => run.current === id && setState((s) => ({ ...s, retryIn: seconds })),
        });
      } catch (error) {
        if (run.current !== id) return;
        setState((s) => ({ ...s, lookupPhase: controller.signal.aborted ? "idle" : "error", error: controller.signal.aborted ? null : messageOf(error), retryIn: null }));
        return;
      }
      if (run.current !== id) return;
      setState((s) => ({ ...s, lookupPhase: "done", lookup, retryIn: null }));
      await saveLookup({ q, lookup, context: null });
      if (lookup.found && run.current === id) await searchWeb(q, lookup, id, controller);
    },
    [searchWeb],
  );

  const search = useCallback((q: string) => void start(q), [start]);
  const refresh = useCallback(() => void start(state.q, { fresh: true }), [start, state.q]);
  const stop = useCallback(() => abort.current?.abort(), []);
  const retry = useCallback(() => {
    if (state.lookupPhase !== "done" || !state.lookup) {
      void start(state.q, { fresh: true });
      return;
    }
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const id = ++run.current;
    void searchWeb(state.q, state.lookup, id, controller);
  }, [searchWeb, start, state.lookup, state.lookupPhase, state.q]);
  const reset = useCallback(() => {
    abort.current?.abort();
    run.current++;
    setState(EMPTY);
  }, []);

  return { state, search, stop, retry, refresh, reset };
}
