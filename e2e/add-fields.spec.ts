import { expect, test } from "@playwright/test";
import { addSheet, LA_THUNE, mockFill, mockSuggest, openReview, tabBar, type SuggestionWire } from "./fixtures";

// «+ Поле» in the add form (phones): «Происхождение», «Спряжение» for a verb the dictionary does not
// know and «Своё поле», saved with the new word.

const PECHO: SuggestionWire = {
  ...LA_THUNE,
  fr: "pécho",
  ru: "склеить, снять",
  note: null,
  example_fr: null,
  example_ru: null,
  pos: "verb",
  gender: "none",
  folder: "povsednevnoe",
  folder_alternatives: [],
};
const forms = (stem: string) => ["je", "tu", "il", "nous", "vous", "ils"].map((p) => `${p} ${stem}`);

test("«+ Поле» in the add form adds origin, conjugation and a field of its own to the new word", async ({ page }) => {
  await mockSuggest(page, [PECHO]);
  await mockFill(page, (body) =>
    body.field === "origin"
      ? "верлан от choper"
      : { auxiliary: "avoir", remark: null, tenses: { present: forms("pécho"), passe_compose: forms("a pécho"), imparfait: forms("pécho"), futur: forms("va pécho") } },
  );
  await openReview(page);
  await tabBar(page).getByRole("button", { name: "Добавить" }).click();
  const sheet = addSheet(page);
  await sheet.getByPlaceholder("Слово или выражение — FR или RU").fill("pécho");
  await sheet.getByRole("button", { name: "Выбрать: pécho — склеить, снять" }).click();

  const menu = page.getByRole("menu", { name: "Какое поле" });
  await sheet.getByRole("button", { name: "Поле", exact: true }).click();
  await expect(menu.getByRole("menuitem")).toHaveText([/^Происхождение/, /^Спряжение/, /^Своё поле/]);
  await menu.getByRole("menuitem", { name: /^Происхождение/ }).click();
  const origin = sheet.getByRole("textbox", { name: "Происхождение" });
  await expect(origin).toBeFocused();
  await sheet.getByRole("button", { name: "Заполнить автоматически" }).click();
  await expect(origin).toHaveValue("верлан от choper");

  await sheet.getByRole("button", { name: "Поле", exact: true }).click();
  await expect(menu.getByRole("menuitem")).toHaveText([/^Спряжение/, /^Своё поле/]);
  await menu.getByRole("menuitem", { name: /^Спряжение/ }).click();
  const conj = sheet.getByRole("group", { name: "Спряжение" });
  await conj.getByRole("button", { name: "Заполнить автоматически" }).click();
  await expect(conj.getByRole("textbox", { name: "Présent, je" })).toHaveValue("je pécho");

  // Origin and conjugation are in: «+ Поле» adds a field of its own at once.
  await sheet.getByRole("button", { name: "Поле", exact: true }).click();
  await expect(menu).toHaveCount(0);
  await expect(sheet.getByRole("textbox", { name: "Название поля 1" })).toBeFocused();
  await sheet.getByRole("textbox", { name: "Значение поля 1" }).fill("в клипе");
  // A value without a name waits for one.
  await sheet.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(sheet.getByText("Дайте полю название")).toBeVisible();
  await sheet.getByRole("textbox", { name: "Название поля 1" }).fill("Где услышал");
  await sheet.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(sheet).toBeHidden();

  await page.goto("/library");
  await page.getByRole("searchbox", { name: "Поиск по FR и RU" }).fill("pécho");
  await page.getByText("pécho", { exact: true }).click();
  const card = page.getByRole("dialog", { name: "Карточка слова" });
  await card.getByRole("button", { name: /^Ещё\s?·/ }).click();
  await expect(card.getByText("верлан от choper")).toBeVisible();
  await expect(card.getByText("своё · avoir")).toBeVisible();
  await expect(card.getByText("Где услышал")).toBeVisible();
  await expect(card.getByText("в клипе")).toBeVisible();
});

test("a noun's «+ Поле» offers no conjugation; a removed origin is not saved", async ({ page }) => {
  await mockSuggest(page, [LA_THUNE]);
  await openReview(page);
  await tabBar(page).getByRole("button", { name: "Добавить" }).click();
  const sheet = addSheet(page);
  await sheet.getByPlaceholder("Слово или выражение — FR или RU").fill("la thu");
  await sheet.getByRole("button", { name: "Выбрать: la thune — бабки, деньги" }).click();
  await sheet.getByRole("button", { name: "Поле", exact: true }).click();
  const menu = page.getByRole("menu", { name: "Какое поле" });
  await expect(menu.getByRole("menuitem")).toHaveText([/^Происхождение/, /^Своё поле/]);
  await menu.getByRole("menuitem", { name: /^Происхождение/ }).click();
  await sheet.getByRole("textbox", { name: "Происхождение" }).fill("от thune, старое арго");
  await sheet.getByRole("button", { name: "Убрать происхождение" }).click();
  await expect(sheet.getByRole("textbox", { name: "Происхождение" })).toHaveCount(0);
  await sheet.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(sheet).toBeHidden();
  await page.goto("/library");
  await page.getByRole("searchbox", { name: "Поиск по FR и RU" }).fill("thune");
  await expect(page.getByText("от thune, старое арго")).toHaveCount(0);
});
