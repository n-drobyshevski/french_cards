import { afterEach, describe, expect, it, vi } from "vitest";
import { HAPTIC_KINDS, haptic, hapticsEnabled, hapticSupport, IOS_TAPS, thresholdNotifier, VIBRATION_PATTERNS } from "./haptics";
import { resetSettingsMirrorMemory, SETTINGS_MIRROR_KEY } from "./settings-mirror";

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
    expect(() => haptic("tick")).not.toThrow();
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
      haptic("done");
      vi.advanceTimersByTime(1000);
      expect(clicks).toHaveLength(4);
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

describe("haptic vocabulary", () => {
  it("has an Android pattern and an iOS tap count for every kind (MOTION-SPEC §5.13)", () => {
    expect(VIBRATION_PATTERNS).toEqual({ tick: 20, good: 40, again: [35, 80, 35], done: [30, 60, 30, 60, 50] });
    expect(IOS_TAPS).toEqual({ tick: 1, good: 1, again: 2, done: 1 });
    expect(Object.keys(VIBRATION_PATTERNS).sort()).toEqual([...HAPTIC_KINDS].sort());
  });
});

describe("the «Вибрация» setting", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetSettingsMirrorMemory();
  });

  const mirror = (haptics: boolean | undefined) => {
    const raw = haptics === undefined ? null : JSON.stringify({ haptics });
    vi.stubGlobal("localStorage", { getItem: (key: string) => (key === SETTINGS_MIRROR_KEY ? raw : null) });
    resetSettingsMirrorMemory();
  };

  it("is on by default and follows the mirrored setting", () => {
    mirror(undefined);
    expect(hapticsEnabled()).toBe(true);
    mirror(false);
    expect(hapticsEnabled()).toBe(false);
    mirror(true);
    expect(hapticsEnabled()).toBe(true);
  });

  it("silences every kind when it is off", () => {
    mirror(false);
    const vibrate = vi.fn(() => true);
    vi.stubGlobal("navigator", { vibrate, userAgent: "Android", platform: "Linux", maxTouchPoints: 5 });
    for (const kind of HAPTIC_KINDS) haptic(kind);
    expect(vibrate).not.toHaveBeenCalled();
  });
});

describe("desktop", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reports no support without a coarse pointer, even where navigator.vibrate exists", () => {
    vi.stubGlobal("navigator", { vibrate: () => true, userAgent: "Mozilla/5.0 (X11; Linux x86_64)", platform: "Linux", maxTouchPoints: 0 });
    vi.stubGlobal("window", { matchMedia: (q: string) => ({ matches: q !== "(any-pointer: coarse)" }) });
    expect(hapticSupport()).toBe("none");
    vi.stubGlobal("window", { matchMedia: () => ({ matches: true }) });
    expect(hapticSupport()).toBe("vibrate");
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

  it("stays silent on iPhone, where nothing plays outside a gesture", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X)", platform: "iPhone", maxTouchPoints: 5 });
    const createElement = vi.fn();
    vi.stubGlobal("document", { createElement, head: {} });
    const n = thresholdNotifier();
    n.update(true, true);
    expect(createElement).not.toHaveBeenCalled();
  });

  it("stays silent when haptics are turned off", () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal("navigator", { vibrate, userAgent: "", platform: "", maxTouchPoints: 0 });
    const n = thresholdNotifier();
    n.update(true, false);
    expect(vibrate).not.toHaveBeenCalled();
  });
});
