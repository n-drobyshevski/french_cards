// Post-processing for /api/ai/anki. The model sees short refs (n1, n2…) instead of Anki note ids;
// this maps them back, normalizes each row like a screenshot row, keeps theme picks inside the
// learner's slugs and keeps one item per note, in note order. Notes the model left out get no item.
import type { AnkiItem } from "@/lib/anki/types";
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

function skipped(ref: string, issue: string | null): AnkiItem {
  return {
    ref,
    skip: true,
    fr_field: null,
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

/** `refs` from ankiRefMap(notes); `folders` = the themes sent with the request. */
export function finalizeAnki(
  raw: AnkiModel,
  refs: ReadonlyMap<string, Pick<AnkiRequestNote, "ref" | "fields">>,
  folders: readonly FolderRef[],
): AnkiItem[] {
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
    byRef.set(note.ref, { ...vocab, ref: note.ref, skip: false, fr_field: matchField(item.fr_field, note.fields) });
  }
  return [...refs.values()].flatMap((n) => byRef.get(n.ref) ?? []);
}
