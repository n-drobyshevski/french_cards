import { describe, expect, it } from "vitest";
import { finalizeAssignments, finalizeTaxonomy } from "./classify";
import { dedupeKey, detectDirection, normalizeSuggestion, normalizeVocabItem, slangLevelFromCode, toSlug } from "./normalize";
import { TokenBucketLimiter } from "./rate-limit";
import type { SuggestionModel, TaxonomyFolderInput, VocabItemModel } from "./schemas";

const folders = [
  { slug: "dengi", name: "Деньги" },
  { slug: "eda", name: "Еда" },
  { slug: "lyudi", name: "Люди" },
];

const base: SuggestionModel = {
  fr: "  la thune ",
  ru: "бабки",
  note: "  ",
  example_fr: "J'ai plus de thune.",
  example_ru: "Бабок нет.",
  pos: "noun",
  gender: "f",
  slang_level: "arg",
  verlan: false,
  folder: "dengi",
  folder_alternatives: ["dengi", "eda", "NEW", "nope", "lyudi"],
  new_folder: null,
  confidence: "high",
};

describe("normalizeSuggestion", () => {
  it("cleans text, maps slang level, filters alternatives", () => {
    const s = normalizeSuggestion(base, folders)!;
    expect(s.fr).toBe("la thune");
    expect(s.note).toBeNull();
    expect(s.slang_level).toBe(2);
    expect(s.folder_alternatives).toEqual(["eda", "lyudi"]);
  });

  it("falls back to INBOX for unknown folders and NEW without proposal", () => {
    expect(normalizeSuggestion({ ...base, folder: "ghost" }, folders)!.folder).toBe("INBOX");
    expect(normalizeSuggestion({ ...base, folder: "NEW" }, folders)!.folder).toBe("INBOX");
  });

  it("keeps a valid new folder and maps a duplicate name to the existing slug", () => {
    const fresh = normalizeSuggestion(
      { ...base, folder: "NEW", new_folder: { slug: "Transport!", name: "транспорт", description: "Машины" } },
      folders,
    )!;
    expect(fresh.folder).toBe("NEW");
    expect(fresh.new_folder).toEqual({ slug: "transport", name: "Транспорт", description: "Машины" });
    const dup = normalizeSuggestion({ ...base, folder: "NEW", new_folder: { slug: "money", name: "деньги", description: "" } }, folders)!;
    expect(dup.folder).toBe("dengi");
    expect(dup.new_folder).toBeNull();
    const clash = normalizeSuggestion({ ...base, folder: "NEW", new_folder: { slug: "eda", name: "Кухня", description: "" } }, folders)!;
    expect(clash.new_folder?.slug).toBe("eda-2");
  });

  it("drops gender for non-nouns, example_ru without example_fr, empty rows", () => {
    const verb = normalizeSuggestion({ ...base, fr: "raquer", pos: "verb", gender: "m", example_fr: null }, folders)!;
    expect(verb.gender).toBe("none");
    expect(verb.example_ru).toBeNull();
    expect(normalizeSuggestion({ ...base, ru: " " }, folders)).toBeNull();
  });
});

describe("normalizeVocabItem", () => {
  const item: VocabItemModel = {
    fr: "être vénère",
    fr_as_seen: "Être vénère",
    ru: "беситься",
    ru_suggested: false,
    note: null,
    example_fr: " Il est trop vénère. ",
    example_ru: "Он прям бесится.",
    pos: "expression",
    gender: "none",
    slang_level: "arg",
    verlan: true,
    provenance: "in_text",
    confidence: "med",
    issue: null,
    folder: "INBOX",
    new_folder: null,
  };
  it("drops fr_as_seen equal to fr and forces ru_suggested when no translation was shown", () => {
    const v = normalizeVocabItem(item, folders)!;
    expect(v.fr_as_seen).toBeNull();
    expect(v.ru_suggested).toBe(true);
    expect(normalizeVocabItem({ ...item, provenance: "pair" }, folders)!.ru_suggested).toBe(false);
    expect(normalizeVocabItem({ ...item, fr_as_seen: "vnr" }, folders)!.fr_as_seen).toBe("vnr");
  });
  it("keeps a trimmed example and drops its translation without one", () => {
    const v = normalizeVocabItem(item, folders)!;
    expect(v.example_fr).toBe("Il est trop vénère.");
    expect(v.example_ru).toBe("Он прям бесится.");
    const bare = normalizeVocabItem({ ...item, example_fr: " ", example_ru: "что-то" }, folders)!;
    expect(bare.example_fr).toBeNull();
    expect(bare.example_ru).toBeNull();
  });
});

