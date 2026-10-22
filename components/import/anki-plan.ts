// What an Anki import sends, keeps and saves: pure helpers between the parsed deck
// (lib/anki/apkg.ts), the enrichment (/api/ai/anki) and the review rows (./rows.ts).
import { ANKI_RUN_MAX, type AnkiDeck, type AnkiItem, type AnkiNote } from "@/lib/anki/types";
import type { Folder, Word } from "@/lib/types";
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

/** Review rows for the enriched notes; skipped ones are counted, not shown. Each row keeps its note id in `ref`. */
export function ankiRows(
  items: readonly AnkiItem[],
  folders: readonly Pick<Folder, "id" | "slug" | "name">[],
  duplicates: ReadonlyMap<string, Word>,
  prefs: { autoSort?: boolean; slang?: boolean; examples?: boolean } = {},
): { rows: ImportRow[]; skipped: number } {
  const kept = items.filter((it) => !it.skip && it.fr.trim() !== "");
  const rows = buildRows(kept, folders, duplicates, prefs).map((row, i) => ({ ...row, ref: kept[i].ref }));
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
