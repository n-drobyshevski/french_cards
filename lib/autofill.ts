"use client";

// «Заполнить автоматически» in the word card. The free sources first: an origin the learner's
// «Контекст» history already has for the word (device-local), and for a conjugation the
// dictionary built on the device (the button is shown only when it has none). Otherwise one cheap
// call to /api/ai/fill. The note and «Определить» (slang level, verlan, part of speech) read the
// word's suggestion from /api/ai/suggest. The answer only fills the open form; nothing is saved
// until «Сохранить».
import { AiClientError, postAiJson, type AiClientErrorCode } from "./ai-client";
import { readNdjson } from "./ai/ndjson";
import type { AiErrorBody, FillResponse, SuggestLine, Suggestion } from "./ai/schemas";
import { getLookup } from "./context";
import { cleanConjugation, cleanOrigin } from "./core/conjugate";
import { searchKey } from "./core/text";
import { normalizeLemma } from "./text";
import type { Conjugation, Gender, PartOfSpeech, SlangLevel, Word } from "./types";

export type FillErrorCode = AiClientErrorCode | "none";

const MESSAGES: Record<FillErrorCode, string> = {
  offline: "Нет сети: автозаполнение работает только онлайн",
  auth: "Войдите, чтобы заполнять автоматически",
  unavailable: "Автозаполнение сейчас недоступно",
  rate_limited: "Слишком много запросов — попробуйте через минуту",
  upstream: "Не получилось заполнить — попробуйте ещё раз",
  aborted: "Отменено",
  none: "Нечего подставить — заполните вручную",
};

export class FillError extends AiClientError {
  constructor(public readonly fillCode: FillErrorCode) {
    super(fillCode === "none" ? "upstream" : fillCode, MESSAGES[fillCode]);
    this.name = "FillError";
  }
}

type FillWord = Pick<Word, "fr" | "ru" | "pos">;
type FillOpts = { signal?: AbortSignal; fetchImpl?: typeof fetch; model?: "fast" | "accurate" };

function requestFill(field: "origin" | "conjugation", word: FillWord, opts: FillOpts): Promise<FillResponse> {
  return postAiJson<FillResponse>(
    "/api/ai/fill",
    { field, fr: word.fr.trim().slice(0, 120), ru: word.ru.trim().slice(0, 160) || null, pos: word.pos, ...(opts.model && { model: opts.model }) },
    (code) => new FillError(code),
    { signal: opts.signal, fetchImpl: opts.fetchImpl, retries: 1 },
  );
}

/** The word's origin from the «Контекст» history when the same word was looked up, else null. */
export async function originFromHistory(fr: string): Promise<string | null> {
  try {
    const entry = await getLookup(fr);
    if (!entry?.lookup.found || searchKey(entry.lookup.fr) !== searchKey(fr)) return null;
    return cleanOrigin(entry.lookup.origin);
  } catch {
    return null;
  }
}

export async function autofillOrigin(word: FillWord, opts: FillOpts = {}): Promise<string> {
  const saved = await originFromHistory(word.fr);
  if (saved) return saved;
  const res = await requestFill("origin", word, opts);
  const origin = typeof res.value === "string" ? cleanOrigin(res.value) : null;
  if (!origin) throw new FillError("none");
  return origin;
}

export async function autofillConjugation(word: FillWord, opts: FillOpts = {}): Promise<Conjugation> {
  const res = await requestFill("conjugation", word, opts);
  const conj = cleanConjugation(res.value);
  if (!conj) throw new FillError("none");
  return conj;
}

/** The suggestion for the word itself (the one whose lemma matches, else the first). */
export async function suggestionFor(fr: string, opts: FillOpts = {}): Promise<Suggestion> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await fetchImpl("/api/ai/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: fr.trim().slice(0, 80), direction: "fr", ...(opts.model && { model: opts.model }) }),
      signal: opts.signal,
    });
  } catch {
    if (opts.signal?.aborted) throw new FillError("aborted");
    throw new FillError(typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "upstream");
  }
  if (!res.ok) {
    let error = "";
    try {
      error = ((await res.json()) as AiErrorBody).error ?? "";
    } catch {
      // not JSON
    }
    if (res.status === 401) throw new FillError("auth");
    if (res.status === 403 || res.status === 503 || error === "not_configured") throw new FillError("unavailable");
    if (res.status === 429) throw new FillError("rate_limited");
    throw new FillError("upstream");
  }
  const key = normalizeLemma(fr);
  const found: Suggestion[] = [];
  for await (const line of readNdjson<SuggestLine>(res, opts.signal)) {
    if (line.type === "suggestion") {
      if (normalizeLemma(line.suggestion.fr) === key) return line.suggestion;
      found.push(line.suggestion);
    } else if (line.type === "error" && found.length === 0) {
      throw new FillError("upstream");
    }
  }
  if (!found[0]) throw new FillError("none");
  return found[0];
}

export async function autofillNote(word: Pick<Word, "fr">, opts: FillOpts = {}): Promise<string> {
  const note = (await suggestionFor(word.fr, opts)).note?.trim();
  if (!note) throw new FillError("none");
  return note;
}

/** «Определить»: what the entry form's slang level, verlan and part of speech should be. */
export interface EntryGuess {
  slang_level: SlangLevel;
  verlan: boolean;
  pos: PartOfSpeech;
  gender: Gender;
}

export async function detectEntry(word: Pick<Word, "fr">, opts: FillOpts = {}): Promise<EntryGuess> {
  const s = await suggestionFor(word.fr, opts);
  return { slang_level: s.slang_level, verlan: s.verlan, pos: s.pos, gender: s.gender };
}
