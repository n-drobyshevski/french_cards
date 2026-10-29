import { describe, expect, it } from "vitest";
import type { CardsSetup, ExerciseSetup, LevelReviewRow, LevelsReview, ReviewFolder, WordReviewRow, WordsReview } from "@/lib/core/chat-review";
import { reviewFolderUrl } from "@/lib/core/chat-review";
import {
  addWordsArguments,
  addedHeadline,
  cardsScopeCount,
  cardsSetupAvailable,
  cardsThemeCount,
  cardsSetupRequest,
  cardsSetupState,
  commonFolder,
  inlineCount,
  levelRows,
  levelsReceipt,
  nextLevelsMessage,
  readLevelsResult,
  readWordsResult,
  setLevelsArguments,
  setupAvailable,
  setupRequest,
  setupState,
  todayLine,
  toggled,
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

describe("«Настроить упражнение»", () => {
  const setup = (preset: Partial<ExerciseSetup["preset"]> = {}): ExerciseSetup => ({
    kind: "kartochki-setup",
    version: 1,
    themes: [
      { id: null, name: "Входящие", count: 4, verbs: 1 },
      { id: "f1", name: "01 · Люди", count: 20, verbs: 6 },
      { id: "f2", name: "02 · Семья", count: 12, verbs: 3 },
    ],
    preset: { verbs: false, folders: [], tenses: [], size: null, levels: [], ...preset },
    sizes: [8, 12, 16],
    verb_sizes: [6, 8, 10],
  });

  it("starts from Claude's presets, unknown themes dropped, sizes snapped", () => {
    expect(setupState(setup())).toEqual({ folders: [], verbs: false, tenses: [], size: 12, verbSize: 8, levels: [], sent: false });
    expect(setupState(setup({ verbs: true, folders: ["f2", "gone", null], tenses: ["imparfait", "present"], size: 7, levels: ["B2", "A2"] }))).toEqual({
      folders: ["f2", null],
      verbs: true,
      tenses: ["present", "imparfait"],
      size: 12,
      verbSize: 6,
      levels: ["A2", "B2"],
      sent: false,
    });
  });

  it("counts the words (or verbs) of the picked themes, and sends the app's request played in the chat", () => {
    const s = setup();
    const state = setupState(s);
    expect(setupAvailable(s, state)).toBe(36);
    expect(setupRequest(s, state)).toBe("Сделай упражнение здесь в чате по всем темам, 12 вопросов.");
    state.verbs = true;
    state.folders = toggled(s.themes.map((t) => t.id), state.folders, "f1");
    state.tenses = ["imparfait"];
    expect(setupAvailable(s, state)).toBe(6);
    expect(setupRequest(s, state)).toBe("Сделай упражнение на спряжение глаголов здесь в чате по теме «01 · Люди», 8 вопросов, только imparfait.");
    state.folders = toggled(s.themes.map((t) => t.id), state.folders, null);
    expect(state.folders).toEqual([null, "f1"]);
  });
});

describe("«Повторить слова»", () => {
  const setup = (preset: Partial<CardsSetup["preset"]> = {}): CardsSetup => ({
    kind: "kartochki-cards-setup",
    version: 1,
    today: { due: 12, new: 4, waiting: 1, deferred: 0 },
    themes: [
      { id: null, name: "Входящие", due: 2, new: 0, practice: { today: 1 } },
      { id: "f1", name: "Еда", due: 6, new: 3, practice: {} },
      { id: "f2", name: "Жильё", due: 4, new: 1, practice: { today: 3 } },
    ],
    preset: { choice: "cards", size: null, folders: [], scope: null, ...preset },
    sizes: [10, 20, 30],
    scopes: [
      { scope: "today", label: "Ошибки сегодня", count: 4 },
      { scope: "all", label: "Вся тема", count: 0 },
    ],
  });

  it("starts from Claude's presets: unknown themes dropped, sizes snapped, the first «Тренировка» option", () => {
    expect(cardsSetupState(setup())).toEqual({ choice: "cards", folders: [], size: 20, exerciseSize: 12, scope: "today", sent: false });
    expect(cardsSetupState(setup({ choice: "exercise", size: 15, folders: ["f2", "gone"], scope: "difficult" }))).toEqual({
      choice: "exercise",
      folders: ["f2"],
      size: 20,
      exerciseSize: 16,
      scope: "today",
      sent: false,
    });
    expect(cardsSetupState(setup({ choice: "practice", size: 28, scope: "all" }))).toMatchObject({ size: 30, scope: "all" });
  });

  it("sends the request the connector routes for each way", () => {
    const s = setup();
    const state = cardsSetupState(s);
    expect(todayLine(s.today)).toBe("12 к повторению · 4 новых · 1 ждёт");
    expect(todayLine({ due: 0, new: 0, waiting: 0, deferred: 0 })).toBe("Сегодня повторять нечего");
    expect(cardsSetupAvailable(s, state)).toBe(16);
    expect(cardsSetupRequest(s, state)).toBe("Повтори карточки здесь в чате, 20 карточек.");
    state.folders = toggled(s.themes.map((t) => t.id), state.folders, "f2");
    state.folders = toggled(s.themes.map((t) => t.id), state.folders, "f1");
    state.choice = "cards_then_exercise";
    expect(cardsSetupAvailable(s, state)).toBe(14);
    expect(cardsSetupRequest(s, state)).toBe("Повтори карточки здесь в чате, 20 карточек, по темам «Еда», «Жильё», потом упражнение по ошибкам.");
    state.choice = "exercise";
    expect(cardsSetupAvailable(s, state)).toBe(10);
    expect(cardsSetupRequest(s, state)).toBe("Сделай упражнение здесь в чате по словам к повторению из тем «Еда», «Жильё», 12 вопросов.");
    state.folders = [];
    expect(cardsSetupRequest(s, state)).toBe("Сделай упражнение здесь в чате по словам к повторению из всех тем, 12 вопросов.");
    state.choice = "practice";
    expect(cardsSetupAvailable(s, state)).toBe(4);
    expect(cardsSetupRequest(s, state)).toBe("Потренируй карточки здесь в чате без расписания: ошибки сегодня, 20 карточек.");
    state.scope = "all";
    expect(cardsSetupAvailable(s, state)).toBe(0);
  });

  it("counts «Тренировка» over the themes picked, and gives each theme its own number", () => {
    const s = setup({ choice: "practice" });
    const state = cardsSetupState(s);
    expect(cardsScopeCount(s, state, "today")).toBe(4);
    expect(s.themes.map((t) => cardsThemeCount(t, state))).toEqual([1, 0, 3]);
    // «Еда» has no misses today: nothing to start there.
    state.folders = ["f1"];
    expect(cardsScopeCount(s, state, "today")).toBe(0);
    expect(cardsSetupAvailable(s, state)).toBe(0);
    state.folders = ["f1", "f2"];
    expect(cardsSetupAvailable(s, state)).toBe(3);
    state.choice = "exercise";
    expect(s.themes.map((t) => cardsThemeCount(t, state))).toEqual([2, 6, 4]);
    state.choice = "cards";
    expect(s.themes.map((t) => cardsThemeCount(t, state))).toEqual([2, 9, 5]);
  });
});
