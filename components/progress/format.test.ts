import { describe, expect, it } from "vitest";
import type { DayPoint } from "@/lib/progress";
import {
  calendarDayAria,
  calendarDayKind,
  changeSince,
  dayHeading,
  dayRange,
  dayStatParts,
  formatCount,
  libraryAria,
  listDays,
  monthAria,
  monthGrid,
  monthSummary,
  monthSummaryLine,
  monthTitle,
  percent,
  planSubline,
  signed,
  sparkGeometry,
  squareSize,
  stageParts,
  streakAria,
  streakLine,
  sublinePeriod,
  usualNewWords,
  weekDelta,
} from "./format";
import { parseProgressRange } from "./range";

const NB = " ";

function point(day: string, over: Partial<DayPoint> = {}): DayPoint {
  return {
    day,
    known: 0,
    learning: 0,
    fresh: 0,
    difficult: 0,
    paused: 0,
    total: 0,
    memorized: 0,
    reviews: 0,
    again: 0,
    new_introduced: 0,
    new_words: 0,
    added: 0,
    exercises: 0,
    active: false,
    correct: null,
    source: "live",
    ...over,
  };
}

describe("numbers", () => {
  it("groups thousands with a no-break space and signs changes", () => {
    expect(formatCount(96)).toBe("96");
    expect(formatCount(2410)).toBe(`2${NB}410`);
    expect(formatCount(1234567)).toBe(`1${NB}234${NB}567`);
    expect(signed(23)).toBe("+23");
    expect(signed(-5)).toBe("−5");
    expect(signed(0)).toBe("0");
    expect(percent(0.884)).toBe(`88${NB}%`);
    expect(percent(null)).toBe("—");
  });
});

describe("dates", () => {
  it("names days and months in Russian", () => {
    expect(dayHeading("2026-10-21")).toBe("Среда, 21 октября");
    expect(monthTitle("2026-10")).toBe("Октябрь 2026");
    expect(dayRange("2026-09-10", "2026-09-28")).toBe("10–28 сентября");
    expect(dayRange("2026-09-28", "2026-10-03")).toBe("28 сентября – 3 октября");
    expect(listDays(["2026-10-06", "2026-10-07", "2026-10-13"])).toBe("6, 7 и 13 октября");
    expect(listDays(["2026-10-06"])).toBe("6 октября");
  });
});

describe("streakLine", () => {
  const streak = { current: 12, currentFrom: "2026-10-14", best: 19, bestFrom: "2026-09-10", bestTo: "2026-09-28" };
  it("is the one mono line: streak, best, active days", () => {
    expect(streakLine(streak, 48)).toBe("12 дней подряд · лучшая 19 · 48 дней занятий");
    expect(streakAria(streak, 48, "2026-09-03")).toBe(
      "Серия: 12 дней подряд, с 14 октября. Лучшая серия — 19 дней, 10–28 сентября. Всего 48 дней занятий с 3 сентября.",
    );
  });
  it("drops the streak at 0, «лучшая» when it is the current one, everything before any day", () => {
    expect(streakLine({ ...streak, current: 0, currentFrom: null }, 48)).toBe("лучшая 19 · 48 дней занятий");
    expect(streakLine({ current: 3, currentFrom: "2026-10-23", best: 3, bestFrom: "2026-10-23", bestTo: "2026-10-25" }, 3)).toBe(
      "3 дня подряд · 3 дня занятий",
    );
    expect(streakLine({ current: 1, currentFrom: "2026-10-25", best: 1, bestFrom: "2026-10-25", bestTo: "2026-10-25" }, 1)).toBe(
      "1 день подряд · 1 день занятий",
    );
    expect(streakLine({ current: 0, currentFrom: null, best: 0, bestFrom: null, bestTo: null }, 0)).toBeNull();
  });
});

describe("the library now", () => {
  const today = point("2026-10-25", { known: 412, learning: 350, fresh: 500, paused: 56, total: 1318 });
  it("says the stages without zeros", () => {
    expect(stageParts(today)).toEqual(["учу 350", "новых 500", "на паузе 56"]);
    expect(stageParts({ learning: 4, fresh: 0, paused: 0 })).toEqual(["учу 4"]);
    expect(libraryAria(today)).toBe(`Библиотека, 1${NB}318 слов: знаю 412, учу 350, новых 500, на паузе 56`);
  });
  it("«+23 за неделю» only with a stored day a week ago and a change", () => {
    expect(weekDelta(today, { known: 389 })).toBe("+23 за неделю");
    expect(weekDelta(today, { known: 412 })).toBeNull();
    expect(weekDelta(today, null)).toBeNull();
  });
});

