import { afterEach, describe, expect, it, vi } from "vitest";
import { exitMs, parseCssDuration, sheetCloseMs, spotlight, tokenMs } from "./motion";

describe("parseCssDuration", () => {
  it("reads ms and the minifier's seconds", () => {
    expect(parseCssDuration("240ms")).toBe(240);
    expect(parseCssDuration(" .24s ")).toBe(240);
    expect(parseCssDuration("0.11s")).toBeCloseTo(110);
    expect(parseCssDuration("1ms")).toBe(1);
  });

  it("rejects anything that is not a duration", () => {
    expect(parseCssDuration("")).toBeNull();
    expect(parseCssDuration("var(--dur-quick)")).toBeNull();
    expect(parseCssDuration("240")).toBeNull();
  });
});

describe("tokenMs", () => {
  afterEach(() => vi.unstubAllGlobals());

  const tokens = (values: Record<string, string>) => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", { documentElement: {} });
    vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: (name: string) => values[name] ?? "" }));
  };

  it("falls back on the server", () => {
    expect(tokenMs("--dur-enter", 240)).toBe(240);
    expect(sheetCloseMs()).toBe(240);
    expect(exitMs()).toBe(140);
  });

  it("follows the page's tokens, so reduced motion shortens the timers too", () => {
    tokens({ "--dur-enter": ".11s", "--dur-exit": "140ms" });
    expect(sheetCloseMs()).toBeCloseTo(110);
    expect(exitMs()).toBe(140);
    expect(tokenMs("--dur-missing", 99)).toBe(99);
  });
});

describe("spotlight", () => {
  it("restarts the paper fade and clears the class when it ends", () => {
    const classes = new Set<string>();
    const listeners = new Set<(e: Event) => void>();
    let reflows = 0;
    const el = {
      classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c) },
      get offsetWidth() {
        reflows++;
        return 0;
      },
      addEventListener: (_: string, fn: (e: Event) => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: (e: Event) => void) => listeners.delete(fn),
    } as unknown as Element;

    spotlight(el);
    expect(classes.has("spotlight")).toBe(true);
    expect(reflows).toBe(1);

    // Another animation ending on the element leaves it lit.
    for (const fn of [...listeners]) fn({ target: el, animationName: "enter-rise" } as unknown as Event);
    expect(classes.has("spotlight")).toBe(true);

    for (const fn of [...listeners]) fn({ target: el, animationName: "spotlight" } as unknown as Event);
    expect(classes.has("spotlight")).toBe(false);
    expect(listeners.size).toBe(0);

    expect(() => spotlight(null)).not.toThrow();
  });
});
