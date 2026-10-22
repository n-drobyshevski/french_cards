import { describe, expect, it } from "vitest";
import { domainOf, finalizeContext, finalizeLookup, findHit, normalizeShares, snippetsFromSources, textKey, usesHeadword, type WebSource } from "./context";
import type { ContextModel, LookupModel } from "./schemas";

const lookupModel = (extra: Partial<LookupModel> = {}): LookupModel => ({
  found: true,
  fr: " kiffer ",
  pos: "verb",
  gender: "m",
  slang_level: "fam",
  verlan: false,
  note: null,
  origin: " от арабского kif ",
  translations: [
    { ru: "тащиться, кайфовать", share: 40 },
    { ru: "нравиться", share: 30 },
    { ru: "Нравиться", share: 10 },
    { ru: "обожать", share: 0 },
  ],
  synonyms: [
    { fr: "adorer", ru: "обожать", slang_level: "neutral" },
    { fr: "kiffer", ru: "тащиться", slang_level: "fam" },
    { fr: "surkiffer", ru: "дико тащиться", slang_level: "arg" },
    { fr: "", ru: "x", slang_level: "fam" },
  ],
  ...extra,
});

describe("finalizeLookup", () => {
  it("cleans, de-duplicates and scales shares to 100", () => {
    const r = finalizeLookup(lookupModel(), "kiffer");
    expect(r).toMatchObject({ found: true, q: "kiffer", direction: "fr", fr: "kiffer", pos: "verb", gender: "none", slang_level: 1, origin: "от арабского kif" });
    expect(r.translations.map((t) => t.ru)).toEqual(["тащиться, кайфовать", "нравиться", "обожать"]);
    expect(r.translations.reduce((a, t) => a + t.share, 0)).toBe(100);
    expect(r.translations.every((t) => t.share >= 1)).toBe(true);
    expect(r.synonyms.map((s) => [s.fr, s.slang_level])).toEqual([
      ["adorer", 0],
      ["surkiffer", 2],
    ]);
    // Built on the device from Lexique, never by the model.
    expect(r.conjugation).toBeNull();
  });

  it("not found: empty entry, Russian direction kept", () => {
    const r = finalizeLookup(lookupModel({ found: false }), "фывап");
    expect(r).toMatchObject({ found: false, direction: "ru", translations: [], synonyms: [], conjugation: null });
  });
});

describe("normalizeShares", () => {
  it("adds up to 100 with at least 1 each", () => {
    expect(normalizeShares([1, 1, 1])).toEqual([34, 33, 33]);
    expect(normalizeShares([0, 0])).toEqual([50, 50]);
    expect(normalizeShares([99, 0.1])).toEqual([99, 1]);
    expect(normalizeShares([])).toEqual([]);
  });
});

const source = (url: string, citedText?: string, title = "Page"): WebSource => ({
  sourceType: "url",
  url,
  title,
  providerMetadata: citedText === undefined ? undefined : { anthropic: { citedText } },
});

describe("snippetsFromSources", () => {
  it("numbers distinct cited snippets and counts pages", () => {
    const { snippets, pages } = snippetsFromSources([
      source("https://www.forum.exemple.fr/t/1", "Franchement je kiffe trop ce son."),
      source("https://www.forum.exemple.fr/t/1", "Franchement, je KIFFE trop ce son !"),
      source("https://paroles.exemple.fr/x"),
      source("javascript:alert(1)", "Je kiffe le code."),
      source("https://paroles.exemple.fr/y", "Kiffe la vie frérot"),
    ]);
    expect(pages).toBe(3);
    expect(snippets.map((s) => [s.n, s.domain, s.text])).toEqual([
      [1, "forum.exemple.fr", "Franchement je kiffe trop ce son."],
      [2, "paroles.exemple.fr", "Kiffe la vie frérot"],
    ]);
  });
});

