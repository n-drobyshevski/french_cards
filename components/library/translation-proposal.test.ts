import { describe, expect, it } from "vitest";
import { proposedTranslation } from "./translation-proposal";

describe("proposedTranslation", () => {
  it("offers the Russian of the suggestion for this very word", () => {
    const results = [
      { fr: "se casser la tête", ru: "ломать голову" },
      { fr: "se casser", ru: "свалить, сбежать" },
    ];
    expect(proposedTranslation(results, "se casser", "сломаться")).toBe("свалить, сбежать");
  });

  it("falls back to the first suggestion (the model may complete the word)", () => {
    expect(proposedTranslation([{ fr: "la thune", ru: "бабки, деньги" }], "thune", "")).toBe("бабки, деньги");
  });

  it("matches articles and case loosely", () => {
    const results = [{ fr: "un pote", ru: "кореш" }, { fr: "La Thune", ru: "бабки" }];
    expect(proposedTranslation(results, "la thune", "деньги")).toBe("бабки");
  });

  it("proposes nothing when the field already says it", () => {
    expect(proposedTranslation([{ fr: "kiffer", ru: "Тащиться,  обожать" }], "kiffer", " тащиться, обожать")).toBeNull();
  });

  it("proposes nothing without suggestions", () => {
    expect(proposedTranslation([], "kiffer", "")).toBeNull();
    expect(proposedTranslation([{ fr: "kiffer", ru: "  " }], "kiffer", "")).toBeNull();
  });
});
