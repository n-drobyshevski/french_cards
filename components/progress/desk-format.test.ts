import { describe, expect, it } from "vitest";
import {
  addMonths,
  calendarMonths,
  dayCardNote,
  defaultDay,
  deskMonthAria,
  deskMonthTitle,
  deskSquareSize,
  deskSubline,
  monthTally,
  numericDate,
  progressAxis,
  rangeLabel,
  shortDay,
  stepDay,
  steppableDays,
  tallyLine,
  trendAria,
} from "./desk-format";
import { sparkGeometry } from "./format";

const point = { known: 412, learning: 350, fresh: 500, paused: 0, memorized: 640.4, correct: 0.88 };

describe("dates", () => {
  it("formats the ledger heads, the card date and the range", () => {
    expect(shortDay("2026-09-03")).toBe("3 сент");
    expect(shortDay("2026-10-25")).toBe("25 окт");
    expect(shortDay("2026-05-01")).toBe("1 мая");
    expect(numericDate("2026-10-01")).toBe("01.10.2026");
    expect(rangeLabel("2026-09-03", "2026-10-25")).toBe("3.09 – 25.10.2026");
    expect(rangeLabel("2025-12-30", "2026-01-02")).toBe("30.12.2025 – 2.01.2026");
    expect(rangeLabel("2026-10-25", "2026-10-25")).toBe("25.10.2026");
  });

  it("adds months across years", () => {
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-10-25", 1)).toBe("2026-11");
  });
});

describe("deskSubline", () => {
  it("reads «412 знаю · 350 учу · 500 новых · помню ≈ 640 · 88 % верно»", () => {
    const parts = deskSubline(point);
    expect(parts[0]).toEqual({ text: "412 знаю", strong: true });
    expect(parts.map((p) => p.text).join(" · ")).toBe("412 знаю · 350 учу · 500 новых · помню ≈ 640 · 88\u00a0% верно");
  });

  it("leaves zero parts and today's missing «верно» out, adds «на паузе»", () => {
    const parts = deskSubline({ ...point, learning: 0, fresh: 0, paused: 56, memorized: 0, correct: null });
    expect(parts.map((p) => p.text)).toEqual(["412 знаю", "56 на паузе"]);
  });
});

describe("trendAria", () => {
  it("says first → last and the extremes outside them", () => {
    expect(trendAria([0, 200, 412])).toBe("с 0 до 412");
    expect(trendAria([80, 132, 31, 96])).toBe("с 80 до 96; от 31 до 132");
    expect(trendAria([])).toBe("пока нет данных");
  });
});

describe("calendar months", () => {
  it("shows last month and this one once there was something last month", () => {
    expect(calendarMonths("2026-10-25", null, "2026-09-03")).toEqual(["2026-09", "2026-10"]);
    expect(calendarMonths("2026-10-25", "2026-09-21", "2026-08-01")).toEqual(["2026-09", "2026-10"]);
    expect(calendarMonths("2026-10-25", null, "2026-10-02")).toEqual(["2026-10"]);
    expect(calendarMonths("2026-01-05", null, "2025-11-02")).toEqual(["2025-12", "2026-01"]);
  });

  it("follows a day picked further back", () => {
    expect(calendarMonths("2026-10-25", "2026-07-14", "2026-03-01")).toEqual(["2026-07", "2026-08"]);
  });

  it("names a month with its year only when it is not this year's", () => {
    expect(deskMonthTitle("2026-09", "2026-10-25")).toBe("Сентябрь");
    expect(deskMonthTitle("2025-12", "2026-01-05")).toBe("Декабрь 2025");
  });

  it("sizes squares 6 / 10 / 13 / 16 against the busiest day", () => {
    expect(deskSquareSize(0, 100)).toBe(6);
    expect(deskSquareSize(30, 100)).toBe(6);
    expect(deskSquareSize(50, 100)).toBe(10);
    expect(deskSquareSize(70, 100)).toBe(13);
    expect(deskSquareSize(100, 100)).toBe(16);
    expect(deskSquareSize(5, 0)).toBe(6);
  });

  it("tallies a month from the first study day to today", () => {
    const active = new Set(["2026-10-01", "2026-10-02", "2026-10-04", "2026-10-05"]);
    const t = monthTally("2026-10", "2026-10-05", "2026-09-03", active);
    expect(t).toEqual({ active: 4, elapsed: 5, missed: ["2026-10-03"] });
    expect(tallyLine(t)).toBe("4 дня из 5");
    expect(deskMonthAria("2026-10", t)).toBe(
      "Октябрь 2026: занятия 4 дня из 5, без занятий 3 октября; размер квадрата — число повторений, рамка — день без занятий",
    );
    // Today not studied yet is not counted against the month.
    const before = monthTally("2026-10", "2026-10-06", "2026-09-03", active);
    expect(before.elapsed).toBe(5);
    expect(tallyLine({ active: 0, elapsed: 0 })).toBeNull();
    expect(deskMonthAria("2026-08", { active: 0, elapsed: 0, missed: [] })).toBe("Август 2026: занятий не было");
  });
});

