import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PartOfSpeech, SlangLevel } from "../types";
import {
  CEFR_LEVELS,
  cleanLevelText,
  createCefrData,
  createLevelResolver,
  effectiveLevel,
  estimateLevel,
  freqBand,
  levelKey,
  levelKeys,
  levelLabel,
  levelSortKey,
  storedLevel,
  type CefrFile,
  type LevelWord,
} from "./level";

const word = (fr: string, pos: PartOfSpeech = "noun", extra: Partial<LevelWord> = {}): LevelWord => ({
  fr,
  pos,
  slang_level: 0 as SlangLevel,
  verlan: false,
  ...extra,
});

/** A1 … C2 lists, as the build script writes them. */
const file = (beacco: string[][], crf: string[][] = []): CefrFile => ({
  v: 1,
  beacco: CEFR_LEVELS.map((_, i) => (beacco[i] ?? []).join("|")),
  crf: CEFR_LEVELS.map((_, i) => (crf[i] ?? []).join("|")),
});

const DATA = createCefrData(
  file(
    [
      ["tromper", "ami", "beau", "marcher", "tenir", "aujourd'hui~r", "aller"],
      ["logement", "hésiter", "moquer"],
      ["annonce", "flic"],
      ["démarche", "aujourd'hui~n", "chef-d'oeuvre"],
    ],
    [["avoir besoin", "en moyenne"], ["par rapport"], ["titre de séjour"], ["au fur et à mesure"]],
  ),
);

describe("levelKey", () => {
  it("strips articles, se / s', glosses, gender markers, placeholders and a trailing à / de", () => {
    expect(levelKey("se tromper")).toBe("tromper");
    expect(levelKey("s'en aller")).toBe("aller");
    expect(levelKey("l'annonce (f)")).toBe("annonce");
    expect(levelKey("l’enjeu (m)")).toBe("enjeu");
    expect(levelKey("le logement")).toBe("logement");
    expect(levelKey("une blague")).toBe("blague");
    expect(levelKey("de l'argent")).toBe("argent");
    expect(levelKey("marcher (fonctionner)")).toBe("marcher");
    expect(levelKey("tenir à (qqn)")).toBe("tenir");
    expect(levelKey("tenir à qqn")).toBe("tenir");
    expect(levelKey("se moquer de qqch")).toBe("moquer");
    expect(levelKey("un(e) ami(e)")).toBe("ami");
    expect(levelKey("beau, belle")).toBe("beau");
    expect(levelKey("le titre de séjour")).toBe("titre de séjour");
    expect(levelKey("Qu'est-ce que tu fais ?")).toBe("qu'est-ce que tu fais");
  });

  it("writes text as FLELex does: œ → oe, no spaces around - and ', accents kept", () => {
    expect(cleanLevelText("Chef - d' Œuvre")).toBe("chef-d'oeuvre");
    expect(levelKey("le chef-d’œuvre")).toBe("chef-d'oeuvre");
    expect(levelKey("sûr")).not.toBe(levelKey("sur"));
  });

  it("lists the lemma first, the text as written last, the singular after a plural article", () => {
    expect(levelKeys("avoir besoin de")).toEqual(["avoir besoin", "avoir besoin de"]);
    expect(levelKeys("se casser la tête")).toEqual(["casser la tête", "se casser la tête"]);
    expect(levelKeys("les flics")).toEqual(["flics", "les flics", "flic"]);
    expect(levelKeys("  ")).toEqual([]);
  });
});

