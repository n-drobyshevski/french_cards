import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLexique, foldKey, loadLexique, prefixSearch, setLexiqueForTesting, type LexiqueEntry } from "./lexique";

const FIXTURE: LexiqueEntry[] = [
  ["casser", "verb", "none", 133],
  ["casserole", "noun", "f", 12],
  ["cassis", "noun", "m", 2],
  ["casse", "noun", "f", 20],
  ["énerver", "verb", "none", 30],
  ["éner", "other", "none", 0.1],
  ["habiller", "verb", "none", 40],
  ["hâter", "verb", "none", 8],
  ["œuvre", "noun", "f", 90],
  ["thune", "noun", "f", 5],
  ["c'est ouf", "expression", "none", 3],
  ["semaine", "noun", "f", 100],
];

/** FIXTURE as the build script writes it: sorted by folded key, the key appended where it differs. */
const FILE_FIXTURE: LexiqueEntry[] = FIXTURE.map((e): LexiqueEntry => (foldKey(e[0]) === e[0] ? e : [...e, foldKey(e[0])])).sort(
  (a, b) => ((a[4] ?? a[0]) < (b[4] ?? b[0]) ? -1 : 1),
);

describe("createLexique / search", () => {
  const lex = createLexique(FIXTURE); // deliberately unsorted

  it("prefix-matches accent-insensitively, exact match first, then by frequency", () => {
    expect(lex.search("cass").map((h) => h.lemma)).toEqual(["casser", "casse", "casserole", "cassis"]);
    expect(lex.search("casse").map((h) => h.lemma)[0]).toBe("casse");
    expect(lex.search("ENERV").map((h) => h.fr)).toEqual(["énerver"]);
    expect(lex.search("oeu")[0].fr).toBe("œuvre");
    expect(lex.search("c’est")[0].fr).toBe("c'est ouf");
  });

  it("respects the limit and returns nothing for empty or unknown input", () => {
    expect(lex.search("cass", 2)).toHaveLength(2);
    expect(lex.search("   ")).toEqual([]);
    expect(lex.search("zzz")).toEqual([]);
    expect(lex.search("cass", 0)).toEqual([]);
  });

  it("strips se / s' and restores the pronominal form on verbs only", () => {
    expect(lex.search("se cass")).toEqual([{ fr: "se casser", lemma: "casser", pos: "verb", gender: "none", freq: 133 }]);
    expect(lex.search("s'éner").map((h) => h.fr)).toEqual(["s'énerver"]);
    expect(lex.search("se ener").map((h) => h.fr)).toEqual(["s'énerver"]);
    expect(lex.search("s’habi").map((h) => h.fr)).toEqual(["s'habiller"]);
    expect(lex.search("se hât").map((h) => h.fr)).toEqual(["se hâter"]);
    expect(lex.search("se ")).toEqual([]);
    expect(lex.search("se")[0].lemma).toBe("semaine");
  });

  it("strips a leading article, keeps nouns of that gender and puts the article back", () => {
    expect(lex.search("la thu")).toEqual([{ fr: "la thune", lemma: "thune", pos: "noun", gender: "f", freq: 5 }]);
    expect(lex.search("la cass").map((h) => h.fr)).toEqual(["la casse", "la casserole"]);
    expect(lex.search("le cass").map((h) => h.fr)).toEqual(["le cassis"]);
    expect(lex.search("une cas").map((h) => h.fr)).toEqual(["une casse", "une casserole"]);
    expect(lex.search("les cass").map((h) => h.fr)).toEqual(["la casse", "la casserole", "le cassis"]);
    expect(lex.search("l'oeu").map((h) => h.fr)).toEqual(["l'œuvre"]);
    expect(lex.search("la oeuv").map((h) => h.fr)).toEqual(["l'œuvre"]);
    expect(lex.search("le ")).toEqual([]);
    // Without the space it is an ordinary prefix.
    expect(lex.search("la")).toEqual([]);
  });

  it("searches prefolded entries the same way", () => {
    const pre = createLexique(FILE_FIXTURE, { prefolded: true });
    for (const q of ["cass", "ENERV", "oeu", "c’est", "se ener", "l'oeu", "la cass"]) expect(pre.search(q)).toEqual(lex.search(q));
  });

  it("folds a prefolded list after all when it is out of key order (a file without keys)", () => {
    const stale = createLexique(FILE_FIXTURE.map((e) => e.slice(0, 4) as unknown as LexiqueEntry), { prefolded: true });
    expect(stale.search("ENERV").map((h) => h.fr)).toEqual(["énerver"]);
    expect(stale.search("oeu")[0].fr).toBe("œuvre");
  });

  it("folds like the build script", () => {
    expect(foldKey("  Être  Vénère ")).toBe("etre venere");
    expect(foldKey("l’Œil")).toBe("l'oeil");
  });
});

describe("public/lexique/fr-lemmas.json", () => {
  const path = fileURLToPath(new URL("../public/lexique/fr-lemmas.json", import.meta.url));
  const data = JSON.parse(readFileSync(path, "utf8")) as LexiqueEntry[];

  const lex = createLexique(data, { prefolded: true });

  it("is a sorted list of 20–30k well-formed lemmas", () => {
    expect(data.length).toBeGreaterThan(20000);
    expect(data.length).toBeLessThan(30000);
    const keys = data.map((e) => foldKey(e[0]));
    for (let i = 1; i < keys.length; i++) expect(keys[i - 1] <= keys[i]).toBe(true);
    // The stored key is the folded lemma, and is left out only when it equals the lemma.
    const mismatched = data.filter((e) => (e[4] ?? e[0]) !== foldKey(e[0]) || e[4] === e[0] || e.length > 5);
    expect(mismatched).toEqual([]);
    for (const [lemma, pos, gender, freq] of data.slice(0, 500)) {
      expect(typeof lemma).toBe("string");
      expect(["noun", "verb", "adj", "adv", "expression", "other"]).toContain(pos);
      expect(["m", "f", "mf", "none"]).toContain(gender);
      expect(typeof freq).toBe("number");
    }
  });

  it("finds common words and slang", () => {
    expect(lex.search("se cass")[0].fr).toBe("se casser");
    expect(lex.search("thun")[0].lemma).toBe("thune");
    expect(lex.search("keuf")[0]).toMatchObject({ lemma: "keuf", pos: "noun", gender: "m" });
    expect(lex.search("chelou")[0].lemma).toBe("chelou");
    expect(lex.search("maison")[0]).toMatchObject({ lemma: "maison", gender: "f" });
  });
});

describe("loadLexique / prefixSearch", () => {
  afterEach(() => setLexiqueForTesting(null));

  it("fetches once and caches", async () => {
    const fetchImpl = vi.fn(async () => Response.json(FILE_FIXTURE));
    const a = await loadLexique(fetchImpl as unknown as typeof fetch);
    const b = await loadLexique(fetchImpl as unknown as typeof fetch);
    expect(a).toBe(b);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(prefixSearch("se cass", 1)[0].fr).toBe("se casser");
    expect(prefixSearch("s'ener", 1)[0].fr).toBe("s'énerver");
  });

  it("retries after a failed load and returns [] while not loaded", async () => {
    expect(prefixSearch("cass")).toEqual([]);
    const failing = vi.fn(async () => new Response("nope", { status: 500 }));
    await expect(loadLexique(failing as unknown as typeof fetch)).rejects.toThrow();
    const ok = vi.fn(async () => Response.json(FILE_FIXTURE));
    await expect(loadLexique(ok as unknown as typeof fetch)).resolves.toBeTruthy();
  });
});
