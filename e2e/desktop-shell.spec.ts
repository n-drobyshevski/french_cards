import { expect, test, type Page } from "@playwright/test";
import { addSheet, openReview } from "./fixtures";

// Desktop shell (mockups/DESKTOP-SPEC.md §2, §4): sidebar ≥ 1200, rail 768–1199, tab bar below 768,
// sheets as centred dialogs, global keys. Runs in the desktop-chromium project (1440×800).

const sidebar = (page: Page) => page.getByRole("complementary", { name: "Разделы" });
const rail = (page: Page) => page.getByRole("navigation", { name: "Разделы" });
const tabBar = (page: Page) => page.locator("[data-tabbar]");

test("sidebar with themes at 1440, no tab bar", async ({ page }) => {
  await openReview(page);
  const aside = sidebar(page);
  await expect(aside).toBeVisible();
  await expect(aside.getByRole("link", { name: "Повторение" })).toHaveAttribute("aria-current", "page");
  const themes = aside.getByRole("list", { name: "Темы" });
  await expect(themes.getByRole("link", { name: /^Входящие, \d+ слов/ })).toBeVisible();
  await expect(themes.getByRole("link", { name: /^Повседневное, \d+ слов/ })).toBeVisible();
  await expect(tabBar(page)).toBeHidden();

  // A theme row is the one active item while that theme is shown.
  await themes.getByRole("link", { name: /^Повседневное/ }).click();
  await expect(page.getByRole("heading", { name: "Повседневное" })).toBeVisible();
  await expect(themes.getByRole("link", { name: /^Повседневное/ })).toHaveAttribute("aria-current", "page");
  await expect(aside.locator("[aria-current=page]")).toHaveCount(1);
});

test("rail at 1024, tab bar at 390", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await openReview(page);
  await expect(rail(page)).toBeVisible();
  await expect(rail(page).getByRole("link", { name: /^Входящие/ })).toBeVisible();
  await expect(sidebar(page)).toBeHidden();
  await expect(tabBar(page)).toBeHidden();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(tabBar(page)).toBeVisible();
  await expect(rail(page)).toBeHidden();
  await expect(sidebar(page)).toBeHidden();
});

test("N opens «Новое слово» as a centred dialog, Esc closes it", async ({ page }) => {
  await openReview(page);
  await page.keyboard.press("n");
  const dialog = addSheet(page);
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBe(640);
  expect(Math.abs(box!.x + box!.width / 2 - 720)).toBeLessThan(2);
  expect(box!.y).toBeLessThan(100);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("? opens «Клавиши»", async ({ page }) => {
  await openReview(page);
  await page.keyboard.press("Shift+Slash");
  const dialog = page.getByRole("dialog", { name: "Клавиши" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Везде" })).toBeVisible();
  await expect(dialog.getByText("Однобуквенные клавиши можно выключить в")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("G then L goes to the library, / to its search", async ({ page }) => {
  await openReview(page);
  await page.keyboard.press("g");
  await page.keyboard.press("l");
  await expect(page).toHaveURL(/\/library$/);
  await expect(sidebar(page).getByRole("link", { name: "Библиотека" })).toHaveAttribute("aria-current", "page");

  await page.keyboard.press("g");
  await page.keyboard.press("r");
  await expect(page).toHaveURL(/\/$/);
  await page.keyboard.press("/");
  await expect(page).toHaveURL(/\/library\?focus=search$/);
});

test("[ hides and shows the sidebar, and the choice survives a reload", async ({ page }) => {
  await openReview(page);
  await page.keyboard.press("BracketLeft");
  await expect(sidebar(page)).toBeHidden();
  const reveal = page.getByRole("button", { name: "Показать боковую панель" });
  await expect(reveal).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: /^Карточка .*, перевернуть$/ })).toBeVisible();
  await expect(sidebar(page)).toBeHidden();

  await page.keyboard.press("BracketLeft");
  await expect(sidebar(page)).toBeVisible();
  await expect(reveal).toBeHidden();

  await page.keyboard.press("BracketLeft");
  await reveal.click();
  await expect(sidebar(page)).toBeVisible();
});

test("global keys stay off while typing", async ({ page }) => {
  await page.goto("/library");
  const search = page.getByRole("searchbox", { name: "Поиск по FR и RU" }).or(page.getByRole("textbox", { name: "Поиск по FR и RU" }));
  await search.fill("");
  await search.press("n");
  await search.press("BracketLeft");
  await expect(search).toHaveValue("n[");
  await expect(addSheet(page)).toBeHidden();
  await expect(sidebar(page)).toBeVisible();
});

// Dragging words onto a theme is covered with the library's draggable rows.
