// The word view's editor model (WordDetailBody): which part is open, its draft, the patch a save
// makes, the patch that undoes it, and whether anything changed. Pure, for tests.
import { toDrafts, type ExampleDraft } from "@/components/examples/ExampleList";
import { examplesPatch, wordExamples } from "@/lib/examples";
import type { WordPatch } from "@/lib/core/words";
import { cleanConjugation } from "@/lib/core/conjugate";
import type { Conjugation, FieldDef, Gender, PartOfSpeech, SlangLevel, Word } from "@/lib/types";
import { fieldRows, rowsToValues, sameFieldValues, type FieldRow } from "./word-fields";

export type Editing = null | "entry" | "note" | "origin" | "example" | "fields" | "conjugation";

export interface Draft {
  fr: string;
  ru: string;
  slang_level: SlangLevel;
  verlan: boolean;
  /** Set by «Определить» only; the form shows them as a caption. */
  pos: PartOfSpeech;
  gender: Gender;
  note: string;
  /** «Происхождение»: one line (also written from the chat). */
  origin: string;
  examples: ExampleDraft[];
  /** «Свои поля»: shared fields (empty ones too), then the word's one-off fields. */
  fields: FieldRow[];
  /** «Спряжение»: the forms in the form (the word's own, or the dictionary's to start from). */
  conjugation: ConjDraft;
  /** The forms the form opened with, to tell an edit from an untouched copy of the dictionary's. */
  conjugationBase: string;
}

export const CONJ_TENSE_KEYS = ["present", "passe_compose", "imparfait", "futur"] as const;
export type ConjTenseKey = (typeof CONJ_TENSE_KEYS)[number];

export interface ConjDraft {
  auxiliary: "avoir" | "être";
  remark: string | null;
  tenses: Record<ConjTenseKey, string[]>;
}

/** The form's forms for a conjugation (six empty fields per tense without one). */
export function conjDraftOf(c: Conjugation | null | undefined): ConjDraft {
  const clean = cleanConjugation(c);
  const empty = () => ["", "", "", "", "", ""];
  return {
    auxiliary: clean?.auxiliary ?? "avoir",
    remark: clean?.remark ?? null,
    tenses: {
      present: clean ? [...clean.tenses.present] : empty(),
      passe_compose: clean ? [...clean.tenses.passe_compose] : empty(),
      imparfait: clean ? [...clean.tenses.imparfait] : empty(),
      futur: clean ? [...clean.tenses.futur] : empty(),
    },
  };
}

const conjKey = (d: ConjDraft) => JSON.stringify({ a: d.auxiliary, t: CONJ_TENSE_KEYS.map((t) => d.tenses[t].map((f) => f.replace(/\s+/g, " ").trim())) });

/** A draft whose conjugation form starts from `c` (the word's own, or the dictionary's). */
export function withConjugationDraft(draft: Draft, c: Conjugation | null | undefined): Draft {
  const conjugation = conjDraftOf(c);
  return { ...draft, conjugation, conjugationBase: conjKey(conjugation) };
}

/** «Заполните все формы» while any of the 24 is empty; null when the form can be saved. */
export function conjDraftError(d: ConjDraft): string | null {
  const missing = CONJ_TENSE_KEYS.reduce((n, t) => n + d.tenses[t].filter((f) => !f.trim()).length, 0);
  if (missing === 0) return null;
  return missing === 24 ? "Заполните формы спряжения" : `Заполните все формы — не хватает ${missing}`;
}

export const draftOf = (w: Word, defs: readonly FieldDef[]): Draft => ({
  fr: w.fr,
  ru: w.ru,
  slang_level: w.slang_level,
  verlan: w.verlan,
  pos: w.pos,
  gender: w.gender,
  note: w.note ?? "",
  origin: w.origin ?? "",
  examples: toDrafts(wordExamples(w)),
  fields: fieldRows(w, defs),
  ...(() => {
    const conjugation = conjDraftOf(w.conjugation);
    return { conjugation, conjugationBase: conjKey(conjugation) };
  })(),
});

export function patchFor(editing: Exclude<Editing, null>, draft: Draft): WordPatch {
  if (editing === "entry") return { fr: draft.fr, ru: draft.ru, slang_level: draft.slang_level, verlan: draft.verlan, pos: draft.pos, gender: draft.gender };
  if (editing === "note") return { note: draft.note };
  if (editing === "origin") return { origin: draft.origin };
  if (editing === "fields") return { custom_fields: rowsToValues(draft.fields) };
  if (editing === "conjugation") {
    const d = draft.conjugation;
    return { conjugation: { auxiliary: d.auxiliary, remark: d.remark, tenses: { ...d.tenses } } };
  }
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
  // Against what the form opened with: an untouched copy of the dictionary's forms is no change.
  if (editing === "conjugation") return conjKey(draft.conjugation) !== draft.conjugationBase;
  const current = { ...word, extra_examples: word.extra_examples ?? [] };
  return Object.entries(patch).some(([k, v]) => norm(v) !== norm(current[k as keyof Word]));
}
