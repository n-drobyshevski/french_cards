import { describe, expect, it } from "vitest";
import { activePairRow } from "./MatchPairs";
import { sourceDomain } from "./NewWordCard";
import { cardLabel, explainParts, showsMeter, stampPlace } from "./QuestionCard";

const word = { fr: "relou", ru: "надоедливый", pos: "adj" as const, gender: "none" as const, slang_level: 1 as const, verlan: true, example_fr: null, example_ru: null };

describe("cardLabel", () => {
  it("names the skill and the direction", () => {
    expect(cardLabel({ type: "choice", skill: "meaning", ask: "fr" })).toEqual({ label: "Значение", detail: "FR → RU" });
    expect(cardLabel({ type: "choice", skill: "meaning", ask: "ru" })).toEqual({ label: "Значение", detail: "RU → FR" });
    expect(cardLabel({ type: "choice", skill: "form", ask: null })).toEqual({ label: "Форма", detail: "RU → FR" });
    expect(cardLabel({ type: "choice", skill: "situation", ask: null })).toEqual({ label: "Ситуация", detail: "RU → FR" });
    expect(cardLabel({ type: "choice", skill: "verlan", ask: null })).toEqual({ label: "Верлан", detail: null });
    expect(cardLabel({ type: "choice", skill: null, ask: null }).label).toBe("Значение");
    expect(cardLabel({ type: "cloze", skill: null, ask: null }).label).toBe("Пропуск");
    expect(cardLabel({ type: "pairs", skill: null, ask: null }).label).toBe("Пары");
    expect(cardLabel({ type: "conjugate", skill: null, ask: null, tense: "passe_compose" })).toEqual({ label: "Спряжение", detail: "Passé composé" });
    expect(cardLabel({ type: "conjugate", skill: null, ask: null, tense: null })).toEqual({ label: "Спряжение", detail: null });
  });
});

describe("showsMeter", () => {
  it("shows the level only where it gives nothing away", () => {
    expect(showsMeter({ type: "choice", skill: "meaning", word })).toBe(true);
    expect(showsMeter({ type: "choice", skill: "verlan", word })).toBe(true);
    expect(showsMeter({ type: "choice", skill: "situation", word })).toBe(false);
    expect(showsMeter({ type: "choice", skill: "neutral", word })).toBe(false);
    expect(showsMeter({ type: "cloze", skill: null, word })).toBe(false);
    expect(showsMeter({ type: "choice", skill: "meaning", word: null })).toBe(false);
  });
});

describe("sourceDomain", () => {
  it("keeps the host without www", () => {
    expect(sourceDomain("https://www.lalanguefrancaise.com/dictionnaire/flemme")).toBe("lalanguefrancaise.com");
    expect(sourceDomain("not a url")).toBeNull();
    expect(sourceDomain(null)).toBeNull();
  });
});

describe("stampPlace (phones, X-Player-B)", () => {
  const choice = (prompt: string) => ({ type: "choice" as const, prompt, word: null, sentence: null });
  it("lands beside a short headword, else over the header", () => {
    expect(stampPlace(choice("les flics"))).toBe("line1");
    expect(stampPlace(choice("avoir la flemme"))).toBe("head");
    expect(stampPlace(choice("копы"))).toBe("line1");
    expect(stampPlace(choice("Друг спрашивает, кто приехал. Что ответить?"))).toBe("head");
    expect(stampPlace({ type: "conjugate", prompt: "se casser", word: null, sentence: "je me [[suis cassé]]" })).toBe("line1");
    expect(stampPlace({ type: "pairs", prompt: null, word: null, sentence: null })).toBe("head");
  });
  it("takes a two-line cloze sentence's short second line", () => {
    expect(stampPlace({ type: "cloze", prompt: null, word: null, sentence: "Allez, [[vas-y]], on t'attend !" })).toBe("line2");
    expect(stampPlace({ type: "cloze", prompt: null, word: null, sentence: "Il a pris la [[flemme]] de venir hier soir avec nous." })).toBe("head");
  });
});

describe("explainParts", () => {
  it("splits the French term off a «term — gloss» explanation", () => {
    expect(explainParts("flic — разговорное «полицейский»")).toEqual({ term: "flic", rest: "разговорное «полицейский»" });
    expect(explainParts("возвратные глаголы — с être")).toEqual({ term: null, rest: "возвратные глаголы — с être" });
    expect(explainParts("так говорят друзья")).toEqual({ term: null, rest: "так говорят друзья" });
  });
});

describe("activePairRow", () => {
  const board = { fr: ["a", "b", "c"].map((key) => ({ key, fr: key, ru: key })) };
  it("is the row picked, else the first open one in order", () => {
    expect(activePairRow(board, { selected: null, matched: [] })).toBe("a");
    expect(activePairRow(board, { selected: null, matched: ["a"] })).toBe("b");
    expect(activePairRow(board, { selected: "c", matched: ["a"] })).toBe("c");
    expect(activePairRow(board, { selected: null, matched: ["a", "b", "c"] })).toBeNull();
  });
});
