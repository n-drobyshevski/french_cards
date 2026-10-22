import { describe, expect, it } from "vitest";
import type { VocabItem } from "@/lib/ai/schemas";
import type { Word } from "@/lib/types";
import {
  INBOX,
  allAddableChecked,
  applyFolderToChecked,
  autoFolderChoice,
  buildRows,
  canAdd,
  checkedRows,
  choiceFromKey,
  choiceKey,
  choiceName,
  commonChoice,
  newFoldersNeeded,
  pluralRu,
  proposalsOf,
  setAllChecked,
  toWordInput,
  updateRow,
  wordsRu,
} from "./rows";

const folders = [
  { id: "f-emo", slug: "emotsii", name: "Эмоции" },
  { id: "f-ppl", slug: "lyudi", name: "Люди" },
  { id: "f-money", slug: "dengi", name: "Деньги" },
];

const transport = { slug: "transport", name: "Транспорт", description: "Машины, метро, байки." };

function item(fr: string, patch: Partial<VocabItem> = {}): VocabItem {
  return {
    fr,
    fr_as_seen: null,
    ru: `ru:${fr}`,
    ru_suggested: false,
    note: null,
    example_fr: null,
    example_ru: null,
    pos: "noun",
    gender: "f",
    slang_level: 1,
    verlan: false,
    provenance: "pair",
    confidence: "high",
    issue: null,
    folder: "INBOX",
    new_folder: null,
    ...patch,
  };
}

const thune = { id: "w-thune", fr: "la thune", ru: "бабки", folder_id: "f-money" } as Word;

describe("autoFolderChoice", () => {
  it("maps slugs to folder ids and INBOX to the inbox", () => {
    expect(autoFolderChoice(item("chelou", { folder: "emotsii" }), folders, new Map())).toEqual({ kind: "folder", id: "f-emo" });
    expect(autoFolderChoice(item("x", { folder: "INBOX" }), folders, new Map())).toEqual(INBOX);
    expect(autoFolderChoice(item("x", { folder: "deleted" }), folders, new Map())).toEqual(INBOX);
  });

  it("uses a proposed new theme only with enough words", () => {
    const it = item("la caisse", { folder: "NEW", new_folder: transport });
    expect(autoFolderChoice(it, folders, new Map([["transport", 2]]))).toEqual(INBOX);
    expect(autoFolderChoice(it, folders, new Map([["transport", 3]]))).toEqual({ kind: "new", ...transport });
  });

  it("reuses an existing folder with the proposed name", () => {
    const it = item("le pognon", { folder: "NEW", new_folder: { slug: "dengi-2", name: "деньги", description: "" } });
    expect(autoFolderChoice(it, folders, new Map([["dengi-2", 5]]))).toEqual({ kind: "folder", id: "f-money" });
  });
});

