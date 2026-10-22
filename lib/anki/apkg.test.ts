import { unzipSync, zipSync } from "fflate";
import type { SqlJsStatic } from "sql.js";
import { beforeAll, describe, expect, it } from "vitest";
import { AnkiReadError, notetypeKind, readAnkiFile, readApkg } from "./apkg";
import {
  BASIC_MODEL,
  buildApkg,
  buildCollection,
  buildDummyCollection,
  DEFAULT_DECK,
  FIXTURE_CRT,
  FIXTURE_DECK,
  loadNodeSql,
  type ApkgSpec,
  type FixtureModel,
} from "./test-fixtures";
import { ANKI_MAX_FILE_BYTES } from "./types";

let SQL: SqlJsStatic;
beforeAll(async () => {
  SQL = await loadNodeSql();
});

const REVERSED: FixtureModel = { id: 2002, name: "Basic (and reversed card)", fields: ["Front", "Back"], templates: 2 };
const CLOZE: FixtureModel = { id: 3003, name: "Cloze", fields: ["Text", "Back Extra"], templates: 1, cloze: true };
const ARGOT = { id: 1_700_000_000_002, name: "Français::Argot" };
const EMPTY = { id: 1_700_000_000_003, name: "Vide" };

function spec(schema: ApkgSpec["schema"]): Omit<ApkgSpec, "SQL"> {
  return {
    schema,
    models: [BASIC_MODEL, REVERSED, CLOZE],
    decks: [DEFAULT_DECK, FIXTURE_DECK, ARGOT, EMPTY],
    notes: [
      { id: 101, fields: ["la <b>thune</b>", "деньги"], tags: ["argot", "fric"] },
      {
        id: 102,
        mid: REVERSED.id,
        fields: ["kiffer", "обожать [sound:k.mp3]"],
        cards: [
          { ord: 0, did: ARGOT.id, type: 2, due: 400, ivl: 12, factor: 2300, reps: 5, lapses: 1, reviews: [1_734_000_000_000] },
          { ord: 1, did: ARGOT.id, type: 1, due: 1_734_100_000, ivl: -600, reps: 1 },
        ],
      },
      { id: 103, mid: CLOZE.id, fields: ["J'ai {{c1::la dalle}}", ""] },
      {
        id: 104,
        fields: ["relou", "надоедливый"],
        cards: [{ type: 2, due: 410, ivl: 30, data: '{"s":41.5,"d":6.25,"dr":0.9}', odid: FIXTURE_DECK.id, did: 99, odue: 0 }],
      },
    ],
  };
}

