// «Варианты» in the add sheet: debounced, abortable calls to POST /api/ai/suggest (NDJSON).
// While the next request loads, earlier results that still match the new query stay on screen;
// when every result of a finished request still matches a longer query, no request is made.
// The logic lives in pure functions and a small store (SuggestController) so it is testable
// without React; `useSuggest` binds the store to a component.
import { useEffect, useState, useSyncExternalStore } from "react";
import { readNdjson } from "./ai/ndjson";
import { dedupeKey, detectDirection } from "./ai/normalize";
import { SUGGEST_MAX, type FolderInput, type ModelTierInput, type SuggestLine, type SuggestRegister, type Suggestion } from "./ai/schemas";
import { foldKey } from "./lexique";
import type { Folder } from "./types";

export const SUGGEST_URL = "/api/ai/suggest";
export const SUGGEST_DEBOUNCE_MS = 300;
export const SUGGEST_MIN_CHARS = 3;
/** The route rejects longer queries. */
export const SUGGEST_MAX_QUERY = 80;
/** The route accepts at most this many folders. */
export const SUGGEST_MAX_FOLDERS = 60;
const CACHE_SIZE = 24;

export type SuggestDirection = "fr" | "ru";

/** Settings «ИИ» that shape «Варианты». */
export interface SuggestPreferences {
  model: ModelTierInput;
  /** 1–3. */
  max: number;
  register: SuggestRegister;
  notes: boolean;
}

export const DEFAULT_SUGGEST_PREFERENCES: SuggestPreferences = { model: "fast", max: SUGGEST_MAX, register: "any", notes: true };
/** idle: nothing to ask (short query or switched off). loading: debouncing or streaming. */
export type SuggestStatus = "idle" | "loading" | "done" | "error";
/**
 * offline: no network. unavailable: the route refused (signed out, not configured).
 * rate_limited: 429. failed: server or model error, or the stream broke off.
 */
export type SuggestErrorKind = "offline" | "unavailable" | "rate_limited" | "failed";

export interface SuggestSnapshot {
  /** Normalized query the results belong to. */
  query: string;
  /** "ru" when the query is Cyrillic: the user typed Russian and gets French suggestions. */
  direction: SuggestDirection;
  results: readonly Suggestion[];
  status: SuggestStatus;
  error: SuggestErrorKind | null;
  /**
   * The debounce is over and a request is in flight (status "loading"). The UI waits on this,
   * not on `status`, for its delayed indicator (MOTION-SPEC §3.1: 150 ms after the debounce).
   */
  requesting: boolean;
}

/** The last response received, which later queries are narrowed from. */
export interface SuggestBasis {
  query: string;
  direction: SuggestDirection;
  results: readonly Suggestion[];
  /** The stream ended with `done` (not cut off by an error). */
  complete: boolean;
}

export interface SuggestPlan {
  /** Earlier results that still match, shown at once. */
  results: Suggestion[];
  /** Whether a request is needed for the new query. */
  fetch: boolean;
}

// ---------------------------------------------------------------------------------------
// Pure helpers

/** Collapses whitespace, trims, and cuts to the length the route accepts. */
export function normalizeQuery(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, SUGGEST_MAX_QUERY).trim();
}

/** A suggestion still fits the query: its French (or Russian, for Russian input) contains it, ignoring case and accents. */
export function suggestionMatches(suggestion: Pick<Suggestion, "fr" | "ru">, query: string, direction: SuggestDirection): boolean {
  const q = foldKey(query);
  if (!q) return true;
  return foldKey(direction === "ru" ? suggestion.ru : suggestion.fr).includes(q);
}

export function narrowSuggestions(results: readonly Suggestion[], query: string, direction: SuggestDirection): Suggestion[] {
  return results.filter((s) => suggestionMatches(s, query, direction));
}

/**
 * What to do when the query changes, given the last response.
 * - Different input language, or nothing yet: start over.
 * - Otherwise keep the results that still match.
 * - Skip the request only when the last response was complete and non-empty, the new query
 *   extends it, and every one of its results still matches (the longer query only narrows).
 */
export function planSuggest(basis: SuggestBasis | null, query: string): SuggestPlan {
  const direction = detectDirection(query);
  if (!basis || basis.direction !== direction) return { results: [], fetch: true };
  const results = narrowSuggestions(basis.results, query, direction);
  const refines = foldKey(query).startsWith(foldKey(basis.query));
  const covered = basis.complete && refines && results.length > 0 && results.length === basis.results.length;
  return { results, fetch: !covered };
}

