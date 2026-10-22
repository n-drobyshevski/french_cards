import { afterEach, describe, expect, it, vi } from "vitest";
import { haptic, hapticSupport, thresholdNotifier, VIBRATION_PATTERNS } from "./haptics";

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

describe("haptic on iPhone", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** A minimal document: records the switches toggled through their label. */
  function fakeDocument() {
    const clicks: { type: string; switch: boolean; display: string; attached: boolean }[] = [];
    const head = {
      children: new Set<object>(),
      appendChild(el: object) {
        this.children.add(el);
      },
    };
    const createElement = (tag: string) => {
      const attrs = new Map<string, string>();
      const el = {
        tag,
        type: "",
        style: { display: "" },
        child: null as null | { type: string; attrs: Map<string, string> },
        attrs,
        setAttribute: (k: string, v: string) => attrs.set(k, v),
        appendChild(c: { type: string; attrs: Map<string, string> }) {
          this.child = c;
        },
        click() {
          clicks.push({ type: this.child!.type, switch: this.child!.attrs.has("switch"), display: this.style.display, attached: head.children.has(this) });
        },
        remove() {
          head.children.delete(this);
        },
      };
      return el;
    };
    return { doc: { head, createElement }, clicks, head };
  }

  it("toggles a fresh hidden switch per haptic and cleans it up", () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X)", platform: "iPhone", maxTouchPoints: 5 });
      const { doc, clicks, head } = fakeDocument();
      vi.stubGlobal("document", doc);
      expect(hapticSupport()).toBe("ios");
      haptic("good");
      expect(clicks).toEqual([{ type: "checkbox", switch: true, display: "none", attached: true }]);
      haptic("again");
      vi.advanceTimersByTime(120);
      expect(clicks).toHaveLength(3);
      expect(head.children.size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports no support on a desktop browser without the Vibration API", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (X11; Linux x86_64)", platform: "Linux x86_64", maxTouchPoints: 0 });
    expect(hapticSupport()).toBe("none");
  });

  it("uses pulses long enough for Android vibration motors", () => {
    const shortest = Math.min(...Object.values(VIBRATION_PATTERNS).flatMap((p) => (Array.isArray(p) ? p.filter((_, i) => i % 2 === 0) : [p])));
    expect(shortest).toBeGreaterThanOrEqual(20);
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
