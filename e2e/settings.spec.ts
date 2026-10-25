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

test("phones: the index shows each section's current values and opens its sub-screen", async ({ page }) => {
  await page.goto("/settings");
  // One list of rows, no section headings; «Тема» is the one control kept inline.
  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(0);
  const rows = page.getByRole("main").getByRole("link");
  await expect(rows).toHaveText([/^План повторения/, /^Повторение/, /^Упражнения/, /^ИИ/, /^Свои поля/, /^Данные/]);
  await expect(page.getByRole("link", { name: "Повторение: FR → RU, 3 кнопки, свайпы" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Упражнения: Обычно" })).toBeVisible();
  await expect(page.getByRole("link", { name: "ИИ: Всё включено, быстрее" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Свои поля: Нет полей" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Данные: Только на этом устройстве" })).toBeVisible();

  for (const [name, url] of [
    ["Повторение", "/settings/review"],
    ["Упражнения", "/settings/exercises"],
    ["ИИ", "/settings/ai"],
    ["Свои поля", "/settings/fields"],
    ["Данные", "/settings/data"],
  ] as const) {
    await page.getByRole("link", { name: new RegExp(`^${name}:`) }).click();
    await expect(page).toHaveURL(new RegExp(`${url}$`));
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    // The library tab stays current on every sub-screen.
    await expect(tabBar(page).getByRole("link", { name: "Библиотека" })).toHaveAttribute("aria-current", "page");
    await page.getByRole("button", { name: "Назад к настройкам" }).click();
    await expect(page).toHaveURL(/\/settings$/);
  }

  // Old links to a section open its sub-screen; a sub-screen opened directly goes back to the index.
  await page.goto("/settings#set-data");
  await expect(page).toHaveURL(/\/settings\/data$/);
  await page.goto("/settings/exercises");
  await page.getByRole("button", { name: "Назад к настройкам" }).click();
  await expect(page).toHaveURL(/\/settings$/);
});

test("from 768 a sub-screen's route opens the one settings page at its section", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto("/settings/data");
  await expect(page).toHaveURL(/\/settings#set-data$/);
  await expect(page.locator("#set-data").getByRole("heading", { level: 2, name: "Данные" })).toBeInViewport();
  await page.goto("/settings/exercises");
  await expect(page).toHaveURL(/\/settings#set-exercises$/);
  await expect(page.locator("#set-exercises").getByRole("heading", { level: 2, name: "Упражнения" })).toBeInViewport();
});

test("settings show local-only sync and the privacy line", async ({ page }) => {
  await page.goto("/settings/data");
  await expect(page.getByText("только на этом устройстве")).toBeVisible();
  // That the plan and exercises are shared is said once, here.
  await expect(page.getByText("План повторения и упражнения общие для всех устройств — Claude их тоже видит.")).toBeVisible();
  // The rare imports open in place under «Другие форматы».
  const formats = page.getByRole("button", { name: /^Другие форматы/ });
  await expect(formats).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("main").locator('[data-state="closed"]').getByRole("button", { name: "Импорт из Anki", includeHidden: true })).toHaveCount(1);
  await formats.click();
  await expect(formats).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "Импорт из старой версии (HTML)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Импорт из Anki" })).toBeVisible();
  await page.goto("/settings/ai");
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
  await page.getByRole("link", { name: /^ИИ:/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "ИИ" })).toBeVisible();
  await page.getByRole("switch", { name: "Подбирать примеры" }).click();
  await expect(page.getByRole("switch", { name: "Подбирать примеры" })).not.toBeChecked();
  // «Вариантов» and «Регистр вариантов» belong to the suggestions: shown only while they are on.
  const folded = page.getByRole("main").locator('[data-state="closed"]');
  await page.getByRole("switch", { name: "Автоподсказки при вводе" }).click();
  await expect(folded.getByRole("radiogroup", { name: "Вариантов", exact: true, includeHidden: true })).toHaveCount(1);
  await expect(folded.getByRole("radiogroup", { name: "Регистр вариантов", includeHidden: true })).toHaveCount(1);
  await page.getByRole("switch", { name: "Автоподсказки при вводе" }).click();
  await expect(folded).toHaveCount(0);
  await page.getByRole("radiogroup", { name: "Вариантов", exact: true }).getByRole("radio", { name: "Один вариант" }).click();
  // One «Модель» for the suggestions and the screenshots: it sets both stored models.
  await page.getByRole("radiogroup", { name: "Модель" }).getByRole("radio", { name: /^Точнее/ }).click();
  await expect(page.getByRole("radiogroup", { name: "Модель" }).getByRole("radio", { name: /^Точнее/ })).toBeChecked();
  await expect
    .poll(async () => (await dbRows<{ id: string; ai_model: string; ai_model_extract: string }>(page, "settings")).find((r) => r.id === "settings"))
    .toMatchObject({ ai_model: "accurate", ai_model_extract: "accurate" });
  await page.getByRole("button", { name: "Назад к настройкам" }).click();
  await expect(page.getByRole("link", { name: "ИИ: Выключено: примеры, точнее" })).toBeVisible();

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
  await page.goto("/settings/review");
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
  await expect(page.getByRole("link", { name: "Упражнения: Обычно" })).toBeVisible();
  await page.getByRole("link", { name: /^Упражнения:/ }).click();
  await expect(page).toHaveURL(/\/settings\/exercises$/);

  const target = page.getByRole("radiogroup", { name: "Чаще в упражнениях" });
  const share = page.getByRole("radiogroup", { name: "Сколько в наборе" });
  // Unused with «Обычно», and it says so.
  await expect(page.getByText("При «Обычно» не используется")).toBeVisible();
  await expect(target.getByRole("radio")).toHaveCount(4);
  await expect(target.getByRole("radio", { name: "Обычно" })).toBeChecked();
  await expect(share.getByRole("radio", { name: "Половина" })).toBeChecked();
  for (const name of ["Немного", "Половина", "Почти все"]) await expect(share.getByRole("radio", { name })).toBeDisabled();

  await target.getByRole("radio", { name: "Трудные", exact: true }).click();
  await expect(target.getByRole("radio", { name: "Трудные", exact: true })).toBeChecked();
  await expect(share.getByRole("radio", { name: "Почти все" })).toBeEnabled();
  await expect(page.getByText("При «Обычно» не используется")).toHaveCount(0);
  await share.getByRole("radio", { name: "Почти все" }).click();
  await expect(share.getByRole("radio", { name: "Почти все" })).toBeChecked();
  await expect.poll(async () => (await focusRow())?.value).toEqual({ target: "difficult", share: "most" });
  expect((await focusRow())?.deleted_at).toBeNull();

  // Survives a reload.
  await page.reload();
  await expect(page.getByRole("radiogroup", { name: "Чаще в упражнениях" }).getByRole("radio", { name: "Трудные", exact: true })).toBeChecked();
  await expect(page.getByRole("radiogroup", { name: "Сколько в наборе" }).getByRole("radio", { name: "Почти все" })).toBeChecked();

  // The index says it.
  await page.getByRole("button", { name: "Назад к настройкам" }).click();
  await expect(page.getByRole("link", { name: "Упражнения: Трудные, почти весь набор" })).toBeVisible();
  await page.getByRole("link", { name: /^Упражнения:/ }).click();

  // «Обычно» keeps the share but dims and blocks the choice.
  await page.getByRole("radiogroup", { name: "Чаще в упражнениях" }).getByRole("radio", { name: "Обычно" }).click();
  const most = page.getByRole("radiogroup", { name: "Сколько в наборе" }).getByRole("radio", { name: "Почти все" });
  await expect(most).toBeDisabled();
  await expect(most).toBeChecked();
  await expect.poll(async () => (await focusRow())?.value).toEqual({ target: "normal", share: "most" });
});
