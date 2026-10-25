import { describe, expect, it } from "vitest";
import { DAY_START_HOUR as DEVICE_DAY_START } from "@/lib/session";
import { DAY_START_HOUR, studyDay, studyDayKey, studyDayKeyer, studyDayStartBefore, studyDayStartOf } from "./study-day";

const iso = (d: Date) => d.toISOString();
const day = (now: string, zone: string) => {
  const { start, end } = studyDay(new Date(now), zone);
  return [iso(start), iso(end)];
};

describe("studyDay", () => {
  it("starts at the device's hour", () => {
    expect(DAY_START_HOUR).toBe(DEVICE_DAY_START);
  });

  it("runs 04:00 to 04:00 on the zone's clock; before 04:00 is still yesterday", () => {
    expect(day("2026-10-22T10:00:00Z", "Europe/Paris")).toEqual(["2026-10-22T02:00:00.000Z", "2026-10-23T02:00:00.000Z"]);
    // 03:30 in Paris (CEST) belongs to the day that began on the 21st.
    expect(day("2026-10-22T01:30:00Z", "Europe/Paris")).toEqual(["2026-10-21T02:00:00.000Z", "2026-10-22T02:00:00.000Z"]);
    expect(day("2026-10-22T02:00:00Z", "Europe/Paris")[0]).toBe("2026-10-22T02:00:00.000Z");
    expect(day("2026-10-22T10:00:00Z", "UTC")).toEqual(["2026-10-22T04:00:00.000Z", "2026-10-23T04:00:00.000Z"]);
  });

  it("is 23 h long when the clocks go forward and 25 h when they go back", () => {
    // Paris: 2026-03-29 02:00 CET → 03:00 CEST; 2026-10-25 03:00 CEST → 02:00 CET.
    expect(day("2026-03-28T12:00:00Z", "Europe/Paris")).toEqual(["2026-03-28T03:00:00.000Z", "2026-03-29T02:00:00.000Z"]);
    expect(day("2026-10-24T12:00:00Z", "Europe/Paris")).toEqual(["2026-10-24T02:00:00.000Z", "2026-10-25T03:00:00.000Z"]);
    // New York: 2026-03-08 and 2026-11-01.
    expect(day("2026-03-08T12:00:00Z", "America/New_York")).toEqual(["2026-03-08T08:00:00.000Z", "2026-03-09T08:00:00.000Z"]);
    expect(day("2026-03-07T12:00:00Z", "America/New_York")).toEqual(["2026-03-07T09:00:00.000Z", "2026-03-08T08:00:00.000Z"]);
    expect(day("2026-11-01T12:00:00Z", "America/New_York")).toEqual(["2026-11-01T09:00:00.000Z", "2026-11-02T09:00:00.000Z"]);
    expect(day("2026-10-31T12:00:00Z", "America/New_York")).toEqual(["2026-10-31T08:00:00.000Z", "2026-11-01T09:00:00.000Z"]);
  });

  it("crosses month and year ends, and works east of UTC", () => {
    expect(day("2026-01-01T00:30:00Z", "Europe/Paris")).toEqual(["2025-12-31T03:00:00.000Z", "2026-01-01T03:00:00.000Z"]);
    expect(day("2026-07-01T00:30:00Z", "Asia/Tokyo")).toEqual(["2026-06-30T19:00:00.000Z", "2026-07-01T19:00:00.000Z"]);
  });

  it("goes back whole calendar days, 04:00 to 04:00, across DST", () => {
    // Paris after the clocks go back (2026-10-25): 7 days before is 169 h back, in CEST.
    const after = studyDay(new Date("2026-10-28T12:00:00Z"), "Europe/Paris").start;
    expect(iso(studyDayStartBefore(after, 7, "Europe/Paris"))).toBe("2026-10-21T02:00:00.000Z");
    expect(after.getTime() - studyDayStartBefore(after, 7, "Europe/Paris").getTime()).toBe(169 * 3_600_000);
    // After the clocks go forward: 167 h.
    const spring = studyDay(new Date("2026-04-01T12:00:00Z"), "Europe/Paris").start;
    expect(iso(studyDayStartBefore(spring, 7, "Europe/Paris"))).toBe("2026-03-25T03:00:00.000Z");
    expect(iso(studyDayStartBefore(new Date("2026-01-03T03:00:00Z"), 7, "Europe/Paris"))).toBe("2025-12-27T03:00:00.000Z");
  });
});

describe("studyDayKey", () => {
  it("names the study day on the zone's clock, before 04:00 the previous date", () => {
    expect(studyDayKey(new Date("2026-10-22T01:30:00Z"), "Europe/Paris")).toBe("2026-10-21");
    expect(studyDayKey(new Date("2026-10-22T02:30:00Z"), "Europe/Paris")).toBe("2026-10-22");
    expect(studyDayKey(new Date("2026-10-22T02:30:00Z"), "UTC")).toBe("2026-10-21");
    expect(studyDayStartOf("2026-10-25", "Europe/Paris").toISOString()).toBe("2026-10-25T03:00:00.000Z");
    const keyOf = studyDayKeyer("Europe/Paris");
    const ats = ["2026-10-24T01:00:00Z", "2026-10-24T02:00:00Z", "2026-10-25T02:59:59Z", "2026-10-25T03:00:00Z", "2026-10-26T02:00:00Z"];
    expect(ats.map((t) => keyOf(Date.parse(t)))).toEqual(ats.map((t) => studyDayKey(Date.parse(t), "Europe/Paris")));
    expect(ats.map((t) => keyOf(Date.parse(t)))).toEqual(["2026-10-23", "2026-10-24", "2026-10-24", "2026-10-25", "2026-10-25"]);
  });
});
