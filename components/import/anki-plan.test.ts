import { describe, expect, it } from "vitest";
import type { AnkiDeck, AnkiItem, AnkiNote } from "@/lib/anki/types";
import type { Word } from "@/lib/types";
import { ankiRows, candidateTerms, deckTitle, frFirst, knownNotes, selectNotes } from "./anki-plan";

const note = (id: string, deckId: string, ...texts: string[]): AnkiNote => ({
  id,
  deckId,
  fields: texts.map((text, i) => ({ name: i === 0 ? "Front" : `F${i}`, text })),
  tags: [],
  cards: [],
  templates: 1,
});

const deck = (notes: AnkiNote[]): AnkiDeck => ({
  crt: null,
  decks: [
    { id: "d1", name: "Argot", count: 0 },
    { id: "d2", name: "Verlan", count: 0 },
  ],
  notes,
  hasProgress: false,
});

const item = (ref: string, fr: string, patch: Partial<AnkiItem> = {}): AnkiItem => ({
  ref,
  skip: false,
  fr_field: "Front",
  fr,
  fr_as_seen: null,
  ru: `ru:${fr}`,
  ru_suggested: false,
  note: null,
  example_fr: null,
  example_ru: null,
  pos: "noun",
  gender: "f",
  slang_level: 2,
  verlan: false,
  provenance: "pair",
  confidence: "high",
  issue: null,
  folder: "INBOX",
  new_folder: null,
  ...patch,
});

describe("anki plan", () => {
  it("takes short one-line fields as candidate words", () => {
    expect(candidateTerms(note("1", "d1", "la meuf", "девушка\nдевчонка", "x".repeat(61), " "))).toEqual(["la meuf"]);
  });

  it("marks notes the library has and leaves them out of the run", () => {
    const notes = [note("1", "d1", "la meuf", "девушка"), note("2", "d1", "relou", "зануда"), note("3", "d2", "chelou")];
    const known = knownNotes(notes, new Map([["relou", {} as Word]]));
    expect([...known]).toEqual(["2"]);
    const sel = selectNotes(deck(notes), new Set(["d1"]), known);
    expect(sel.send.map((n) => n.id)).toEqual(["1"]);
    expect(sel).toMatchObject({ known: 1, later: 0 });
  });

  it("caps a run at 300 notes and counts the rest for later", () => {
    const notes = Array.from({ length: 310 }, (_, i) => note(`${i}`, "d1", `mot${i}`));
    const sel = selectNotes(deck(notes), new Set(["d1"]), new Set());
    expect(sel.send).toHaveLength(300);
    expect(sel.later).toBe(10);
  });

  it("builds rows only for kept items, each with its note id", () => {
    const { rows, skipped } = ankiRows(
      [item("1", "la meuf"), item("2", "", { skip: true }), item("3", "chelou", { ru_suggested: true })],
      [],
      new Map(),
    );
    expect(skipped).toBe(1);
    expect(rows.map((r) => [r.fr, r.ref, r.ruGuess])).toEqual([
      ["la meuf", "1", false],
      ["chelou", "3", true],
    ]);
  });

  it("knows which side the first field was", () => {
    const n = note("1", "d1", "девушка", "la meuf");
    expect(frFirst(n, item("1", "la meuf", { fr_field: "F1" }))).toBe(false);
    expect(frFirst(n, item("1", "la meuf", { fr_field: "Front" }))).toBe(true);
    expect(frFirst(n, undefined)).toBe(true);
  });

  it("names one deck or counts several", () => {
    const d = deck([]);
    expect(deckTitle(d, new Set(["d2"]))).toBe("Verlan");
    expect(deckTitle(d, new Set(["d1", "d2"]))).toBe("2 колоды");
  });
});