describe("buildRows", () => {
  const items = [
    item("chelou", { folder: "emotsii", verlan: true }),
    item("bouffer", { ru_suggested: true }),
    item("la daronne", { confidence: "low", issue: "текст обрезан справа" }),
    item("la thune", { folder: "dengi" }),
    item("la caisse", { folder: "NEW", new_folder: transport }),
    item("le tromé", { folder: "NEW", new_folder: transport }),
    item("la bécane", { folder: "NEW", new_folder: transport }),
  ];
  const rows = buildRows(items, folders, new Map([["la thune", thune]]));

  it("checks clean rows and leaves duplicates and doubtful rows unchecked", () => {
    expect(rows.map((r) => r.checked)).toEqual([true, true, false, false, true, true, true]);
    expect(rows[2].warn).toBe(true);
    expect(rows[3].duplicate).toBe(thune);
    expect(canAdd(rows[3])).toBe(false);
  });

  it("marks guessed translations and keeps the reader's metadata", () => {
    expect(rows[1].ruGuess).toBe(true);
    expect(rows[0].verlan).toBe(true);
    expect(rows[0].folder).toEqual({ kind: "folder", id: "f-emo" });
    expect(rows[4].folder).toEqual({ kind: "new", ...transport });
  });

  it("starts every row in «Входящие» when automatic sorting is off", () => {
    const manual = buildRows(items, folders, new Map(), { autoSort: false });
    expect(manual.every((r) => r.folder.kind === "inbox")).toBe(true);
    expect(newFoldersNeeded(manual)).toEqual([]);
  });

  it("lists proposals and the new folders the checked rows need", () => {
    expect(proposalsOf(items)).toEqual([transport]);
    expect(newFoldersNeeded(rows)).toEqual([{ kind: "new", ...transport }]);
    const unchecked = rows.map((r) => (r.folder.kind === "new" ? { ...r, checked: false } : r));
    expect(newFoldersNeeded(unchecked)).toEqual([]);
  });

  it("selects and clears only addable rows", () => {
    const none = setAllChecked(rows, false);
    expect(checkedRows(none)).toHaveLength(0);
    const all = setAllChecked(none, true);
    expect(checkedRows(all)).toHaveLength(6);
    expect(all[3].checked).toBe(false);
    expect(allAddableChecked(all)).toBe(true);
    expect(allAddableChecked(rows)).toBe(false);
  });

  it("unchecks a row whose text is cleared", () => {
    const next = updateRow(rows, "r0", { ru: "  " });
    expect(next[0].checked).toBe(false);
    expect(canAdd(next[0])).toBe(false);
    expect(next[1]).toBe(rows[1]);
  });

  it("applies one theme to the checked rows as a manual choice", () => {
    const choice = { kind: "folder", id: "f-ppl" } as const;
    const next = applyFolderToChecked(rows, choice);
    for (const r of checkedRows(next)) {
      expect(r.folder).toEqual(choice);
      expect(r.folderSource).toBe("user");
    }
    expect(next[2].folder).toEqual(rows[2].folder);
    expect(commonChoice(next)).toEqual(choice);
    expect(commonChoice(rows)).toBeNull();
  });
});

describe("choice keys and names", () => {
  it("round-trips through keys", () => {
    const proposals = [transport];
    for (const c of [INBOX, { kind: "folder", id: "f-emo" } as const, { kind: "new", ...transport } as const]) {
      expect(choiceFromKey(choiceKey(c), folders, proposals)).toEqual(c);
    }
    expect(choiceFromKey("f:missing", folders, proposals)).toBeNull();
    expect(choiceFromKey("n:missing", folders, proposals)).toBeNull();
  });

  it("names choices, with deleted folders as the inbox", () => {
    expect(choiceName(INBOX, folders)).toBe("Входящие");
    expect(choiceName({ kind: "folder", id: "f-emo" }, folders)).toBe("Эмоции");
    expect(choiceName({ kind: "folder", id: "gone" }, folders)).toBe("Входящие");
    expect(choiceName({ kind: "new", ...transport }, folders)).toBe("Транспорт");
  });
});

describe("toWordInput", () => {
  const [row] = buildRows([item("chelou", { folder: "emotsii", confidence: "med", note: "верлан от louche" })], folders, new Map());

  it("keeps the example read with the row", () => {
    const [withExample] = buildRows(
      [item("chelou", { example_fr: "Il est chelou, ton pote.", example_ru: "Стрёмный у тебя кореш." })],
      folders,
      new Map(),
    );
    expect(toWordInput(withExample, null)).toMatchObject({ example_fr: "Il est chelou, ton pote.", example_ru: "Стрёмный у тебя кореш." });
    expect(toWordInput(row, null)).toMatchObject({ example_fr: null, example_ru: null });
  });

  it("saves screenshot words with the automatic theme and its confidence", () => {
    expect(toWordInput(row, "f-emo")).toMatchObject({
      fr: "chelou",
      ru: "ru:chelou",
      note: "верлан от louche",
      folder_id: "f-emo",
      folder_source: "auto",
      folder_confidence: "med",
      source: "screenshot",
      slang_level: 1,
    });
  });

  it("marks a hand-picked theme as placed by the user", () => {
    expect(toWordInput({ ...row, folderSource: "user" }, "f-ppl")).toMatchObject({ folder_source: "user", folder_confidence: null });
    expect(toWordInput(row, null)).toMatchObject({ folder_id: null, folder_confidence: null });
  });
});

describe("plurals", () => {
  it("picks Russian forms", () => {
    expect([1, 2, 5, 11, 12, 21, 22, 25, 111].map((n) => pluralRu(n, ["слово", "слова", "слов"]))).toEqual([
      "слово",
      "слова",
      "слов",
      "слов",
      "слов",
      "слово",
      "слова",
      "слов",
      "слов",
    ]);
    expect(wordsRu(9)).toBe("9 слов");
  });
});
