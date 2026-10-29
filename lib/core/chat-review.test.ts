import { describe, expect, it } from "vitest";
import { asChatReview, CARDS_SETUP_CHOICES, type CardsSetup, type ExerciseSetup } from "./chat-review";

const cardsSetup = (over: Partial<CardsSetup> = {}): CardsSetup => ({
  kind: "kartochki-cards-setup",
  version: 1,
  today: { due: 12, new: 4, waiting: 1, deferred: 2 },
  themes: [
    { id: null, name: "Входящие", due: 3, new: 1 },
    { id: "f-food", name: "Еда", due: 9, new: 3 },
  ],
  preset: { choice: "cards_then_exercise", size: 20, folders: ["f-food"], scope: null },
  sizes: [10, 20, 30, 50],
  scopes: [
    { scope: "today", label: "Ошибки сегодня", count: 4 },
    { scope: "all", label: "Вся тема", count: 40 },
  ],
  ...over,
});

describe("chat review contract", () => {
  it("offers the four choices of «Повторить слова» in order", () => {
    expect(CARDS_SETUP_CHOICES).toEqual(["cards", "cards_then_exercise", "exercise", "practice"]);
  });

  it("takes «Повторить слова» from structuredContent unchanged", () => {
    const setup = cardsSetup();
    expect(asChatReview(JSON.parse(JSON.stringify(setup)))).toEqual(setup);
    for (const choice of CARDS_SETUP_CHOICES) expect(asChatReview(cardsSetup({ preset: { ...setup.preset, choice } }))).toMatchObject({ preset: { choice } });
  });

  it("refuses a «Повторить слова» card it can't show", () => {
    const setup = cardsSetup();
    expect(asChatReview({ ...setup, today: undefined })).toBeNull();
    expect(asChatReview({ ...setup, themes: undefined })).toBeNull();
    expect(asChatReview({ ...setup, preset: undefined })).toBeNull();
    expect(asChatReview({ ...setup, sizes: undefined })).toBeNull();
    expect(asChatReview({ ...setup, preset: { ...setup.preset, choice: "quiz" } })).toBeNull();
  });

  it("fills what an older connector left out and drops what it can't read", () => {
    const review = asChatReview({
      kind: "kartochki-cards-setup",
      version: 1,
      today: { due: 5, new: "3" },
      themes: [{ id: "f1", name: "Жильё", due: 2 }, { id: 4, name: "x" }, null],
      preset: { choice: "practice", folders: ["f1", 7, null] },
      sizes: [20, "30", 0],
    }) as CardsSetup;
    expect(review).toMatchObject({
      today: { due: 5, new: 0, waiting: 0, deferred: 0 },
      themes: [{ id: "f1", name: "Жильё", due: 2, new: 0 }],
      preset: { choice: "practice", size: null, folders: ["f1", null], scope: null },
      sizes: [20],
      scopes: [],
    });
  });

  it("still tells the other cards apart by kind", () => {
    const setup: ExerciseSetup = {
      kind: "kartochki-setup",
      version: 1,
      themes: [{ id: null, name: "Входящие", count: 3, verbs: 1 }],
      preset: { verbs: false, folders: [], tenses: [], size: null, levels: [] },
      sizes: [10, 20],
      verb_sizes: [12, 24],
    };
    expect(asChatReview(setup)).toEqual(setup);
    expect(asChatReview({ kind: "kartochki-levels", version: 1, rows: [], remaining: null })).toMatchObject({ kind: "kartochki-levels" });
    expect(asChatReview({ kind: "kartochki-words", version: 1 })).toBeNull();
    expect(asChatReview({ kind: "kartochki-cards", version: 1, cards: [] })).toBeNull();
    expect(asChatReview(null)).toBeNull();
  });
});
