// Slang level, part of speech, an example and a theme for words the user typed (manual form,
// quick save, «Список»), and slang level + example for words already in the library
// («Дополнить карточки»), via POST /api/ai/enrich.
// The network part is small; deciding what to change is in pure functions so it is unit-tested.
import { db } from "./db";
import { ENRICH_CHUNK_MAX } from "./ai/constants";
import type { AiErrorBody, EnrichResponse, EnrichResult, FolderInput, ModelTierInput } from "./ai/schemas";
import { listFolders } from "./folders";
import { getSettings } from "./settings";
import type { Folder, Settings, Word } from "./types";
import { toFolderInputs } from "./use-suggest";
import { updateWords, type WordPatch } from "./words";

export const ENRICH_URL = "/api/ai/enrich";
// Smaller requests than the server cap, more at once: each finishes sooner and the bar moves in
// finer steps. 6 in flight stays well inside the enrich rate-limit bucket.
export const ENRICH_REQUEST_SIZE = Math.min(20, ENRICH_CHUNK_MAX);
export const ENRICH_CONCURRENCY = 6;
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
  /** Called before the first request (0 / n) and as each batch comes back, with that batch's results. */
  onStage?: (progress: EnrichProgress) => void;
  /** The learner's themes: when set, each result also carries a theme pick. */
  folders?: readonly FolderInput[];
  /** Settings «Модель для подсказок». */
  model?: ModelTierInput;
  /** Words per request (default ENRICH_REQUEST_SIZE, at most ENRICH_CHUNK_MAX). */
  requestSize?: number;
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
        body: JSON.stringify({ words, ...(opts.folders && { folders: opts.folders }), ...(opts.model && { model: opts.model }) }),
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

/**
 * Where a detection run is (MOTION-SPEC E2, A10): «Подбираем примеры · 24 / 48» counts the words
 * whose batch has come back; the determinate bar moves per batch, never backwards.
 */
export interface EnrichProgress {
  /** Words sent (the «/ 48»). */
  words: number;
  /** Words whose batch has finished. */
  wordsDone: number;
  /** Batches finished / in total. */
  done: number;
  total: number;
  /** The results of the batch that has just finished (empty for the opening 0 / n). */
  batch: readonly EnrichResult[];
}

/** 0–1 for the 1px bar: finished batches over all of them (1 when there was nothing to send). */
export function enrichFraction(p: Pick<EnrichProgress, "done" | "total">): number {
  return p.total === 0 ? 1 : Math.min(1, p.done / p.total);
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** All words in chunks, a few requests at a time. Results by word id (skipped words are missing). */
export async function enrichWords(words: readonly EnrichInput[], opts: EnrichOptions = {}): Promise<Map<string, EnrichResult>> {
  const chunks = chunk(toEnrichWords(words), Math.min(opts.requestSize ?? ENRICH_REQUEST_SIZE, ENRICH_CHUNK_MAX));
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Map<string, EnrichResult>();
  let next = 0;
  let done = 0;
  let batches = 0;
  opts.onProgress?.(0, total);
  opts.onStage?.({ words: total, wordsDone: 0, done: 0, total: chunks.length, batch: [] });
  // One failed request stops the others (and cancels those in flight): the run has failed anyway.
  const stop = new AbortController();
  const onAbort = () => stop.abort();
  opts.signal?.addEventListener("abort", onAbort, { once: true });
  if (opts.signal?.aborted) stop.abort();
  const reqOpts = { ...opts, signal: stop.signal };
  const worker = async () => {
    while (next < chunks.length) {
      if (stop.signal.aborted) throw new EnrichError("aborted");
      const part = chunks[next++];
      const batch = await postEnrich(part, reqOpts).catch((error: unknown) => {
        stop.abort();
        throw error;
      });
      for (const r of batch) out.set(r.id, r);
      done += part.length;
      batches++;
      opts.onProgress?.(done, total);
      opts.onStage?.({ words: total, wordsDone: done, done: batches, total: chunks.length, batch });
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(ENRICH_CONCURRENCY, chunks.length) }, worker));
  } finally {
    opts.signal?.removeEventListener("abort", onAbort);
  }
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
  /**
   * The detected theme may be set (only while the word is in «Входящие», only an existing theme,
   * never a low-confidence pick). Used after saving; the forms show the pick before saving instead.
   */
  folder?: boolean;
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

/** What Settings «ИИ» allow to fill in automatically. */
export interface EnrichPreferences {
  slang: boolean;
  examples: boolean;
  themes: boolean;
}

export const enrichPreferences = (s: Pick<Settings, "slang_detect_enabled" | "examples_enabled" | "auto_sort_enabled">): EnrichPreferences => ({
  slang: s.slang_detect_enabled,
  examples: s.examples_enabled,
  themes: s.auto_sort_enabled,
});

/** The settings when background detection may run now (online), otherwise null. */
export async function enrichSettings(): Promise<Settings | null> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return null;
  return getSettings();
}

