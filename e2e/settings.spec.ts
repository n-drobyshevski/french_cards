import { expect, test } from "@playwright/test";
import { addSheet, dbRows, enriched, LA_THUNE, mockEnrich, mockSuggest, SE_CASSER_LA_TETE, tabBar } from "./fixtures";

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

test("«Проверить» next to the vibration switch plays a test pulse", async ({ page }) => {
  await page.addInitScript(() => {
    const calls: unknown[] = [];
    (window as unknown as { __vibrations: unknown[] }).__vibrations = calls;
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: (p: unknown) => (calls.push(p), true) });
  });
  await page.goto("/settings");
  await page.getByRole("button", { name: "Проверить" }).click();
  expect(await page.evaluate(() => (window as unknown as { __vibrations: unknown[] }).__vibrations)).toEqual([[35, 80, 35]]);

  // Without any way to vibrate, it says so.
  await page.evaluate(() => Object.defineProperty(navigator, "vibrate", { configurable: true, value: undefined }));
  await page.getByRole("button", { name: "Проверить" }).click();
  await expect(page.getByText("Этот браузер не умеет вибрировать")).toBeVisible();
});

test("«Чаще в упражнениях» saves to the synced row at once; «Обычно» disables «Сколько в наборе»", async ({ page }) => {
  const focusRow = async () =>
    (await dbRows<{ id: string; value: unknown; deleted_at: string | null }>(page, "user_prefs")).find((r) => r.id === "exercise_focus");

  await page.goto("/settings");
  const section = page.getByRole("region", { name: "Упражнения" });
  await expect(section).toBeVisible();
  // Right after «Повторение».
  const headings = page.getByRole("heading", { level: 2 });
  await expect(headings.nth(0)).toHaveText("Повторение");
  await expect(headings.nth(1)).toHaveText("Упражнения");
  await expect(headings.nth(2)).toHaveText("Оформление");
  await expect(section.getByText("Claude будет брать такие слова в упражнения — и когда просите в чате. Настройка общая для всех устройств.")).toBeVisible();

  const target = section.getByRole("radiogroup", { name: "Чаще в упражнениях" });
  const share = section.getByRole("radiogroup", { name: "Сколько в наборе" });
  await expect(target.getByRole("radio")).toHaveCount(4);
  await expect(target.getByRole("radio", { name: "Обычно" })).toBeChecked();
  await expect(share.getByRole("radio", { name: "Половина" })).toBeChecked();
  for (const name of ["Немного", "Половина", "Почти все"]) await expect(share.getByRole("radio", { name })).toBeDisabled();

  await target.getByRole("radio", { name: "Трудные", exact: true }).click();
  await expect(target.getByRole("radio", { name: "Трудные", exact: true })).toBeChecked();
  await expect(share.getByRole("radio", { name: "Почти все" })).toBeEnabled();
  await share.getByRole("radio", { name: "Почти все" }).click();
  await expect(share.getByRole("radio", { name: "Почти все" })).toBeChecked();
  await expect.poll(async () => (await focusRow())?.value).toEqual({ target: "difficult", share: "most" });
  expect((await focusRow())?.deleted_at).toBeNull();

  // Survives a reload.
  await page.reload();
  await expect(page.getByRole("radiogroup", { name: "Чаще в упражнениях" }).getByRole("radio", { name: "Трудные", exact: true })).toBeChecked();
  await expect(page.getByRole("radiogroup", { name: "Сколько в наборе" }).getByRole("radio", { name: "Почти все" })).toBeChecked();

  // «Обычно» keeps the share but dims and blocks the slider.
  await page.getByRole("radiogroup", { name: "Чаще в упражнениях" }).getByRole("radio", { name: "Обычно" }).click();
  const most = page.getByRole("radiogroup", { name: "Сколько в наборе" }).getByRole("radio", { name: "Почти все" });
  await expect(most).toBeDisabled();
  await expect(most).toBeChecked();
  await expect.poll(async () => (await focusRow())?.value).toEqual({ target: "normal", share: "most" });
});
