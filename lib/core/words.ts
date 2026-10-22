// Pure word helpers shared by the app and the server (no Dexie): input types, text cleanup,
// building a new row with its defaults, the card directions and the auto-sort rule. lib/words.ts re-exports them.
import { cleanExamples } from "../examples";
import { cleanCustomFields } from "./custom-fields";
import { newId } from "../id";
import type { Direction, Word } from "../types";

export type WordFields = Omit<Word, "id" | "created_at" | "updated_at" | "deleted_at">;

/** fr + ru are required; everything else has a default (see `addWord`). */
export type NewWordInput = Pick<Word, "fr" | "ru"> & Partial<WordFields> & { id?: string; created_at?: string };

export type WordPatch = Partial<WordFields>;

/** Collapses whitespace and trims; empty becomes null. */
export function cleanText(s: string | null | undefined): string | null {
  const t = s?.replace(/\s+/g, " ").trim();
  return t ? t : null;
}

/** A complete new word row with every default set explicitly (the DB defaults differ, e.g. both_directions). */
export function buildWord(input: NewWordInput, now: Date): Word {
  const fr = cleanText(input.fr);
  const ru = cleanText(input.ru);
  if (!fr) throw new Error("Пустое французское слово");
  if (!ru) throw new Error("Пустой перевод");
  const iso = now.toISOString();
  const folderId = input.folder_id ?? null;
  return {
    id: input.id ?? newId(),
    fr,
    ru,
    note: cleanText(input.note),
    example_fr: cleanText(input.example_fr),
    example_ru: cleanText(input.example_ru),
    extra_examples: cleanExamples(input.extra_examples),
    custom_fields: cleanCustomFields(input.custom_fields),
    pos: input.pos ?? "other",
    gender: input.gender ?? "none",
    slang_level: input.slang_level ?? 0,
    verlan: input.verlan ?? false,
    tags: [...new Set((input.tags ?? []).map((t) => t.trim()).filter(Boolean))],
    folder_id: folderId,
    folder_source: input.folder_source ?? "auto",
    folder_confidence: folderId === null ? null : (input.folder_confidence ?? null),
    source: input.source ?? "manual",
    both_directions: input.both_directions ?? true,
    created_at: input.created_at ?? iso,
    updated_at: iso,
    deleted_at: null,
  };
}

/** Card directions a word should have: fr_ru, plus ru_fr when `both_directions`. */
export function directionsOf(word: Pick<Word, "both_directions">): Direction[] {
  return word.both_directions ? ["fr_ru", "ru_fr"] : ["fr_ru"];
}

/** True when automatic sorting may move the word: not placed by hand and not in a locked folder. */
export function isMovable(word: Pick<Word, "deleted_at" | "folder_source" | "folder_id">, lockedIds: ReadonlySet<string>): boolean {
  return word.deleted_at === null && word.folder_source !== "user" && !(word.folder_id !== null && lockedIds.has(word.folder_id));
}