describe("the day pane", () => {
  const active = ["2026-10-20", "2026-10-21", "2026-10-23"];

  it("opens on today once studied, else on the latest study day", () => {
    expect(defaultDay(active, "2026-10-25")).toBe("2026-10-23");
    expect(defaultDay([...active, "2026-10-25"], "2026-10-25")).toBe("2026-10-25");
    expect(defaultDay([], "2026-10-25")).toBe("2026-10-25");
  });

  it("steps through the study days and today", () => {
    const days = steppableDays(active, "2026-10-25");
    expect(days).toEqual(["2026-10-20", "2026-10-21", "2026-10-23", "2026-10-25"]);
    expect(stepDay(days, "2026-10-23", -1)).toBe("2026-10-21");
    expect(stepDay(days, "2026-10-23", 1)).toBe("2026-10-25");
    expect(stepDay(days, "2026-10-20", -1)).toBeNull();
    expect(stepDay(days, "2026-10-25", 1)).toBeNull();
    expect(stepDay(days, "2026-10-22", -1)).toBe("2026-10-21");
  });

  it("notes when «знаю» was counted", () => {
    expect(dayCardNote("2026-10-21", "2026-10-25", 412)).toBe("Знаю — на конец дня. Сегодня 412.");
    expect(dayCardNote("2026-10-25", "2026-10-25", 412)).toBe("Знаю — на сейчас, день ещё идёт.");
  });
});

describe("progressAxis", () => {
  it("runs from the first study day or the range start, whichever is later, to today", () => {
    const today = { day: "2026-10-25" };
    expect(progressAxis({ today, since: "2026-09-03", series: [], rangeFrom: "2026-08-01" })).toEqual({ from: "2026-09-03", to: "2026-10-25" });
    expect(progressAxis({ today, since: "2026-09-03", series: [], rangeFrom: "2026-10-01" })).toEqual({ from: "2026-10-01", to: "2026-10-25" });
  });
});

describe("sparkGeometry marker", () => {
  const pts = [
    { day: "2026-10-01", value: 0 },
    { day: "2026-10-03", value: 10 },
  ];

  it("marks a day inside the axis, with its value's y when it has one", () => {
    const g = sparkGeometry(pts, "2026-10-01", "2026-10-05", { width: 320, height: 32, floor: 0, marker: "2026-10-03" });
    expect(g.marker).toEqual({ x: 159, y: 4 });
    const gap = sparkGeometry(pts, "2026-10-01", "2026-10-05", { width: 320, height: 32, floor: 0, marker: "2026-10-02" });
    expect(gap.marker?.y).toBeNull();
  });

  it("marks nothing outside the axis or without a marker", () => {
    expect(sparkGeometry(pts, "2026-10-01", "2026-10-05", { marker: "2026-09-30" }).marker).toBeNull();
    expect(sparkGeometry(pts, "2026-10-01", "2026-10-05").marker).toBeNull();
  });
});
