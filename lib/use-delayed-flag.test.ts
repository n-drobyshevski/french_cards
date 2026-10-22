import { describe, expect, it } from "vitest";
import { formatElapsed } from "./use-delayed-flag";

describe("formatElapsed", () => {
  it("prints m:ss", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(4)).toBe("0:04");
    expect(formatElapsed(72)).toBe("1:12");
  });
});
