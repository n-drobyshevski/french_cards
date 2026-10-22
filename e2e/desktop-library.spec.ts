import { expect, test, type Page } from "@playwright/test";

// Desktop library (mockups/DESKTOP-SPEC.md §5 #6–10, §4 «Library / Theme»): the sortable word table,
// the detail pane, keys, multi-select with the bulk bar, undo, search via `/` and dragging rows onto
// a sidebar theme. Runs in the desktop-chromium project (1440×800) on the first-run seed words.

const grid = (page: Page) => page.getByRole("grid", { name: /^Слова/ });
const rows = (page: Page) => grid(page).getByRole("row").filter({ has: page.getByRole("gridcell") });
const row = (page: Page, fr: string) => grid(page).getByRole("row", { name: new RegExp(`^${fr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} —`) });
const pane = (page: Page) => page.getByRole("complementary", { name: "Карточка слова" });
const themes = (page: Page) => page.getByRole("complementary", { name: "Разделы" }).getByRole("list", { name: "Темы" });

async function openLibrary(page: Page) {
  await page.goto("/library");
  await expect(row(page, "vas-y")).toBeVisible();
}

test("the table renders with sortable column heads", async ({ page }) => {
  await openLibrary(page);
  const head = (name: string) => grid(page).getByRole("columnheader", { name: new RegExp(name) });
  await expect(head("Слово")).toHaveAttribute("aria-sort", "ascending");
  await expect(head("Тема")).toBeVisible();
  await expect(rows(page).first()).toHaveAccessibleName(/^arrête —/);

  await head("Слово").getByRole("button").click();
  await expect(head("Слово")).toHaveAttribute("aria-sort", "descending");
  await expect(rows(page).first()).toHaveAccessibleName(/^vas-y —/);

  await head("Показ").getByRole("button").click();
  await expect(head("Показ")).toHaveAttribute("aria-sort", "ascending");
  await expect(head("Слово")).toHaveAttribute("aria-sort", "none");
});

test("clicking a row shows the word in the detail pane; J and K move the cursor", async ({ page }) => {
  await openLibrary(page);
  await expect(pane(page).getByText("Выберите слово")).toBeVisible();

  await row(page, "les flics").click();
  await expect(row(page, "les flics")).toHaveAttribute("aria-current", "true");
  await expect(pane(page).getByRole("heading", { name: "les flics" })).toBeVisible();
  await expect(pane(page).getByRole("button", { name: "Тема: Полиция. Переместить" })).toBeVisible();

  await page.keyboard.press("j");
  await expect(row(page, "le gras")).toHaveAttribute("aria-current", "true");
  await expect(row(page, "le gras")).toBeFocused();
  await expect(pane(page).getByRole("heading", { name: "le gras" })).toBeVisible();

  await page.keyboard.press("k");
  await page.keyboard.press("k");
  await expect(row(page, "être dehors")).toHaveAttribute("aria-current", "true");
  await expect(pane(page).getByRole("heading", { name: "être dehors" })).toBeVisible();
});

test("multi-select, bulk move to a theme and undo with Z", async ({ page }) => {
  await openLibrary(page);
  await expect(themes(page).getByRole("link", { name: /^Полиция, 1 слово/ })).toBeVisible();

  await row(page, "arrête").click();
  await page.keyboard.press("x");
  await page.keyboard.press("Shift+ArrowDown");
  await expect(row(page, "arrête")).toHaveAttribute("aria-selected", "true");
  await expect(row(page, "une blague")).toHaveAttribute("aria-selected", "true");
  const bar = page.getByRole("toolbar", { name: "Выбранные слова" });
  await expect(bar).toContainText("2 выбрано");
  await expect(pane(page).getByRole("heading", { name: "2 слова" })).toBeVisible();

  await page.keyboard.press("m");
  const menu = page.getByRole("menu", { name: "Переместить 2 слова" });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: /^Полиция/ }).click();
  await expect(page.getByText("Перемещено в «Полиция»")).toBeVisible();
  await expect(themes(page).getByRole("link", { name: /^Полиция, 3 слова/ })).toBeVisible();
  await expect(bar).toBeHidden();

  await page.keyboard.press("z");
  await expect(themes(page).getByRole("link", { name: /^Полиция, 1 слово/ })).toBeVisible();
  await expect(row(page, "arrête").getByRole("gridcell").nth(4)).toHaveText("Повседневное");
});

test("Delete removes the current word and «Отменить» brings it back", async ({ page }) => {
  await openLibrary(page);
  await row(page, "vas-y").click();
  await page.keyboard.press("Delete");
  await expect(row(page, "vas-y")).toHaveCount(0);
  const snack = page.locator("[data-snackbar]");
  await expect(snack).toContainText("Удалено · vas-y");
  // The cursor moved to the neighbour (the last row: the previous one).
  await expect(row(page, "qu'est-ce qui se passe ?")).toHaveAttribute("aria-current", "true");
  await snack.getByRole("button", { name: "Отменить" }).click();
  await expect(row(page, "vas-y")).toBeVisible();
});

test("/ focuses the search; it matches French and Russian", async ({ page }) => {
  await openLibrary(page);
  await page.locator("body").click({ position: { x: 700, y: 20 } });
  await page.keyboard.press("/");
  const search = page.getByRole("searchbox", { name: "Поиск по FR и RU" });
  await expect(search).toBeFocused();
  await search.fill("flic");
  await expect(rows(page)).toHaveCount(1);
  await expect(page.getByText("Найдено 1 слово")).toBeVisible();
  await search.fill("шутка");
  await expect(rows(page)).toHaveCount(1);
  await expect(row(page, "une blague")).toBeVisible();
});

test("dragging a row onto a sidebar theme moves it there", async ({ page }) => {
  await openLibrary(page);
  const eda = themes(page).getByRole("link", { name: /^Еда, 1 слово/ });
  await expect(eda).toBeVisible();
  await row(page, "vas-y").dragTo(eda);
  await expect(themes(page).getByRole("link", { name: /^Еда, 2 слова/ })).toBeVisible();
  await expect(page.getByText("Перемещено в «Еда»")).toBeVisible();
  await expect(row(page, "vas-y").getByRole("gridcell").nth(4)).toHaveText("Еда");
});

test("a theme page: header, «Повторить тему» with R, theme menu", async ({ page }) => {
  await page.goto("/library");
  await themes(page).getByRole("link", { name: /^Эмоции/ }).click();
  await expect(page.getByRole("heading", { name: "Эмоции", level: 1 })).toBeVisible();
  await expect(grid(page).getByRole("columnheader", { name: /Тема/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Ещё действия с темой" }).click();
  const menu = page.getByRole("menu", { name: "Действия с темой" });
  await expect(menu.getByRole("menuitem", { name: /Название, описание и цвет/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await row(page, "c'est dur").click();
  await page.keyboard.press("r");
  await expect(page).toHaveURL(/\/\?folder=/);
});
