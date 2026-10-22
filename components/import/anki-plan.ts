// What an Anki import sends, keeps and saves: pure helpers between the parsed deck
// (lib/anki/apkg.ts), the enrichment (/api/ai/anki) and the review rows (./rows.ts).
import { ANKI_RUN_MAX, type AnkiDeck, type AnkiItem, type AnkiNote } from "@/lib/anki/types";
import { cleanFieldLabel, cleanFieldValue, fieldDefByName, liveFieldDefs, withFieldValue } from "@/lib/core/custom-fields";
import type { CustomFieldValue, FieldDef, Folder, Word } from "@/lib/types";
import { buildRows, pluralRu, type ImportRow } from "./rows";

/** Short one-line fields: the ones that can be the French word itself. */
export function candidateTerms(note: Pick<AnkiNote, "fields">): string[] {
  return note.fields.map((f) => f.text.trim()).filter((t) => t !== "" && t.length <= 60 && !t.includes("\n"));
}

/** Notes whose word the library already has (any short field matches a saved word): never sent. */
export function knownNotes(notes: readonly AnkiNote[], duplicates: ReadonlyMap<string, Word>): Set<string> {
  const out = new Set<string>();
  for (const n of notes) if (candidateTerms(n).some((t) => duplicates.has(t))) out.add(n.id);
  return out;
}

export interface AnkiSelection {
  /** Notes to enrich now (chosen decks, not known, at most ANKI_RUN_MAX). */
  send: AnkiNote[];
  /** In the chosen decks but already in the library. */
  known: number;
  /** Left for the next import (over ANKI_RUN_MAX). */
  later: number;
}

export function selectNotes(deck: AnkiDeck, chosen: ReadonlySet<string>, known: ReadonlySet<string>): AnkiSelection {
  const inDecks = deck.notes.filter((n) => chosen.has(n.deckId));
  const fresh = inDecks.filter((n) => !known.has(n.id));
  return {
    send: fresh.slice(0, ANKI_RUN_MAX),
    known: inDecks.length - fresh.length,
    later: Math.max(0, fresh.length - ANKI_RUN_MAX),
  };
}

const lower = (s: string) => s.trim().toLocaleLowerCase("ru");

/**
 * The custom fields a note's card gets: the values filled for the learner's definitions, then every
 * non-empty note field the card was not made from (not in used_fields, not the fr_field): under the
 * definition of the same name when there is one (unless already filled), otherwise as a one-off
 * field labelled with the Anki field name. Pure.
 */
export function ankiCustomFields(
  note: Pick<AnkiNote, "fields"> | undefined,
  item: Pick<AnkiItem, "custom" | "used_fields" | "fr_field">,
  defs: readonly FieldDef[],
): CustomFieldValue[] {
  const live = liveFieldDefs(defs);
  let out: CustomFieldValue[] = [];
  for (const c of item.custom ?? []) {
    const def = live.find((d) => d.id === c.id);
    if (def && !out.some((f) => f.field_id === def.id)) out = withFieldValue(out, { field_id: def.id, label: def.name }, c.value);
  }
  // Without used_fields (an older response) it is unknown which fields the card came from: none is kept.
  if (!item.used_fields) return out;
  const used = new Set([...item.used_fields, ...(item.fr_field ? [item.fr_field] : [])].map(lower));
  for (const field of note?.fields ?? []) {
    if (used.has(lower(field.name))) continue;
    const value = cleanFieldValue(field.text);
    const label = cleanFieldLabel(field.name);
    if (!value || !label) continue;
    const def = fieldDefByName(live, label);
    if (def) {
      if (!out.some((f) => f.field_id === def.id)) out = withFieldValue(out, { field_id: def.id, label: def.name }, value);
    } else if (!out.some((f) => lower(f.label) === lower(label))) {
      out = withFieldValue(out, { field_id: null, label }, value);
    }
  }
  return out;
}

/**
 * Review rows for the enriched notes; skipped ones are counted, not shown. Each row keeps its note
 * id in `ref`, and with `notes` and `defs` (the custom field definitions) its custom fields.
 */
export function ankiRows(
  items: readonly AnkiItem[],
  folders: readonly Pick<Folder, "id" | "slug" | "name">[],
  duplicates: ReadonlyMap<string, Word>,
  prefs: { autoSort?: boolean; slang?: boolean; examples?: boolean } = {},
  { notes = [], defs = [] }: { notes?: readonly Pick<AnkiNote, "id" | "fields">[]; defs?: readonly FieldDef[] } = {},
): { rows: ImportRow[]; skipped: number } {
  const kept = items.filter((it) => !it.skip && it.fr.trim() !== "");
  const byId = new Map(notes.map((n) => [n.id, n]));
  const rows = buildRows(kept, folders, duplicates, prefs).map((row, i) => {
    const customFields = ankiCustomFields(byId.get(kept[i].ref), kept[i], defs);
    return { ...row, ref: kept[i].ref, ...(customFields.length > 0 && { customFields }) };
  });
  return { rows, skipped: items.length - kept.length };
}

/** Whether the note's first field held the French side (then card ord 0 is fr→ru). */
export function frFirst(note: Pick<AnkiNote, "fields">, item: Pick<AnkiItem, "fr_field"> | undefined): boolean {
  if (!item?.fr_field) return true;
  return note.fields[0]?.name === item.fr_field;
}

/** «Fiches · Argot» for one chosen deck, «3 колоды» for several. */
export function deckTitle(deck: AnkiDeck, chosen: ReadonlySet<string>): string {
  const names = deck.decks.filter((d) => chosen.has(d.id)).map((d) => d.name);
  if (names.length === 1) return names[0];
  return `${names.length} ${pluralRu(names.length, ["колода", "колоды", "колод"])}`;
}

export const notesRu = (n: number) => `${n} ${pluralRu(n, ["карточка", "карточки", "карточек"])}`;
