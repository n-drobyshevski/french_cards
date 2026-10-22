"use client";

// «Заполнить автоматически» in the word card. The free sources first: an origin the learner's
// «Контекст» history already has for the word (device-local), and for a conjugation the
// dictionary built on the device (the button is shown only when it has none). Otherwise one cheap
// call to /api/ai/fill. The answer only fills the open form; nothing is saved until «Сохранить».
import { AiClientError, postAiJson, type AiClientErrorCode } from "./ai-client";
import type { FillResponse } from "./ai/schemas";
import { getLookup } from "./context";
import { cleanConjugation, cleanOrigin } from "./core/conjugate";
import { searchKey } from "./core/text";
import type { Conjugation, Word } from "./types";

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
