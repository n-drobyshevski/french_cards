import { describe, expect, it } from "vitest";
import { currentSection } from "./useSectionSpy";

describe("currentSection", () => {
  it("is the first section before any reaches the offset", () => {
    expect(currentSection([112, 400, 900], false)).toBe(0);
  });

  it("is the last section whose top passed the offset", () => {
    expect(currentSection([-500, -40, 100, 600], false)).toBe(2);
    expect(currentSection([-500, -40, 121, 600], false)).toBe(1);
  });

  it("is the last section at the bottom of the page", () => {
    expect(currentSection([-900, -300, 200, 450], true)).toBe(3);
  });

  it("handles no sections", () => {
    expect(currentSection([], false)).toBe(-1);
  });
});
