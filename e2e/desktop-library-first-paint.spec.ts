import { expect, test } from "@playwright/test";

// Desktop library without blinks (mockups/MOTION-SPEC.md D3, D4). Runs in desktop-chromium (1440×800).

const grid = (page: import("@playwright/test").Page) => page.getByRole("grid", { name: /^Слова/ });
const pane = (page: import("@playwright/test").Page) => page.getByRole("complementary", { name: "Карточка слова" });

test("the detail pane stays filled while ↓ walks the list", async ({ page }) => {
  await page.goto("/library");
  await grid(page).getByRole("row", { name: /^les flics —/ }).click();
  await expect(pane(page).getByRole("heading", { name: "les flics" })).toBeVisible();

  // Count painted frames in which the pane has no word heading (blank / busy).
  await page.evaluate(() => {
    const w = window as unknown as { __blank: number; __frames: number; __stop: boolean };
    w.__blank = 0;
    w.__frames = 0;
    w.__stop = false;
    const sample = () => {
      const aside = document.querySelector('aside[aria-label="Карточка слова"]');
      w.__frames++;
      if (!aside?.querySelector("h1, h2, h3, h4") || aside.querySelector('[aria-busy="true"].min-h-40')) w.__blank++;
      if (!w.__stop) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(300);
  const { blank, frames } = await page.evaluate(() => {
    const w = window as unknown as { __blank: number; __frames: number; __stop: boolean };
    w.__stop = true;
    return { blank: w.__blank, frames: w.__frames };
  });
  expect(frames).toBeGreaterThan(5);
  expect(blank).toBe(0);
  // The cursor did move.
  await expect(grid(page).getByRole("row", { name: /^les flics —/ })).not.toHaveAttribute("aria-current", "true");
});

test("first paint draws the desk chrome where the desk will have it", async ({ page }) => {
  // Freeze the page right at the server HTML (before hydration) by blocking scripts.
  await page.route(/\/_next\/static\/.*\.js$/, (route) => route.abort());
  await page.goto("/library", { waitUntil: "domcontentloaded" });
  const placeholderHead = await page.locator('main[data-wide] [role="row"][aria-rowindex="1"]').first().boundingBox();
  await page.unroute(/\/_next\/static\/.*\.js$/);

  await page.goto("/library");
  await expect(grid(page).getByRole("row", { name: /^vas-y —/ })).toBeVisible();
  const deskHead = await grid(page).getByRole("row").first().boundingBox();
  expect(placeholderHead).not.toBeNull();
  expect(deskHead).not.toBeNull();
  expect(Math.round(placeholderHead!.y)).toBe(Math.round(deskHead!.y));
});
