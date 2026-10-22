import { describe, expect, it } from "vitest";
import type { AnkiDeck, AnkiItem, AnkiNote } from "@/lib/anki/types";
import { FIELD_VALUE_MAX } from "@/lib/core/custom-fields";
import type { FieldDef, Word } from "@/lib/types";
import { ankiCustomFields, ankiRows, candidateTerms, deckTitle, frFirst, knownNotes, selectNotes } from "./anki-plan";

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

const withFields = (id: string, ...fields: [name: string, text: string][]): AnkiNote => ({
  ...note(id, "d1"),
  fields: fields.map(([name, text]) => ({ name, text })),
});

const def = (id: string, name: string, patch: Partial<FieldDef> = {}): FieldDef => ({
  id,
  name,
  hint: null,
  ai_fill: true,
  sort: 1,
  updated_at: "2026-10-22T10:00:00.000Z",
  deleted_at: null,
  ...patch,
});

describe("ankiCustomFields", () => {
  const n = withFields(
    "1",
    ["Front", "la meuf"],
    ["Back", "девушка"],
    ["Example", "C'est ma meuf."],
    ["произношение", "[mœf]"],
    ["Synonymes", "  la nana,\n la go "],
    ["Source", "x".repeat(400)],
  );
  const defs = [def("ipa", "Произношение"), def("syn", "Synonymes", { sort: 2 }), def("old", "Source", { deleted_at: "2026-10-01T00:00:00.000Z" })];

  it("AI values for the definitions, then the unused note fields: by definition name, else one-off", () => {
    const out = ankiCustomFields(n, item("1", "la meuf", { used_fields: ["Back", "Example"], custom: [{ id: "syn", value: "la go" }] }), defs);
    expect(out).toEqual([
      { field_id: "syn", label: "Synonymes", value: "la go" },
      // Same name as a definition (case aside): that definition, under its own name.
      { field_id: "ipa", label: "Произношение", value: "[mœf]" },
      // A deleted definition does not count: a one-off field, the value cut to its limit.
      { field_id: null, label: "Source", value: "x".repeat(FIELD_VALUE_MAX) },
    ]);
  });

  it("a definition the AI filled keeps the AI's value; unknown ids are ignored", () => {
    const out = ankiCustomFields(n, item("1", "la meuf", { used_fields: ["front", "BACK", "Example", "Source"], custom: [{ id: "ipa", value: "[mœf] (AI)" }, { id: "ghost", value: "?" }] }), defs);
    expect(out).toEqual([
      { field_id: "ipa", label: "Произношение", value: "[mœf] (AI)" },
      { field_id: "syn", label: "Synonymes", value: "la nana, la go" },
    ]);
  });

  it("without definitions every unused field is one-off; the fr_field is never kept; no used_fields keeps nothing", () => {
    const out = ankiCustomFields(n, item("1", "la meuf", { fr_field: "Front", used_fields: ["Back", "Example", "Source"] }), []);
    expect(out).toEqual([
      { field_id: null, label: "произношение", value: "[mœf]" },
      { field_id: null, label: "Synonymes", value: "la nana, la go" },
    ]);
    expect(ankiCustomFields(n, item("1", "la meuf"), [])).toEqual([]);
    expect(ankiCustomFields(undefined, item("1", "la meuf", { used_fields: [] }), [])).toEqual([]);
  });
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

  it("keeps the note's other fields and the filled values as custom fields of the row", () => {
    const n = withFields("1", ["Front", "la meuf"], ["Back", "девушка"], ["Произношение", "[mœf]"]);
    const { rows } = ankiRows([item("1", "la meuf", { used_fields: ["Front", "Back"] }), item("2", "chelou")], [], new Map(), {}, { notes: [n], defs: [] });
    expect(rows[0].customFields).toEqual([{ field_id: null, label: "Произношение", value: "[mœf]" }]);
    expect(rows[1].customFields).toBeUndefined();
    // Without notes only the filled values count.
    expect(ankiRows([item("1", "la meuf", { used_fields: [] })], [], new Map()).rows[0].customFields).toBeUndefined();
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
