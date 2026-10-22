// Shared shapes for the Anki import: the parser (lib/anki/apkg.ts, text.ts) produces an AnkiDeck,
// /api/ai/anki turns its notes into vocabulary, lib/anki/progress.ts maps cards to ReviewState.
import type { CustomFill, VocabItem } from "@/lib/ai/schemas";

/** Largest .apkg / .colpkg we try to open on a phone. */
export const ANKI_MAX_FILE_BYTES = 200 * 1024 * 1024;
/** Notes enriched and imported in one run; the rest come with the next import (duplicates are skipped). */
export const ANKI_RUN_MAX = 300;
/** Notes per /api/ai/anki request. */
export const ANKI_CHUNK_MAX = 25;
/** Fields per note sent to the model, and characters per field. */
export const ANKI_FIELDS_MAX = 8;
export const ANKI_FIELD_CHARS = 400;
export const ANKI_TAGS_MAX = 5;

export interface AnkiDeckInfo {
  id: string;
  /** Full path, subdecks joined with "::". */
  name: string;
  /** Notes with at least one card in this deck. */
  count: number;
}

/** One Anki card (one direction of a note) with its scheduling, as stored by Anki. */
export interface AnkiCard {
  /** Template index: 0 is the note's forward card. */
  ord: number;
  /** 0 new · 1 learning · 2 review · 3 relearning. */
  type: 0 | 1 | 2 | 3;
  /** -3/-2 buried · -1 suspended · 0..4 as in Anki. */
  queue: number;
  /** Review cards: days since the collection was created; (re)learning: unix seconds; new: position. */
  due: number;
  /** Interval in days (negative = seconds, for learning cards). */
  ivl: number;
  /** SM-2 ease ×1000 (2500 = 250 %); 0 for new cards. */
  factor: number;
  reps: number;
  lapses: number;
  /** FSRS memory state when the collection used FSRS. */
  fsrs: { stability: number; difficulty: number } | null;
  /** Last review time (ms) from revlog, null when the card has none. */
  lastReviewMs: number | null;
}

export interface AnkiField {
  /** Field name from the note type («Front», «Back», …; «Поле 1…» for text exports). */
  name: string;
  /** Cleaned text (lib/anki/clean.ts): no HTML, sound, images or cloze markup. */
  text: string;
}

export interface AnkiNote {
  id: string;
  deckId: string;
  /** Non-empty cleaned fields in note-type order, at most ANKI_FIELDS_MAX. */
  fields: AnkiField[];
  tags: string[];
  /** Cards of this note; empty for text exports. */
  cards: AnkiCard[];
  /** Templates the note type has (cloze = 0): progress is carried only for 1–2 templates. */
  templates: number;
}

export interface AnkiDeck {
  /** Collection creation time (unix seconds), base for review-card due days; null for text exports. */
  crt: number | null;
  decks: AnkiDeckInfo[];
  notes: AnkiNote[];
  /** Some card was ever reviewed (type ≠ 0). */
  hasProgress: boolean;
}

/** What /api/ai/anki returns per note: a vocabulary row, or a skip. */
export interface AnkiItem extends VocabItem {
  /** The AnkiNote id the item came from. */
  ref: string;
  /** Not French vocabulary (grammar note, empty, other language): leave it out. */
  skip: boolean;
  /** Name of the field the French term was read from (decides the direction of card ord 0). */
  fr_field: string | null;
  /**
   * Names of the note fields the card was made from (fr_field included), as the note has them;
   * the other non-empty fields become custom fields of the word. Missing from older responses.
   */
  used_fields?: string[];
  /** Custom fields filled for the definitions sent with the request (only those with a value). */
  custom?: CustomFill[];
}