/** While a response streams: fresh rows first, then kept rows it has not repeated, up to SUGGEST_MAX. */
export function mergeStreaming(fresh: readonly Suggestion[], kept: readonly Suggestion[], max = SUGGEST_MAX): Suggestion[] {
  const seen = new Set(fresh.map((s) => dedupeKey(s.fr)));
  return [...fresh, ...kept.filter((s) => !seen.has(dedupeKey(s.fr)))].slice(0, max);
}

export function errorKindForStatus(status: number): SuggestErrorKind {
  if (status === 429) return "rate_limited";
  if (status === 401 || status === 403 || status === 503) return "unavailable";
  return "failed";
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;

/** Folders in the shape the route accepts (valid unique slugs, ≤60, trimmed text). */
export function toFolderInputs(folders: readonly Pick<Folder, "slug" | "name" | "description">[]): FolderInput[] {
  const seen = new Set<string>();
  const out: FolderInput[] = [];
  for (const f of folders) {
    const name = f.name.replace(/\s+/g, " ").trim().slice(0, 60);
    if (!name || !SLUG_RE.test(f.slug) || seen.has(f.slug)) continue;
    seen.add(f.slug);
    out.push({ slug: f.slug, name, description: f.description?.trim().slice(0, 300) || null });
    if (out.length >= SUGGEST_MAX_FOLDERS) break;
  }
  return out;
}

const cacheKey = (query: string) => query.toLocaleLowerCase("fr");

// ---------------------------------------------------------------------------------------
// Store

export interface SuggestControllerOptions {
  fetch?: typeof fetch;
  url?: string;
  debounceMs?: number;
  minChars?: number;
  isOnline?: () => boolean;
}

export interface SetQueryOptions {
  /** Request now instead of after the debounce. */
  immediate?: boolean;
  /** Request now even if the query is unchanged, cached or covered by earlier results. */
  force?: boolean;
}

class HttpError extends Error {
  constructor(readonly kind: SuggestErrorKind) {
    super(kind);
  }
}

const IDLE: SuggestSnapshot = { query: "", direction: "fr", results: [], status: "idle", error: null, requesting: false };

const defaultOnline = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);

export class SuggestController {
  private snapshot: SuggestSnapshot = IDLE;
  private readonly listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inflight: AbortController | null = null;
  private basis: SuggestBasis | null = null;
  private readonly cache = new Map<string, readonly Suggestion[]>();
  private folders: FolderInput[] = [];
  private preferences: SuggestPreferences = DEFAULT_SUGGEST_PREFERENCES;
  private enabled = true;
  private readonly fetchImpl: typeof fetch;
  private readonly url: string;
  private readonly debounceMs: number;
  private readonly minChars: number;
  private readonly isOnline: () => boolean;

  constructor(opts: SuggestControllerOptions = {}) {
    this.fetchImpl = opts.fetch ?? ((...args) => fetch(...args));
    this.url = opts.url ?? SUGGEST_URL;
    this.debounceMs = opts.debounceMs ?? SUGGEST_DEBOUNCE_MS;
    this.minChars = opts.minChars ?? SUGGEST_MIN_CHARS;
    this.isOnline = opts.isOnline ?? defaultOnline;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): SuggestSnapshot => this.snapshot;

  setFolders = (folders: FolderInput[]): void => {
    this.folders = folders;
  };

  /** New preferences make earlier answers stale: forget them and ask again for the current query. */
  setPreferences = (preferences: SuggestPreferences): void => {
    const p = this.preferences;
    if (p.model === preferences.model && p.max === preferences.max && p.register === preferences.register && p.notes === preferences.notes) return;
    this.preferences = preferences;
    this.cache.clear();
    this.basis = null;
    if (this.snapshot.query) this.setQuery(this.snapshot.query, { force: true });
  };

  setEnabled = (enabled: boolean): void => {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.setQuery(this.snapshot.query, { force: true });
  };

