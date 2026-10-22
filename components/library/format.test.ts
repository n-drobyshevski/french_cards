import { describe, expect, it } from "vitest";
import { newReviewState } from "@/lib/scheduler";
import type { ReviewState } from "@/lib/types";
import { folderHref, formatDate, nWords, plural, posAbbr, reviewHref, wordSchedule } from "./format";
import { matchesSlang, slangChipLabel } from "./SlangFilter";

const NOW = new Date("2026-10-21T10:00:00.000Z");
const DAY = 86_400_000;

const reviewed = (patch: Partial<ReviewState>): ReviewState => ({
  ...newReviewState("w", "fr_ru", NOW),
  state: 2,
  stability: 9,
  reps: 3,
  last_review: new Date(NOW.getTime() - 5 * DAY).toISOString(),
  ...patch,
});

describe("plural", () => {
  it("picks the Russian form", () => {
    const forms = ["слово", "слова", "слов"] as const;
    expect([1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 101, 111, 0].map((n) => plural(n, forms))).toEqual([
      "слово", "слова", "слова", "слов", "слов", "слов", "слов", "слово", "слова", "слов", "слово", "слов", "слов",
    ]);
    expect(nWords(158)).toBe("158 слов");
    expect(nWords(1)).toBe("1 слово");
  });
});

describe("posAbbr", () => {
  it("reads like a dictionary entry", () => {
    expect(posAbbr({ pos: "noun", gender: "f", fr: "la thune" })).toBe("n. f.");
    expect(posAbbr({ pos: "noun", gender: "m", fr: "le fric" })).toBe("n. m.");
    expect(posAbbr({ pos: "verb", gender: "none", fr: "se casser" })).toBe("v. pron.");
    expect(posAbbr({ pos: "verb", gender: "none", fr: "s'énerver" })).toBe("v. pron.");
    expect(posAbbr({ pos: "verb", gender: "none", fr: "raquer" })).toBe("v.");
    expect(posAbbr({ pos: "expression", gender: "none", fr: "c'est ouf" })).toBe("loc.");
    expect(posAbbr({ pos: "other", gender: "none", fr: "vas-y" })).toBeNull();
  });
});

describe("wordSchedule", () => {
  it("marks never-reviewed words as new", () => {
    const s = wordSchedule([newReviewState("w", "fr_ru", NOW), newReviewState("w", "ru_fr", NOW)], NOW);
    expect(s).toMatchObject({ status: "new", dueLabel: "новое", tone: "new", due: false });
  });

  it("shows «к повт.» when a reviewed card is due today", () => {
    const s = wordSchedule([reviewed({ due: new Date(NOW.getTime() - DAY).toISOString() })], NOW);
    expect(s).toMatchObject({ dueLabel: "к повт.", tone: "due", due: true });
  });

  it("shows the nearest next review otherwise", () => {
    const s = wordSchedule(
      [
        reviewed({ due: new Date(NOW.getTime() + 6 * DAY).toISOString() }),
        reviewed({ direction: "ru_fr", due: new Date(NOW.getTime() + 12 * DAY).toISOString() }),
      ],
      NOW,
    );
    expect(s).toMatchObject({ dueLabel: "через 6 д", tone: "later", status: "learning" });
  });

  it("flags difficult words", () => {
    const s = wordSchedule([reviewed({ lapses: 3, due: new Date(NOW.getTime() + 2 * DAY).toISOString() })], NOW);
    expect(s.status).toBe("difficult");
  });
});

describe("slang filter", () => {
  it("ORs levels and requires verlan when picked", () => {
    expect(matchesSlang({ slang_level: 2, verlan: false }, [])).toBe(true);
    expect(matchesSlang({ slang_level: 2, verlan: false }, [1, 2])).toBe(true);
    expect(matchesSlang({ slang_level: 0, verlan: false }, [1, 2])).toBe(false);
    expect(matchesSlang({ slang_level: 1, verlan: true }, ["verl"])).toBe(true);
    expect(matchesSlang({ slang_level: 1, verlan: false }, ["verl"])).toBe(false);
    expect(matchesSlang({ slang_level: 2, verlan: true }, [1, "verl"])).toBe(false);
  });

  it("labels the chip", () => {
    expect(slangChipLabel([])).toBe("Сленг");
    expect(slangChipLabel([2])).toBe("Сленг: arg.");
    expect(slangChipLabel(["verl"])).toBe("Сленг: verl.");
    expect(slangChipLabel([1, 3])).toBe("Сленг: 2");
  });
});

describe("paths and dates", () => {
  it("builds links", () => {
    expect(folderHref(null)).toBe("/library/inbox");
    expect(folderHref("abc")).toBe("/library/abc");
    expect(reviewHref(null)).toBe("/?folder=inbox");
    expect(reviewHref("abc")).toBe("/?folder=abc");
  });

  it("formats dates as dd.mm.yyyy", () => {
    expect(formatDate(new Date(2026, 8, 12, 15).toISOString())).toBe("12.09.2026");
  });
});