describe("periods and changes", () => {
  it("month and 3 months speak of this month, year and all of the range", () => {
    expect(sublinePeriod("3m", "2026-10-25", "2026-09-03")).toEqual({ from: "2026-10-01", over: "за октябрь", within: "в октябре" });
    expect(sublinePeriod("year", "2026-10-25", "2025-11-01").over).toBe("за год");
    expect(sublinePeriod("all", "2026-10-25", "2026-09-03").within).toBe("с 3 сентября");
  });
  it("changeSince counts from the last point before the period, else its first point", () => {
    const series = [
      { day: "2026-09-29", v: 580 },
      { day: "2026-09-30", v: 590 },
      { day: "2026-10-01", v: 600 },
      { day: "2026-10-25", v: 640 },
    ];
    expect(changeSince(series, "2026-10-01", (p) => p.v)).toBe(50);
    expect(changeSince(series.slice(2), "2026-10-01", (p) => p.v)).toBe(40);
    expect(changeSince(series.slice(3), "2026-10-01", (p) => p.v)).toBeNull();
  });
});

describe("sparkGeometry", () => {
  it("plots by day, breaks at gaps and marks today", () => {
    const g = sparkGeometry(
      [
        { day: "2026-10-01", value: 0 },
        { day: "2026-10-02", value: 10 },
        { day: "2026-10-04", value: 5 },
        { day: "2026-10-05", value: 10 },
      ],
      "2026-10-01",
      "2026-10-05",
      { floor: 0 },
    );
    expect(g.lines).toEqual(["2,21 30.5,4", "87.5,12.5 116,4"]);
    expect(g.today).toEqual({ x: 116, y: 4 });
    expect(g.dots).toEqual([]);
    expect(g.refY).toBeNull();
  });
  it("draws a lone day as a dot, keeps the reference inside the scale, no red point without today", () => {
    const g = sparkGeometry(
      [
        { day: "2026-10-01", value: 0.8 },
        { day: "2026-10-03", value: 0.9 },
      ],
      "2026-10-01",
      "2026-10-05",
      { ceil: 1, reference: 0.95 },
    );
    expect(g.lines).toEqual([]);
    expect(g.dots).toHaveLength(2);
    expect(g.today).toBeNull();
    expect(g.refY).not.toBeNull();
    expect(g.refY!).toBeGreaterThan(4);
    expect(g.refY!).toBeLessThan(21);
  });
  it("puts a single day at the right edge and a flat line in the middle", () => {
    const one = sparkGeometry([{ day: "2026-10-25", value: 7 }], "2026-10-25", "2026-10-25");
    expect(one.today).toEqual({ x: 116, y: 12.5 });
    const zero = sparkGeometry([{ day: "2026-10-25", value: 0 }], "2026-10-25", "2026-10-25", { floor: 0 });
    expect(zero.today).toEqual({ x: 116, y: 21 });
  });
});

describe("calendar", () => {
  it("lays a month out Monday first", () => {
    const grid = monthGrid("2026-10");
    expect(grid.length % 7).toBe(0);
    expect(grid.slice(0, 4)).toEqual([null, null, null, "2026-10-01"]); // 1 October 2026 is a Thursday
    expect(grid.filter(Boolean)).toHaveLength(31);
    expect(monthGrid("2026-06")[0]).toBe("2026-06-01"); // a Monday
  });
  it("sizes squares against the busiest day", () => {
    expect(squareSize(132, 132)).toBe(20);
    expect(squareSize(98, 132)).toBe(16);
    expect(squareSize(86, 132)).toBe(12);
    expect(squareSize(0, 132)).toBe(12);
  });
  it("tells the kind of each day and names it", () => {
    const active = new Set(["2026-10-05", "2026-10-25"]);
    expect(calendarDayKind("2026-10-26", "2026-10-25", "2026-09-03", active)).toBe("future");
    expect(calendarDayKind("2026-10-25", "2026-10-25", "2026-09-03", active)).toBe("today");
    expect(calendarDayKind("2026-10-05", "2026-10-25", "2026-09-03", active)).toBe("active");
    expect(calendarDayKind("2026-10-06", "2026-10-25", "2026-09-03", active)).toBe("missed");
    expect(calendarDayKind("2026-09-01", "2026-10-25", "2026-09-03", active)).toBe("before");
    expect(calendarDayAria("2026-10-01", "active", 108, 0, true)).toBe("1 октября, 108 повторений");
    expect(calendarDayAria("2026-10-03", "active", 122, 0, true)).toBe("3 октября, 122 повторения");
    expect(calendarDayAria("2026-10-06", "missed", 0, 0, false)).toBe("6 октября, без занятий");
    expect(calendarDayAria("2026-10-25", "today", 96, 0, true)).toBe("25 октября, 96 повторений, сегодня");
    expect(calendarDayAria("2026-10-26", "future", 0, 0, false)).toBe("26 октября, впереди");
    expect(calendarDayAria("2026-10-07", "active", 0, 1, true)).toBe("7 октября, 1 упражнение");
  });
  it("sums the month: «22 дня из 25 · 2 410 повторений · знаю +64»", () => {
    const keys: string[] = [];
    const series: DayPoint[] = [point("2026-09-30", { known: 348 })];
    for (let d = 1; d <= 25; d++) {
      const key = `2026-10-${String(d).padStart(2, "0")}`;
      const off = [6, 7, 13].includes(d);
      if (!off) keys.push(key);
      series.push(point(key, { known: 348 + Math.round((64 * d) / 25), reviews: off ? 0 : d === 25 ? 100 : 110, active: !off }));
    }
    const s = monthSummary("2026-10", "2026-10-25", "2026-09-03", keys, series);
    expect(s).toMatchObject({ active: 22, elapsed: 25, missed: ["2026-10-06", "2026-10-07", "2026-10-13"], reviews: 2410, knownDelta: 64 });
    expect(monthSummaryLine(s)).toBe(`22 дня из 25 · 2${NB}410 повторений · знаю +64`);
    expect(monthAria("2026-10", s, 7)).toBe(
      "Октябрь 2026: занятия 22 дня из 25, без занятий 6, 7 и 13 октября; на этой неделе 7 из 7; размер квадрата — число повторений, пунктирная рамка — день без занятий",
    );
  });
  it("counts the month from the first active day, today only once studied", () => {
    const s = monthSummary("2026-10", "2026-10-25", "2026-10-20", ["2026-10-20", "2026-10-22"], []);
    expect(s).toMatchObject({ active: 2, elapsed: 5, missed: ["2026-10-21", "2026-10-23", "2026-10-24"], reviews: 0, knownDelta: null });
    expect(monthSummaryLine(s)).toBe("2 дня из 5");
  });
});

