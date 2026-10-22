import { expect, test } from "@playwright/test";
import { addSheet, enriched, mockEnrich, mockExample, mockSuggest, openReview, tabBar } from "./fixtures";

// Examples: «другой пример» ↻ and «+ Ещё пример» ask /api/ai/example for a sentence unlike the
// ones the word already has.

const SENTENCES = ["Les flics sont arrivés.", "Appelle pas les flics !", "Les flics tournent dans le quartier."];

test("in the word sheet: pick an example, add another, swap one, undo", async ({ page }) => {
  const avoided: string[][] = [];
  await mockExample(
    page,
    () => ({ fr: SENTENCES[avoided.length - 1] ?? "Encore une.", ru: `перевод ${avoided.length}` }),
    (b) => avoided.push(b.avoid),
  );
  await page.goto("/library");
  await page.getByRole("searchbox", { name: "Поиск по FR и RU" }).fill("flics");
  await page.getByText("les flics", { exact: true }).click();
  const card = page.getByRole("dialog", { name: "Карточка слова" });
  await expect(card.getByText("Нет примера")).toBeVisible();

  await card.getByRole("button", { name: "Подобрать пример" }).click();
  await expect(card.getByText(SENTENCES[0])).toBeVisible();
  await expect(card.getByText("Пример добавлен")).toBeVisible();

  await card.getByRole("button", { name: "Ещё пример" }).click();
  await expect(card.getByText(SENTENCES[1])).toBeVisible();
  expect(avoided[1]).toEqual([SENTENCES[0]]);

  // ↻ on the first one: a third sentence takes its place; the other stays.
  await card.getByRole("button", { name: `Другой пример вместо «${SENTENCES[0]}»` }).click();
  await expect(card.getByText(SENTENCES[2])).toBeVisible();
  await expect(card.getByText(SENTENCES[0])).toHaveCount(0);
  await expect(card.getByText(SENTENCES[1])).toBeVisible();
  expect(avoided[2]).toEqual([SENTENCES[0], SENTENCES[1]]);

  await card.getByRole("button", { name: "Отменить", exact: true }).click();
  await expect(card.getByText(SENTENCES[0])).toBeVisible();
  await expect(card.getByText(SENTENCES[2])).toHaveCount(0);
});

test("in the add form: «+ Ещё пример» adds a second example that is saved with the word", async ({ page }) => {
  await mockSuggest(page, []);
  await mockEnrich(page, (w) => enriched(w, { example_fr: "Il a garé sa caisse devant chez moi.", example_ru: "Он припарковал тачку у моего дома." }));
  await mockExample(page, () => ({ fr: "Sa caisse est en panne.", ru: "Его тачка сломалась." }));
  await openReview(page);
  await tabBar(page).getByRole("button", { name: "Добавить" }).click();
  const sheet = addSheet(page);
  await sheet.getByPlaceholder("Слово или выражение — FR или RU").fill("la caisse");
  await sheet.getByRole("button", { name: "Заполнить вручную" }).click();
  await sheet.getByRole("textbox", { name: "Русский", exact: true }).fill("тачка");
  await expect(sheet.getByRole("textbox", { name: "Пример по-французски" })).toHaveValue("Il a garé sa caisse devant chez moi.");

  await sheet.getByRole("button", { name: "Ещё пример" }).click();
  await expect(sheet.getByRole("textbox", { name: "Пример 2 по-французски" })).toHaveValue("Sa caisse est en panne.");
  await expect(sheet.getByRole("textbox", { name: "Перевод примера 2" })).toHaveValue("Его тачка сломалась.");
  await sheet.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(sheet).toBeHidden();

  await tabBar(page).getByRole("link", { name: "Библиотека" }).click();
  await page.getByRole("searchbox", { name: "Поиск по FR и RU" }).fill("caisse");
  await page.getByText("la caisse", { exact: true }).click();
  const card = page.getByRole("dialog", { name: "Карточка слова" });
  await expect(card.getByText("Il a garé sa caisse devant chez moi.")).toBeVisible();
  await expect(card.getByText("Sa caisse est en panne.")).toBeVisible();
});
