import type { Page } from "@playwright/test";

// Helpers for the review loading and motion specs (MOTION-SPEC R1–R10): a slow first database read,
// layout-shift accounting, a record of whether the loading placeholder ever mounted, and a record of
// the card motion the page played.

declare global {
  interface Window {
    __cls: number;
    __placeholderSeen: boolean;
    __played: PlayedAnimation[];
    __vibrations: unknown[];
  }
}

/** A Web Animations call the page made (the review card's run-time motion: glide, exit, arrival). */
export interface PlayedAnimation {
  id: string;
  keyframes: Record<string, string | number>[];
  duration: number;
  delay: number;
  /** performance.now() when it was started. */
  at: number;
}

/**
 * Before the page loads: every `element.animate()` is recorded into `window.__played`, and
 * navigator.vibrate into `window.__vibrations` (the call succeeds, nothing vibrates).
 */
export async function recordMotion(page: Page) {
  await page.addInitScript(() => {
    window.__played = [];
    window.__vibrations = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (this: Element, keyframes, options) {
      const o = typeof options === "number" ? { duration: options } : (options ?? {});
      window.__played.push({
        id: o.id ?? "",
        keyframes: JSON.parse(JSON.stringify(keyframes)),
        duration: Number(o.duration ?? 0),
        delay: Number(o.delay ?? 0),
        at: performance.now(),
      });
      return animate.call(this, keyframes, options);
    };
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: (p: unknown) => (window.__vibrations.push(p), true) });
  });
}

export const played = (page: Page, id?: string) =>
  page.evaluate((only) => window.__played.filter((a) => !only || a.id === only), id);

export const vibrations = (page: Page) => page.evaluate(() => window.__vibrations.slice());

/** CSS animations (name, delay, duration in ms) running or held on `selector` and its subtree. */
export const cssAnimations = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return [];
    return el.getAnimations({ subtree: true }).flatMap((a) => {
      if (!(a instanceof CSSAnimation)) return [];
      const timing = a.effect!.getTiming();
      return [{ name: a.animationName, delay: Number(timing.delay), duration: Number(timing.duration) }];
    });
  }, selector);

/**
 * Before the page loads: IndexedDB opens `ms` late (the cold-start case, so the placeholder lasts),
 * and layout shifts of the review screen are summed into `window.__cls` (the desktop sidebar's
 * theme counts settle on their own and are not this screen's).
 */
export async function slowDatabase(page: Page, ms: number) {
  await page.addInitScript((delay) => {
    type Shift = PerformanceEntry & { value: number; hadRecentInput: boolean; sources: { node?: Node | null }[] };
    window.__cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Shift[]) {
        const inReview = entry.sources.some((s) => {
          const el = s.node instanceof Element ? s.node : s.node?.parentElement;
          return !el || !!el.closest("[data-review]");
        });
        if (!entry.hadRecentInput && inReview) window.__cls += entry.value;
      }
    }).observe({ type: "layout-shift", buffered: true });

    if (!delay) return;
    const open = IDBFactory.prototype.open;
    const onsuccess = Object.getOwnPropertyDescriptor(IDBRequest.prototype, "onsuccess")!;
    IDBFactory.prototype.open = function (this: IDBFactory, ...args: Parameters<IDBFactory["open"]>) {
      const request = open.apply(this, args);
      let handler: IDBRequest["onsuccess"] = null;
      Object.defineProperty(request, "onsuccess", {
        configurable: true,
        get: () => handler,
        set(fn: IDBRequest["onsuccess"]) {
          handler = fn;
          onsuccess.set!.call(request, fn ? (event: Event) => window.setTimeout(() => fn.call(request, event), delay) : null);
        },
      });
      return request;
    };
  }, ms);
}

/** From now on, `window.__placeholderSeen` turns true if the loading placeholder mounts, even for one frame. */
export async function watchPlaceholder(page: Page) {
  await page.evaluate(() => {
    window.__placeholderSeen = false;
    new MutationObserver(() => {
      if (document.querySelector("[data-review-placeholder]")) window.__placeholderSeen = true;
    }).observe(document.body, { childList: true, subtree: true });
  });
}
