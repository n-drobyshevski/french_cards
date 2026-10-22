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

test("the library shows theme tiles or every word, and remembers the choice", async ({ page }) => {
  await page.goto("/library");
  const view = page.getByRole("radiogroup", { name: "Показывать" });
  await expect(view.getByRole("radio", { name: "Темы" })).toBeChecked();
  await expect(page.getByRole("link", { name: /^Эмоции:/ })).toBeVisible();

  await view.getByRole("radio", { name: "Все слова" }).click();
  await expect(page.getByText("Все слова · 11")).toBeVisible();
  const list = page.getByRole("list", { name: "Все слова" });
  await expect(list.getByText("les flics", { exact: true })).toBeVisible();
  await expect(list.getByText("dépêche-toi", { exact: true })).toBeVisible();
  await expect(list.getByRole("listitem")).toHaveCount(11);
  await expect(page.getByRole("link", { name: /^Эмоции:/ })).toHaveCount(0);

  // Remembered on this device.
  await page.reload();
  await expect(page.getByText("Все слова · 11")).toBeVisible();

  // A search narrows the list; the view switch steps aside while it is active.
  await page.getByRole("searchbox", { name: "Поиск по FR и RU" }).or(page.getByRole("textbox", { name: "Поиск по FR и RU" })).fill("flics");
  await expect(page.getByText("Найдено 1 слово")).toBeVisible();
  await expect(view).toHaveCount(0);
  await page.getByRole("button", { name: "Очистить поиск" }).click();

  await view.getByRole("radio", { name: "Темы" }).click();
  await expect(page.getByRole("link", { name: /^Эмоции:/ })).toBeVisible();
});

test("a tap on an abbreviation in the word sheet explains it", async ({ page }) => {
  await page.goto("/library");
  await page.getByRole("searchbox", { name: "Поиск по FR и RU" }).or(page.getByRole("textbox", { name: "Поиск по FR и RU" })).fill("flics");
  await page.getByText("les flics", { exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Карточка слова" });

  await sheet.getByRole("button", { name: "n. m. — nom masculin" }).click();
  const hint = sheet.getByRole("tooltip");
  await expect(hint).toContainText("Существительное мужского рода");
  await expect(sheet.getByRole("button", { name: "n. m. — nom masculin" })).toHaveAttribute("aria-expanded", "true");

  // The slang level explains itself too; one hint at a time.
  await sheet.getByRole("button", { name: "fam. — familier" }).click();
  await expect(sheet.getByRole("tooltip")).toHaveCount(1);
  await expect(sheet.getByRole("tooltip")).toContainText("Разговорное");

  // Escape closes the hint, not the sheet.
  await page.keyboard.press("Escape");
  await expect(sheet.getByRole("tooltip")).toHaveCount(0);
  await expect(sheet).toBeVisible();
});