describe("estimateLevel", () => {
  it("uses FLELex-Beacco on the lemma, by part of speech, else the lowest level", () => {
    expect(estimateLevel(word("se tromper", "verb"), DATA)).toEqual({ level: "A1", source: "flelex", estimated: true });
    expect(estimateLevel(word("la démarche"), DATA)?.level).toBe("B2");
    expect(estimateLevel(word("aujourd'hui", "adv"), DATA)?.level).toBe("A1");
    expect(estimateLevel(word("aujourd'hui", "noun"), DATA)?.level).toBe("B2");
    expect(estimateLevel(word("aujourd'hui", "expression"), DATA)?.level).toBe("A1");
    expect(estimateLevel(word("les flics"), DATA)?.level).toBe("B1");
  });

  it("matches CRF expressions exactly, after the same normalisation", () => {
    expect(estimateLevel(word("le titre de séjour", "expression"), DATA)?.level).toBe("B1");
    expect(estimateLevel(word("avoir besoin de", "expression"), DATA)?.level).toBe("A1");
    expect(estimateLevel(word("par rapport à", "expression"), DATA)?.level).toBe("A2");
    // No content-word guessing: «avoir la flemme» is not «avoir».
    const avoir = createLevelResolver(DATA, (key) => (key === "avoir" ? { rank: 5, freq: 900 } : null));
    expect(avoir.level(word("avoir la flemme", "expression"))).toBeNull();
  });

  it("prefers a FLELex hit to the frequency band", () => {
    expect(estimateLevel(word("la démarche"), DATA, { rank: 100, freq: 300 })).toMatchObject({ level: "B2", source: "flelex" });
    expect(estimateLevel(word("le bail"), DATA, { rank: 5000, freq: 7 })).toEqual({ level: "B2", source: "freq", estimated: true });
    expect(estimateLevel(word("le bail"), null, { rank: 5000, freq: 7 })?.level).toBe("B2");
    expect(estimateLevel(word("le bail"), DATA)).toBeNull();
  });

  it("bands the frequency rank at 800 / 2000 / 4000 / 7000 / 12000", () => {
    const at = (rank: number) => freqBand(rank);
    expect([1, 800, 801, 2000, 2001, 4000, 4001, 7000, 7001, 12000, 12001, 25000].map(at)).toEqual([
      "A1", "A1", "A2", "A2", "B1", "B1", "B2", "B2", "C1", "C1", "C2", "C2",
    ]);
  });

  it("ignores the made-up frequency of the curated slang lemmas", () => {
    expect(estimateLevel(word("kiffer", "verb"), null, { rank: 6800, freq: 3 })).toBeNull();
    expect(estimateLevel(word("kiffer", "verb"), null, { rank: 6800, freq: 3.01 })?.level).toBe("B2");
  });

  it("gives argot, vulgar words and verlan no estimate", () => {
    const lex = { rank: 300, freq: 200 };
    expect(estimateLevel(word("flic", "noun", { slang_level: 2 }), DATA, lex)).toBeNull();
    expect(estimateLevel(word("flic", "noun", { slang_level: 3 }), DATA, lex)).toBeNull();
    expect(estimateLevel(word("relou", "adj", { slang_level: 1, verlan: true }), DATA, lex)).toBeNull();
    expect(estimateLevel(word("flic", "noun", { slang_level: 1 }), DATA, lex)?.level).toBe("B1");
  });
});

describe("effectiveLevel", () => {
  it("lets a stored level win; only the user's own is not ≈", () => {
    const user = word("la démarche", "noun", { cefr: "C1", cefr_source: "user" });
    expect(effectiveLevel(user, DATA)).toEqual({ level: "C1", source: "user", estimated: false });
    const chat = word("la démarche", "noun", { cefr: "B1", cefr_source: "chat" });
    expect(effectiveLevel(chat, DATA)).toEqual({ level: "B1", source: "chat", estimated: true });
    // A stored level beats the slang rule too (Claude may level argot).
    const argot = word("taf", "noun", { slang_level: 2, cefr: "B2", cefr_source: "ai" });
    expect(effectiveLevel(argot, DATA)).toEqual({ level: "B2", source: "ai", estimated: true });
  });

  it("reads older rows without the fields, and treats junk as missing", () => {
    expect(effectiveLevel(word("la démarche"), DATA)?.source).toBe("flelex");
    const junk = { ...word("la démarche"), cefr: "D9" } as unknown as LevelWord;
    expect(effectiveLevel(junk, DATA)?.source).toBe("flelex");
    expect(storedLevel({ cefr: "A2", cefr_source: null })).toEqual({ level: "A2", source: "user", estimated: false });
    expect(storedLevel({ cefr: null, cefr_source: "user" })).toBeNull();
  });

  it("labels with ≈ unless the user set it", () => {
    expect(levelLabel({ level: "B1", source: "flelex", estimated: true })).toBe("≈B1");
    expect(levelLabel({ level: "B1", source: "user", estimated: false })).toBe("B1");
  });
});

