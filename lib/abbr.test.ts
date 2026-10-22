import { describe, expect, it } from "vitest";
import { posAbbr } from "@/components/add/match";
import { ABBREVIATIONS, abbrEntry } from "./abbr";
import { SLANG_LABELS, type PartOfSpeech } from "./types";

describe("abbrEntry", () => {
  it("explains every abbreviation the app prints", () => {
    const pos: { pos: PartOfSpeech; gender: "m" | "f" | "mf" | "none"; fr: string }[] = [
      { pos: "noun", gender: "m", fr: "le fric" },
      { pos: "noun", gender: "f", fr: "la thune" },
      { pos: "noun", gender: "mf", fr: "pote" },
      { pos: "noun", gender: "none", fr: "truc" },
      { pos: "verb", gender: "none", fr: "kiffer" },
      { pos: "verb", gender: "none", fr: "se casser" },
      { pos: "adj", gender: "none", fr: "chelou" },
      { pos: "adv", gender: "none", fr: "grave" },
      { pos: "expression", gender: "none", fr: "laisse tomber" },
    ];
    for (const w of pos) expect(abbrEntry(posAbbr(w)!), posAbbr(w)!).not.toBeNull();
    for (const label of [...SLANG_LABELS, "verl."]) expect(abbrEntry(label), label).not.toBeNull();
  });

  it("ignores spacing and case", () => {
    expect(abbrEntry("n.m.")).toBe(abbrEntry("n. m."));
    expect(abbrEntry("V. Pron.")?.full).toBe("verbe pronominal");
    expect(abbrEntry("xyz.")).toBeNull();
    expect(ABBREVIATIONS).toContain("loc.");
  });
});
