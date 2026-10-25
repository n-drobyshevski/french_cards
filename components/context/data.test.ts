import { describe, expect, it } from "vitest";
import { prefilledDraft } from "@/components/add/draft";
import type { LookupResponse } from "@/lib/ai/schemas";
import {
  conjugationPreview,
  contextHref,
  filterByMeaning,
  hasExample,
  historyMeta,
  meaningChips,
  nExamples,
  placeExample,
  prefillFromLookup,
  shareWidth,
  splitHit,
  splitPronoun,
  synonymColumns,
  translationLine,
} from "./data";

const KIFFER: LookupResponse = {
  found: true,
  q: "kiffer",
  direction: "fr",
  fr: "kiffer",
  pos: "verb",
  gender: "none",
  slang_level: 1,
  verlan: false,
  note: "от араб. kif",
  translations: [
    { ru: "тащиться", share: 38 },
    { ru: "нравиться", share: 27 },
    { ru: "кайфовать", share: 21 },
    { ru: "обожать", share: 14 },
  ],
  synonyms: [
    { fr: "adorer", ru: "обожать", slang_level: 0 },
    { fr: "triper", ru: "тащиться", slang_level: 1 },
    { fr: "Kiffer", ru: "тащиться", slang_level: 1 },
    { fr: "surkiffer", ru: "дико тащиться", slang_level: 2 },
    { fr: "adorer ", ru: "обожать", slang_level: 0 },
  ],
  conjugation: null,
};

const word = (examples: { fr: string; ru: string | null }[]) => ({
  example_fr: examples[0]?.fr ?? null,
  example_ru: examples[0]?.ru ?? null,
  extra_examples: examples.slice(1),
});

describe("contextHref", () => {
  it("encodes the cleaned query", () => {
    expect(contextHref("  se   casser ")).toBe("/context?q=se%20casser");
    expect(contextHref("c'est ouf")).toBe("/context?q=c'est%20ouf");
    expect(contextHref("  ")).toBe("/context");
  });
});

describe("nExamples", () => {
  it("declines", () => {
    expect(nExamples(1)).toBe("1 пример");
    expect(nExamples(3)).toBe("3 примера");
    expect(nExamples(5)).toBe("5 примеров");
    expect(nExamples(11)).toBe("11 примеров");
    expect(nExamples(22)).toBe("22 примера");
  });
});

describe("splitHit", () => {
  it("splits around the headword form", () => {
    expect(splitHit("Franchement, je kiffe trop ce son.", "kiffe")).toEqual(["Franchement, je ", "kiffe", " trop ce son."]);
  });
  it("matches regardless of case and keeps the sentence's own spelling", () => {
    expect(splitHit("Kiffe la vie, frérot.", "kiffe")).toEqual(["", "Kiffe", " la vie, frérot."]);
  });
  it("leaves the sentence whole when the form is missing", () => {
    expect(splitHit("Rien à voir.", "kiffe")).toEqual(["Rien à voir.", "", ""]);
    expect(splitHit("Rien à voir.", " ")).toEqual(["Rien à voir.", "", ""]);
  });
});

describe("meaning chips", () => {
  const examples = [{ meaning: "тащиться" }, { meaning: "тащиться" }, { meaning: "кайфовать" }, { meaning: null }];
  it("counts the examples of each sense, in the lookup's order", () => {
    expect(meaningChips(KIFFER.translations, examples).map((c) => [c.ru, c.count])).toEqual([
      ["тащиться", 2],
      ["нравиться", 0],
      ["кайфовать", 1],
      ["обожать", 0],
    ]);
  });
  it("filters, null = all", () => {
    expect(filterByMeaning(examples, null)).toHaveLength(4);
    expect(filterByMeaning(examples, "кайфовать")).toEqual([{ meaning: "кайфовать" }]);
  });
  it("sizes bars against the most frequent sense", () => {
    expect(shareWidth(38, KIFFER.translations)).toBe(100);
    expect(shareWidth(14, KIFFER.translations)).toBe(37);
    expect(shareWidth(5, [])).toBe(100);
  });
});

describe("synonymColumns", () => {
  it("puts the headword in its column, drops repeats and itself, skips empty levels", () => {
    const columns = synonymColumns({ fr: "kiffer", ru: "тащиться", slang_level: 1 }, KIFFER.synonyms);
    expect(columns.map((c) => c.level)).toEqual([0, 1, 2]);
    expect(columns[0].words.map((w) => w.fr)).toEqual(["adorer"]);
    expect(columns[1].words.map((w) => [w.fr, w.self])).toEqual([
      ["kiffer", true],
      ["triper", false],
    ]);
  });
});

