import { expect, test, type Page } from "@playwright/test";
import { addSheet, EXTRACTED, LA_THUNE, mockExtract, mockSuggest, openReview, screenshotPng, SE_CASSER_LA_TETE, tabBar } from "./fixtures";

// Main screens at 390×844 for docs/screenshots (compare with mockups/*.dc.html).
// Opt-in: SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to refresh docs/screenshots");
test.use({ deviceScaleFactor: 2 });

const shot = async (page: Page, name: string) => {
  // Let sheet/flip transitions settle and fonts finish loading.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(450);
  await page.screenshot({ path: `docs/screenshots/${name}.png`, animations: "disabled", caret: "initial" });
};

test("review front, back and dark", async ({ page }) => {
  await openReview(page);
  // Start on se casser, like the mockups: grade the first four cards.
  for (let i = 0; i < 4; i++) {
    await page.getByRole("button", { name: "Показать ответ" }).click();
    await page.getByRole("group", { name: "Оценка" }).getByRole("button", { name: /^Знаю/ }).click();
    await expect(page.getByText(`0${i + 1} / 11`, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: /Карточка se casser/ })).toBeVisible();
  await page.getByRole("status").filter({ hasText: "Знаю" }).waitFor({ state: "detached", timeout: 10_000 }).catch(() => {});
  await shot(page, "review-front");
  await page.getByRole("button", { name: "Показать ответ" }).click();
  await expect(page.getByRole("group", { name: "Оценка" })).toBeVisible();
  await shot(page, "review-back");

  await page.goto("/settings");
  await page.getByRole("radiogroup", { name: "Тема" }).getByRole("radio", { name: "Тёмная" }).click();
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Карточка se casser/ })).toBeVisible();
  await page.getByRole("button", { name: "Показать ответ" }).click();
  await expect(page.getByRole("group", { name: "Оценка" })).toBeVisible();
  await shot(page, "review-back-dark");
});

test("add sheet with suggestions", async ({ page }) => {
  await mockSuggest(page, [LA_THUNE, SE_CASSER_LA_TETE].slice(0, 1));
  await openReview(page);
  await tabBar(page).getByRole("button", { name: "Добавить" }).click();
  const sheet = addSheet(page);
  await shot(page, "add-empty");
  await sheet.getByPlaceholder("Слово или выражение — FR или RU").fill("la thu");
  await expect(sheet.getByRole("button", { name: /^Выбрать: la thune/ })).toBeVisible();
  await expect(sheet.getByText("Словарь")).toBeVisible();
  await shot(page, "add-suggest");
  await sheet.getByRole("button", { name: /^Выбрать: la thune/ }).click();
  await expect(sheet.getByText("подобрано автоматически")).toBeVisible();
  await shot(page, "add-filled");
});

test("library and folder", async ({ page }) => {
  await page.goto("/library");
  await expect(page.getByText("11 слов", { exact: true }).first()).toBeVisible();
  await shot(page, "library");
  await page.getByRole("link", { name: /^Повседневное:/ }).click();
  await expect(page.getByRole("heading", { name: "Повседневное" })).toBeVisible();
  await shot(page, "folder");
});

test("import review", async ({ page }) => {
  await mockExtract(page, EXTRACTED);
  await page.goto("/import");
  await shot(page, "import-pick");
  await page
    .locator("input[type=file][accept='image/png,image/jpeg,image/webp']")
    .setInputFiles({ name: "chat.png", mimeType: "image/png", buffer: await screenshotPng(page) });
  await expect(page.getByRole("heading", { name: "Найдено 4 слова" })).toBeVisible();
  await shot(page, "import-review");
});

test("settings", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByText("только на этом устройстве")).toBeVisible();
  await shot(page, "settings");
});
