import { describe, expect, it } from "vitest";
import { deskCaption, REVIEW_CAP_TOP, stepReviewCap, themeNumber, themeRange, themesCaption } from "./plan-settings";

describe("stepReviewCap", () => {
  it("steps 50…975 by 25, then «без лимита»", () => {
    expect(REVIEW_CAP_TOP).toBe(975);
    expect(stepReviewCap(200, 1)).toBe(225);
    expect(stepReviewCap(200, -1)).toBe(175);
    expect(stepReviewCap(50, -1)).toBe(50);
    expect(stepReviewCap(975, 1)).toBeNull();
    expect(stepReviewCap(null, -1)).toBe(975);
    expect(stepReviewCap(null, 1)).toBeNull();
  });

  it("snaps an off-grid cap to the grid", () => {
    expect(stepReviewCap(210, 1)).toBe(225);
    expect(stepReviewCap(210, -1)).toBe(200);
    expect(stepReviewCap(999, -1)).toBe(975);
    expect(stepReviewCap(999, 1)).toBeNull();
  });
});

describe("theme range", () => {
  it("reads the first and last numbered themes", () => {
    expect(themeNumber("03 Жильё")).toBe("03");
    expect(themeNumber("Тик Ток")).toBeNull();
    expect(themeNumber("2026 год")).toBeNull();
    expect(themeRange(["01 Семья", "03 Жильё", "Тик Ток", "35 Частые глаголы 4"])).toBe("01 → 35");
    expect(themeRange(["Повседневное", "Деньги"])).toBeNull();
    expect(themeRange(["01 Семья"])).toBeNull();
    expect(themesCaption(["01 Семья", "35 Глаголы"])).toBe("01 → 35, по порядку тем");
    expect(themesCaption([])).toBe("По порядку тем");
  });
});

describe("deskCaption", () => {
  it("lowercases a sentence, keeps names and numbers", () => {
    expect(deskCaption("Сначала A1–B2, частые раньше")).toBe("сначала A1–B2, частые раньше");
    expect(deskCaption("RU → FR не показывать")).toBe("RU → FR не показывать");
    expect(deskCaption("01 → 35, по порядку тем")).toBe("01 → 35, по порядку тем");
    expect(deskCaption("Когда FR → RU продержится 3 дня")).toBe("когда FR → RU продержится 3 дня");
  });
});
