import { afterEach, describe, expect, it, vi } from "vitest";
import { haptic, thresholdNotifier, VIBRATION_PATTERNS } from "./haptics";

describe("haptic", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("vibrates with the pattern for each kind where the Vibration API exists", () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal("navigator", { vibrate, userAgent: "Android", platform: "Linux", maxTouchPoints: 5 });
    haptic("good");
    haptic("again");
    expect(vibrate).toHaveBeenNthCalledWith(1, VIBRATION_PATTERNS.good);
    expect(vibrate).toHaveBeenNthCalledWith(2, VIBRATION_PATTERNS.again);
  });

  it("does nothing (and does not throw) without any haptic support", () => {
    vi.stubGlobal("navigator", { userAgent: "Desktop", platform: "Linux", maxTouchPoints: 0 });
    expect(() => haptic("good")).not.toThrow();
  });

  it("swallows errors from the Vibration API", () => {
    vi.stubGlobal("navigator", { vibrate: () => { throw new Error("blocked"); }, userAgent: "", platform: "", maxTouchPoints: 0 });
    expect(() => haptic("threshold")).not.toThrow();
  });
});

describe("thresholdNotifier", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fires once on entering the commit zone and re-arms after leaving it", () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal("navigator", { vibrate, userAgent: "", platform: "", maxTouchPoints: 0 });
    const n = thresholdNotifier();
    n.update(false, true);
    n.update(true, true);
    n.update(true, true);
    expect(vibrate).toHaveBeenCalledTimes(1);
    n.update(false, true);
    n.update(true, true);
    expect(vibrate).toHaveBeenCalledTimes(2);
  });

  it("stays silent when haptics are turned off", () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal("navigator", { vibrate, userAgent: "", platform: "", maxTouchPoints: 0 });
    const n = thresholdNotifier();
    n.update(true, false);
    expect(vibrate).not.toHaveBeenCalled();
  });
});
