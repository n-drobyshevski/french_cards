import { expect, test } from "@playwright/test";
import { addSheet, enriched, LA_THUNE, mockEnrich, mockSuggest, SE_CASSER_LA_TETE, tabBar } from "./fixtures";

test("switching the theme to dark applies at once and survives a reload", async ({ page }) => {
  await page.goto("/settings");
  const themes = page.getByRole("radiogroup", { name: "Тема" });
  await expect(themes.getByRole("radio", { name: "Система" })).toBeChecked();

  await themes.getByRole("radio", { name: "Тёмная" }).click();
  await expect(themes.getByRole("radio", { name: "Тёмная" })).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(18, 18, 18)");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.goto("/");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(18, 18, 18)");

  await page.goto("/settings");
  await page.getByRole("radiogroup", { name: "Тема" }).getByRole("radio", { name: "Светлая" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(241, 241, 238)");
});

test("settings show local-only sync and the privacy line", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByText("только на этом устройстве")).toBeVisible();
  await expect(page.getByText(/отправляются в Anthropic \(Claude\)/)).toBeVisible();
});

test("Settings «ИИ» shape the variants and what is filled in automatically", async ({ page }) => {
  const suggestBodies: Record<string, unknown>[] = [];
  const enrichBodies: Record<string, unknown>[] = [];
  await mockSuggest(page, [LA_THUNE, SE_CASSER_LA_TETE], (body) => suggestBodies.push(body as Record<string, unknown>));
  await mockEnrich(page, (w) => enriched(w, { example_fr: "Il a garé sa caisse.", slang_level: 1 }));
  page.on("request", (req) => {
    if (req.url().endsWith("/api/ai/enrich")) enrichBodies.push(req.postDataJSON() as Record<string, unknown>);
  });

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "ИИ" })).toBeVisible();
  await page.getByRole("switch", { name: "Подбирать примеры" }).click();
  await expect(page.getByRole("switch", { name: "Подбирать примеры" })).not.toBeChecked();
  await page.getByRole("radiogroup", { name: "Вариантов" }).getByRole("radio", { name: "Один вариант" }).click();
  await page.getByRole("radiogroup", { name: "Модель: подсказки" }).getByRole("radio", { name: "Точнее" }).click();
  await expect(page.getByRole("radiogroup", { name: "Модель: подсказки" }).getByRole("radio", { name: "Точнее" })).toBeChecked();

  await tabBar(page).getByRole("button", { name: "Добавить" }).click();
  const sheet = addSheet(page);
  await sheet.getByPlaceholder("Слово или выражение — FR или RU").fill("la thu");
  await expect(sheet.getByRole("button", { name: "Выбрать: la thune — бабки, деньги" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: /^Выбрать:/ })).toHaveCount(1);
  expect(suggestBodies.at(-1)).toMatchObject({ model: "accurate", max: 1, register: "any", notes: true });

  // A picked variant keeps its level but brings no example.
  await sheet.getByRole("button", { name: "Выбрать: la thune — бабки, деньги" }).click();
  await expect(sheet.getByRole("textbox", { name: "Пример по-французски" })).toHaveValue("");
  await sheet.getByRole("button", { name: "Назад к поиску" }).click();

  // A word typed by hand: level detected with the chosen model, no example.
  await sheet.getByPlaceholder("Слово или выражение — FR или RU").fill("la caisse");
  await sheet.getByRole("button", { name: "Заполнить вручную" }).click();
  await sheet.getByRole("textbox", { name: "Русский", exact: true }).fill("тачка");
  await expect(sheet.getByText("определён автоматически")).toBeVisible();
  await expect(sheet.getByRole("radio", { name: "фамильярный" })).toBeChecked();
  await expect(sheet.getByRole("textbox", { name: "Пример по-французски" })).toHaveValue("");
  expect(enrichBodies.at(-1)).toMatchObject({ model: "accurate" });
});
