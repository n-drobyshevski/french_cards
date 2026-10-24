import { expect, test, type Page } from "@playwright/test";

// «Уровень языка» on desktop (DESKTOP-SPEC §8 «Уровень языка», boards D-Level-Library, D-Level-Word):
// the «Ур.» column and its sort, the «Уровень языка ▾» strip filter, and the word pane's section with
// its in-place options. Seed levels as in levels.spec.ts: «une blague», «le gras» ≈A1, «arrête» ≈B2,
// «les flics» ≈C1, the other seven none.

const grid = (page: Page) => page.getByRole("grid", { name: /^Слова/ });
const rows = (page: Page) => grid(page).getByRole("row").filter({ has: page.getByRole("gridcell") });
const row = (page: Page, fr: string) => grid(page).getByRole("row", { name: new RegExp(`^${fr} —`) });
const pane = (page: Page) => page.getByRole("complementary", { name: "Карточка слова" });

test("«Ур.» shows the levels and sorts A1 → C2 with no level last; «Уровень языка ▾» filters", async ({ page }) => {
  await page.goto("/library");
  await expect(row(page, "une blague")).toHaveAccessibleName(/, ≈A1,/);
  await expect(row(page, "vas-y")).toHaveAccessibleName(/, без уровня,/);

  const head = grid(page).getByRole("columnheader", { name: /Ур/ });
  await head.getByRole("button").click();
  await expect(head).toHaveAttribute("aria-sort", "ascending");
  await expect(rows(page).first()).toHaveAccessibleName(/≈A1/);
  await expect(rows(page).nth(3)).toHaveAccessibleName(/^les flics —/);
  await expect(page.getByText("A1 → C2 · без уровня в конце")).toBeVisible();

  await page.getByRole("button", { name: /^Уровень языка/ }).click();
  await page.getByRole("checkbox", { name: "A1, 2" }).click();
  await expect(rows(page)).toHaveCount(2);
  await expect(page.getByRole("button", { name: /^Уровень языка: A1/ })).toBeVisible();
});

test("the word pane: «Изменить» opens the options in place; a pick is the user's level", async ({ page }) => {
  await page.goto("/library");
  await row(page, "une blague").click();
  const section = pane(page).getByRole("region", { name: "Уровень языка" });
  await expect(section.getByText("по словарю FLELex", { exact: true })).toBeVisible();
  await expect(section.getByText(/≈.A1 — оценка по словарю FLELex/)).toBeVisible();
  const change = section.getByRole("button", { name: "Изменить" });
  await expect(change).toHaveAttribute("aria-expanded", "false");
  await change.click();

  const options = section.getByRole("radiogroup", { name: "Уровень языка" });
  await expect(options.getByRole("radio", { name: "Авто" })).toHaveAttribute("aria-checked", "true");
  // Focus lands on the checked option; «Изменить» stays, expanded; Esc closes the options.
  await expect(options.getByRole("radio", { name: "Авто" })).toBeFocused();
  await expect(change).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(options).toBeHidden();
  await change.click();
  await expect(options.getByRole("radio", { name: "Авто" })).toBeFocused();
  await expect(options.getByRole("radio", { name: "A1, сейчас оценка" })).toBeVisible();
  await expect(section.getByText("подобрано автоматически · «Авто» вернёт оценку")).toBeVisible();
  await options.getByRole("radio", { name: "B2", exact: true }).click();
  await section.getByRole("button", { name: /^Сохранить/ }).click();

  await expect(section.getByText("· вы указали ·")).toBeVisible();
  await expect(row(page, "une blague")).toHaveAccessibleName(/, B2,/);
});

test("«Определить уровень языка»: the 760 dialog's footer has «Отмена Esc» / «Сохранить уровни ⌘↵», and ⌘↵ saves", async ({ page }) => {
  await page.route("**/api/ai/enrich", async (route) => {
    const body = route.request().postDataJSON() as { words: { id: string }[] };
    await route.fulfill({ json: { levels: body.words.map((w) => ({ id: w.id, cefr: "A2" })) } });
  });
  await page.goto("/library");
  await page.getByRole("button", { name: "Определить уровень языка" }).click();
  const dialog = page.getByRole("dialog", { name: /Уровень языка/ });
  await expect(dialog.getByText("Уровень языка для 6 слов")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Отмена" })).toHaveAttribute("aria-keyshortcuts", "Escape");
  const save = dialog.getByRole("button", { name: /^Сохранить уровни 6/ });
  await expect(save).toHaveAttribute("aria-keyshortcuts", "Meta+Enter Control+Enter");
  await page.keyboard.press("Control+Enter");
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Уровень языка: 6 слов")).toBeVisible();
});