describe("the opened day", () => {
  it("leaves out zeros but always says «Знаю»", () => {
    expect(dayStatParts(point("2026-10-21", { reviews: 104, new_introduced: 12, new_words: 10, correct: 0.92, known: 398 }))).toEqual([
      { label: "Повторено", value: "104" },
      { label: "Новых слов", value: "10" },
      { label: "Новых карточек", value: "12" },
      { label: "Верно", value: `92${NB}%` },
      { label: "Знаю", value: "398" },
    ]);
    expect(dayStatParts(point("2026-10-25", { known: 412 }))).toEqual([{ label: "Знаю", value: "412" }]);
  });

  it("says the cards once when they are the words, and only cards in the plan's «together» mode", () => {
    expect(dayStatParts(point("2026-10-21", { reviews: 40, new_introduced: 10, new_words: 10, known: 398 })).map((s) => s.label)).toEqual([
      "Повторено",
      "Новых слов",
      "Знаю",
    ]);
    expect(dayStatParts(point("2026-10-21", { reviews: 40, new_introduced: 14, new_words: 14, known: 398 }), true).map((s) => s.label)).toEqual([
      "Повторено",
      "Новых карточек",
      "Знаю",
    ]);
  });
});

describe("«Новых слов в день» against the plan", () => {
  const days = [
    point("2026-10-20", { reviews: 90, new_words: 10 }),
    point("2026-10-21", { reviews: 0, exercises: 1, new_words: 0 }), // an exercise only: not a study day
    point("2026-10-22", { reviews: 110, new_words: 6 }),
    point("2026-10-23", { reviews: 100, new_words: 10 }),
  ];

  it("is the median over the study days; a day off is never a 0", () => {
    expect(usualNewWords(days, "2026-10-25", 10)).toBe(10);
    expect(usualNewWords([...days, point("2026-10-24", { reviews: 80, new_words: 4 })], "2026-10-25", 10)).toBe(8);
    expect(usualNewWords([], "2026-10-25", 10)).toBeNull();
  });

  it("counts today only once its new words reached the plan", () => {
    const early = [point("2026-10-24", { reviews: 80, new_words: 6 }), point("2026-10-25", { reviews: 20, new_words: 2 })];
    expect(usualNewWords(early, "2026-10-25", 10)).toBe(6);
    expect(usualNewWords([...early.slice(0, 1), point("2026-10-25", { reviews: 60, new_words: 10 })], "2026-10-25", 10)).toBe(8);
  });

  it("words the plan as a ceiling, never as a ratio", () => {
    expect(planSubline(10, 10)).toBe("обычно 10 · до 10 по плану");
    expect(planSubline(6, 10)).toBe("обычно 6 · до 10 по плану");
    expect(planSubline(6, null)).toBe("обычно 6");
    expect(planSubline(null, 10)).toBeNull();
  });
});

describe("range", () => {
  it("parses the stored period, defaulting to 3 months", () => {
    expect(parseProgressRange("year")).toBe("year");
    expect(parseProgressRange("week")).toBe("3m");
    expect(parseProgressRange(null)).toBe("3m");
  });
});
