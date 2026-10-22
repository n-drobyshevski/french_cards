import { describe, expect, it } from "vitest";
import { assignUserPrompt, enrichUserPrompt, estimateTokens, extractUserPrompt, suggestUserPrompt, SYSTEM_PROMPTS, taxonomyUserPrompt } from "./prompts";

describe("system prompts", () => {
  for (const [name, text] of Object.entries(SYSTEM_PROMPTS)) {
    it(`${name}: long enough to be cached (≥600 tokens)`, () => {
      expect(estimateTokens(text)).toBeGreaterThanOrEqual(600);
      // Conservative check that does not depend on the Cyrillic weighting.
      expect(text.length / 4).toBeGreaterThanOrEqual(600);
    });

    it(`${name}: frozen text with the slang rubric`, () => {
      expect(text).not.toMatch(/\$\{|undefined|\[object Object\]|\bNaN\b/);
      expect(text).toContain("neutral (нейтр.)");
      expect(text).toContain("vulg (vulg.)");
      expect(text).toContain("VERLAN");
    });
  }

  it("suggest few-shots cover argot, verlan, vulgar, neutral and Russian input", () => {
    const s = SYSTEM_PROMPTS.suggest;
    expect(s).toContain("slang_level arg");
    expect(s).toContain("verlan true");
    expect(s).toContain("slang_level vulg");
    expect(s).toContain("slang_level neutral");
    expect(s).toContain("Input ru");
  });

  it("never mentions the product UI terms the app must not show", () => {
    for (const text of Object.values(SYSTEM_PROMPTS)) expect(text).not.toMatch(/ИИ|✨/);
  });
});

describe("user prompts", () => {
  const folders = [
    { slug: "dengi", name: "Деньги", description: "Деньги и работа" },
    { slug: "eda", name: "Еда", description: null },
  ];

  it("suggest: lists themes and the query on one line", () => {
    const p = suggestUserPrompt({ q: "se\ncass", direction: "fr", folders });
    expect(p).toContain("- dengi: Деньги — Деньги и работа");
    expect(p).toContain("- eda: Еда");
    expect(p).toContain("<input>se cass</input>");
    expect(suggestUserPrompt({ q: "деньги", direction: "ru", folders: [] })).toContain("Russian");
  });

  it("extract/taxonomy/assign include their inputs", () => {
    expect(extractUserPrompt({ imageCount: 3, folders })).toContain("3 images");
    const t = taxonomyUserPrompt({
      folders: [{ ...folders[0], locked: true, created_by: "auto" }],
      words: [{ ref: "w1", fr: "la thune", ru: "бабки", folder: null }],
    });
    expect(t).toContain("dengi [locked]");
    expect(t).toContain("w1\tla thune\tбабки\t-");
    const a = assignUserPrompt({ folders, examples: [{ fr: "le fric", ru: "деньги", folder: "dengi" }], words: [{ ref: "w1", fr: "raquer", ru: "платить", note: null }] });
    expect(a).toContain("le fric — деньги → dengi");
    expect(a).toContain("w1\traquer\tплатить");
    const e = enrichUserPrompt({ words: [{ ref: "w1", fr: "la\ncaisse", ru: "тачка", note: null }, { ref: "w2", fr: "chelou", ru: "стрёмный", note: "верлан" }] });
    expect(e).toContain("Cards (2)");
    expect(e).toContain("w1\tla caisse\tтачка\t");
    expect(e).toContain("w2\tchelou\tстрёмный\tверлан");
  });
});
