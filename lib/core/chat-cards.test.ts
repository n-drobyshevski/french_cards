import { describe, expect, it } from "vitest";
import {
  asChatCardsSession,
  asGradeCardsResult,
  asUndoGradesResult,
  CARDS_ROUND_DEFAULT,
  CARDS_ROUND_MAX,
  CARDS_ROUND_MIN,
  CHAT_CARDS_URI,
  directionLabel,
  GRADE_LABELS,
  GRADE_TOOL,
  gradeArguments,
  isCardRating,
  LEARN_AHEAD_MS,
  returnsInRound,
  UNDO_GRADES_TOOL,
  undoArguments,
  type ChatCard,
  type ChatCardsSession,
  type GradeAnswer,
} from "./chat-cards";
import { LEARN_AHEAD_MS as PLAN_LEARN_AHEAD_MS } from "./plan";

const card = (over: Partial<ChatCard> = {}): ChatCard => ({
  key: "w1:fr_ru",
  word_id: "w1",
  direction: "fr_ru",
  is_new: false,
  expected: "2026-10-28T09:00:00.000Z",
  intervals: { 1: "<1 мин", 2: "6 мин", 3: "3 д" },
  number: 7,
  fr: "relou",
  ru: "напряжный",
  pos: "adj",
  gender: "none",
  slang_level: 1,
  verlan: true,
  example_fr: "Il est relou, lui.",
  example_ru: "Он напрягает.",
  note: null,
  origin: "верлан от lourd",
  fields: [],
  fields_more: 0,
  level: "B2",
  level_estimated: true,
  folder_name: "Сленг",
  ...over,
});

const session = (over: Partial<ChatCardsSession> = {}): ChatCardsSession => ({
  kind: "kartochki-cards",
  version: 1,
  mode: "schedule",
  round_id: "cr-round-1",
  built_at: "2026-10-28T10:00:00.000Z",
  day_end: "2026-10-29T03:00:00.000Z",
  title: "Повторение",
  folder_label: "Все темы",
  direction: "both",
  direction_label: "FR ↔ RU",
  scope: null,
  cards: [card()],
  counts: { due: 12, new: 4, waiting: 1, deferred: 0 },
  remaining: 0,
  next_due: null,
  next: null,
  app_url: "https://kartochki.example",
  ...over,
});

