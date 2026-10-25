import { describe, expect, it } from "vitest";
import type { DayPlan } from "@/lib/core/plan";
import { DEFAULT_STUDY_PLAN, LEGACY_STUDY_PLAN, type StudyPlan } from "@/lib/core/study-plan";
import { queueSummary, queueSummaryParts } from "./format";
import {
  dayStrip,
  newTicks,
  newWordsToday,
  overrideOffered,
  planHeld,
  planShort,
  planSummary,
  queueNew,
  reasonLine,
  returnAxis,
  returnGroups,
  reverseToday,
  sublineParts,
  summaryAria,
  waitIn,
  waitingSummary,
  waitTitle,
} from "./plan-format";

const plan = (patch: Partial<StudyPlan> = {}): StudyPlan => ({ ...DEFAULT_STUDY_PLAN, ...patch });
const legacy = (patch: Partial<StudyPlan> = {}): StudyPlan => ({ ...LEGACY_STUDY_PLAN, new_words: 20, ...patch });

const day = (patch: Partial<DayPlan> = {}): DayPlan => ({
  ceiling: 10,
  budget: 10,
  newToday: 0,
  newLeft: 10,
  ruLeft: 10,
  ruToday: 0,
  reason: "limit",
  backlog: false,
  override: false,
  canOverride: false,
  cap: 200,
  capDone: 0,
  dueReviews: 27,
  deferred: 0,
  buried: 0,
  forecast7: 40,
  load: 1,
  accuracy7: 0.9,
  accuracyLogs: 50,
  available: { fr: 100, ru: 6 },
  ...patch,
});

describe("plan summaries", () => {
  it("counts words, or cards with «Назавтра»", () => {
    expect(planSummary(plan())).toBe("10 слов в день · до 200 повторений");
    expect(planSummary(plan({ new_words: 1, review_cap: null }))).toBe("1 слово в день · без лимита повторений");
    expect(planSummary(legacy())).toBe("20 карточек в день · без лимита повторений");
    expect(planShort(plan())).toBe("10 слов · до 200");
    expect(planShort(plan({ new_words: 3, review_cap: null }))).toBe("3 слова · без лимита");
  });
});

describe("the review summary", () => {
  const item = (isNew: boolean, direction: "fr_ru" | "ru_fr") => ({ isNew, direction });
  const queue = [item(false, "fr_ru"), item(true, "fr_ru"), item(true, "ru_fr"), item(true, "fr_ru"), item(false, "ru_fr")];

  it("splits reverse sides only with «После 3 дней узнавания» and both directions", () => {
    expect(queueNew(queue, plan())).toEqual({ fresh: 2, reverse: 1 });
    expect(queueNew(queue, plan(), "ru_fr")).toEqual({ fresh: 3, reverse: 0 });
    expect(queueNew(queue, legacy())).toEqual({ fresh: 3, reverse: 0 });
  });

  it("names the parts, leaving out the ones at 0", () => {
    expect(queueSummary(27, 4, 6)).toBe("27 к повторению · 4 новых · 6 обратных");
    expect(queueSummary(0, 0, 1)).toBe("1 обратная");
    expect(queueSummary(0, 11)).toBe("11 новых");
    expect(summaryAria(queueSummaryParts(27, 4, 6))).toBe("План на сегодня: 27 к повторению, 4 новых, 6 обратных");
  });

  it("puts the ticks where the new cards sit", () => {
    expect(newTicks(queue, 5, 10)).toEqual([0.6, 0.7, 0.8]);
    expect(newTicks(queue, 0, 0)).toEqual([]);
  });
});

describe("the reason subline and line", () => {
  it("shows only while new words are held back", () => {
    expect(sublineParts(day())).toBeNull();
    expect(sublineParts(day({ reason: "empty" }))).toBeNull();
    expect(sublineParts(day({ reason: "accuracy", override: true }))).toBeNull();
    expect(planHeld(day({ reason: "load" }))).toBe(true);
  });

  it("names the reason", () => {
    expect(sublineParts(day({ reason: "accuracy", budget: 4, accuracy7: 0.74 }))).toEqual([
      { text: "Новых", value: "4 из 10" },
      { text: "точность за неделю", value: "74\u00a0%" },
    ]);
    expect(sublineParts(day({ reason: "load", budget: 4 }))).toEqual([{ text: "Новых", value: "4 из 10" }, { text: "много повторений на неделе" }]);
    expect(sublineParts(day({ reason: "backlog", backlog: true, budget: 0, deferred: 140 }))).toEqual([
      { text: "Отложено", value: "140" },
      { text: "новые на паузе" },
    ]);
    expect(reasonLine(day({ reason: "accuracy", accuracy7: 0.74 }), plan())).toBe(`Точность за неделю 74\u00a0% — новых сегодня меньше.`);
    expect(reasonLine(day({ reason: "load" }), plan())).toBe("На неделе много повторений — новых сегодня меньше.");
    expect(reasonLine(day({ reason: "backlog", deferred: 140 }), plan())).toBe(
      "Повторений больше, чем помещается в день: 140 — на завтра. Новые на паузе.",
    );
    expect(reasonLine(day({ reason: "empty", available: { fr: 0, ru: 0 } }), plan())).toBe("Новых слов в библиотеке больше нет.");
    expect(reasonLine(day({ reason: "empty", available: { fr: 3, ru: 0 } }), plan())).toBe("Новых слов в библиотеке осталось 3.");
    expect(reasonLine(day(), plan())).toBeNull();
    expect(reasonLine(day({ reason: "load", override: true }), plan())).toBeNull();
  });
});

