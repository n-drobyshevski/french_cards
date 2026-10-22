import { expect, test } from "@playwright/test";
import { enriched, mockEnrich } from "./fixtures";

test("library search matches French and Russian, ignoring accents", async ({ page }) => {
  await page.goto("/library");
  await expect(page.getByText("11 слов", { exact: true }).first()).toBeVisible();
  const search = page.getByRole("searchbox", { name: "Поиск по FR и RU" }).or(page.getByRole("textbox", { name: "Поиск по FR и RU" }));

  await search.fill("depeche");
  const results = page.getByRole("region", { name: "Слова" }).or(page.locator("section[aria-label='Слова']"));
  await expect(results.getByText("dépêche-toi", { exact: true })).toBeVisible();
  await expect(results.getByText("une blague", { exact: true })).toHaveCount(0);

  await search.fill("копы");
  await expect(results.getByText("les flics", { exact: true })).toBeVisible();
  await expect(results.getByText("dépêche-toi", { exact: true })).toHaveCount(0);

  await search.fill("zzzz");
  await expect(page.getByText(/Ничего не нашлось|не найдено/i).first()).toBeVisible();
});

test("a theme opens with its words and «Повторить тему» filters review to it", async ({ page }) => {
  await page.goto("/library");
  await page.getByRole("link", { name: /^Эмоции:/ }).click();
  await expect(page.getByRole("heading", { name: "Эмоции" })).toBeVisible();
  await expect(page.getByText("c'est dur", { exact: true })).toBeVisible();
  await expect(page.getByText("je vais me tuer", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Повторить тему" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: "Эмоции" })).toBeVisible();
  await expect(page.getByText("00 / 02", { exact: true })).toBeVisible();
});

test("an undo snackbar raised inside the word sheet is part of the sheet", async ({ page }) => {
  await page.goto("/library");
  await page.getByRole("searchbox", { name: "Поиск по FR и RU" }).or(page.getByRole("textbox", { name: "Поиск по FR и RU" })).fill("flics");
  await page.getByText("les flics", { exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Карточка слова" });
  await expect(sheet).toBeVisible();

  await sheet.getByRole("button", { name: "Сбросить прогресс" }).click();
  await expect(sheet.getByText("Прогресс сброшен")).toBeVisible();
  const undo = sheet.getByRole("button", { name: "Отменить", exact: true });
  await undo.focus();
  await expect(undo).toBeFocused();
});

test("«Дополнить карточки» proposes examples, applies the checked ones and undoes them", async ({ page }) => {
  await mockEnrich(page, (w) => enriched(w));
  await page.goto("/library");
  await page.getByRole("button", { name: /Дополнить карточки/ }).click();
  const sheet = page.getByRole("dialog", { name: "Дополнить карточки" });
  await expect(sheet.getByRole("region", { name: /^Примеры:/ }).or(sheet.locator("section[aria-label^='Примеры:']"))).toBeVisible();
  await expect(sheet.getByText("Exemple avec les flics.")).toBeVisible();

  // Uncheck one example: it is not written.
  await sheet.getByRole("checkbox", { name: /les flics/ }).click();
  const apply = sheet.getByRole("button", { name: /Применить/ });
  await expect(apply).toBeEnabled();
  await apply.click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText(/^Обновлено \d+ слов/)).toBeVisible();

  const search = page.getByRole("searchbox", { name: "Поиск по FR и RU" }).or(page.getByRole("textbox", { name: "Поиск по FR и RU" }));
  await page.getByRole("button", { name: "Отменить", exact: true }).click();
  await expect(page.getByText("Изменения отменены")).toBeVisible();
  await search.fill("flics");
  await page.getByText("les flics", { exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Карточка слова" }).getByText("Exemple avec les flics.")).toHaveCount(0);
});
