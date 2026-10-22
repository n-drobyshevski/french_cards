// Slang level, part of speech, an example and a theme for words the user typed (manual form,
// quick save, «Список»), and slang level + example for words already in the library
// («Дополнить карточки»), via POST /api/ai/enrich. Both also fill the empty «Свои поля» whose
// definition is marked for the automatic fill (FieldDef.ai_fill: the switch, no setting of its own).
// The network part is small; deciding what to change is in pure functions so it is unit-tested.
import { AiClientError, postAiJson, type AiClientErrorCode, type AiPostOptions } from "./ai-client";
import { db } from "./db";
import {
  ENRICH_CHUNK_MAX,
  type CustomFieldInput,
  type EnrichResponse,
  type EnrichResult,
  type FolderInput,
  type ModelTierInput,
} from "./ai/schemas";
import { cleanFieldLabel, emptyAutoFields, FIELD_HINT_MAX, liveFieldDefs, listFieldDefs, MAX_FIELD_DEFS, withFieldValue } from "./custom-fields";
import { listFolders } from "./folders";
import { getSettings } from "./settings";
import type { CustomFieldValue, FieldDef, Folder, Settings, Word } from "./types";
import { toFolderInputs } from "./use-suggest";
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

export type EnrichErrorCode = AiClientErrorCode;

const ERROR_MESSAGES: Record<EnrichErrorCode, string> = {
  offline: "Нет сети. Дополнить карточки можно только онлайн.",
  auth: "Войдите, чтобы дополнять карточки.",
  unavailable: "Дополнение карточек сейчас недоступно.",
  rate_limited: "Слишком много запросов. Попробуйте через минуту.",
  upstream: "Не получилось дополнить карточки. Попробуйте ещё раз.",
  aborted: "Отменено.",
};

export class EnrichError extends AiClientError {
  constructor(code: EnrichErrorCode) {
    super(code, ERROR_MESSAGES[code]);
    this.name = "EnrichError";
  }
}

export interface EnrichOptions extends AiPostOptions {
  /** Called as chunks finish: (words done, words total). */
  onProgress?: (done: number, total: number) => void;
  /** Called before the first request (0 / n) and as each batch comes back, with that batch's results. */
  onStage?: (progress: EnrichProgress) => void;
  /** The learner's themes: when set, each result also carries a theme pick. */
  folders?: readonly FolderInput[];
  /** Settings «Модель для подсказок». */
  model?: ModelTierInput;
  /** Custom fields to fill (see autoFillFields); not sent when empty. */
  fields?: readonly CustomFieldInput[];
}

const clip = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max).trim();