describe("conjugation", () => {
  it("splits the pronoun off", () => {
    expect(splitPronoun("je kiffe")).toEqual(["je ", "kiffe"]);
    expect(splitPronoun("j'ai kiffé")).toEqual(["j'", "ai kiffé"]);
    expect(splitPronoun("j’aime")).toEqual(["j’", "aime"]);
    expect(splitPronoun("il/elle kiffe")).toEqual(["il/elle ", "kiffe"]);
    expect(splitPronoun("il/elle/on kiffe")).toEqual(["il/elle/on ", "kiffe"]);
    expect(splitPronoun("nous nous cassons")).toEqual(["nous ", "nous cassons"]);
    expect(splitPronoun("ils/elles se sont cassés")).toEqual(["ils/elles ", "se sont cassés"]);
    expect(splitPronoun("kiffe")).toEqual(["", "kiffe"]);
  });
  it("previews three présent forms", () => {
    expect(conjugationPreview(["je kiffe", "tu kiffes", "il kiffe", "nous kiffons", "vous kiffez", "ils kiffent"])).toBe("je kiffe · tu kiffes · il kiffe…");
    expect(conjugationPreview(["je kiffe"])).toBe("je kiffe");
    expect(conjugationPreview([])).toBe("");
  });
});

describe("prefill", () => {
  it("fills the add form from the lookup and the chosen example", () => {
    const p = prefillFromLookup(KIFFER, { fr: "Je kiffe trop ce son.", ru: "Обожаю этот трек." });
    expect(p).toMatchObject({ fr: "kiffer", ru: "тащиться, нравиться, кайфовать", pos: "verb", slang_level: 1, note: "от араб. kif", example_fr: "Je kiffe trop ce son." });
    expect(translationLine(KIFFER.translations, 2)).toBe("тащиться, нравиться");
  });
  it("makes a manual draft whose level and example detection leaves alone", () => {
    const d = prefilledDraft(prefillFromLookup(KIFFER, { fr: "Je kiffe.", ru: null }));
    expect(d).toMatchObject({ fr: "kiffer", source: "manual", slang_level: 1, slang_auto: true, slang_touched: true, example_fr: "Je kiffe.", example_touched: true });
    const bare = prefilledDraft({ fr: "triper", ru: "тащиться" });
    expect(bare).toMatchObject({ slang_touched: false, example_touched: false, example_fr: "", pos: "other" });
  });
});

describe("placeExample", () => {
  const ex = { fr: "Je kiffe trop ce son.", ru: "Обожаю этот трек." };
  it("appends a new sentence", () => {
    const r = placeExample(word([{ fr: "Elle kiffe.", ru: null }]), ex);
    expect(r).toEqual({ ok: true, patch: { example_fr: "Elle kiffe.", example_ru: null, extra_examples: [ex] } });
  });
  it("puts it first as the main example", () => {
    const r = placeExample(word([{ fr: "Elle kiffe.", ru: null }]), ex, { main: true });
    expect(r.ok && r.patch.example_fr).toBe(ex.fr);
    expect(r.ok && r.patch.extra_examples).toEqual([{ fr: "Elle kiffe.", ru: null }]);
  });
  it("moves a sentence the word has first, refuses to add it twice", () => {
    const w = word([{ fr: "Elle kiffe.", ru: null }, { fr: "je kiffe trop ce son.", ru: "x" }]);
    expect(hasExample(w, ex.fr)).toBe(true);
    expect(placeExample(w, ex)).toEqual({ ok: false, reason: "present" });
    const moved = placeExample(w, ex, { main: true });
    expect(moved.ok && moved.patch.example_fr).toBe("je kiffe trop ce son.");
    expect(placeExample(word([ex]), ex, { main: true })).toEqual({ ok: false, reason: "present" });
  });
  it("refuses a sixth example", () => {
    const full = word(Array.from({ length: 5 }, (_, i) => ({ fr: `Phrase ${i}.`, ru: null })));
    expect(placeExample(full, ex)).toEqual({ ok: false, reason: "full" });
    expect(placeExample(full, ex, { main: true })).toEqual({ ok: false, reason: "full" });
  });
});

describe("historyMeta", () => {
  it("says how many examples were found", () => {
    expect(historyMeta({ lookup: { found: true }, context: { examples: [1, 2, 3] } })).toBe("3 прим.");
    expect(historyMeta({ lookup: { found: true }, context: { examples: [] } })).toBe("без прим.");
    expect(historyMeta({ lookup: { found: true }, context: null })).toBe("без прим.");
    expect(historyMeta({ lookup: { found: false }, context: null })).toBe("не нашли");
  });
});
