import { describe, expect, it } from "vitest";
import type { LevelReviewRow, LevelsReview, ReviewFolder, WordReviewRow, WordsReview } from "@/lib/core/chat-review";
import { reviewFolderUrl } from "@/lib/core/chat-review";
import {
  addWordsArguments,
  addedHeadline,
  commonFolder,
  inlineCount,
  levelRows,
  levelsReceipt,
  nextLevelsMessage,
  readLevelsResult,
  readWordsResult,
  setLevelsArguments,
  wordRows,
} from "./model";

const lrow = (id: string, over: Partial<LevelReviewRow> = {}): LevelReviewRow => ({
  id, fr: id, ru: "ru", pos: "noun", proposed: "B1", current: null, current_source: null, dictionary: null, locked: false, ...over,
});
const levels = (rows: LevelReviewRow[]): LevelsReview => ({ kind: "kartochki-levels", version: 1, rows, remaining: 20 });

const inbox: ReviewFolder = { id: null, name: "Входящие", count: 12 };
const home: ReviewFolder = { id: "f-home", name: "Жильё", count: 48 };
const wrow = (key: string, over: Partial<WordReviewRow> = {}): WordReviewRow => ({
  key, fr: `mot ${key}`, ru: "слово", pos: "noun", gender: "f", slang_level: 0, verlan: false, note: null, example_fr: null, example_ru: null,
  origin: null, level: "B1", folder: home, folder_chosen_by_user: false, duplicate: null, checked: true, ...over,
});
const words = (rows: WordReviewRow[]): WordsReview => ({ kind: "kartochki-words", version: 1, rows, folders: [inbox, home], source_label: null });

describe("«Уровни слов»", () => {
  it("saves the checked rows the user didn't set, with the level picked, as set_word_levels takes them", () => {
    const rows = levelRows(levels([lrow("w1"), lrow("w2", { locked: true, current: "A2", current_source: "user" }), lrow("w3")]));
    expect(rows.map((r) => [r.checked, r.level])).toEqual([[true, "B1"], [false, "A2"], [true, "B1"]]);
    rows[2].level = "C1";
    rows[0].checked = false;
    expect(setLevelsArguments(rows)).toEqual({ items: [{ word_id: "w3", cefr: "C1" }] });
  });

  it("reads the result into the receipt and keeps the undo as returned", () => {
    const undo = { tool: "set_word_levels", items: [{ word_id: "w1", cefr: null, source: null, expect: { cefr: "B1", source: "chat" } }], overwrite_user: false };
    const saved = readLevelsResult({ updated: [{}, {}], unchanged: [{}], skipped_user: [{}], not_found: [], conflicts: [], undo }, 1);
    expect(saved).toEqual({ saved: 3, skipped: 2, failed: 0, undo: { items: undo.items, overwrite_user: false } });
    expect(levelsReceipt(saved)).toBe("Сохранено 3 уровня · 2 пропущено (вы указали сами)");
    expect(levelsReceipt({ saved: 14, skipped: 1, failed: 0, undo: null })).toBe("Сохранено 14 уровней · 1 пропущено (вы указали сами)");
    expect(readLevelsResult({ updated: [], undo: null }, 0).undo).toBeNull();
  });

  it("asks for the next batch, no more than what is left", () => {
    expect(nextLevelsMessage(null)).toBe("Предложи уровни для следующих 15 слов без уровня");
    expect(nextLevelsMessage(4)).toBe("Предложи уровни для следующих 4 слов без уровня");
  });

  it("shows one more row rather than «ещё 1»", () => {
    expect([inlineCount(7, 7), inlineCount(8, 7), inlineCount(15, 7)]).toEqual([7, 8, 7]);
  });
});

describe("«Новые слова»", () => {
  it("adds the checked words with their own themes, chosen by the user when picked here", () => {
    const rows = wordRows(words([wrow("0"), wrow("1", { duplicate: { id: "w9", fr: "mot 1", folder_name: "Жильё" }, checked: false }), wrow("2", { pos: "adj", example_fr: "Ex.", note: null, cefr: "B2" })]));
    rows[2].folder = inbox;
    rows[2].chosen = true;
    rows[0].row = { ...rows[0].row, extra: { tags: ["дом"], both_directions: false } };
    const args = addWordsArguments(rows);
    expect(args.folder_chosen_by_user).toBe(false);
    expect(args.words).toEqual([
      // The fields the card doesn't show go back as Claude gave them.
      { tags: ["дом"], both_directions: false, fr: "mot 0", ru: "слово", pos: "noun", gender: "f", slang_level: 0, verlan: false, folder: "f-home", folder_chosen_by_user: false },
      { fr: "mot 2", ru: "слово", pos: "adj", slang_level: 0, verlan: false, example_fr: "Ex.", cefr: "B2", folder: "inbox", folder_chosen_by_user: true },
    ]);
    expect(commonFolder(rows)).toBeNull();
    rows[2].folder = home;
    expect(commonFolder(rows)).toEqual(home);
  });

  it("reads add_words' result: the words, the duplicates and delete_words' ids", () => {
    const result = readWordsResult({
      added: [{ id: "n1", fr: "l'annonce", ru: "объявление", folder: { id: "f-home", name: "Жильё" }, level: "A2" }, { id: "n2", fr: "le bail", ru: "аренда", folder: { id: null, name: "Входящие" }, level: null }],
      duplicates: [{ fr: "le loyer", existing: { id: "w1", fr: "le loyer", ru: "квартплата", folder: { id: "f-home", name: "Жильё" } } }],
      undo: { tool: "delete_words", ids: ["n1", "n2"] },
    });
    expect(result.undoIds).toEqual(["n1", "n2"]);
    expect(result.duplicates).toEqual([{ fr: "le loyer", folder_name: "Жильё" }]);
    expect(addedHeadline(result.added)).toBe("Добавлено 2 слова: 1 в «Жильё», 1 во «Входящие»");
    expect(addedHeadline(result.added.slice(0, 1))).toBe("Добавлено 1 слово в «Жильё»");
  });

  it("links a theme in the app as the app routes it", () => {
    expect(reviewFolderUrl("https://kartochki.example/", "f-home")).toBe("https://kartochki.example/library/f-home");
    expect(reviewFolderUrl("https://kartochki.example", null)).toBe("https://kartochki.example/library/inbox");
  });
});
