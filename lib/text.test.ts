import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { compareFr, findDuplicate, findDuplicates, foldAccents, frSortKey, matchesSearch, normalizeLemma, searchKey, slugify } from "./text";
import { addWord, softDeleteWord } from "./words";

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("foldAccents / searchKey", () => {
  it("strips Latin diacritics and ligatures", () => {
    expect(foldAccents("Être fauché à la plage, ça coûte")).toBe("Etre fauche a la plage, ca coute");
    expect(foldAccents("cœur, Œuvre, ex æquo, naïf")).toBe("coeur, OEuvre, ex aequo, naif");
  });

  it("folds ё but keeps й", () => {
    expect(foldAccents("ещё мой")).toBe("еще мой");
    expect(foldAccents("Ёлка")).toBe("Елка");
  });

  it("handles decomposed input", () => {
    expect(foldAccents("été")).toBe("ete");
  });

  it("searchKey lowercases, unifies apostrophes and collapses spaces", () => {
    expect(searchKey("  C’est   OUF  ")).toBe("c'est ouf");
    expect(searchKey("Ça va")).toBe("ca va");
  });

  it("matchesSearch looks at fr, ru, note and tags ignoring accents", () => {
    const w = { fr: "être fauché", ru: "быть на мели", note: "Синоним: raide", tags: ["argent"] };
    expect(matchesSearch(w, "fauche")).toBe(true);
    expect(matchesSearch(w, "ETRE")).toBe(true);
    expect(matchesSearch(w, "мели")).toBe(true);
    expect(matchesSearch(w, "raide")).toBe(true);
    expect(matchesSearch(w, "argent")).toBe(true);
    expect(matchesSearch(w, "fauche мели")).toBe(true);
    expect(matchesSearch(w, "fauche кошка")).toBe(false);
    expect(matchesSearch(w, "   ")).toBe(true);
  });
});

describe("normalizeLemma", () => {
  it.each([
    ["la thune", "thune"],
    ["La  Thune", "thune"],
    ["le fric", "fric"],
    ["les keufs", "keufs"],
    ["un pote", "pote"],
    ["une blague", "blague"],
    ["des sous", "sous"],
    ["l'oseille", "oseille"],
    ["L’oseille", "oseille"],
    ["l' oseille", "oseille"],
    ["Qu'est-ce qui se passe ?", "qu'est-ce qui se passe"],
    ["vas-y !", "vas-y"],
    ["se casser", "se casser"],
    ["là-bas", "là-bas"],
    ["la", "la"],
    ["lequel", "lequel"],
    ["unique", "unique"],
  ])("%s → %s", (input, out) => {
    expect(normalizeLemma(input)).toBe(out);
  });

  it("keeps accents and normalizes to NFC", () => {
    expect(normalizeLemma("pâte")).not.toBe(normalizeLemma("pate"));
    expect(normalizeLemma("été")).toBe("été");
  });
});

describe("frSortKey / compareFr", () => {
  it("drops a leading article or «se» and folds accents", () => {
    expect(frSortKey("la thune")).toBe("thune");
    expect(frSortKey("l’oseille")).toBe("oseille");
    expect(frSortKey("les keufs")).toBe("keufs");
    expect(frSortKey("se casser")).toBe("casser");
    expect(frSortKey("s'en foutre")).toBe("en foutre");
    expect(frSortKey("Dépêche-toi")).toBe("depeche-toi");
    expect(frSortKey("la")).toBe("la");
    expect(frSortKey("lequel")).toBe("lequel");
  });

  it("orders entries like a dictionary", () => {
    const words = ["vas-y", "la thune", "une blague", "se casser", "bouffer", "chelou", "dépêche-toi", "les flics", "le fric"];
    expect([...words].sort(compareFr)).toEqual([
      "une blague",
      "bouffer",
      "se casser",
      "chelou",
      "dépêche-toi",
      "les flics",
      "le fric",
      "la thune",
      "vas-y",
    ]);
  });
});

describe("slugify", () => {
  it("transliterates Russian and folds French", () => {
    expect(slugify("Повседневное")).toBe("povsednevnoe");
    expect(slugify("Деньги")).toBe("dengi");
    expect(slugify("Уход / побег")).toBe("uhod-pobeg");
    expect(slugify("Café & Bar")).toBe("cafe-bar");
    expect(slugify("  ")).toBe("");
  });
});

describe("findDuplicate", () => {
  it("matches across articles and case, ignoring deleted words and excludeId", async () => {
    const thune = await addWord({ fr: "la thune", ru: "бабки" });
    expect((await findDuplicate("Thune"))?.id).toBe(thune.id);
    expect((await findDuplicate("une thune"))?.id).toBe(thune.id);
    expect(await findDuplicate("thunes")).toBeUndefined();
    expect(await findDuplicate("la thune", { excludeId: thune.id })).toBeUndefined();
    await softDeleteWord(thune.id);
    expect(await findDuplicate("la thune")).toBeUndefined();
    expect(await findDuplicate("   ")).toBeUndefined();
  });

  it("findDuplicates maps each input to its existing word", async () => {
    const fric = await addWord({ fr: "le fric", ru: "бабло" });
    const pote = await addWord({ fr: "un pote", ru: "кореш" });
    const map = await findDuplicates(["fric", "Pote", "chelou"]);
    expect(map.get("fric")?.id).toBe(fric.id);
    expect(map.get("Pote")?.id).toBe(pote.id);
    expect(map.has("chelou")).toBe(false);
  });
});
