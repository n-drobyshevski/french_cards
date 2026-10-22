// A word's examples as one list: the first lives in example_fr / example_ru (the review card, the
// Claude connector and older devices read those), the rest in extra_examples.
import type { Word, WordExample } from "./types";

/** At most this many examples per word. */
export const MAX_EXAMPLES = 5;
const MAX_LENGTH = 300;

const clean = (s: string | null | undefined): string => (s ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_LENGTH);

/** Trimmed, without empty French sides or repeats, capped. */
export function cleanExamples(list: readonly Partial<WordExample>[] | null | undefined): WordExample[] {
  const out: WordExample[] = [];
  const seen = new Set<string>();
  for (const e of list ?? []) {
    const fr = clean(e?.fr);
    if (!fr) continue;
    const key = fr.toLocaleLowerCase("fr");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ fr, ru: clean(e?.ru) || null });
    if (out.length === MAX_EXAMPLES) break;
  }
  return out;
}

/** Every example of the word, first one first. */
export function wordExamples(w: Pick<Word, "example_fr" | "example_ru" | "extra_examples">): WordExample[] {
  return cleanExamples([{ fr: w.example_fr ?? "", ru: w.example_ru }, ...(w.extra_examples ?? [])]);
}

/** The word fields for a list of examples (the first becomes example_fr / example_ru). */
export function examplesPatch(list: readonly Partial<WordExample>[]): Pick<Word, "example_fr" | "example_ru"> & { extra_examples: WordExample[] } {
  const [first, ...rest] = cleanExamples(list);
  return { example_fr: first?.fr ?? null, example_ru: first?.ru ?? null, extra_examples: rest };
}

// ---------------------------------------------------------------------------------------------
// «Другой пример» / «+ Ещё пример»: one more example from /api/ai/example.

export type ExampleErrorCode = "offline" | "auth" | "unavailable" | "rate_limited" | "upstream" | "none" | "aborted";

const ERROR_MESSAGES: Record<ExampleErrorCode, string> = {
  offline: "Нет сети: пример подбирается только онлайн.",
  auth: "Войдите, чтобы подбирать примеры.",
  unavailable: "Подбор примеров сейчас недоступен.",
  rate_limited: "Слишком много запросов. Попробуйте через минуту.",
  upstream: "Не получилось подобрать пример. Попробуйте ещё раз.",
  none: "Другого хорошего примера не нашлось.",
  aborted: "Отменено.",
};

export class ExampleError extends Error {
  constructor(public readonly code: ExampleErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "ExampleError";
  }
}

export interface ExampleCard {
  fr: string;
  ru: string;
  note?: string | null;
}

/** One new example for the card, different from `avoid` (the French sides it already has). */
export async function requestExample(
  card: ExampleCard,
  avoid: readonly string[],
  opts: { signal?: AbortSignal; fetchImpl?: typeof fetch; model?: "fast" | "accurate" } = {},
): Promise<WordExample> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await fetchImpl("/api/ai/example", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fr: card.fr.trim().slice(0, 120),
        ru: card.ru.trim().slice(0, 160),
        note: card.note?.trim().slice(0, 300) || null,
        avoid: avoid.map((a) => a.slice(0, 300)).slice(-6),
        ...(opts.model && { model: opts.model }),
      }),
      signal: opts.signal,
    });
  } catch {
    if (opts.signal?.aborted) throw new ExampleError("aborted");
    throw new ExampleError(typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "upstream");
  }
  if (res.ok) {
    const body = (await res.json()) as { example: WordExample | null };
    if (!body.example) throw new ExampleError("none");
    return body.example;
  }
  let error = "";
  try {
    error = ((await res.json()) as { error?: string }).error ?? "";
  } catch {
    // not JSON
  }
  if (res.status === 401) throw new ExampleError("auth");
  if (res.status === 403 || res.status === 503 || error === "not_configured") throw new ExampleError("unavailable");
  if (res.status === 429) throw new ExampleError("rate_limited");
  if (res.status === 499) throw new ExampleError("aborted");
  throw new ExampleError("upstream");
}
