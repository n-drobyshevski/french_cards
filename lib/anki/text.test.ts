import { describe, expect, it } from "vitest";
import { parseRows, readAnkiText, TEXT_DEFAULT_DECK } from "./text";

describe("parseRows", () => {
  it("handles quotes, doubled quotes and quoted newlines", () => {
    expect(parseRows('a,"b, c","say ""hi""","multi\nline"\r\nnext,row\n\n', ",")).toEqual([
      ["a", "b, c", 'say "hi"', "multi\nline"],
      ["next", "row"],
    ]);
    expect(parseRows("x\t\ty", "\t")).toEqual([["x", "", "y"]]);
    expect(parseRows('a,""', ",")).toEqual([["a", ""]]);
  });
});

describe("readAnkiText", () => {
  it("reads an Anki export with headers", () => {
    const text = [
      "#separator:tab",
      "#html:true",
      "#notetype column:1",
      "#deck column:2",
      "#tags column:5",
      "Basic\tFrançais::Argot\tla <b>thune</b>\tденьги\targot fric",
      "Basic\tFrançais\tkiffer\tобожать&nbsp;\t",
    ].join("\n");
    const deck = readAnkiText(text);
    expect(deck.crt).toBeNull();
    expect(deck.hasProgress).toBe(false);
    expect(deck.decks).toEqual([
      { id: "Français::Argot", name: "Français::Argot", count: 1 },
      { id: "Français", name: "Français", count: 1 },
    ]);
    expect(deck.notes[0]).toEqual({
      id: "row1",
      deckId: "Français::Argot",
      fields: [
        { name: "Поле 1", text: "la thune" },
        { name: "Поле 2", text: "деньги" },
      ],
      tags: ["argot", "fric"],
      cards: [],
      templates: 0,
    });
    expect(deck.notes[1].fields[1].text).toBe("обожать");
    expect(deck.notes[1].tags).toEqual([]);
  });

  it("names fields from #columns, uses the guid column and #deck", () => {
    const text =
      "#separator:Semicolon\n#columns:Français;Russe;GUID\n#guid column:3\n#deck:Mes mots\nmec;парень;g1\nmeuf;девушка;g1\n";
    const deck = readAnkiText(text);
    expect(deck.decks).toEqual([{ id: "Mes mots", name: "Mes mots", count: 2 }]);
    expect(deck.notes.map((n) => n.id)).toEqual(["g1", "g1+"]);
    expect(deck.notes[0].fields).toEqual([
      { name: "Français", text: "mec" },
      { name: "Russe", text: "парень" },
    ]);
  });

  it("sniffs the separator and quoting without headers", () => {
    expect(readAnkiText("\uFEFFla thune\tденьги, бабки\n").notes[0].fields.map((f) => f.text)).toEqual([
      "la thune",
      "деньги, бабки",
    ]);
    expect(readAnkiText("relou;надоедливый, «душный»").notes[0].fields).toHaveLength(2);
    const csv = readAnkiText('"chelou","странный, ""мутный"""\n"avoir la dalle","хотеть есть\nочень"');
    expect(csv.decks).toEqual([{ id: TEXT_DEFAULT_DECK, name: TEXT_DEFAULT_DECK, count: 2 }]);
    expect(csv.notes[0].fields[1].text).toBe('странный, "мутный"');
    expect(csv.notes[1].fields[1].text).toBe("хотеть есть очень"); // HTML by default: a raw newline is a space
  });

  it("keeps plain text as written with #html:false and skips empty rows", () => {
    const deck = readAnkiText('#html:false\n#separator:comma\na & b,"un\ndeux"\n,\n');
    expect(deck.notes).toHaveLength(1);
    expect(deck.notes[0].fields.map((f) => f.text)).toEqual(["a & b", "un\ndeux"]);
  });

  it("returns no notes for an empty file", () => {
    expect(readAnkiText("#separator:tab\n\n").notes).toEqual([]);
    expect(readAnkiText("").decks).toEqual([]);
  });
});
