// Post-processing for /api/ai/anki. The model sees short refs (n1, n2…) instead of Anki note ids;
// this maps them back, normalizes each row like a screenshot row, keeps theme picks inside the
// learner's slugs and keeps one item per note, in note order. Notes the model left out get no item.
// Field names the model gives (fr_field, used_fields) are matched to the note's own, ignoring case.
import type { AnkiItem } from "@/lib/anki/types";
import { fieldRefMap, finalizeCustom } from "./enrich";
import { cleanText, normalizeVocabItem, type FolderRef } from "./normalize";
import { FOLDER_INBOX, type AnkiModel, type AnkiRequestNote, type VocabItemModel } from "./schemas";

export const ankiRefFor = (index: number) => `n${index + 1}`;

/** Short ref → the note it stands for. */
export function ankiRefMap<T extends Pick<AnkiRequestNote, "ref" | "fields">>(notes: readonly T[]): Map<string, T> {
  return new Map(notes.map((n, i) => [ankiRefFor(i), n]));
}

/** The field name as the note has it (the model may change its case), or null when it is not one of them. */
function matchField(name: string | null, fields: readonly { name: string }[]): string | null {
  const wanted = name?.trim().toLocaleLowerCase();
  if (!wanted) return null;
  return fields.find((f) => f.name.trim().toLocaleLowerCase() === wanted)?.name ?? null;
}

/** The note's own names of the fields the model says it used (unknown names and repeats dropped), fr_field first. */
function usedFields(names: readonly string[] | null | undefined, frField: string | null, fields: readonly { name: string }[]): string[] {
  const out = new Set<string>();
  if (frField) out.add(frField);
  for (const name of names ?? []) {
    const field = typeof name === "string" ? matchField(name, fields) : null;
    if (field) out.add(field);
  }
  return [...out];
}

function skipped(ref: string, issue: string | null): AnkiItem {
  return {
    ref,
    skip: true,
    fr_field: null,
    used_fields: [],
    custom: [],
    fr: "",
    fr_as_seen: null,
    ru: "",
    ru_suggested: false,
    note: null,
    example_fr: null,
    example_ru: null,
    pos: "other",
    gender: "none",
    slang_level: 0,
    verlan: false,
    provenance: "fr_only",
    confidence: "low",
    issue,
    folder: FOLDER_INBOX,
    new_folder: null,
  };
}

/** `refs` from ankiRefMap(notes); `folders` = the themes sent with the request; `fields` = the custom fields sent. */
export function finalizeAnki(
  raw: AnkiModel,
  refs: ReadonlyMap<string, Pick<AnkiRequestNote, "ref" | "fields">>,
  folders: readonly FolderRef[],
  fields: readonly { id: string }[] = [],
): AnkiItem[] {
  const fieldRefs = fieldRefMap(fields);
  const byRef = new Map<string, AnkiItem>();
  for (const item of raw.items) {
    const note = refs.get(item.ref.trim());
    if (!note || byRef.has(note.ref)) continue;
    const issue = cleanText(item.issue, 120);
    if (item.skip) {
      byRef.set(note.ref, skipped(note.ref, issue));
      continue;
    }
    // Provenance follows the translation: the note's own Russian makes a pair, ours means only French was there.
    const model: VocabItemModel = { ...item, provenance: item.ru_suggested ? "fr_only" : "pair" };
    const vocab = normalizeVocabItem(model, folders);
    // A row without French or Russian is no card: keep the note as a skip so the import can say why.
    if (!vocab) {
      byRef.set(note.ref, skipped(note.ref, issue ?? "Нет французского слова или перевода"));
      continue;
    }
    const frField = matchField(item.fr_field, note.fields);
    byRef.set(note.ref, {
      ...vocab,
      ref: note.ref,
      skip: false,
      fr_field: frField,
      used_fields: usedFields(item.used_fields, frField, note.fields),
      custom: finalizeCustom(item.custom, fieldRefs),
    });
  }
  return [...refs.values()].flatMap((n) => byRef.get(n.ref) ?? []);
}
