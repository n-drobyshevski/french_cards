import { describe, expect, it } from "vitest";
import { nextDirection, parseReviewFilter, toSessionFilter } from "./filter";
import { formatPercent, formatProgress, pluralRu, posAbbr, progressRatio, queueSummary } from "./format";

describe("pluralRu", () => {
  const forms = ["слово", "слова", "слов"] as const;
  it.each([
    [1, "слово"],
    [2, "слова"],
    [4, "слова"],
    [5, "слов"],
    [11, "слов"],
    [12, "слов"],
    [14, "слов"],
    [21, "слово"],
    [22, "слова"],
    [111, "слов"],
    [0, "слов"],
  ])("%i → %s", (n, expected) => {
    expect(pluralRu(n, forms)).toBe(expected);
  });
});

describe("posAbbr", () => {
  const w = (
    fr: string,
    pos: "noun" | "verb" | "adj" | "adv" | "expression" | "other",
    gender: "m" | "f" | "mf" | "none" = "none",
  ) => ({
    fr,
    pos,
    gender,
  });
  it("reads like a dictionary entry", () => {
    expect(posAbbr(w("la thune", "noun", "f"))).toBe("n. f.");
    expect(posAbbr(w("le fric", "noun", "m"))).toBe("n. m.");
    expect(posAbbr(w("se casser", "verb"))).toBe("v. pron.");
    expect(posAbbr(w("s’énerver", "verb"))).toBe("v. pron.");
    expect(posAbbr(w("bouffer", "verb"))).toBe("v.");
    expect(posAbbr(w("chelou", "adj"))).toBe("adj.");
    expect(posAbbr(w("c'est ouf", "expression"))).toBe("expr.");
    expect(posAbbr(w("vas-y", "other"))).toBeNull();
  });
});

describe("progress", () => {
  it("pads like the mockups", () => {
    expect(formatProgress(7, 30)).toBe("07 / 30");
    expect(formatProgress(120, 130)).toBe("120 / 130");
  });

  it("clamps the ratio", () => {
    expect(progressRatio(7, 30)).toBeCloseTo(0.2333, 3);
    expect(progressRatio(0, 0)).toBe(0);
    expect(progressRatio(3, 0)).toBe(1);
  });

  it("summarises the queue", () => {
    expect(queueSummary(23, 4)).toBe("23 к повторению · 4 новых");
    expect(queueSummary(5, 1)).toBe("5 к повторению · 1 новая");
    expect(queueSummary(0, 11)).toBe("11 новых");
    expect(queueSummary(0, 0)).toBe("0 к повторению");
  });

  it("formats the correct rate", () => {
    expect(formatPercent(0.92)).toBe("92 %");
    expect(formatPercent(null)).toBe("—");
  });
});

describe("review filter", () => {
  it("cycles FR → RU, RU → FR, both", () => {
    expect(nextDirection("fr_ru")).toBe("ru_fr");
    expect(nextDirection("ru_fr")).toBe("both");
    expect(nextDirection("both")).toBe("fr_ru");
  });

  it("maps to a session filter", () => {
    expect(toSessionFilter("both", "all")).toEqual({ direction: undefined, folderId: undefined });
    expect(toSessionFilter("ru_fr", "inbox")).toEqual({ direction: "ru_fr", folderId: null });
    expect(toSessionFilter("fr_ru", "abc")).toEqual({ direction: "fr_ru", folderId: "abc" });
  });

  it("parses stored values defensively", () => {
    expect(parseReviewFilter(JSON.stringify({ direction: "both", folder: "inbox" }))).toEqual({
      direction: "both",
      folder: "inbox",
    });
    expect(parseReviewFilter(JSON.stringify({ direction: "sideways", folder: 3 }))).toEqual({ direction: null, folder: "all" });
    expect(parseReviewFilter("{oops")).toEqual({ direction: null, folder: "all" });
    expect(parseReviewFilter(null)).toEqual({ direction: null, folder: "all" });
  });
});