describe("helpers", () => {
  it("detects Russian input", () => {
    expect(detectDirection("деньги")).toBe("ru");
    expect(detectDirection("se cass")).toBe("fr");
    expect(detectDirection("ça va")).toBe("fr");
  });
  it("maps slang codes and numeric strings", () => {
    expect(["neutral", "fam", "arg", "vulg", "3", "x"].map(slangLevelFromCode)).toEqual([0, 1, 2, 3, 3, 0]);
  });
  it("slugifies like lib/text", () => {
    expect(toSlug("Повседневное")).toBe("povsednevnoe");
    expect(toSlug("Cœur & âme")).toBe("coeur-ame");
  });
  it("dedupe key ignores articles, case and apostrophe style", () => {
    expect(dedupeKey("La thune")).toBe(dedupeKey("thune"));
    expect(dedupeKey("l’oseille")).toBe(dedupeKey("oseille"));
  });
});

describe("finalizeTaxonomy", () => {
  const current: TaxonomyFolderInput[] = [
    { slug: "povsednevnoe", name: "Повседневное", description: "Фразы", locked: false, created_by: "user" },
    { slug: "dengi", name: "Деньги", description: "Деньги", locked: true, created_by: "auto" },
    { slug: "eda", name: "Еда", description: "Еда", locked: false, created_by: "auto" },
    { slug: "tusovka", name: "Тусовка", description: "Вечеринки", locked: false, created_by: "auto" },
  ];
  const words = Array.from({ length: 10 }, (_, i) => ({ id: `id${i + 1}` }));

  it("keeps protected folders unchanged, applies rules to new and auto ones", () => {
    const res = finalizeTaxonomy(
      {
        folders: [
          { existing: "dengi", name: "Бабки", description: "renamed?", examples: ["w1", "w2", "w99"] },
          { existing: "eda", name: "Еда и напитки", description: "Еда, напитки", examples: ["w3"] },
          { existing: "NEW", name: "транспорт", description: "Машины", examples: ["w4", "w5", "w6"] },
          { existing: "NEW", name: "Работа", description: "Работа", examples: ["w7", "w7"] },
          { existing: "NEW", name: "Деньги", description: "dup name", examples: ["w8", "w9", "w10"] },
        ],
      },
      current,
      words,
    );
    const bySlug = Object.fromEntries(res.folders.map((f) => [f.slug, f]));
    expect(bySlug.dengi).toMatchObject({ name: "Деньги", description: "Деньги", status: "keep", example_ids: ["id1", "id2"] });
    expect(bySlug.povsednevnoe).toMatchObject({ name: "Повседневное", status: "keep" });
    expect(bySlug.eda).toMatchObject({ name: "Еда и напитки", status: "update" });
    expect(bySlug.transport).toMatchObject({ name: "Транспорт", status: "new", example_ids: ["id4", "id5", "id6"] });
    expect(res.folders.find((f) => f.name === "Работа")).toBeUndefined(); // < 3 distinct examples
    expect(res.folders.filter((f) => f.name === "Деньги")).toHaveLength(1);
    expect(res.removed).toEqual(["tusovka"]);
  });

  it("caps the total at 25, never dropping protected folders", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      existing: "NEW",
      name: `Тема ${i}`,
      description: "x",
      examples: ["w1", "w2", "w3"],
    }));
    const res = finalizeTaxonomy({ folders: many }, current, words);
    expect(res.folders).toHaveLength(25);
    expect(res.folders.map((f) => f.slug)).toEqual(expect.arrayContaining(["povsednevnoe", "dengi"]));
  });
});

describe("finalizeAssignments", () => {
  it("maps refs to ids, sends low confidence and unknown slugs to INBOX, fills skipped words", () => {
    const words = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    const res = finalizeAssignments(
      {
        assignments: [
          { ref: "w1", folder: "dengi", confidence: "high" },
          { ref: "w2", folder: "eda", confidence: "low" },
          { ref: "w3", folder: "ghost", confidence: "high" },
          { ref: "w1", folder: "eda", confidence: "high" },
          { ref: "w42", folder: "eda", confidence: "high" },
        ],
      },
      words,
      ["dengi", "eda"],
    );
    expect(res).toEqual([
      { id: "a", folder: "dengi", confidence: "high" },
      { id: "b", folder: "INBOX", confidence: "low" },
      { id: "c", folder: "INBOX", confidence: "high" },
      { id: "d", folder: "INBOX", confidence: "low" },
    ]);
  });
});

describe("TokenBucketLimiter", () => {
  it("allows a burst, then refuses with Retry-After, then refills", () => {
    const limiter = new TokenBucketLimiter({ capacity: 2, refillPerSec: 0.5 });
    expect(limiter.take("k", 1, 0).ok).toBe(true);
    expect(limiter.take("k", 1, 0).ok).toBe(true);
    const refused = limiter.take("k", 1, 0);
    expect(refused).toMatchObject({ ok: false, retryAfterSec: 2 });
    expect(limiter.take("other", 1, 0).ok).toBe(true);
    expect(limiter.take("k", 1, 2000).ok).toBe(true);
  });
});