/** The request's `fields`: live definitions marked for the automatic fill, in their order. */
export function autoFillFields(defs: readonly FieldDef[]): CustomFieldInput[] {
  return liveFieldDefs(defs)
    .filter((d) => d.ai_fill && cleanFieldLabel(d.name))
    .slice(0, MAX_FIELD_DEFS)
    .map((d) => ({ id: d.id, name: cleanFieldLabel(d.name), hint: d.hint ? clip(d.hint, FIELD_HINT_MAX) || null : null }));
}

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
  const body = {
    words,
    ...(opts.folders && { folders: opts.folders }),
    ...(opts.fields?.length && { fields: opts.fields }),
    ...(opts.model && { model: opts.model }),
  };
  const res = await postAiJson<EnrichResponse>(ENRICH_URL, body, (code) => new EnrichError(code), opts);
  return res.results ?? [];
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
  const chunks = chunk(toEnrichWords(words), ENRICH_CHUNK_MAX);
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Map<string, EnrichResult>();
  let next = 0;
  let done = 0;
  let batches = 0;
  opts.onProgress?.(0, total);
  opts.onStage?.({ words: total, wordsDone: 0, done: 0, total: chunks.length, batch: [] });
  const worker = async () => {
    while (next < chunks.length) {
      if (opts.signal?.aborted) throw new EnrichError("aborted");
      const part = chunks[next++];
      const batch = await postEnrich(part, opts);
      for (const r of batch) out.set(r.id, r);
      done += part.length;
      batches++;
      opts.onProgress?.(done, total);
      opts.onStage?.({ words: total, wordsDone: done, done: batches, total: chunks.length, batch });
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
  /**
   * The detected theme may be set (only while the word is in «Входящие», only an existing theme,
   * never a low-confidence pick). Used after saving; the forms show the pick before saving instead.
   */
  folder?: boolean;
}

type Enrichable = Pick<Word, "example_fr" | "slang_level" | "verlan" | "pos" | "gender" | "custom_fields">;

/**
 * The word's custom fields with the values the result filled: only for live definitions marked for
 * the automatic fill that the word has no value for (a value the user wrote is never replaced).
 * Null when nothing would be filled.
 */
export function filledCustomFields(
  word: Pick<Word, "custom_fields">,
  r: Pick<EnrichResult, "custom">,
  defs: readonly FieldDef[],
): { list: CustomFieldValue[]; filled: CustomFieldValue[] } | null {
  if (!r.custom?.length || defs.length === 0) return null;
  const empty = new Map(emptyAutoFields(word, defs).map((d) => [d.id, d]));
  let list = word.custom_fields ?? [];
  const filled: CustomFieldValue[] = [];
  for (const c of r.custom) {
    const def = empty.get(c.id);
    if (!def) continue;
    const next = withFieldValue(list, { field_id: def.id, label: def.name }, c.value);
    const entry = next.find((f) => f.field_id === def.id);
    if (!entry) continue;
    empty.delete(def.id);
    list = next;
    filled.push(entry);
  }
  return filled.length > 0 ? { list, filled } : null;
}

/**
 * The fields to write for a result; empty when nothing would change. With `defs` (the custom field
 * definitions) the empty custom fields marked for the automatic fill are filled too.
 */
export function enrichmentPatch(word: Enrichable, r: EnrichResult, scope: PatchScope, defs: readonly FieldDef[] = []): WordPatch {
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
  const custom = filledCustomFields(word, r, defs);
  if (custom) patch.custom_fields = custom.list;
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
  const defs = await listFieldDefs();
  const fields = autoFillFields(defs);
  const lacksFields = (w: Word) => fields.length > 0 && lacksAutoFields(w, defs);
  // Part of speech alone is not worth a request: only words with something the settings (or the
  // custom fields marked for the automatic fill) allow.
  const wanted = items
    .map((i) => ({ ...i, scope: allowedScope(i.scope, prefs) }))
    .filter((i) => i.scope.slang || i.scope.example || i.scope.folder || lacksFields(i.word));
  if (wanted.length === 0) return 0;
  const withFields = wanted.some((i) => lacksFields(i.word));
  const withFolders = wanted.some((i) => i.scope.folder);
  const folders = withFolders ? await listFolders() : [];
  let results: Map<string, EnrichResult>;
  try {
    results = await enrichWords(
      wanted.map(({ word }) => ({ id: word.id, fr: word.fr, ru: word.ru, note: word.note })),
      {
        ...opts,
        retries: opts.retries ?? 1,
        folders: withFolders ? toFolderInputs(folders) : undefined,
        fields: withFields ? fields : undefined,
        model: settings.ai_model,
      },
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
      const patch = enrichmentPatch(current, r, scope, defs);
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

/** A custom field marked for the automatic fill is still empty (`defs`: the definitions). */
export const lacksAutoFields = (w: Pick<Word, "custom_fields">, defs: readonly FieldDef[]) => emptyAutoFields(w, defs).length > 0;

export function isEnrichCandidate(w: Word, prefs: BackfillPreferences = ALL, defs: readonly FieldDef[] = []): boolean {
  return (
    w.deleted_at === null &&
    ((prefs.examples && lacksExample(w)) || (prefs.slang && slangUndetected(w)) || lacksAutoFields(w, defs))
  );
}

/** Live words worth looking at, newest first. `defs` are read when not given. */
export async function loadEnrichCandidates(prefs: BackfillPreferences = ALL, defs?: readonly FieldDef[]): Promise<Word[]> {
  const fieldDefs = defs ?? (await listFieldDefs());
  const words = await db.words.filter((w) => isEnrichCandidate(w, prefs, fieldDefs)).toArray();
  return words.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
}

/** For the library entry row: candidates in all, how many would get an example, and how many have empty custom fields to fill. */
export async function countEnrichCandidates(
  prefs: BackfillPreferences = ALL,
): Promise<{ total: number; noExample: number; noFields: number }> {
  const defs = await listFieldDefs();
  let total = 0;
  let noExample = 0;
  let noFields = 0;
  await db.words.each((w) => {
    if (!isEnrichCandidate(w, prefs, defs)) return;
    total++;
    if (prefs.examples && lacksExample(w)) noExample++;
    if (lacksAutoFields(w, defs)) noFields++;
  });
  return { total, noExample, noFields };
}

export type EnrichField = "example" | "slang" | "fields";

export interface EnrichChange {
  key: string;
  field: EnrichField;
  word: Word;
  result: EnrichResult;
  patch: WordPatch;
  undo: WordPatch;
  /** «Свои поля» only: the values filled (with the definitions' names), for the plan to show. */
  filled?: CustomFieldValue[];
}

export interface EnrichPlan {
  examples: EnrichChange[];
  slang: EnrichChange[];
  /** Empty custom fields filled (definitions marked for the automatic fill). */
  fields: EnrichChange[];
}

/**
 * Proposed changes: an example for words without one, a level for words whose level was never
 * detected, and the empty custom fields marked for the automatic fill (`defs`).
 */
export function buildEnrichPlan(
  words: readonly Word[],
  results: ReadonlyMap<string, EnrichResult>,
  prefs: BackfillPreferences = ALL,
  defs: readonly FieldDef[] = [],
): EnrichPlan {
  const plan: EnrichPlan = { examples: [], slang: [], fields: [] };
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
    const custom = filledCustomFields(word, r, defs);
    if (custom) {
      plan.fields.push({
        key: `fields:${word.id}`,
        field: "fields",
        word,
        result: r,
        patch: { custom_fields: custom.list },
        undo: { custom_fields: word.custom_fields ?? [] },
        filled: custom.filled,
      });
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
  const defs = await listFieldDefs();
  const candidates = await loadEnrichCandidates(prefs, defs);
  const batch = candidates.slice(0, ENRICH_RUN_MAX);
  const fields = batch.some((w) => lacksAutoFields(w, defs)) ? autoFillFields(defs) : [];
  const results =
    batch.length > 0
      ? await enrichWords(batch, { ...opts, fields, model: opts.model ?? settings?.ai_model })
      : new Map<string, EnrichResult>();
  return { plan: buildEnrichPlan(batch, results, prefs, defs), more: candidates.length - batch.length };
}

export const planChanges = (plan: EnrichPlan) => [...plan.examples, ...plan.slang, ...plan.fields];

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
