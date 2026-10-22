import { describe, expect, it } from "vitest";
import type { Suggestion } from "@/lib/ai/schemas";
import { draftFromSuggestion, draftToSaveRequest, manualDraft, validateDraft } from "./draft";
import { choiceKey, choiceName, folderSource, foldersForSuggestion, INBOX_CHOICE } from "./folder-choice";
import { cardNumber, nWords, posAbbr, splitTypedPrefix } from "./match";
import { parseWordList } from "./parse-list";

const FOLDERS = [
  { id: "f-pov", slug: "povsednevnoe", name: "Повседневное" },
  { id: "f-den", slug: "dengi", name: "Деньги" },
  { id: "f-tus", slug: "tusovka", name: "Тусовка" },
  { id: "f-emo", slug: "emotsii", name: "Эмоции" },
];

function sug(over: Partial<Suggestion> = {}): Suggestion {
  return {
    fr: "se casser",
    ru: "свалить, сбежать",
    note: "«Casse-toi» — грубое «свали».",
    example_fr: "Allez, on se casse d’ici.",
    example_ru: "Ладно, сваливаем отсюда.",
    pos: "verb",
    gender: "none",
    slang_level: 2,
    verlan: false,
    folder: "povsednevnoe",
    folder_alternatives: ["tusovka", "emotsii"],
    new_folder: { slug: "pobeg", name: "Побег", description: "Уйти, сбежать, свалить." },
    confidence: "high",
    ...over,
  };
}

describe("foldersForSuggestion", () => {
  it("resolves the pick, alternatives and the proposed theme", () => {
    const r = foldersForSuggestion(sug(), FOLDERS);
    expect(r.auto).toEqual({ kind: "folder", id: "f-pov" });
    expect(r.alternatives).toEqual([
      { kind: "folder", id: "f-tus" },
      { kind: "folder", id: "f-emo" },
    ]);
    expect(r.proposal).toEqual({ kind: "new", name: "Побег", description: "Уйти, сбежать, свалить." });
  });

  it("uses the proposal as the pick for NEW", () => {
    const r = foldersForSuggestion(sug({ folder: "NEW" }), FOLDERS);
    expect(r.auto).toEqual({ kind: "new", name: "Побег", description: "Уйти, сбежать, свалить." });
    expect(r.proposal).toBeNull();
  });

  it("falls back to the inbox for INBOX, unknown slugs, or NEW without a proposal", () => {
    expect(foldersForSuggestion(sug({ folder: "INBOX" }), FOLDERS).auto).toEqual(INBOX_CHOICE);
    expect(foldersForSuggestion(sug({ folder: "gone" }), FOLDERS).auto).toEqual(INBOX_CHOICE);
    expect(foldersForSuggestion(sug({ folder: "NEW", new_folder: null }), FOLDERS).auto).toEqual(INBOX_CHOICE);
  });

  it("drops unknown or repeated alternatives", () => {
    const r = foldersForSuggestion(sug({ folder_alternatives: ["povsednevnoe", "nope", "dengi"], new_folder: null }), FOLDERS);
    expect(r.alternatives).toEqual([{ kind: "folder", id: "f-den" }]);
  });

  it("turns a proposal with an existing name into that folder", () => {
    const r = foldersForSuggestion(
      sug({ folder_alternatives: [], new_folder: { slug: "dengi-2", name: "деньги", description: "" } }),
      FOLDERS,
    );
    expect(r.proposal).toBeNull();
    expect(r.alternatives).toEqual([{ kind: "folder", id: "f-den" }]);
  });
});

describe("folderSource", () => {
  const auto = { kind: "folder", id: "f-pov" } as const;
  it("is auto when the automatic pick is kept", () => {
    expect(folderSource(auto, auto, false)).toEqual({ folder_source: "auto", kept_auto: true });
    expect(folderSource(auto, auto, true)).toEqual({ folder_source: "auto", kept_auto: true });
  });
  it("is user when another theme is chosen, including the inbox", () => {
    expect(folderSource({ kind: "folder", id: "f-den" }, auto, true).folder_source).toBe("user");
    expect(folderSource(INBOX_CHOICE, auto, true).folder_source).toBe("user");
  });
  it("leaves an untouched manual inbox to automatic sorting", () => {
    expect(folderSource(INBOX_CHOICE, null, false)).toEqual({ folder_source: "auto", kept_auto: false });
    expect(folderSource({ kind: "folder", id: "f-den" }, null, true).folder_source).toBe("user");
  });
});

describe("choice helpers", () => {
  it("names and keys choices", () => {
    expect(choiceName(INBOX_CHOICE, FOLDERS)).toBe("Входящие");
    expect(choiceName({ kind: "folder", id: "f-den" }, FOLDERS)).toBe("Деньги");
    expect(choiceName({ kind: "new", name: "Побег", description: null }, FOLDERS)).toBe("Побег");
    expect(choiceKey({ kind: "new", name: "Побег", description: null })).toBe(choiceKey({ kind: "new", name: "побег", description: "x" }));
  });
});

