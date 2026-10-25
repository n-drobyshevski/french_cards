import { describe, expect, it } from "vitest";
import { sourceDomain } from "./NewWordCard";
import { cardLabel, showsMeter } from "./QuestionCard";

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
    expect(cardLabel({ type: "register", skill: null, ask: null }).label).toBe("Регистр");
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
    expect(showsMeter({ type: "register", skill: null, word })).toBe(false);
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