/** A scope narrowed to what the settings allow. */
export function allowedScope(scope: PatchScope, prefs: EnrichPreferences): PatchScope {
  return { slang: scope.slang && prefs.slang, example: scope.example && prefs.examples, pos: scope.pos, folder: !!scope.folder && prefs.themes };
}

/** The theme to file a saved word in after the fact: an existing theme picked with some confidence. */
export function folderPatch(
  word: Pick<Word, "folder_id">,
  r: EnrichResult,
  folders: readonly Pick<Folder, "id" | "slug">[],
): WordPatch {
  if (word.folder_id !== null || !r.folder || r.confidence === "low") return {};
  const folder = folders.find((f) => f.slug === r.folder);
  return folder ? { folder_id: folder.id, folder_source: "auto", folder_confidence: r.confidence } : {};
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
  const settings = items.length > 0 ? await enrichSettings() : null;
  if (!settings) return 0;
  const prefs = enrichPreferences(settings);
  // Part of speech alone is not worth a request: only words with something the settings allow.
  const wanted = items
    .map((i) => ({ ...i, scope: allowedScope(i.scope, prefs) }))
    .filter((i) => i.scope.slang || i.scope.example || i.scope.folder);
  if (wanted.length === 0) return 0;
  const withFolders = wanted.some((i) => i.scope.folder);
  const folders = withFolders ? await listFolders() : [];
  let results: Map<string, EnrichResult>;
  try {
    results = await enrichWords(
      wanted.map(({ word }) => ({ id: word.id, fr: word.fr, ru: word.ru, note: word.note })),
      { ...opts, retries: opts.retries ?? 1, folders: withFolders ? toFolderInputs(folders) : undefined, model: settings.ai_model },
    );
  } catch {
    return 0;
  }
  const patches: { id: string; patch: WordPatch }[] = [];
  await db.transaction("r", db.words, async () => {
    const stored = await db.words.bulkGet(wanted.map(({ word }) => word.id));
    for (const [i, { word, scope }] of wanted.entries()) {
      const r = results.get(word.id);
      if (!r) continue;
      const current = stored[i];
      if (!current || current.deleted_at !== null || current.updated_at !== word.updated_at) continue;
      const patch = enrichmentPatch(current, r, scope);
      if (withFolders && scope.folder) Object.assign(patch, folderPatch(current, r, folders));
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

/** What «Дополнить карточки» proposes, from Settings «ИИ». */
export type BackfillPreferences = Pick<EnrichPreferences, "slang" | "examples">;
const ALL: BackfillPreferences = { slang: true, examples: true };

export function isEnrichCandidate(w: Word, prefs: BackfillPreferences = ALL): boolean {
  return w.deleted_at === null && ((prefs.examples && lacksExample(w)) || (prefs.slang && slangUndetected(w)));
}

/** Live words worth looking at, newest first. */
export async function loadEnrichCandidates(prefs: BackfillPreferences = ALL): Promise<Word[]> {
  const words = (await db.words.toArray()).filter((w) => isEnrichCandidate(w, prefs));
  return words.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
}

/** For the library entry row: candidates in all, and how many of them would get an example. */
export async function countEnrichCandidates(prefs: BackfillPreferences = ALL): Promise<{ total: number; noExample: number }> {
  let total = 0;
  let noExample = 0;
  for (const w of await db.words.toArray()) {
    if (!isEnrichCandidate(w, prefs)) continue;
    total++;
    if (prefs.examples && lacksExample(w)) noExample++;
  }
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
export function buildEnrichPlan(
  words: readonly Word[],
  results: ReadonlyMap<string, EnrichResult>,
  prefs: BackfillPreferences = ALL,
): EnrichPlan {
  const plan: EnrichPlan = { examples: [], slang: [] };
  for (const word of words) {
    const r = results.get(word.id);
    if (!r) continue;
    if (prefs.examples && lacksExample(word)) {
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
    if (prefs.slang && slangUndetected(word)) {
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

export interface RunEnrichPlanOptions extends Omit<EnrichOptions, "folders" | "onProgress"> {
  /** What Settings «ИИ» allow; read from Settings when omitted. */
  prefs?: BackfillPreferences;
}

export interface EnrichPlanRun {
  plan: EnrichPlan;
  /** Candidates left for a later run (over ENRICH_RUN_MAX). */
  more: number;
}

/**
 * «Дополнить карточки»: the candidates (a local read), their detection in batches (`onStage` before
 * the first request and after each batch) and the plan to review. Nothing is written.
 */
export async function runEnrichPlan(opts: RunEnrichPlanOptions = {}): Promise<EnrichPlanRun> {
  const settings = opts.prefs && opts.model ? null : await getSettings();
  const prefs = opts.prefs ?? enrichPreferences(settings!);
  const candidates = await loadEnrichCandidates(prefs);
  const batch = candidates.slice(0, ENRICH_RUN_MAX);
  const results = batch.length > 0 ? await enrichWords(batch, { ...opts, model: opts.model ?? settings?.ai_model }) : new Map<string, EnrichResult>();
  return { plan: buildEnrichPlan(batch, results, prefs), more: candidates.length - batch.length };
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