describe("draft", () => {
  it("keeps the automatic pick as auto with its confidence", () => {
    const req = draftToSaveRequest(draftFromSuggestion(sug({ confidence: "med" }), FOLDERS));
    expect(req.folder).toEqual({ kind: "folder", id: "f-pov" });
    expect(req.folderSource).toBe("auto");
    expect(req.folderConfidence).toBe("med");
    expect(req.words[0]).toMatchObject({ fr: "se casser", source: "suggest", slang_level: 2, both_directions: true });
  });

  it("starts in «Входящие» without an automatic pick when automatic sorting is off", () => {
    const d = draftFromSuggestion(sug({ confidence: "high" }), FOLDERS, { autoSort: false });
    expect(d.folder).toEqual(INBOX_CHOICE);
    expect(d.auto).toBeNull();
    const req = draftToSaveRequest(d);
    expect(req.folder).toEqual(INBOX_CHOICE);
    expect(req.folderConfidence).toBeNull();
    expect(req.newFolderCreatedBy).toBe("user");
  });

  it("files a chosen theme as user", () => {
    const d = { ...draftFromSuggestion(sug(), FOLDERS), folder: { kind: "folder" as const, id: "f-tus" }, folder_touched: true };
    const req = draftToSaveRequest(d);
    expect(req.folderSource).toBe("user");
    expect(req.folderConfidence).toBeNull();
  });

  it("creates a tapped new theme as the user's, an automatic one as auto", () => {
    const base = draftFromSuggestion(sug(), FOLDERS);
    const tapped = draftToSaveRequest({ ...base, folder: base.auto!.proposal!, folder_touched: true });
    expect(tapped).toMatchObject({ folderSource: "user", newFolderCreatedBy: "user" });
    const kept = draftToSaveRequest(draftFromSuggestion(sug({ folder: "NEW" }), FOLDERS));
    expect(kept).toMatchObject({ folderSource: "auto", newFolderCreatedBy: "auto", folder: { kind: "new", name: "Побег" } });
  });

  it("drops a lone example translation and gender on non-nouns", () => {
    const d = { ...manualDraft({ fr: "kiffer", ru: "тащиться" }), example_ru: "x", gender: "f" as const };
    const w = draftToSaveRequest(d).words[0];
    expect(w.example_ru).toBeNull();
    expect(w.gender).toBe("none");
    expect(w.source).toBe("manual");
  });

  it("validates both sides", () => {
    expect(validateDraft({ fr: " ", ru: "" })).toEqual({ fr: "Нужно французское слово", ru: "Нужен перевод" });
    expect(validateDraft({ fr: "kiffer", ru: "тащиться" })).toEqual({});
  });
});

describe("parseWordList", () => {
  it("splits on dashes, tabs, arrows, colons and spaced hyphens", () => {
    const rows = parseWordList(
      ["la thune — бабки, деньги", "kiffer\tтащиться", "chelou -> стрёмный", "c'est ouf: это безумие", "vas-y - давай", "la galère = засада"].join("\n"),
    );
    expect(rows.map((r) => [r.fr, r.ru])).toEqual([
      ["la thune", "бабки, деньги"],
      ["kiffer", "тащиться"],
      ["chelou", "стрёмный"],
      ["c'est ouf", "это безумие"],
      ["vas-y", "давай"],
      ["la galère", "засада"],
    ]);
    expect(rows.every((r) => r.problem === null)).toBe(true);
  });

  it("keeps hyphenated French words whole", () => {
    expect(parseWordList("casse-croûte — перекус")[0]).toMatchObject({ fr: "casse-croûte", ru: "перекус" });
    expect(parseWordList("dépêche-toi поторапливайся")[0]).toMatchObject({ fr: "dépêche-toi", ru: "поторапливайся" });
  });

  it("strips bullets and numbering, skips blank lines, keeps line numbers", () => {
    const rows = parseWordList("1. le fric — бабло\n\n• un pote – кореш\n- bouffer — жрать");
    expect(rows.map((r) => [r.line, r.fr, r.ru])).toEqual([
      [1, "le fric", "бабло"],
      [3, "un pote", "кореш"],
      [4, "bouffer", "жрать"],
    ]);
  });

  it("swaps Russian-first lines", () => {
    expect(parseWordList("менты — les keufs")[0]).toMatchObject({ fr: "les keufs", ru: "менты" });
  });

  it("flags rows without a translation or French side", () => {
    expect(parseWordList("la meuf")[0]).toMatchObject({ fr: "la meuf", ru: "", problem: "no_translation" });
    expect(parseWordList("девушка")[0]).toMatchObject({ fr: "", ru: "девушка", problem: "no_french" });
  });
});

describe("display helpers", () => {
  it("splits the typed prefix ignoring case and accents", () => {
    expect(splitTypedPrefix("se casser", "se cass")).toEqual(["se cass", "er"]);
    expect(splitTypedPrefix("être fauché", "etre fau")).toEqual(["être fau", "ché"]);
    expect(splitTypedPrefix("se casser", "se ")).toEqual(["se", " casser"]);
    expect(splitTypedPrefix("casser", "zzz")).toEqual(["", "casser"]);
  });

  it("formats dictionary abbreviations", () => {
    expect(posAbbr({ pos: "verb", gender: "none", fr: "se casser" })).toBe("v. pron.");
    expect(posAbbr({ pos: "noun", gender: "f", fr: "la thune" })).toBe("n. f.");
    expect(posAbbr({ pos: "other", gender: "none", fr: "ouf" })).toBeNull();
  });

  it("formats counts", () => {
    expect(nWords(1)).toBe("1 слово");
    expect(nWords(3)).toBe("3 слова");
    expect(nWords(12)).toBe("12 слов");
    expect(cardNumber(47)).toBe("№ 047");
    expect(cardNumber(1159)).toBe("№ 1159");
  });
});