describe("readApkg", () => {
  for (const schema of ["legacy", "v18"] as const) {
    it(`reads a ${schema} collection`, async () => {
      const deck = await readApkg(buildApkg({ SQL, ...spec(schema) }), { SQL });
      expect(deck.crt).toBe(FIXTURE_CRT);
      expect(deck.hasProgress).toBe(true);
      // Default and «Vide» have no notes; subdecks keep their full path.
      expect(deck.decks).toEqual([
        { id: String(FIXTURE_DECK.id), name: "Français", count: 3 },
        { id: String(ARGOT.id), name: "Français::Argot", count: 1 },
      ]);
      expect(deck.notes.map((n) => n.id)).toEqual(["101", "102", "103", "104"]);

      const [basic, reversed, cloze, fsrs] = deck.notes;
      expect(basic.fields).toEqual([
        { name: "Front", text: "la thune" },
        { name: "Back", text: "деньги" },
      ]);
      expect(basic.tags).toEqual(["argot", "fric"]);
      expect(basic.templates).toBe(1);
      expect(basic.cards).toEqual([
        { ord: 0, type: 0, queue: 0, due: 0, ivl: 0, factor: 0, reps: 0, lapses: 0, fsrs: null, lastReviewMs: null },
      ]);

      expect(reversed.deckId).toBe(String(ARGOT.id));
      expect(reversed.templates).toBe(2);
      expect(reversed.fields[1].text).toBe("обожать");
      expect(reversed.cards).toEqual([
        {
          ord: 0,
          type: 2,
          queue: 2,
          due: 400,
          ivl: 12,
          factor: 2300,
          reps: 5,
          lapses: 1,
          fsrs: null,
          lastReviewMs: 1_734_000_000_000,
        },
        {
          ord: 1,
          type: 1,
          queue: 1,
          due: 1_734_100_000,
          ivl: -600,
          factor: 2500,
          reps: 1,
          lapses: 0,
          fsrs: null,
          lastReviewMs: null,
        },
      ]);

      expect(cloze.templates).toBe(0);
      expect(cloze.fields).toEqual([{ name: "Text", text: "J'ai la dalle" }]);

      // A card in a filtered deck belongs to its home deck.
      expect(fsrs.deckId).toBe(String(FIXTURE_DECK.id));
      expect(fsrs.cards[0].fsrs).toEqual({ stability: 41.5, difficulty: 6.25 });
    });
  }

  it("prefers collection.anki21b over the stand-in collection.anki2", async () => {
    const deck = await readApkg(buildApkg({ SQL, ...spec("v18"), dummy: true }), { SQL });
    expect(deck.notes).toHaveLength(4);
  });

  it("reads an old collection.anki2 package", async () => {
    const data = buildApkg({ SQL, schema: "legacy", legacyFile: "collection.anki2", notes: [{ fields: ["mec", "парень"] }] });
    const deck = await readApkg(data, { SQL });
    expect(deck.notes[0].fields.map((f) => f.text)).toEqual(["mec", "парень"]);
    expect(deck.hasProgress).toBe(false);
  });

  it("detects cloze note types in schema 18 by their markup when the config says nothing", async () => {
    const plainConfigCloze: FixtureModel = { id: 4004, name: "Mon cloze", fields: ["Texte", "Extra"], templates: 1 };
    const data = buildApkg({
      SQL,
      schema: "v18",
      models: [BASIC_MODEL, plainConfigCloze],
      notes: [{ mid: plainConfigCloze.id, fields: ["{{c1::bouffer}}", ""] }, { fields: ["a", "b"] }],
    });
    const deck = await readApkg(data, { SQL });
    expect(deck.notes.map((n) => n.templates)).toEqual([0, 1]);
  });

  it("never inflates media entries", async () => {
    // The media entry "0" holds corrupt deflate data: reading it would throw.
    const media = new Uint8Array(1 << 20);
    const data = buildApkg({ SQL, ...spec("v18"), media: { "0": media } });
    expect(data[0] === 0x50 && data[26] === 1 && data[30] === 0x30).toBe(true); // the first local entry is "0"
    const compressedSize = data[18] | (data[19] << 8) | (data[20] << 16);
    const start = 30 + 1 + (data[28] | (data[29] << 8));
    data.fill(0xff, start, start + compressedSize);
    expect(() => unzipSync(data)).toThrow();
    const deck = await readApkg(data, { SQL });
    expect(deck.notes).toHaveLength(4);
  });

  it("asks for a compatible export when only the stand-in collection is there", async () => {
    const onlyDummy = zipSync({ "collection.anki2": buildDummyCollection(SQL), "collection.anki21c": new Uint8Array(8) });
    await expect(readApkg(onlyDummy, { SQL })).rejects.toMatchObject({ code: "old_format" });
    const dummyAlone = zipSync({ "collection.anki2": buildDummyCollection(SQL) });
    const error = await readApkg(dummyAlone, { SQL }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AnkiReadError);
    expect((error as AnkiReadError).code).toBe("old_format");
    expect((error as AnkiReadError).message).toContain("Поддержка старых версий Anki");
  });

  it("rejects files that are not Anki packages", async () => {
    await expect(readApkg(new TextEncoder().encode("hello"), { SQL })).rejects.toMatchObject({ code: "not_anki" });
    await expect(readApkg(zipSync({ "notes.txt": new Uint8Array(3) }), { SQL })).rejects.toMatchObject({ code: "not_anki" });
    const broken = zipSync({ "collection.anki21": new TextEncoder().encode("not sqlite at all, sorry") });
    await expect(readApkg(broken, { SQL })).rejects.toMatchObject({ code: "broken" });
    const badZstd = zipSync({ "collection.anki21b": new Uint8Array([1, 2, 3, 4]) });
    await expect(readApkg(badZstd, { SQL })).rejects.toMatchObject({ code: "broken" });
  });

  it("reads the collection bytes of a .colpkg the same way", async () => {
    const collection = buildCollection({ SQL, schema: "legacy", notes: [{ fields: ["pote", "приятель"] }] });
    const deck = await readApkg(zipSync({ "collection.anki21": collection }).buffer, { SQL });
    expect(deck.notes[0].fields[0].text).toBe("pote");
  });
});

describe("notetypeKind", () => {
  it("reads the kind field and skips others", () => {
    expect(notetypeKind(new Uint8Array([0x08, 0x01]))).toBe(1);
    expect(notetypeKind(new Uint8Array([0x1a, 0x02, 0x08, 0x01, 0x08, 0x01]))).toBe(1); // a string first
    expect(notetypeKind(new Uint8Array([0x1a, 0x01, 0x61]))).toBe(0);
    expect(notetypeKind(new Uint8Array([0x1a, 0x7f]))).toBe(0); // cut off
    expect(notetypeKind(new Uint8Array())).toBe(0);
  });
});

describe("readAnkiFile", () => {
  it("dispatches by extension", async () => {
    const apkg = buildApkg({ SQL, ...spec("legacy") });
    expect((await readAnkiFile(new File([apkg], "Deck.APKG"), { SQL })).notes).toHaveLength(4);
    expect((await readAnkiFile(new File([apkg], "deck.bin"), { SQL })).notes).toHaveLength(4);
    const txt = await readAnkiFile(new File(["#separator:tab\nmec\tпарень\n"], "deck.txt"));
    expect(txt.notes[0].fields.map((f) => f.text)).toEqual(["mec", "парень"]);
    await expect(readAnkiFile(new File(["#separator:tab\n"], "deck.csv"))).rejects.toMatchObject({ code: "empty" });
    await expect(readAnkiFile(new File(["hello"], "photo.jpg"))).rejects.toMatchObject({ code: "not_anki" });
  });

  it("refuses files over the size limit before reading them", async () => {
    const big = { name: "big.apkg", size: ANKI_MAX_FILE_BYTES + 1 } as File;
    await expect(readAnkiFile(big)).rejects.toMatchObject({ code: "too_big" });
  });
});
