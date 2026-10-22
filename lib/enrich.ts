// Slang level, part of speech and an example for words the user typed (manual form, quick save,
// «Список») and for words already in the library («Дополнить карточки»), via POST /api/ai/enrich.
// The network part is small; deciding what to change is in pure functions so it is unit-tested.
import { db } from "./db";
import { ENRICH_CHUNK_MAX, type AiErrorBody, type EnrichResponse, type EnrichResult } from "./ai/schemas";
import { getSettings } from "./settings";
import type { Word } from "./types";
import { updateWords, type WordPatch } from "./words";

export const ENRICH_URL = "/api/ai/enrich";
export const ENRICH_CONCURRENCY = 3;
/** Words looked at per «Дополнить карточки» run. */
export const ENRICH_RUN_MAX = 300;

export interface EnrichInput {
  id: string;
  fr: string;
  ru: string;
  note?: string | null;
}

export type EnrichErrorCode = "offline" | "auth" | "unavailable" | "rate_limited" | "upstream" | "aborted";

const ERROR_MESSAGES: Record<EnrichErrorCode, string> = {
  offline: "Нет сети. Дополнить карточки можно только онлайн.",
  auth: "Войдите, чтобы дополнять карточки.",
  unavailable: "Дополнение карточек сейчас недоступно.",
  rate_limited: "Слишком много запросов. Попробуйте через минуту.",
  upstream: "Не получилось дополнить карточки. Попробуйте ещё раз.",
  aborted: "Отменено.",
};

export class EnrichError extends Error {
  constructor(public readonly code: EnrichErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "EnrichError";
  }
}

export interface EnrichOptions {
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  /** Retries after a 429, waiting for Retry-After (capped). */
  retries?: number;
  /** Injected for tests. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Called as chunks finish: (words done, words total). */
  onProgress?: (done: number, total: number) => void;
}

const defaultSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new EnrichError("aborted"));
      },
      { once: true },
    );
  });

const clip = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max).trim();

/** The request body the route accepts: trimmed, cut to its limits, words without both sides dropped. */
export function toEnrichWords(words: readonly EnrichInput[]): EnrichInput[] {
  const seen = new Set<string>();
  const out: EnrichInput[] = [];
  for (const w of words) {
    const fr = clip(w.fr, 120);
    const ru = clip(w.ru, 160);
    if (!fr || !ru || !w.id || seen.has(w.id)) continue;
    seen.add(w.id);
    out.push({ id: w.id, fr, ru, note: w.note ? clip(w.note, 300) || null : null });
  }
  return out;
}

/** One request (≤ ENRICH_CHUNK_MAX words). */
export async function postEnrich(words: readonly EnrichInput[], opts: EnrichOptions = {}): Promise<EnrichResult[]> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  let retries = opts.retries ?? 3;
  for (;;) {
    if (opts.signal?.aborted) throw new EnrichError("aborted");
    let res: Response;
    try {
      res = await fetchImpl(ENRICH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ words }),
        signal: opts.signal,
      });
    } catch {
      if (opts.signal?.aborted) throw new EnrichError("aborted");
      throw new EnrichError(typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "upstream");
    }
    if (res.ok) return ((await res.json()) as EnrichResponse).results ?? [];
    if (res.status === 429 && retries > 0) {
      retries--;
      const after = Number(res.headers.get("Retry-After"));
      await sleep(Math.min(20, Number.isFinite(after) && after > 0 ? after : 3) * 1000, opts.signal);
      continue;
    }
    let error = "";
    try {
      error = ((await res.json()) as AiErrorBody).error ?? "";
    } catch {
      // not JSON
    }
    if (res.status === 401) throw new EnrichError("auth");
    if (res.status === 403 || res.status === 503 || error === "not_configured") throw new EnrichError("unavailable");
    if (res.status === 429) throw new EnrichError("rate_limited");
    if (res.status === 499) throw new EnrichError("aborted");
    throw new EnrichError("upstream");
  }
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** All words in chunks, a few requests at a time. Results by word id (skipped words are missing). */
export async function enrichWords(words: readonly EnrichInput[], opts: EnrichOptions = {}): Promise<Map<string, EnrichResult>> {
  const chunks = chunk(toEnrichWords(words), ENRICH_CHUNK_MAX);
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Map<string, EnrichResult>();
  let next = 0;
  let done = 0;
  opts.onProgress?.(0, total);
  const worker = async () => {
    while (next < chunks.length) {
      if (opts.signal?.aborted) throw new EnrichError("aborted");
      const part = chunks[next++];
      for (const r of await postEnrich(part, opts)) out.set(r.id, r);
      done += part.length;
      opts.onProgress?.(done, total);
    }
  };
  await Promise.all(Array.from({ length: Math.min(ENRICH_CONCURRENCY, chunks.length) }, worker));
  return out;
}

// ---------------------------------------------------------------------------------------------
// What to change

export interface PatchScope {
  /** Slang level and verlan may be set. */
  slang: boolean;
  /** An example may be added (only ever when the word has none). */
  example: boolean;
  /** Part of speech and gender may be set (only while still "other"). */
  pos: boolean;
}

type Enrichable = Pick<Word, "example_fr" | "slang_level" | "verlan" | "pos" | "gender">;

/** The fields to write for a result; empty when nothing would change. */
export function enrichmentPatch(word: Enrichable, r: EnrichResult, scope: PatchScope): WordPatch {
  const patch: WordPatch = {};
  if (scope.slang && (r.slang_level !== word.slang_level || r.verlan !== word.verlan)) {
    patch.slang_level = r.slang_level;
    patch.verlan = r.verlan;
  }
  if (scope.example && !word.example_fr?.trim() && r.example_fr) {
    patch.example_fr = r.example_fr;
    patch.example_ru = r.example_ru;
  }
  if (scope.pos && word.pos === "other" && r.pos !== "other") {
    patch.pos = r.pos;
    patch.gender = r.gender;
  }
  return patch;
}

