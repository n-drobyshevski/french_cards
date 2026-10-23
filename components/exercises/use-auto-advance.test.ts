import { describe, expect, it } from "vitest";
import { AUTO_ADVANCE_MS, autoAdvanceAt, autoAdvancePhase } from "./use-auto-advance";

describe("autoAdvancePhase", () => {
  it("is idle without a right answer", () => {
    expect(autoAdvancePhase(null, false, null)).toBe("idle");
    expect(autoAdvancePhase(null, true, 3)).toBe("idle");
  });

  it("runs for a right answer until held", () => {
    expect(autoAdvancePhase(3, false, null)).toBe("running");
    expect(autoAdvancePhase(3, false, 3)).toBe("held");
    // A hold belongs to its own card: the next right answer runs again.
    expect(autoAdvancePhase(4, false, 3)).toBe("running");
  });

  it("never auto-advances under reduced motion", () => {
    expect(autoAdvancePhase(3, true, null)).toBe("off");
    expect(autoAdvancePhase(3, true, 3)).toBe("off");
  });

  it("fires once the stamp has landed and the hairline ran out", () => {
    expect(AUTO_ADVANCE_MS).toBe(1000);
    expect(autoAdvanceAt()).toBe(1230);
    expect(autoAdvanceAt(0, 500)).toBe(500);
  });
});
