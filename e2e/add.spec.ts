import { expect, test } from "@playwright/test";
import { addSheet, enriched, LA_THUNE, mockEnrich, mockSuggest, openReview, questionCard, SE_CASSER_LA_TETE, tabBar } from "./fixtures";

test("add a word from a suggestion and find it in its theme", async ({ page }) => {
  const requests: unknown[] = [];
  await mockSuggest(page, [LA_THUNE, SE_CASSER_LA_TETE], (body) => requests.push(body));
  await openReview(page);

  await tabBar(page).getByRole("button", { name: "Добавить" }).click();
  const sheet = addSheet(page);
  await expect(sheet).toBeVisible();
  const input = sheet.getByPlaceholder("Слово или выражение — FR или RU");
  await expect(input).toBeFocused();

  await input.fill("la thu");
  await expect(sheet.getByRole("button", { name: "Выбрать: la thune — бабки, деньги" })).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ q: "la thu", direction: "auto" });
  expect((requests[0] as { folders: { slug: string }[] }).folders.map((f) => f.slug)).toContain("dengi");

  await sheet.getByRole("button", { name: "Выбрать: la thune — бабки, деньги" }).click();
  await expect(sheet.getByText("подобрано автоматически")).toBeVisible();
  await expect(sheet.getByRole("radio", { name: "Деньги" })).toBeChecked();
  await sheet.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(sheet).toBeHidden();

  // A new card joins today's queue (two directions, ru_fr waits for fr_ru).
  await expect(page.getByText("00 / 12", { exact: true })).toBeVisible();

  await tabBar(page).getByRole("link", { name: "Библиотека" }).click();
  await expect(page.getByText("12 слов", { exact: true }).first()).toBeVisible();
  await page.getByRole("link", { name: /^Деньги:/ }).click();
  await expect(page.getByRole("heading", { name: "Деньги" })).toBeVisible();
  await expect(page.getByText("la thune", { exact: true })).toBeVisible();
  await expect(page.getByText("бабки, деньги", { exact: true })).toBeVisible();
});

test("a duplicate is flagged instead of added twice", async ({ page }) => {
  await mockSuggest(page, []);
  await openReview(page);
  await tabBar(page).getByRole("button", { name: "Добавить" }).click();
  const sheet = addSheet(page);
  await sheet.getByPlaceholder("Слово или выражение — FR или RU").fill("les flics");
  await expect(sheet.getByText(/Уже есть/).first()).toBeVisible();
});

test("the undo snackbar after adding from the review screen stays above the grade buttons", async ({ page }) => {
  await mockSuggest(page, [LA_THUNE]);
  await openReview(page);
  await questionCard(page).click();
  const grades = page.getByRole("group", { name: "Оценка" });
  await expect(grades).toBeVisible();

  await tabBar(page).getByRole("button", { name: "Добавить" }).click();
  const sheet = addSheet(page);
  await sheet.getByPlaceholder("Слово или выражение — FR или RU").fill("la thu");
  await sheet.getByRole("button", { name: "Выбрать: la thune — бабки, деньги" }).click();
  await sheet.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(sheet).toBeHidden();

  const undo = page.getByRole("button", { name: "Отменить", exact: true });
  await expect(undo).toBeVisible();
  await expect(async () => {
    const bar = (await page.locator("[data-snackbar]").boundingBox())!;
    const buttons = (await grades.boundingBox())!;
    expect(bar.y + bar.height).toBeLessThanOrEqual(buttons.y);
  }).toPass();
  // A tap on «Знаю» grades the card instead of undoing the new word.
  await grades.getByRole("button", { name: /^Знаю, следующий показ/ }).click();
  await expect(page.getByText(/^Знаю ·/)).toBeVisible();
  await expect(page.getByText("01 / 12", { exact: true })).toBeVisible();
});

test("the filled form: Return moves from French to Russian, then saves; fields are 16px on touch", async ({ page }) => {
  await mockSuggest(page, [LA_THUNE]);
  await openReview(page);
  await tabBar(page).getByRole("button", { name: "Добавить" }).click();
  const sheet = addSheet(page);
  await sheet.getByPlaceholder("Слово или выражение — FR или RU").fill("la thu");
  await sheet.getByRole("button", { name: "Выбрать: la thune — бабки, деньги" }).click();

  const fields = sheet.locator("input:visible, textarea:visible, select:visible");
  const sizes = await fields.evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)));
  expect(sizes.length).toBeGreaterThan(2);
  expect(Math.min(...sizes)).toBeGreaterThanOrEqual(16);

  const fr = sheet.getByRole("textbox", { name: "Французский" });
  await fr.focus();
  await page.keyboard.press("Enter");
  const ru = sheet.getByRole("textbox", { name: "Русский", exact: true });
  await expect(ru).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(sheet).toBeHidden();
  await expect(page.getByText("00 / 12", { exact: true })).toBeVisible();
});

