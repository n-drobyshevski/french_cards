import { describe, expect, it } from "vitest";
import { CLEARANCE_GAP, clearanceFor, floatingBottom } from "./bottom-clearance";

const rect = (top: number, height: number) => ({ top, bottom: top + height, height });

describe("clearanceFor", () => {
  it("is 0 without a docked bar", () => {
    expect(clearanceFor([], 844)).toBe(0);
    expect(clearanceFor([rect(0, 0)], 844)).toBe(0);
    expect(clearanceFor([rect(900, 56)], 844)).toBe(0);
  });

  it("clears the grade bar above the tab bar", () => {
    // 56px grade bar whose bottom sits 16px above an 83px tab bar.
    expect(clearanceFor([rect(844 - 83 - 16 - 56, 56)], 844)).toBe(83 + 16 + 56 + CLEARANCE_GAP);
  });

  it("uses the highest docked bar and ignores bars in the page flow", () => {
    expect(clearanceFor([rect(700, 60), rect(650, 40), rect(200, 52)], 844)).toBe(844 - 650 + CLEARANCE_GAP);
  });

  it("never goes below the default position", () => {
    expect(floatingBottom("16px")).toBe("max(16px, var(--bottom-clearance, 0px))");
  });
});