describe("chat cards contract", () => {
  it("names the page, its tools and the round sizes", () => {
    expect(CHAT_CARDS_URI).toBe("ui://kartochki/cards.html");
    expect(GRADE_TOOL).toBe("grade_cards");
    expect(UNDO_GRADES_TOOL).toBe("undo_grades");
    expect([CARDS_ROUND_MIN, CARDS_ROUND_DEFAULT, CARDS_ROUND_MAX]).toEqual([5, 20, 50]);
    expect(LEARN_AHEAD_MS).toBe(PLAN_LEARN_AHEAD_MS);
    expect(GRADE_LABELS).toEqual({ 1: "Не знаю", 2: "Сложно", 3: "Знаю" });
    expect([1, 2, 3, 4, 0, "3"].map(isCardRating)).toEqual([true, true, true, false, false, false]);
    expect(["fr_ru", "ru_fr", "both"].map((d) => directionLabel(d as "both"))).toEqual(["FR → RU", "RU → FR", "FR ↔ RU"]);
  });

  it("takes a round from structuredContent unchanged", () => {
    const s = session({ remaining: 8, next: "exercise", next_due: "2026-10-28T10:25:00.000Z" });
    expect(asChatCardsSession(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it("refuses what isn't a round", () => {
    expect(asChatCardsSession(null)).toBeNull();
    expect(asChatCardsSession("x")).toBeNull();
    expect(asChatCardsSession({ ...session(), kind: "kartochki-setup" })).toBeNull();
    expect(asChatCardsSession({ ...session(), cards: undefined })).toBeNull();
    expect(asChatCardsSession({ ...session(), round_id: undefined })).toBeNull();
    expect(asChatCardsSession({ ...session(), day_end: undefined })).toBeNull();
  });

  it("fills what an older connector left out", () => {
    const bare = {
      kind: "kartochki-cards",
      version: 1,
      round_id: "r",
      built_at: "2026-10-28T10:00:00.000Z",
      day_end: "2026-10-29T03:00:00.000Z",
      cards: [{ word_id: "w2", direction: "ru_fr", expected: "2026-10-28T09:00:00.000Z", fr: "meuf", ru: "девушка", intervals: { 1: "1 мин", 2: "6 мин", 3: "1 д" } }],
    };
    const s = asChatCardsSession(bare)!;
    expect(s).toMatchObject({
      mode: "schedule",
      title: "",
      folder_label: "Все темы",
      direction: "both",
      direction_label: "FR ↔ RU",
      scope: null,
      counts: { due: 0, new: 0, waiting: 0, deferred: 0 },
      remaining: 0,
      next_due: null,
      next: null,
      app_url: null,
    });
    expect(s.cards[0]).toEqual({
      key: "w2:ru_fr",
      word_id: "w2",
      direction: "ru_fr",
      is_new: false,
      expected: "2026-10-28T09:00:00.000Z",
      intervals: { 1: "1 мин", 2: "6 мин", 3: "1 д" },
      number: null,
      fr: "meuf",
      ru: "девушка",
      pos: "other",
      gender: "none",
      slang_level: 0,
      verlan: false,
      example_fr: null,
      example_ru: null,
      note: null,
      origin: null,
      fields: [],
      fields_more: 0,
      level: null,
      level_estimated: false,
      folder_name: "",
    });
  });

  it("drops cards it can't show or grade, and a card sent twice", () => {
    const s = asChatCardsSession(
      session({
        cards: [
          card(),
          card(),
          card({ key: "w3:fr_ru", word_id: "w3", intervals: null }),
          { ...card({ key: "w4:fr_ru", word_id: "w4" }), expected: undefined } as unknown as ChatCard,
          { ...card({ key: "w5:fr_ru", word_id: "w5" }), direction: "both" } as unknown as ChatCard,
          { ...card({ key: "w6:fr_ru", word_id: "w6" }), fr: 6 } as unknown as ChatCard,
          null as unknown as ChatCard,
          card({ key: "w7:fr_ru", word_id: "w7", intervals: { 1: "x" } as unknown as ChatCard["intervals"] }),
          card({ key: "w8:fr_ru", word_id: "w8" }),
        ],
      }),
    )!;
    expect(s.cards.map((c) => c.key)).toEqual(["w1:fr_ru", "w8:fr_ru"]);
  });

  it("plays practice cards without intervals, and keeps no day numbers there", () => {
    const s = asChatCardsSession(
      session({ mode: "practice", scope: "today", remaining: 5, cards: [card({ intervals: null })], counts: { due: 3, new: 1, waiting: 0, deferred: 0 } }),
    )!;
    expect(s.mode).toBe("practice");
    expect(s.scope).toBe("today");
    expect(s.cards).toHaveLength(1);
    expect(s.cards[0].intervals).toBeNull();
    expect(s.counts).toEqual({ due: 0, new: 0, waiting: 0, deferred: 0 });
    expect(s.remaining).toBe(0);
    expect(asChatCardsSession({ ...session({ mode: "practice" }), scope: undefined })!.scope).toBe("recent");
  });

  it("keeps at most three custom fields and counts the rest", () => {
    const fields = ["a", "b", "c", "d", "e"].map((label) => ({ label, value: label.toUpperCase() }));
    const s = asChatCardsSession(session({ cards: [card({ fields: [...fields, { label: 1 } as unknown as (typeof fields)[number]], fields_more: 1 })] }))!;
    expect(s.cards[0].fields.map((f) => f.label)).toEqual(["a", "b", "c"]);
    expect(s.cards[0].fields_more).toBe(3);
  });

  it("sends only the answer fields grade_cards takes, in order", () => {
    const answers: (GradeAnswer & { extra?: string })[] = [
      { word_id: "w1", direction: "fr_ru", rating: 1, expected: "2026-10-28T09:00:00.000Z", answered_at: "2026-10-28T10:01:00.000Z", extra: "x" },
      { word_id: "w2", direction: "ru_fr", rating: 3, expected: "2026-10-28T08:00:00.000Z", answered_at: "2026-10-28T10:02:00.000Z" },
    ];
    expect(gradeArguments(answers)).toEqual({
      answers: [
        { word_id: "w1", direction: "fr_ru", rating: 1, expected: "2026-10-28T09:00:00.000Z", answered_at: "2026-10-28T10:01:00.000Z" },
        { word_id: "w2", direction: "ru_fr", rating: 3, expected: "2026-10-28T08:00:00.000Z", answered_at: "2026-10-28T10:02:00.000Z" },
      ],
    });
    expect(gradeArguments([])).toEqual({ answers: [] });
  });

  it("reads a grade result, and passes its undo back unchanged", () => {
    const saved = {
      word_id: "w1",
      direction: "fr_ru",
      key: "w1:fr_ru",
      status: "saved",
      log_id: "cr-abc",
      expected: "2026-10-28T10:01:00.000Z",
      due: "2026-10-28T10:02:00.000Z",
      state: 3,
      intervals: { 1: "<1 мин", 2: "6 мин", 3: "10 мин" },
      returns_in_ms: 60_000,
    };
    const gone = { word_id: "w2", direction: "fr_ru", status: "gone", log_id: null, expected: null, due: null, state: null, intervals: null, returns_in_ms: null };
    const raw = {
      results: [saved, gone, { word_id: "w3", direction: "fr_ru", status: "weird" }, null],
      undo: { tool: "undo_grades", items: [{ log_id: "cr-abc", expected: "2026-10-28T10:01:00.000Z" }, { log_id: 1 }] },
    };
    const result = asGradeCardsResult(raw)!;
    expect(result.results).toEqual([saved, { ...gone, key: "w2:fr_ru" }]);
    expect(result.undo).toEqual({ tool: "undo_grades", items: [{ log_id: "cr-abc", expected: "2026-10-28T10:01:00.000Z" }] });
    expect(undoArguments(result.undo!.items)).toEqual({ items: [{ log_id: "cr-abc", expected: "2026-10-28T10:01:00.000Z" }] });
    expect(asGradeCardsResult({ results: [gone] })!.undo).toBeNull();
    expect(asGradeCardsResult({})).toBeNull();
    expect(asGradeCardsResult(null)).toBeNull();
  });

  it("reads an undo result", () => {
    const undone = {
      log_id: "cr-abc",
      status: "undone",
      word_id: "w1",
      direction: "fr_ru",
      key: "w1:fr_ru",
      expected: "2026-10-28T10:03:00.000Z",
      intervals: { 1: "<1 мин", 2: "6 мин", 3: "3 д" },
      due: "2026-10-28T09:00:00.000Z",
      state: 2,
    };
    const result = asUndoGradesResult({ results: [undone, { log_id: "cr-x", status: "nope" }, { status: "undone" }] })!;
    expect(result.results).toEqual([undone]);
    expect(asUndoGradesResult({ results: "no" })).toBeNull();
  });

  it("brings a card back in the round only when it was written and is due within 20 min", () => {
    expect(returnsInRound({ status: "saved", returns_in_ms: 60_000 })).toBe(true);
    expect(returnsInRound({ status: "already_saved", returns_in_ms: -5 })).toBe(true);
    expect(returnsInRound({ status: "saved", returns_in_ms: LEARN_AHEAD_MS })).toBe(true);
    expect(returnsInRound({ status: "saved", returns_in_ms: LEARN_AHEAD_MS + 1 })).toBe(false);
    expect(returnsInRound({ status: "conflict", returns_in_ms: 0 })).toBe(false);
    expect(returnsInRound({ status: "gone", returns_in_ms: null })).toBe(false);
  });
});
