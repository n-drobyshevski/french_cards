import { expect, test, type Page } from "@playwright/test";
import { tabBar } from "./fixtures";

// Kit, shell and navigation polish (mockups/MOTION-SPEC.md T3, T4, N1, B3, L6): the segmented ink
// slab, the stepper press, the shared tab marker, the offline page's check, the theme tile's pending
// mark and the library ⇄ theme slide.

/** Holds every RSC request for a theme page (prefetch included) until `release` is called. */
async function holdThemeRoute(page: Page) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route(/\/library\/[^/?]+(\?|$)/, async (route) => {
    const headers = route.request().headers();
    if (headers["rsc"] || route.request().url().includes("_rsc=")) await gate;
    await route.fallback();
  });
  return release;
}

test("the segmented slab glides to a tapped segment with a transform", async ({ page }) => {
  await page.goto("/settings");
  const group = page.getByRole("radiogroup", { name: "Кнопки оценки" });
  const slab = group.locator("[data-seg-slab]");
  await expect(slab).toHaveCSS("opacity", "1");
  const look = () =>
    slab.evaluate((el) => {
      const style = getComputedStyle(el);
      return { transform: style.transform, transition: style.transitionProperty };
    });
  const before = await look();
  // A value that arrives on its own is placed, not slid.
  expect(before.transition).not.toContain("transform");
  // The selected segment no longer paints its own fill: the slab under it does.
  const selected = group.getByRole("radio", { checked: true });
  expect(await selected.locator("span").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgba(0, 0, 0, 0)");

  await group.getByRole("radio", { checked: false }).click();
  await expect.poll(async () => (await look()).transform).not.toBe(before.transform);
  expect((await look()).transition).toContain("transform");
  expect(await group.getByRole("radio").first().evaluate((el) => getComputedStyle(el).transitionProperty)).toContain("scale");
});

test("the stepper's buttons press in .96 with a tint", async ({ page }) => {
  await page.goto("/settings");
  const more = page.getByRole("group", { name: "Новых карточек в день" }).getByRole("button", { name: "Больше" });
  await expect(more).toBeVisible();
  expect(await more.evaluate((el) => getComputedStyle(el).transitionProperty)).toContain("scale");
  const box = (await more.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(() => more.evaluate((el) => getComputedStyle(el, "::before").backgroundColor)).toBe("rgb(232, 232, 228)");
  await page.mouse.up();
});

test("the tab marker moves to a tapped tab before its route commits", async ({ page }) => {
  await page.goto("/library");
  const bar = tabBar(page);
  const marker = bar.locator("[data-tab-marker]");
  await expect(marker).toHaveCount(1);
  const at = () => marker.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41);
  const width = await marker.evaluate((el) => el.getBoundingClientRect().width);
  // Повторение · Добавить · Контекст · Библиотека: the library is the fourth column.
  await expect.poll(at).toBeCloseTo(width * 3, 0);
  expect(await marker.evaluate((el) => getComputedStyle(el).transitionProperty)).toBe("transform");

  // Hold the review route: the marker still goes at once.
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route(/localhost:\d+\/(\?|$)/, async (route) => {
    if (route.request().headers()["rsc"]) await gate;
    await route.fallback();
  });
  await bar.getByRole("link", { name: "Повторение" }).click();
  await expect.poll(at).toBeLessThan(1);
  await expect(bar.locator("[data-tab-marker]")).toHaveCount(1);
  release();
  await expect(page).toHaveURL(/\/$/);
  await expect(bar.getByRole("link", { name: "Повторение" })).toHaveAttribute("aria-current", "page");
});

test("offline page: «Повторить» checks for at least 500 ms, then reloads by itself when the network returns", async ({ page, context }) => {
  await page.goto("/~offline");
  const retry = page.getByRole("button", { name: /Повторить|Проверяем/ });
  await expect(page.getByText("Ждём сеть · откроем сами, когда она вернётся")).toBeVisible();
  await context.setOffline(true);
  const started = Date.now();
  await retry.click();
  await expect(retry).toHaveAttribute("aria-busy", "true");
  await expect(retry.getByText("Проверяем…")).toBeVisible();
  await expect(retry).not.toHaveAttribute("aria-busy", "true");
  expect(Date.now() - started).toBeGreaterThanOrEqual(500);
  await expect(retry.getByText("Повторить")).toBeVisible();

  const reloaded = page.waitForEvent("load");
  await context.setOffline(false);
  await reloaded;
});

test("a theme tile holds its tint and runs ink while its page loads, then the page slides in", async ({ page }) => {
  // Held from the start, so not even a prefetched shell lets the route commit early.
  const release = await holdThemeRoute(page);
  await page.goto("/library");
  const tile = page.getByRole("link", { name: /^Эмоции:/ });
  await expect(tile).toBeVisible();
  // Record the view transition the navigation starts and the animations it runs.
  await page.evaluate(() => {
    const w = window as unknown as { __vt: string[] };
    w.__vt = [];
    const start = document.startViewTransition.bind(document);
    document.startViewTransition = ((arg: Parameters<typeof start>[0]) => {
      const vt = start(arg);
      void vt.ready.then(() => {
        for (const a of document.getAnimations()) {
          const effect = a.effect as KeyframeEffect;
          if (effect.pseudoElement) w.__vt.push(`${effect.pseudoElement} ${(a as CSSAnimation).animationName}`);
        }
      });
      return vt;
    }) as typeof document.startViewTransition;
  });
  await tile.click();
  const mark = tile.locator("[data-link-pending]");
  await expect(mark).toHaveCount(1);
  await expect(tile).toHaveCSS("background-color", "rgb(232, 232, 228)");
  await expect(mark.locator(".link-pending")).toHaveCSS("opacity", "1");
  await expect(mark.locator(".motion-loop")).toHaveCSS("animation-name", "ink-run");
  release();
  await expect(page.getByRole("heading", { name: "Эмоции", level: 1 })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __vt: string[] }).__vt))
    .toEqual(expect.arrayContaining([expect.stringMatching(/::view-transition-old\(.*\) nav-slide-out/), expect.stringMatching(/::view-transition-new\(.*\) nav-slide-in/)]));

  // Back reverses it.
  await page.evaluate(() => ((window as unknown as { __vt: string[] }).__vt.length = 0));
  await page.getByRole("link", { name: "Назад в библиотеку" }).click();
  await expect(page.getByRole("heading", { name: "Библиотека", level: 1 })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __vt: string[] }).__vt))
    .toEqual(expect.arrayContaining([expect.stringMatching(/::view-transition-new\(.*\) nav-slide-in/)]));
});

test("reduced motion: library ⇄ theme swaps with no slide", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/library");
  await page.evaluate(() => {
    const w = window as unknown as { __vt: string[] };
    w.__vt = [];
    const start = document.startViewTransition.bind(document);
    document.startViewTransition = ((arg: Parameters<typeof start>[0]) => {
      const vt = start(arg);
      void vt.ready.then(() => {
        for (const a of document.getAnimations()) w.__vt.push(String((a as CSSAnimation).animationName));
      });
      return vt;
    }) as typeof document.startViewTransition;
  });
  await page.getByRole("link", { name: /^Эмоции:/ }).click();
  await expect(page.getByRole("heading", { name: "Эмоции", level: 1 })).toBeVisible();
  await page.waitForTimeout(100);
  const names = await page.evaluate(() => (window as unknown as { __vt: string[] }).__vt);
  expect(names.filter((n) => n.startsWith("nav-slide"))).toEqual([]);
});
