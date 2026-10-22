// The word view's editor model (WordDetailBody): which part is open, its draft, the patch a save
// makes, the patch that undoes it, and whether anything changed. Pure, for tests.
import { toDrafts, type ExampleDraft } from "@/components/examples/ExampleList";
import { examplesPatch, wordExamples } from "@/lib/examples";
import type { WordPatch } from "@/lib/core/words";
import type { FieldDef, SlangLevel, Word } from "@/lib/types";
import { fieldRows, rowsToValues, sameFieldValues, type FieldRow } from "./word-fields";

export type Editing = null | "entry" | "note" | "example" | "fields";

export interface Draft {
  fr: string;
  ru: string;
  slang_level: SlangLevel;
  verlan: boolean;
  note: string;
  examples: ExampleDraft[];
  /** «Свои поля»: shared fields (empty ones too), then the word's one-off fields. */
  fields: FieldRow[];
}

export const draftOf = (w: Word, defs: readonly FieldDef[]): Draft => ({
  fr: w.fr,
  ru: w.ru,
  slang_level: w.slang_level,
  verlan: w.verlan,
  note: w.note ?? "",
  examples: toDrafts(wordExamples(w)),
  fields: fieldRows(w, defs),
});

export function patchFor(editing: Exclude<Editing, null>, draft: Draft): WordPatch {
  if (editing === "entry") return { fr: draft.fr, ru: draft.ru, slang_level: draft.slang_level, verlan: draft.verlan };
  if (editing === "note") return { note: draft.note };
  if (editing === "fields") return { custom_fields: rowsToValues(draft.fields) };
  return examplesPatch(draft.examples);
}

/** The word's current values of the fields a patch touches (to undo it). */
export function undoFor(word: Word, patch: WordPatch): WordPatch {
  const undo: Record<string, unknown> = {};
  const current = { ...word, extra_examples: word.extra_examples ?? [], custom_fields: word.custom_fields ?? [] };
  for (const key of Object.keys(patch)) undo[key] = current[key as keyof Word];
  return undo as WordPatch;
}

const norm = (v: unknown) => (Array.isArray(v) ? JSON.stringify(v) : typeof v === "string" ? v.trim() : (v ?? ""));

export function isDirty(word: Word, editing: Editing, draft: Draft | null): boolean {
  if (!editing || !draft) return false;
  const patch = patchFor(editing, draft);
  // Fields compare as a set: the editor lists them in definition order, the word keeps its own.
  if (editing === "fields") return !sameFieldValues(word.custom_fields, patch.custom_fields);
  const current = { ...word, extra_examples: word.extra_examples ?? [] };
  return Object.entries(patch).some(([k, v]) => norm(v) !== norm(current[k as keyof Word]));
}