test("with automatic sorting off, a picked suggestion starts in «Входящие»", async ({ page }) => {
  await mockSuggest(page, [LA_THUNE]);
  await page.goto("/settings");
  const toggle = page.getByRole("switch", { name: "Раскладывать по темам автоматически" });
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked();

  await tabBar(page).getByRole("button", { name: "Добавить" }).click();
  const sheet = addSheet(page);
  await sheet.getByPlaceholder("Слово или выражение — FR или RU").fill("la thu");
  await sheet.getByRole("button", { name: "Выбрать: la thune — бабки, деньги" }).click();
  await expect(sheet.getByRole("radio", { name: "Входящие" })).toBeChecked();
  await expect(sheet.getByRole("radio", { name: "Деньги" })).not.toBeChecked();
  await expect(sheet.getByText("подобрано автоматически")).toHaveCount(0);
});

test("a word typed by hand gets its slang level and an example before saving", async ({ page }) => {
  const sent: string[] = [];
  await mockSuggest(page, []);
  await mockEnrich(
    page,
    (w) => enriched(w, { example_fr: "Il a garé sa caisse devant chez moi.", example_ru: "Он припарковал тачку у моего дома." }),
    (words) => sent.push(...words.map((w) => `${w.fr}|${w.ru}`)),
  );
  await openReview(page);
  await tabBar(page).getByRole("button", { name: "Добавить" }).click();
  const sheet = addSheet(page);
  await sheet.getByPlaceholder("Слово или выражение — FR или RU").fill("la caisse");
  await sheet.getByRole("button", { name: "Заполнить вручную" }).click();
  await sheet.getByRole("textbox", { name: "Русский", exact: true }).fill("тачка");

  await expect(sheet.getByText("определён автоматически")).toBeVisible();
  await expect(sheet.getByRole("radio", { name: "фамильярный" })).toBeChecked();
  await expect(sheet.getByRole("textbox", { name: "Пример по-французски" })).toHaveValue("Il a garé sa caisse devant chez moi.");
  await expect(sheet.getByText("подобран автоматически")).toBeVisible();
  expect(sent).toEqual(["la caisse|тачка"]);

  // A level picked by hand is what gets saved.
  await sheet.getByRole("radio", { name: "арго" }).click();
  await sheet.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(sheet).toBeHidden();

  await tabBar(page).getByRole("link", { name: "Библиотека" }).click();
  await page.getByRole("searchbox", { name: "Поиск по FR и RU" }).or(page.getByRole("textbox", { name: "Поиск по FR и RU" })).fill("caisse");
  await page.getByText("la caisse", { exact: true }).click();
  const card = page.getByRole("dialog", { name: "Карточка слова" });
  await expect(card.getByText("Il a garé sa caisse devant chez moi.")).toBeVisible();
  await expect(card.getByRole("img", { name: /арго/ }).first()).toBeVisible();
});

test("pasted rows show their slang level and example and are saved with them", async ({ page }) => {
  await mockSuggest(page, []);
  await mockEnrich(page, (w) => (w.fr === "chelou" ? enriched(w, { pos: "adj", gender: "none", slang_level: 2, verlan: true }) : enriched(w)));
  await openReview(page);
  await tabBar(page).getByRole("button", { name: "Добавить" }).click();
  await addSheet(page).getByRole("button", { name: "Список" }).click();
  const sheet = page.getByRole("dialog", { name: /Несколько слов/ });
  await sheet.getByRole("textbox", { name: "Список слов" }).fill("la caisse — тачка\nchelou — стрёмный");
  await expect(sheet.getByText("Exemple avec chelou.")).toBeVisible();
  await expect(sheet.getByText("Exemple avec la caisse.")).toBeVisible();
  await sheet.getByRole("button", { name: "Добавить 2 слова" }).click();
  await expect(sheet).toBeHidden();

  await tabBar(page).getByRole("link", { name: "Библиотека" }).click();
  await page.getByRole("searchbox", { name: "Поиск по FR и RU" }).or(page.getByRole("textbox", { name: "Поиск по FR и RU" })).fill("chelou");
  await page.getByText("chelou", { exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Карточка слова" }).getByText("Exemple avec chelou.")).toBeVisible();
});