describe("levelSortKey", () => {
  const plain = { slang_level: 0 as SlangLevel, verlan: false };
  const info = (level: (typeof CEFR_LEVELS)[number]) => ({ level, source: "flelex" as const, estimated: true });

  it("orders up to the target by level, then no level, then above the target", () => {
    expect(levelSortKey(info("A1"), plain)).toBe(0);
    expect(levelSortKey(info("B2"), plain)).toBe(3);
    expect(levelSortKey(null, plain)).toBe(5);
    expect(levelSortKey(info("C1"), plain)).toBe(14);
    expect(levelSortKey(info("C2"), plain)).toBe(15);
    expect(levelSortKey(info("B2"), plain, "B1")).toBe(13);
  });

  it("adds the register weight", () => {
    expect(levelSortKey(info("A2"), { slang_level: 1, verlan: false })).toBe(1.5);
    expect(levelSortKey(null, { slang_level: 2, verlan: true })).toBe(8);
    expect(levelSortKey(null, { slang_level: 3, verlan: false })).toBe(8);
  });
});

describe("createLevelResolver", () => {
  const lookup = (key: string) => (key === "bail" ? { rank: 5000, freq: 7 } : key === "flic" ? { rank: 3000, freq: 14 } : null);

  it("chains stored, FLELex and frequency, and gives the Lexique frequency", () => {
    const r = createLevelResolver(DATA, lookup);
    expect(r.ready).toBe(true);
    expect(r.level(word("le bail"))).toEqual({ level: "B2", source: "freq", estimated: true });
    expect(r.freq(word("le bail"))).toBe(7);
    expect(r.freq(word("les flics"))).toBe(14);
    expect(r.level(word("la démarche"))?.source).toBe("flelex");
    expect(r.level(word("relou", "adj", { slang_level: 2, verlan: true }))).toBeNull();
  });

  it("shows only stored levels before the data is in", () => {
    const r = createLevelResolver(null, null, false);
    expect(r.ready).toBe(false);
    expect(r.level(word("la démarche"))).toBeNull();
    expect(r.level(word("la démarche", "noun", { cefr: "B1", cefr_source: "user" }))?.level).toBe("B1");
    expect(r.freq(word("le bail"))).toBeNull();
  });
});

describe("public/lexique/fr-cefr.json", () => {
  const raw = readFileSync("public/lexique/fr-cefr.json", "utf8");
  const parsed = JSON.parse(raw) as CefrFile;
  const data = createCefrData(parsed);

  it("is the compact six-string format", () => {
    expect(parsed.v).toBe(1);
    expect(parsed.beacco).toHaveLength(6);
    expect(parsed.crf).toHaveLength(6);
    expect(data.size).toBeGreaterThan(14000);
    expect(raw.length).toBeLessThan(200_000);
  });

  it("levels the plan's sample words", () => {
    const at = (fr: string, pos: PartOfSpeech = "noun") => estimateLevel(word(fr, pos), data)?.level ?? null;
    expect(at("se tromper", "verb")).toBe("A1");
    expect(at("hésiter", "verb")).toBe("A2");
    expect(at("le logement")).toBe("A2");
    expect(at("la démarche")).toBe("B2");
    expect(at("aujourd'hui", "adv")).toBe("A1");
    expect(at("le chef-d'œuvre")).toBe("C1");
    expect(at("en moyenne", "expression")).toBe("A1");
    expect(at("au fur et à mesure", "expression")).toBe("C1");
    expect(at("avoir la flemme", "expression")).toBeNull();
  });
});
