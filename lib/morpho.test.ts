import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildIndex, morphoKey, morphoOf } from "./morpho";

const index = buildIndex(JSON.parse(readFileSync("public/lexique/fr-morpho.json", "utf8")));

describe("morphoOf", () => {
  it("splits a word into prefix, root and suffix with Russian glosses", () => {
    expect(morphoOf("incroyable", index).parts).toEqual([
      { text: "in-", kind: "prefix", gloss: "не-, без- (или в-)" },
      { text: "croire", kind: "root", gloss: null },
      { text: "-able", kind: "suffix", gloss: "можно сделать, -емый" },
    ]);
    expect(morphoOf("volontaire", index).parts?.map((p) => p.text)).toEqual(["volonté", "-aire"]);
    expect(morphoOf("volontairement", index).parts?.map((p) => p.text)).toEqual(["volontaire", "-ment"]);
  });

  it("the family: the root, its other words, and words built on this one", () => {
    const family = morphoOf("volontaire", index).family;
    expect(family).toContain("volonté");
    expect(family).toContain("involontaire");
    expect(family).toContain("volontairement");
    expect(family).not.toContain("volontaire");
    // A root word: what is built on it.
    expect(morphoOf("utile", index).family).toContain("inutile");
  });

  it("no parts for a word Lexique keeps whole", () => {
    expect(morphoOf("bagnole", index).parts).toBeNull();
  });

  it("morphoKey drops the article and «se»", () => {
    expect(morphoKey("la thune")).toBe("thune");
    expect(morphoKey("l’oseille")).toBe("oseille");
    expect(morphoKey("se casser")).toBe("casser");
  });
});
