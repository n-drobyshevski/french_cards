import { describe, expect, it } from "vitest";
import { ankiRefMap, finalizeAnki } from "./anki";
import type { AnkiItemModel } from "./schemas";

const notes = [
  {
    ref: "1001",
    fields: [
      { name: "Front", text: "bagnole" },
      { name: "Back", text: "car" },
    ],
    tags: [],
  },
  {
    ref: "1002",
    fields: [
      { name: "Recto", text: "свалить" },
      { name: "Verso", text: "se casser" },
    ],
    tags: [],
  },
  { ref: "1003", fields: [{ name: "Front", text: "Subjonctif après bien que" }], tags: [] },
];
const folders = [{ slug: "dengi", name: "Деньги" }];

function row(ref: string, extra: Partial<AnkiItemModel> = {}): AnkiItemModel {
  return {
    ref,
    skip: false,
    fr_field: "Front",
    fr: "la bagnole",
    fr_as_seen: "bagnole",
    ru: "тачка, машина",
    ru_suggested: true,
    note: "англ.: car",
    example_fr: null,
    example_ru: "лишнее",
    pos: "noun",
    gender: "f",
    slang_level: "fam",
    verlan: false,
    confidence: "high",
    issue: null,
    folder: "INBOX",
    new_folder: null,
    ...extra,
  };
}

describe("finalizeAnki", () => {
  it("maps short refs back to note ids, in note order, and normalizes like a screenshot row", () => {
    const refs = ankiRefMap(notes);
    expect([...refs.keys()]).toEqual(["n1", "n2", "n3"]);
    const out = finalizeAnki(
      {
        items: [
          row("n2", {
            fr_field: "verso",
            fr: " se casser ",
            fr_as_seen: "se casser",
            ru: "свалить",
            ru_suggested: false,
            pos: "verb",
            gender: "m",
            slang_level: "arg",
          }),
          row(" n1 ", { folder: "ghost" }),
        ],
      },
      refs,
      folders,
    );
    expect(out.map((i) => i.ref)).toEqual(["1001", "1002"]);
    expect(out[0]).toEqual({
      ref: "1001",
      skip: false,
      fr_field: "Front",
      fr: "la bagnole",
      fr_as_seen: "bagnole",
      ru: "тачка, машина",
      ru_suggested: true,
      note: "англ.: car",
      example_fr: null,
      example_ru: null,
      pos: "noun",
      gender: "f",
      slang_level: 1,
      verlan: false,
      provenance: "fr_only",
      confidence: "high",
      issue: null,
      folder: "INBOX",
      new_folder: null,
    });
    // The note's own Russian: a pair; field name back in the note's case; no gender for a verb.
    expect(out[1]).toMatchObject({
      fr: "se casser",
      fr_as_seen: null,
      fr_field: "Verso",
      provenance: "pair",
      ru_suggested: false,
      gender: "none",
      slang_level: 2,
    });
  });

  it("drops unknown refs and repeats, keeps skips, turns empty rows into skips", () => {
    const out = finalizeAnki(
      {
        items: [
          row("n9"),
          row("n3", { skip: true, fr: "", ru: "", issue: "правило грамматики", folder: "dengi" }),
          row("n1", { ru: " " }),
          row("n1", { fr: "la caisse" }),
          row("n3"),
        ],
      },
      ankiRefMap(notes),
      folders,
    );
    expect(out.map((i) => [i.ref, i.skip, i.issue])).toEqual([
      ["1001", true, "Нет французского слова или перевода"],
      ["1003", true, "правило грамматики"],
    ]);
    expect(out[1]).toMatchObject({ fr: "", ru: "", folder: "INBOX", fr_field: null, slang_level: 0 });
  });

  it("keeps theme picks inside the learner's slugs and accepts a new theme", () => {
    const out = finalizeAnki(
      {
        items: [
          row("n1", { folder: "NEW", new_folder: { slug: "Transport", name: "транспорт", description: "Машины." } }),
          row("n2", { folder: "dengi", fr_field: "Nope" }),
          row("n3", { folder: "NEW", new_folder: { slug: "x", name: "деньги", description: "" } }),
        ],
      },
      ankiRefMap(notes),
      folders,
    );
    expect(out[0]).toMatchObject({ folder: "NEW", new_folder: { slug: "transport", name: "Транспорт", description: "Машины." } });
    expect(out[1]).toMatchObject({ folder: "dengi", fr_field: null });
    // A "new" theme named like an existing one is that theme.
    expect(out[2]).toMatchObject({ folder: "dengi", new_folder: null });
  });
});