  /** Call on every keystroke. Aborts the previous request and debounces the next one. */
  setQuery = (raw: string, opts: SetQueryOptions = {}): void => {
    const query = normalizeQuery(raw);
    const current = this.snapshot;
    if (!opts.force && !opts.immediate && query === current.query && current.status !== "error") return;
    this.abortPending();
    const direction = detectDirection(query);

    if (!this.enabled || query.length < this.minChars) {
      this.set({ query, direction, results: [], status: "idle", error: null, requesting: false });
      return;
    }

    const cached = opts.force ? undefined : this.cache.get(cacheKey(query));
    if (cached) {
      this.basis = { query, direction, results: cached, complete: true };
      this.set({ query, direction, results: cached, status: "done", error: null, requesting: false });
      return;
    }

    const plan = planSuggest(this.basis, query);
    if (!plan.fetch && !opts.force) {
      this.set({ query, direction, results: plan.results, status: "done", error: null, requesting: false });
      return;
    }
    if (!this.isOnline()) {
      this.set({ query, direction, results: plan.results, status: "error", error: "offline", requesting: false });
      return;
    }

    this.set({ query, direction, results: plan.results, status: "loading", error: null, requesting: false });
    if (opts.immediate || opts.force) {
      void this.run(query, direction, plan.results);
    } else {
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.run(query, direction, plan.results);
      }, this.debounceMs);
    }
  };

  /** Requests the current query again (after an error or when the network comes back). */
  retry = (): void => {
    if (this.snapshot.status !== "error") return;
    this.setQuery(this.snapshot.query, { force: true });
  };

  /** Fires a pending debounced request right away. */
  flush = (): void => {
    if (!this.timer) return;
    this.setQuery(this.snapshot.query, { immediate: true });
  };

  /** Stops the pending timer and the request in flight. */
  cancel = (): void => {
    this.abortPending();
    if (this.snapshot.status === "loading") this.set({ ...this.snapshot, status: "idle", requesting: false });
  };

  private abortPending(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.inflight?.abort();
    this.inflight = null;
  }

  private set(next: SuggestSnapshot): void {
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }

  private remember(query: string, results: readonly Suggestion[]): void {
    const key = cacheKey(query);
    this.cache.delete(key);
    this.cache.set(key, results);
    if (this.cache.size > CACHE_SIZE) this.cache.delete(this.cache.keys().next().value as string);
  }

  private async run(query: string, direction: SuggestDirection, kept: readonly Suggestion[]): Promise<void> {
    const controller = new AbortController();
    this.inflight = controller;
    const { signal } = controller;
    const fresh: Suggestion[] = [];
    const { max } = this.preferences;
    let ended: "done" | "error" | null = null;
    let errorKind: SuggestErrorKind = "failed";
    this.set({ ...this.snapshot, requesting: true });

    try {
      const res = await this.fetchImpl(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: query, direction: "auto", folders: this.folders, ...this.preferences }),
        signal,
      });
      if (!res.ok) {
        res.body?.cancel().catch(() => {});
        throw new HttpError(errorKindForStatus(res.status));
      }
      for await (const line of readNdjson<SuggestLine>(res, signal)) {
        if (signal.aborted) return;
        if (line.type === "suggestion") {
          if (fresh.length >= max) continue;
          fresh.push(line.suggestion);
          this.set({ query, direction, results: mergeStreaming(fresh, kept, max), status: "loading", error: null, requesting: true });
        } else if (line.type === "done" || line.type === "error") {
          ended = line.type;
          break;
        }
      }
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof HttpError) errorKind = error.kind;
      else if (error instanceof TypeError || !this.isOnline()) errorKind = "offline";
    } finally {
      if (this.inflight === controller) this.inflight = null;
    }
    if (signal.aborted) return;

    if (ended === "done") {
      this.basis = { query, direction, results: fresh, complete: true };
      this.remember(query, fresh);
      this.set({ query, direction, results: fresh, status: "done", error: null, requesting: false });
      return;
    }
    // An error line, an HTTP error, or a stream that broke off: keep whatever arrived.
    if (fresh.length > 0) this.basis = { query, direction, results: fresh, complete: false };
    this.set({ query, direction, results: fresh.length > 0 ? fresh : [...kept], status: "error", error: errorKind, requesting: false });
  }
}

// ---------------------------------------------------------------------------------------
// Hook

export interface UseSuggestOptions {
  /** Folders sent with each request (see `toFolderInputs`). */
  folders: FolderInput[];
  /** settings.suggestions_enabled; when false nothing is requested. */
  enabled: boolean;
  /** From Settings «ИИ»; defaults when not loaded yet. */
  preferences?: SuggestPreferences;
}

export interface SuggestApi extends SuggestSnapshot {
  /** Settings «Вариантов» (1–3): how many row slots «Варианты» reserves. */
  max: number;
  setQuery: SuggestController["setQuery"];
  retry: () => void;
  flush: () => void;
  cancel: () => void;
}

/** Binds a SuggestController to the component. Retries automatically when the network comes back. */
export function useSuggest({ folders, enabled, preferences = DEFAULT_SUGGEST_PREFERENCES }: UseSuggestOptions): SuggestApi {
  const [controller] = useState(() => new SuggestController());
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);

  useEffect(() => controller.setFolders(folders), [controller, folders]);
  useEffect(() => controller.setEnabled(enabled), [controller, enabled]);
  useEffect(() => controller.setPreferences(preferences), [controller, preferences]);
  useEffect(() => {
    const online = () => controller.retry();
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("online", online);
      controller.cancel();
    };
  }, [controller]);

  return { ...snapshot, max: preferences.max, setQuery: controller.setQuery, retry: controller.retry, flush: controller.flush, cancel: controller.cancel };
}