describe("finalizeContext", () => {
  const { snippets, pages } = snippetsFromSources([
    source("https://forum.exemple.fr/t/1", "Vos sons du moment : Franchement je kiffe trop ce son, je l'écoute en boucle."),
    source("https://dico.exemple.fr/kiffer", "Kiffer : verbe transitif, aimer beaucoup."),
    source("https://paroles.exemple.fr/y", "Kiffe la vie frérot, demain c'est pas sûr"),
  ]);
  const pick = (examples: ContextModel["examples"]) =>
    finalizeContext({ examples }, snippets, { fr: "kiffer", meanings: ["тащиться, кайфовать", "нравиться"] }, pages);
  const ex = (extra: Partial<ContextModel["examples"][number]>) => ({
    snippet: 1,
    fr: "Franchement je kiffe trop ce son, je l'écoute en boucle.",
    hit: "kiffe",
    ru: "Честно, я тащусь от этого трека.",
    meaning: "Тащиться, кайфовать",
    kind: "forum" as const,
    ...extra,
  });

  it("keeps a verbatim sentence with its page's link and the listed meaning", () => {
    const r = pick([ex({})]);
    expect(r.sources).toBe(3);
    expect(r.examples).toEqual([
      {
        fr: "Franchement je kiffe trop ce son, je l'écoute en boucle.",
        ru: "Честно, я тащусь от этого трека.",
        hit: "kiffe",
        meaning: "тащиться, кайфовать",
        kind: "forum",
        url: "https://forum.exemple.fr/t/1",
        domain: "forum.exemple.fr",
        title: "Page",
      },
    ]);
  });

  it("drops rewritten sentences, wrong snippets, missing hits and repeats", () => {
    const r = pick([
      ex({ fr: "Franchement je kiffe grave ce son." }), // not in the snippet
      ex({ snippet: 3 }), // in another snippet
      ex({ snippet: 9 }), // no such snippet
      ex({ hit: "adore" }), // hit not in the sentence
      ex({ ru: " " }),
      ex({ snippet: 3, fr: "Kiffe la vie frérot, demain c'est pas sûr", hit: "Kiffe", meaning: "обожать", kind: "song" }),
      ex({ snippet: 3, fr: "kiffe la vie frérot demain c'est pas sûr", hit: "kiffe" }), // repeat
    ]);
    expect(r.examples).toHaveLength(1);
    expect(r.examples[0]).toMatchObject({ hit: "Kiffe", meaning: null, kind: "song", domain: "paroles.exemple.fr" });
  });

  it("punctuation and accents in the copy do not matter, the headword must be there", () => {
    expect(pick([ex({ fr: "Franchement, je kiffe trop ce son – je l’ecoute en boucle" })]).examples).toHaveLength(1);
    expect(
      finalizeContext(
        { examples: [{ snippet: 2, fr: "verbe transitif, aimer beaucoup.", hit: "aimer", ru: "x", meaning: null, kind: "other" }] },
        snippets,
        { fr: "kiffer", meanings: [] },
        pages,
      ).examples,
    ).toEqual([]);
  });
});

describe("helpers", () => {
  it("textKey folds case, accents and punctuation", () => {
    expect(textKey("  L’été, c’est ÇA !")).toBe("l ete c est ca");
  });

  it("findHit returns the spelling inside the sentence", () => {
    expect(findHit("Kiffe la vie", "kiffe")).toBe("Kiffe");
    expect(findHit("Kiffe la vie", "adore")).toBeNull();
    expect(findHit("Kiffe la vie", "")).toBeNull();
  });

  it("usesHeadword by stem, short irregular verbs by hit", () => {
    expect(usesHeadword("Il s'est cassé la tête", "s'est cassé", "se casser la tête")).toBe(true);
    expect(usesHeadword("Je vais au ciné", "vais", "aller")).toBe(true);
    expect(usesHeadword("Il est parti", "parti", "se barrer")).toBe(false);
  });

  it("domainOf keeps http(s) only and drops www.", () => {
    expect(domainOf("https://www.lemonde.fr/a")).toBe("lemonde.fr");
    expect(domainOf("ftp://x.fr")).toBeNull();
    expect(domainOf("nope")).toBeNull();
  });
});
