import { expect, test, type Page } from "@playwright/test";
import { addSheet, LA_THUNE, mockSuggest, openReview, questionCard, tabBar } from "./fixtures";

// «Свои поля» on phones (mockups/SPEC.md «Свои поля»): shared fields defined in Settings, filled in
// the word's sheet and in the add form, shown on the back of the review card; one-off fields per
// word; a deleted definition leaves its values on the cards.

const fieldsSection = (page: Page) => page.getByRole("region", { name: "Свои поля" });
const wordSheet = (page: Page) => page.getByRole("dialog", { name: "Карточка слова" });

async function addSharedField(page: Page, name: string, hint: string) {
  await page.goto("/settings");
  await fieldsSection(page).getByRole("button", { name: "Добавить поле" }).click();
  const sheet = page.getByRole("dialog", { name: "Новое поле" });
  await sheet.getByLabel("Название").fill(name);
  await sheet.getByLabel("Что писать").fill(hint);
  await sheet.getByRole("switch", { name: "Заполнять автоматически" }).click();
  await sheet.getByRole("button", { name: "Сохранить" }).click();
  await expect(sheet).toBeHidden();
  await expect(fieldsSection(page).getByRole("button", { name: new RegExp(`^${name}`) })).toContainText("авто");
}

async function openWord(page: Page, fr: string) {
  await page.goto("/library");
  await page.getByRole("searchbox", { name: "Поиск по FR и RU" }).fill(fr);
  await page.getByText(fr, { exact: true }).click();
  await expect(wordSheet(page)).toBeVisible();
  return wordSheet(page);
}

test("a shared field is filled on the word, shown on the card back and outlives its definition", async ({ page }) => {
  await addSharedField(page, "Синонимы", "2–3 синонима на французском");

  // The word's sheet lists the shared field even when it is empty.
  let sheet = await openWord(page, "une blague");
  const add = sheet.getByRole("button", { name: "Добавить: Синонимы" });
  await expect(add).toBeVisible();
  await add.click();
  const value = sheet.getByRole("textbox", { name: "Синонимы" });
  await expect(value).toBeFocused();
  await expect(value).toHaveAttribute("placeholder", "2–3 синонима на французском");
  await value.fill("une vanne, une connerie");
  await sheet.getByRole("button", { name: "Сохранить" }).click();
  await expect(sheet.getByText("une vanne, une connerie")).toBeVisible();

  // A one-off field of this word.
  await sheet.getByRole("button", { name: "Поле", exact: true }).click();
  await expect(sheet.getByRole("textbox", { name: "Название поля" })).toBeFocused();
  await sheet.getByRole("textbox", { name: "Название поля" }).fill("Произношение");
  await sheet.getByRole("textbox", { name: "Значение поля" }).fill("[yn blag]");
  await sheet.getByRole("button", { name: "Сохранить" }).click();
  await expect(sheet.getByText("[yn blag]")).toBeVisible();
  await expect(sheet.getByText("une vanne, une connerie")).toBeVisible();

  // The back of the card shows both after the flip.
  await openReview(page);
  await expect(page.getByRole("button", { name: /Карточка une blague/ })).toBeVisible();
  await expect(page.getByText("une vanne, une connerie")).toHaveCount(0);
  await questionCard(page).click();
  const back = page.locator("[data-review-answer]");
  await expect(back.getByText("Синонимы", { exact: true })).toBeVisible();
  await expect(back.getByText("une vanne, une connerie")).toBeVisible();
  await expect(back.getByText("Произношение", { exact: true })).toBeVisible();
  await expect(back.getByText("[yn blag]")).toBeVisible();

  // Deleting the definition can be undone…
  await page.goto("/settings");
  await fieldsSection(page)
    .getByRole("button", { name: /^Синонимы/ })
    .click();
  const edit = page.getByRole("dialog", { name: "Изменить поле" });
  await expect(edit.getByLabel("Название")).toHaveValue("Синонимы");
  await edit.getByRole("button", { name: "Удалить поле" }).click();
  await expect(edit).toBeHidden();
  await expect(page.getByText("Поле удалено")).toBeVisible();
  await expect(fieldsSection(page).getByRole("button", { name: /^Синонимы/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Отменить", exact: true }).click();
  await expect(fieldsSection(page).getByRole("button", { name: /^Синонимы/ })).toBeVisible();

  // …and once gone, the word keeps its value as a one-off field.
  await fieldsSection(page)
    .getByRole("button", { name: /^Синонимы/ })
    .click();
  await page.getByRole("dialog", { name: "Изменить поле" }).getByRole("button", { name: "Удалить поле" }).click();
  await expect(page.getByText("Поле удалено")).toBeVisible();

  sheet = await openWord(page, "une blague");
  await expect(sheet.getByText("une vanne, une connerie")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Добавить: Синонимы" })).toHaveCount(0);
  await sheet.getByRole("button", { name: "Изменить свои поля" }).click();
  await expect(sheet.getByRole("button", { name: "Убрать поле «Синонимы»" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Убрать поле «Произношение»" })).toBeVisible();
});

test("the add form offers the shared fields in a collapsed group", async ({ page }) => {
  await addSharedField(page, "Синонимы", "2–3 синонима");
  await mockSuggest(page, [LA_THUNE]);
  await openReview(page);

  await tabBar(page).getByRole("button", { name: "Добавить" }).click();
  const sheet = addSheet(page);
  await sheet.getByPlaceholder("Слово или выражение — FR или RU").fill("la thu");
  await sheet.getByRole("button", { name: "Выбрать: la thune — бабки, деньги" }).click();

  const group = sheet.getByRole("button", { name: /Свои поля/ });
  await expect(group).toHaveAttribute("aria-expanded", "false");
  await group.click();
  await expect(group).toHaveAttribute("aria-expanded", "true");
  const input = sheet.getByPlaceholder("2–3 синонима");
  await input.fill("le pognon, le blé");
  await expect(group).toContainText("заполнено 1 из 1");
  await sheet.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(sheet).toBeHidden();

  const word = await openWord(page, "la thune");
  await expect(word.getByText("le pognon, le blé")).toBeVisible();
});