/** Whether background detection may run now (setting on, online). */
export async function canEnrichNow(): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  return (await getSettings()).suggestions_enabled;
}

export interface SavedWordFill {
  /** The word as saved; it is only patched if it is still unchanged (not edited or undone). */
  word: Word;
  scope: PatchScope;
}

/**
 * After a save that did not wait for detection (quick save, «Список», a form saved early):
 * detects the missing fields and writes them. Silent: returns the number of words patched.
 */
export async function fillSavedWords(items: readonly SavedWordFill[], opts: Omit<EnrichOptions, "onProgress"> = {}): Promise<number> {
  const wanted = items.filter((i) => i.scope.slang || i.scope.example || i.scope.pos);
  if (wanted.length === 0 || !(await canEnrichNow())) return 0;
  let results: Map<string, EnrichResult>;
  try {
    results = await enrichWords(
      wanted.map(({ word }) => ({ id: word.id, fr: word.fr, ru: word.ru, note: word.note })),
      { ...opts, retries: opts.retries ?? 1 },
    );
  } catch {
    return 0;
  }
  const patches: { id: string; patch: WordPatch }[] = [];
  await db.transaction("r", db.words, async () => {
    for (const { word, scope } of wanted) {
      const r = results.get(word.id);
      if (!r) continue;
      const current = await db.words.get(word.id);
      if (!current || current.deleted_at !== null || current.updated_at !== word.updated_at) continue;
      const patch = enrichmentPatch(current, r, scope);
      if (Object.keys(patch).length > 0) patches.push({ id: word.id, patch });
    }
  });
  if (patches.length === 0) return 0;
  return (await updateWords(patches)).length;
}

// ---------------------------------------------------------------------------------------------
// «Дополнить карточки»

/** Typed by hand and never detected: the slang level is still the default. */
export const slangUndetected = (w: Pick<Word, "source" | "slang_level" | "verlan">) =>
  (w.source === "manual" || w.source === "import") && w.slang_level === 0 && !w.verlan;

export const lacksExample = (w: Pick<Word, "example_fr">) => !w.example_fr?.trim();

export function isEnrichCandidate(w: Word): boolean {
  return w.deleted_at === null && (lacksExample(w) || slangUndetected(w));
}

/** Live words worth looking at, newest first. */
export async function loadEnrichCandidates(): Promise<Word[]> {
  const words = await db.words.filter(isEnrichCandidate).toArray();
  return words.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
}

/** For the library entry row: candidates in all, and how many of them have no example. */
export async function countEnrichCandidates(): Promise<{ total: number; noExample: number }> {
  let total = 0;
  let noExample = 0;
  await db.words.each((w) => {
    if (!isEnrichCandidate(w)) return;
    total++;
    if (lacksExample(w)) noExample++;
  });
  return { total, noExample };
}

export type EnrichField = "example" | "slang";

export interface EnrichChange {
  key: string;
  field: EnrichField;
  word: Word;
  result: EnrichResult;
  patch: WordPatch;
  undo: WordPatch;
}

export interface EnrichPlan {
  examples: EnrichChange[];
  slang: EnrichChange[];
}

/** Proposed changes: an example for words without one, a level for words whose level was never detected. */
export function buildEnrichPlan(words: readonly Word[], results: ReadonlyMap<string, EnrichResult>): EnrichPlan {
  const plan: EnrichPlan = { examples: [], slang: [] };
  for (const word of words) {
    const r = results.get(word.id);
    if (!r) continue;
    if (lacksExample(word)) {
      const patch = enrichmentPatch(word, r, { slang: false, example: true, pos: false });
      if (patch.example_fr) {
        plan.examples.push({
          key: `example:${word.id}`,
          field: "example",
          word,
          result: r,
          patch,
          undo: { example_fr: word.example_fr, example_ru: word.example_ru },
        });
      }
    }
    if (slangUndetected(word)) {
      const patch = enrichmentPatch(word, r, { slang: true, example: false, pos: true });
      if (patch.slang_level !== undefined) {
        const undo: WordPatch = { slang_level: word.slang_level, verlan: word.verlan };
        if (patch.pos) Object.assign(undo, { pos: word.pos, gender: word.gender });
        plan.slang.push({ key: `slang:${word.id}`, field: "slang", word, result: r, patch, undo });
      }
    }
  }
  return plan;
}

export const planChanges = (plan: EnrichPlan) => [...plan.examples, ...plan.slang];

/** Merges the picked changes per word, in the order given. */
export function mergeChanges(changes: readonly EnrichChange[]): { apply: { id: string; patch: WordPatch }[]; undo: { id: string; patch: WordPatch }[] } {
  const apply = new Map<string, WordPatch>();
  const undo = new Map<string, WordPatch>();
  for (const c of changes) {
    apply.set(c.word.id, { ...apply.get(c.word.id), ...c.patch });
    undo.set(c.word.id, { ...undo.get(c.word.id), ...c.undo });
  }
  return {
    apply: [...apply].map(([id, patch]) => ({ id, patch })),
    undo: [...undo].map(([id, patch]) => ({ id, patch })),
  };
}

/** Writes the picked changes; returns the patches that undo them (for the words actually written). */
export async function applyEnrichChanges(changes: readonly EnrichChange[], now: Date = new Date()): Promise<{ id: string; patch: WordPatch }[]> {
  const { apply, undo } = mergeChanges(changes);
  const written = new Set((await updateWords(apply, now)).map((w) => w.id));
  return undo.filter((u) => written.has(u.id));
}
