import { expect, test, type Page } from "@playwright/test";

// Drag and drop onto a sidebar theme (MOTION-SPEC D8, §5.11): the dragged row dims to .5 while it
// travels, the target theme is lit (spotlight) as its count swaps, a row that leaves a filtered
// table closes instead of vanishing, and the snackbar names the theme.

const grid = (page: Page) => page.getByRole("grid", { name: /^Слова/ });
const row = (page: Page, fr: string) => grid(page).getByRole("row", { name: new RegExp(`^${fr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} —`) });
const themes = (page: Page) => page.getByRole("complementary", { name: "Разделы" }).getByRole("list", { name: "Темы" });

test("a row dragged from a theme onto another dims, closes on the drop, and the target theme is lit", async ({ page }) => {
  await page.goto("/library");
  await themes(page).getByRole("link", { name: /^Эмоции/ }).click();
  await expect(page.getByRole("heading", { name: "Эмоции", level: 1 })).toBeVisible();
  await expect(row(page, "c'est dur")).toBeVisible();

  // Record what a polling assertion could miss: the row closing, the theme's paper fade.
  await page.evaluate(() => {
    const seen = { closed: false, lit: false };
    (window as unknown as { __drop: typeof seen }).__drop = seen;
    new MutationObserver(() => {
      if (document.querySelector('[aria-hidden="true"][role="row"]')) seen.closed = true;
      if (document.querySelector("[data-drop-light].spotlight")) seen.lit = true;
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "aria-hidden"] });
  });

  const source = row(page, "c'est dur");
  const target = themes(page).getByRole("link", { name: /^Еда, 1 слово/ });
  const from = (await source.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + 200, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 180, from.y + from.height / 2 + 20, { steps: 4 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  // While it travels the source row is at half opacity.
  await expect.poll(() => source.evaluate((el) => getComputedStyle(el).opacity)).toBe("0.5");
  await page.mouse.up();

  await expect(themes(page).getByRole("link", { name: /^Еда, 2 слова/ })).toBeVisible();
  await expect(page.getByText("Перемещено в «Еда»")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __drop: { closed: boolean; lit: boolean } }).__drop))
    .toEqual({ closed: true, lit: true });
  await expect(row(page, "c'est dur")).toHaveCount(0);
});
