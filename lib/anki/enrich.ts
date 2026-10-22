// Cards for the notes of an imported Anki deck, via POST /api/ai/anki: the notes go in chunks of
// ANKI_CHUNK_MAX, a few requests at a time; the items come back in note order. Errors are
// AnkiEnrichError (an AiClientError) with a message ready to show.
import { AiClientError, postAiJson, type AiClientErrorCode, type AiPostOptions } from "@/lib/ai-client";
import type { AnkiRequestNote, AnkiResponse, FolderInput, ModelTierInput } from "@/lib/ai/schemas";
import { ANKI_CHUNK_MAX, ANKI_FIELD_CHARS, ANKI_FIELDS_MAX, ANKI_TAGS_MAX, type AnkiItem, type AnkiNote } from "./types";

export const ANKI_URL = "/api/ai/anki";
export const ANKI_CONCURRENCY = 3;
/** Longest note id the route accepts as a ref. */
const REF_MAX = 40;
const NAME_MAX = 60;
const TAG_MAX = 60;

const ERROR_MESSAGES: Record<AiClientErrorCode, string> = {
  offline: "Нет сети. Импорт из Anki работает только онлайн.",
  auth: "Войдите, чтобы импортировать колоду.",
  unavailable: "Разбор карточек сейчас недоступен.",
  rate_limited: "Слишком много запросов. Попробуйте через минуту.",
  upstream: "Не получилось разобрать карточки. Попробуйте ещё раз.",
  aborted: "Отменено.",
};

export class AnkiEnrichError extends AiClientError {
  constructor(code: AiClientErrorCode) {
    super(code, ERROR_MESSAGES[code]);
    this.name = "AnkiEnrichError";
  }
}

export interface AnkiEnrichOptions extends AiPostOptions {
  /** The learner's themes, for a theme pick per card. */
  folders: readonly FolderInput[];
  /** Settings «Модель для подсказок». */
  model: ModelTierInput;
  /** Called before the first request (0 / n) and as each chunk comes back: (notes done, notes total). */
  onProgress?: (done: number, total: number) => void;
}

const clip = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max).trim();

/** The request shape of a note, cut to the route's limits; null when it has nothing to send. */
export function toAnkiRequestNote(note: AnkiNote): AnkiRequestNote | null {
  if (!note.id || note.id.length > REF_MAX) return null;
  const fields = note.fields
    .map((f, i) => ({ name: clip(f.name, NAME_MAX) || `Поле ${i + 1}`, text: clip(f.text, ANKI_FIELD_CHARS) }))
    .filter((f) => f.text)
    .slice(0, ANKI_FIELDS_MAX);
  if (fields.length === 0) return null;
  const tags = [...new Set(note.tags.map((t) => clip(t, TAG_MAX)).filter(Boolean))].slice(0, ANKI_TAGS_MAX);
  return { ref: note.id, fields, tags };
}

/** One request (≤ ANKI_CHUNK_MAX notes). */
export async function postAnki(notes: readonly AnkiRequestNote[], opts: AnkiEnrichOptions): Promise<AnkiItem[]> {
  const body = { notes, folders: opts.folders, model: opts.model };
  const res = await postAiJson<AnkiResponse>(ANKI_URL, body, (code) => new AnkiEnrichError(code), opts);
  return res.items ?? [];
}

/**
 * Items for every note that could be sent, in input order. Notes without fields, repeated ids and
 * notes the model left out have no item. The first failed chunk rejects the whole run.
 */
export async function enrichAnkiNotes(notes: readonly AnkiNote[], opts: AnkiEnrichOptions): Promise<AnkiItem[]> {
  const order = new Map<string, number>();
  const sendable: AnkiRequestNote[] = [];
  for (const note of notes) {
    const request = toAnkiRequestNote(note);
    if (!request || order.has(request.ref)) continue;
    order.set(request.ref, order.size);
    sendable.push(request);
  }
  const chunks: AnkiRequestNote[][] = [];
  for (let i = 0; i < sendable.length; i += ANKI_CHUNK_MAX) chunks.push(sendable.slice(i, i + ANKI_CHUNK_MAX));

  const total = sendable.length;
  const byRef = new Map<string, AnkiItem>();
  let next = 0;
  let done = 0;
  let failed = false;
  opts.onProgress?.(0, total);
  const worker = async () => {
    while (next < chunks.length && !failed) {
      if (opts.signal?.aborted) throw new AnkiEnrichError("aborted");
      const part = chunks[next++];
      let items: AnkiItem[];
      try {
        items = await postAnki(part, opts);
      } catch (error) {
        failed = true;
        throw error;
      }
      const sent = new Set(part.map((n) => n.ref));
      for (const item of items) if (sent.has(item.ref) && !byRef.has(item.ref)) byRef.set(item.ref, item);
      done += part.length;
      opts.onProgress?.(done, total);
    }
  };
  await Promise.all(Array.from({ length: Math.min(ANKI_CONCURRENCY, chunks.length) }, worker));
  return [...byRef.values()].sort((a, b) => (order.get(a.ref) ?? 0) - (order.get(b.ref) ?? 0));
}