describe("the receipt", () => {
  it("keeps today's new words steady as they are introduced", () => {
    expect(newWordsToday(day({ budget: 4 }), plan())).toBe(4);
    expect(newWordsToday(day({ budget: 4, newToday: 2, newLeft: 2, available: { fr: 98, ru: 6 } }), plan())).toBe(4);
    // Fewer left in the library than the day's number.
    expect(newWordsToday(day({ budget: 10, available: { fr: 3, ru: 0 } }), plan())).toBe(3);
    expect(reverseToday(day({ ruLeft: 10, available: { fr: 0, ru: 6 } }))).toBe(6);
    expect(reverseToday(day({ ruToday: 2, ruLeft: 8, available: { fr: 0, ru: 4 } }))).toBe(6);
  });

  it("offers the override only below the ceiling with new words left", () => {
    expect(overrideOffered(day({ canOverride: true }), plan())).toBe(true);
    expect(overrideOffered(day({ canOverride: false }), plan())).toBe(false);
    expect(overrideOffered(day({ canOverride: true, available: { fr: 0, ru: 5 } }), plan())).toBe(false);
    expect(overrideOffered(day({ canOverride: true, available: { fr: 0, ru: 5 } }), legacy())).toBe(true);
  });

  it("draws the phone day strip with the same numbers, zero parts off the line", () => {
    const held = dayStrip({ due: 27, day: day({ budget: 4, deferred: 140 }), plan: plan() });
    expect(held).toMatchObject({ due: 27, slots: 10, fresh: 4, reverse: 6, deferred: 140 });
    expect(held.parts.map((p) => `${p.text} ${p.value}`)).toEqual(["Повт. 27", "Нов. 4/10", "Обр. 6", "Отл. 140"]);
    expect(held.label).toBe("К повторению 27, новых слов 4 из 10, обратных сторон 6, отложено 140");
    const quiet = dayStrip({ due: 0, day: day({ available: { fr: 100, ru: 0 } }), plan: plan() });
    expect(quiet.parts.map((p) => p.key)).toEqual(["new"]);
    expect(quiet.label).toBe("К повторению 0, новых слов 10 из 10, обратных сторон 0");
  });
});

describe("the wait screen", () => {
  it("counts the cards and the minutes", () => {
    expect(waitingSummary(3)).toBe("Ждут 3 карточки");
    expect(waitingSummary(1)).toBe("Ждёт 1 карточка");
    expect(waitingSummary(21)).toBe("Ждёт 21 карточка");
    expect(waitingSummary(11)).toBe("Ждут 11 карточек");
    expect(waitIn(12 * 60_000)).toBe("12 мин");
    expect(waitIn(11 * 60_000 + 1)).toBe("12 мин");
    expect(waitIn(0)).toBe("1 мин");
    expect(waitIn(65 * 60_000)).toBe("1 ч 5 мин");
    expect(waitIn(120 * 60_000)).toBe("2 ч");
    expect(waitTitle(3)).toBe("ещё 3 карточки");
  });

  it("puts the waiting cards on the shortest axis that holds them", () => {
    expect(returnAxis(47 * 60_000)).toEqual({
      span: 60 * 60_000,
      marks: [
        { at: 0.25, label: "15" },
        { at: 0.5, label: "30" },
        { at: 0.75, label: "45" },
        { at: 1, label: "60 мин" },
      ],
    });
    expect(returnAxis(61 * 60_000).marks.map((m) => m.label)).toEqual(["30", "60", "90", "120 мин"]);
    expect(returnAxis(3 * 3_600_000).marks.map((m) => m.label)).toEqual(["1 ч", "2 ч", "3 ч", "4 ч"]);
    const min = 60_000;
    expect(returnGroups([33 * min, 26 * min, 47 * min, 47 * min], 0, 60 * min)).toEqual([
      { due: 26 * min, at: 26 / 60, count: 1 },
      { due: 33 * min, at: 33 / 60, count: 1 },
      { due: 47 * min, at: 47 / 60, count: 2 },
    ]);
  });
});
