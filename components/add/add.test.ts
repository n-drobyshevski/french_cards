import { describe, expect, it } from "vitest";
import type { EnrichResult, Suggestion } from "@/lib/ai/schemas";
import { MANUAL_KEY, moveActive, resolveActive, variantKey } from "./combobox";
import { applyEnrichment, draftFromSuggestion, draftToSaveRequest, enrichKey, enrichScope, manualDraft, validateDraft } from "./draft";
import { choiceKey, choiceName, folderSource, foldersForSuggestion, INBOX_CHOICE, listFolderChoices } from "./folder-choice";
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

describe("applyEnrichment", () => {
  const result: EnrichResult = {
    id: "w1",
    pos: "noun",
    gender: "f",
    slang_level: 1,
    verlan: false,
    example_fr: "Il a garé sa caisse.",
    example_ru: "Он припарковал тачку.",
    confidence: "high",
    folder: null,
    folder_alternatives: [],
    new_folder: null,
  };

  it("waits for both sides of a manual draft", () => {
    expect(enrichKey(manualDraft({ fr: " la caisse " }))).toBeNull();
    expect(enrichKey(manualDraft({ fr: "la  caisse", ru: "тачка " }))).toBe("la caisse\u0001тачка");
    expect(enrichKey(draftFromSuggestion(sug(), FOLDERS))).toBeNull();
  });

  it("fills level, part of speech and example of an untouched draft", () => {
    const d = applyEnrichment(manualDraft({ fr: "la caisse", ru: "тачка" }), result);
    expect(d).toMatchObject({ slang_level: 1, slang_auto: true, pos: "noun", gender: "f", example_fr: "Il a garé sa caisse.", example_auto: true });
    expect(draftToSaveRequest(d).words[0]).toMatchObject({ slang_level: 1, example_fr: "Il a garé sa caisse.", example_ru: "Он припарковал тачку." });
  });

  it("leaves what the user set by hand", () => {
    const touched = { ...manualDraft({ fr: "la caisse", ru: "тачка" }), slang_level: 3 as const, slang_touched: true, example_fr: "Ma caisse.", example_touched: true };
    expect(enrichScope(touched)).toEqual({ slang: false, example: false, pos: true, folder: true });
    const d = applyEnrichment(touched, result);
    expect(d).toMatchObject({ slang_level: 3, slang_auto: false, example_fr: "Ma caisse.", example_auto: false, pos: "noun" });
  });

  it("fills only what Settings «ИИ» allow", () => {
    const d = applyEnrichment(manualDraft({ fr: "la caisse", ru: "тачка" }), result, [], { slang: false, examples: true });
    expect(d).toMatchObject({ slang_level: 0, slang_auto: false, example_fr: "Il a garé sa caisse.", pos: "noun" });
    const e = applyEnrichment(manualDraft({ fr: "la caisse", ru: "тачка" }), result, [], { slang: true, examples: false });
    expect(e).toMatchObject({ slang_level: 1, slang_auto: true, example_fr: "", example_auto: false });
    expect(draftFromSuggestion(sug(), FOLDERS, { slang: false, examples: false })).toMatchObject({
      slang_level: 0,
      verlan: false,
      slang_auto: false,
      example_fr: "",
      example_ru: "",
    });
  });

  it("replaces its own example when the word changes, and clears it when there is none", () => {
    const first = applyEnrichment(manualDraft({ fr: "la caisse", ru: "тачка" }), result);
    const next = applyEnrichment(first, { ...result, example_fr: "Je vous attends à la caisse.", example_ru: "Жду у кассы.", slang_level: 0 });
    expect(next).toMatchObject({ example_fr: "Je vous attends à la caisse.", slang_level: 0 });
    expect(applyEnrichment(first, { ...result, example_fr: null, example_ru: null })).toMatchObject({ example_fr: "", example_auto: false });
  });
});

