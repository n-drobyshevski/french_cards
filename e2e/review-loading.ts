import type { Page } from "@playwright/test";

// Helpers for the review loading specs (MOTION-SPEC R1, R2): a slow first database read, layout-shift
// accounting and a record of whether the loading placeholder ever mounted.

declare global {
  interface Window {
    __cls: number;
    __placeholderSeen: boolean;
  }
}

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
