import { expect, test, type Page } from "@playwright/test";

// Desktop polish (mockups/MOTION-SPEC.md D7, D10, D11): help hints wait 500 ms, then open at once
// for neighbours and on keyboard focus; a sidebar row ticks while its route loads; hover tints fade.
// Runs in the desktop-chromium project (1440×800, mouse) on the first-run seed words.

const grid = (page: Page) => page.getByRole("grid", { name: /^Слова/ });
const row = (page: Page, fr: string) => grid(page).getByRole("row", { name: new RegExp(`^${fr} —`) });
const pane = (page: Page) => page.getByRole("complementary", { name: "Карточка слова" });
const sidebar = (page: Page) => page.getByRole("complementary", { name: "Разделы" });

test("help hints: a 500 ms pause on first hover, none for a neighbour, none on keyboard focus", async ({ page }) => {
  await page.goto("/library");
  await row(page, "une blague").click();
  const abbr = pane(page).getByRole("button", { name: /^n\. f\. —/ });
  const slang = pane(page).getByRole("button", { name: /^нейтр\. —/ }).first();
  await expect(abbr).toBeVisible();

  await abbr.hover();
  const hoveredAt = Date.now();
  const tip = pane(page).getByRole("tooltip");
  await expect(tip).toBeVisible();
  expect(Date.now() - hoveredAt).toBeGreaterThanOrEqual(450);
  // A first opening fades in.
  expect(await tip.evaluate((el) => getComputedStyle(el).animationName)).toBe("fade-in");

  // Straight to a neighbour: it opens at once, with no fade.
  await slang.hover();
  await expect(tip).toContainText("Нейтральное слово", { timeout: 300 });
  expect(await tip.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");

  // Away: it closes at once; later a keyboard focus opens it without the pause.
  await page.mouse.move(5, 5);
  await expect(tip).toHaveCount(0);
  await page.waitForTimeout(600);
  await abbr.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(tip).toContainText("nom féminin", { timeout: 300 });
});

/** Holds every RSC request for a path until `release` is called. */
async function holdRoute(page: Page, path: RegExp) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route(path, async (route) => {
    if (route.request().headers()["rsc"] || route.request().url().includes("_rsc=")) await gate;
    await route.fallback();
  });
  return release;
}

test("a sidebar row shows a 2px ink tick while its route loads", async ({ page }) => {
  // Held from the start, prefetch included, so the route cannot commit early.
  const release = await holdRoute(page, /\/settings(\?|$)/);
  await page.goto("/");
  const link = sidebar(page).getByRole("link", { name: "Настройки" });
  await expect(link).toBeVisible();
  await link.click();
  const tick = link.locator("[data-link-pending]");
  await expect(tick).toHaveCount(1);
  await expect(tick).toHaveCSS("opacity", "1");
  await expect(tick).toHaveCSS("width", "2px");
  release();
  await expect(link).toHaveAttribute("aria-current", "page");
  await expect(tick).toHaveCount(0);
});

test("hover tints fade over --dur-quick, focus rings don't", async ({ page }) => {
  await page.goto("/library");
  await expect(row(page, "vas-y")).toBeVisible();
  const navRow = sidebar(page).getByRole("link", { name: "Библиотека" });
  const look = await navRow.evaluate((el) => {
    const style = getComputedStyle(el);
    return { property: style.transitionProperty, duration: style.transitionDuration };
  });
  expect(look.property).toBe("color, background-color");
  expect(look.duration).toBe("0.11s");
  // Table rows tint on a layer under the cells, so the row's own (keyboard) background stays instant.
  const before = await row(page, "vas-y").evaluate((el) => {
    const style = getComputedStyle(el, "::before");
    return { property: style.transitionProperty, duration: style.transitionDuration };
  });
  expect(before.property).toContain("background-color");
  expect(before.duration).toBe("0.11s");
  expect(await row(page, "vas-y").evaluate((el) => getComputedStyle(el).transitionProperty)).not.toContain("background-color");
});