describe("automatic theme for typed words", () => {
  const base: EnrichResult = {
    id: "w1",
    pos: "noun",
    gender: "f",
    slang_level: 2,
    verlan: false,
    example_fr: null,
    example_ru: null,
    confidence: "high",
    folder: "dengi",
    folder_alternatives: ["povsednevnoe"],
    new_folder: null,
  };

  it("preselects the detected theme of a manual draft like a suggestion's", () => {
    const d = applyEnrichment(manualDraft({ fr: "la thune", ru: "бабки" }), base, FOLDERS);
    expect(d.folder).toEqual({ kind: "folder", id: "f-den" });
    expect(d.auto).toMatchObject({ auto: { kind: "folder", id: "f-den" }, alternatives: [{ kind: "folder", id: "f-pov" }], confidence: "high" });
    expect(enrichScope(d).folder).toBe(false);
    expect(draftToSaveRequest(d)).toMatchObject({ folderSource: "auto", folderConfidence: "high", newFolderCreatedBy: "auto" });
  });

  it("keeps a theme the user chose, and offers a proposed new one", () => {
    const chosen = { ...manualDraft({ fr: "la thune", ru: "бабки" }), folder: { kind: "folder" as const, id: "f-emo" }, folder_touched: true };
    expect(applyEnrichment(chosen, base, FOLDERS)).toMatchObject({ folder: { kind: "folder", id: "f-emo" }, auto: null });
    const proposal = applyEnrichment(manualDraft({ fr: "la caisse", ru: "тачка" }), {
      ...base,
      folder: "NEW",
      folder_alternatives: [],
      new_folder: { slug: "transport", name: "Транспорт", description: "Машины и метро." },
    }, FOLDERS);
    expect(proposal.folder).toEqual({ kind: "new", name: "Транспорт", description: "Машины и метро." });
    // No theme asked for: the folder stays as it was.
    expect(applyEnrichment(manualDraft({ fr: "la caisse", ru: "тачка" }), { ...base, folder: null }, FOLDERS)).toMatchObject({ folder: INBOX_CHOICE, auto: null });
  });

  it("list rows: a new theme needs three rows, low confidence stays in «Входящие»", () => {
    const transport = { slug: "transport", name: "Транспорт", description: "" };
    const nu = { ...base, folder: "NEW", folder_alternatives: [], new_folder: transport };
    const two = listFolderChoices([base, nu, nu, { ...base, confidence: "low" }, null], FOLDERS);
    expect(two).toEqual([{ kind: "folder", id: "f-den" }, INBOX_CHOICE, INBOX_CHOICE, INBOX_CHOICE, null]);
    const three = listFolderChoices([nu, nu, nu], FOLDERS);
    expect(three.every((c) => c?.kind === "new" && c.name === "Транспорт")).toBe(true);
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

describe("add dialog combobox cursor", () => {
  const keys = ["d:se casser", "d:casse-croûte", variantKey({ fr: "se casser", ru: "свалить" }), variantKey({ fr: "se tirer", ru: "свалить" }), MANUAL_KEY];
  const v1 = keys[2];

  it("defaults to the fallback (first «Вариант» or the kept draft) until the user moves", () => {
    expect(resolveActive(keys, null, v1)).toBe(v1);
    expect(resolveActive(keys, "d:casse-croûte", v1)).toBe("d:casse-croûte");
    expect(resolveActive(keys, "d:gone", v1)).toBe(v1);
    expect(resolveActive(keys, null, "v:gone")).toBeNull();
    expect(resolveActive([], null, v1)).toBeNull();
  });

  it("moves across «Словарь» and «Варианты» as one list and stops at the ends", () => {
    expect(moveActive(keys, v1, -1)).toBe("d:casse-croûte");
    expect(moveActive(keys, v1, 1)).toBe(keys[3]);
    expect(moveActive(keys, keys[3], 1)).toBe(MANUAL_KEY);
    expect(moveActive(keys, MANUAL_KEY, 1)).toBe(MANUAL_KEY);
    expect(moveActive(keys, keys[0], -1)).toBe(keys[0]);
    expect(moveActive(keys, null, 1)).toBe(keys[0]);
    expect(moveActive(keys, null, -1)).toBe(MANUAL_KEY);
    expect(moveActive([], null, 1)).toBeNull();
  });
});
