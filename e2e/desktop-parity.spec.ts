import { expect, test, type Page } from "@playwright/test";
import {
  addSheet,
  dbRows,
  gateSuggest,
  LA_THUNE,
  mockEnrich,
  mockSuggest,
  openReview,
  questionCard,
  seedCardStates,
  seedExerciseSets,
  seedStudyPlan,
  SEED_WORDS,
  SLANG_SET,
} from "./fixtures";

// What phones can do, desktop can do too (parity audit 2026-10-22): the done screen keeps its
// running head, the library's «Новые» filter and phone orders, theme actions from the sidebar and
// at medium width, practice and «Добавить слово» for «Входящие», help hints on hover, and the add
// dialog's way back from «Несколько слов», «Стереть» and the duplicate notice in the quick form.
// Runs in the desktop-chromium project (1440×800, mouse) on the first-run seed words.

const grid = (page: Page) => page.getByRole("grid", { name: /^Слова/ });
const row = (page: Page, fr: string) => grid(page).getByRole("row", { name: new RegExp(`^${fr} —`) });
const pane = (page: Page) => page.getByRole("complementary", { name: "Карточка слова" });
const themes = (page: Page) => page.getByRole("complementary", { name: "Разделы" }).getByRole("list", { name: "Темы" });
const headword = (page: Page) => addSheet(page).getByRole("combobox", { name: "Слово или выражение — FR или RU" });

async function openLibrary(page: Page) {
  await page.goto("/library");
  await expect(row(page, "vas-y")).toBeVisible();
}

async function openAdd(page: Page) {
  await openReview(page);
  await expect(async () => {
    if (!(await addSheet(page).isVisible())) await page.keyboard.press("n");
    await expect(addSheet(page)).toBeVisible({ timeout: 1000 });
  }).toPass();
}

test("«Готово на сегодня» keeps the running head: what to review, direction and undo", async ({ page }) => {
  await openReview(page);
  const done = page.getByRole("heading", { name: "Готово на сегодня" });
  for (let i = 0; i < 60; i++) {
    await expect(questionCard(page).or(done)).toBeVisible();
    if (await done.isVisible()) break;
    await page.keyboard.press("Space");
    await expect(page.locator("[data-review-answer]")).toBeVisible();
    await page.keyboard.press("3");
    await expect(page.locator("[data-review-answer]")).toHaveCount(0);
  }
  await expect(done).toBeVisible();
  await expect(page.getByRole("button", { name: /^Направление/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Отменить последний ответ" })).toBeEnabled();
  await page.getByRole("button", { name: "Все темы" }).click();
  await expect(page.getByRole("dialog", { name: /Что повторять/ })).toBeVisible();
});

test("library: «Новые» filter and the phone's orders in «Порядок ▾»", async ({ page }) => {
  await openLibrary(page);
  const strip = page.getByRole("group", { name: "Фильтр" });
  const fresh = strip.getByRole("button", { name: /^Новые/ });
  await expect(fresh).toContainText("11");
  await fresh.click();
  await expect(fresh).toHaveAttribute("aria-pressed", "true");

  const order = strip.getByRole("button", { name: /^Порядок: По алфавиту/ });
  await order.click();
  const menu = page.getByRole("menu", { name: "Порядок" });
  await expect(menu.getByRole("menuitemradio")).toHaveText(["Сначала новые", "По следующему показу", "По алфавиту", "Сначала трудные", "По уровню языка"]);
  await menu.getByRole("menuitemradio", { name: "Сначала новые" }).click();
  await expect(strip.getByRole("button", { name: /^Порядок: Сначала новые/ })).toBeVisible();
  await expect(grid(page).getByRole("columnheader", { name: /Слово/ })).toHaveAttribute("aria-sort", "none");
});

test("a right click on a sidebar theme opens its actions", async ({ page }) => {
  await openLibrary(page);
  await themes(page).getByRole("link", { name: /^Повседневное/ }).click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Действия с темой «Повседневное»" });
  await expect(menu.getByRole("menuitem", { name: "Открыть тему" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /Повторить тему/ })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /Тренировка всей темы/ })).toBeVisible();
  await expect(menu.getByRole("menuitemcheckbox", { name: /Закрепить тему/ })).toBeVisible();
  await menu.getByRole("menuitem", { name: "Название, описание и цвет" }).click();
  await expect(page.getByRole("dialog", { name: /Изменить тему/ })).toBeVisible();
});

test("medium width: «Новая тема…» in the «Тема:» menu", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await openLibrary(page);
  await page.getByRole("button", { name: /^Тема: все/ }).click();
  await page.getByRole("menuitem", { name: "Новая тема…" }).click();
  await expect(page.getByRole("dialog", { name: /Новая тема/ })).toBeVisible();
});

test("an empty «Входящие» offers «Добавить слово»", async ({ page }) => {
  await page.goto("/library/inbox");
  await expect(page.getByText("Здесь пусто — все слова разложены по темам.")).toBeVisible();
  await page.getByRole("button", { name: "Добавить слово" }).last().click();
  await expect(addSheet(page)).toBeVisible();
});

test("help hints open on hover in the word pane", async ({ page }) => {
  await openLibrary(page);
  await row(page, "une blague").click();
  const abbr = pane(page).getByRole("button", { name: /^n\. f\. —/ });
  await abbr.hover();
  await expect(pane(page).getByRole("tooltip")).toContainText("nom féminin");
  await page.mouse.move(5, 5);
  await expect(pane(page).getByRole("tooltip")).toHaveCount(0);
  // The slang level explains itself too.
  await pane(page).getByRole("button", { name: /^нейтр\. —/ }).first().click();
  await expect(pane(page).getByRole("tooltip")).toContainText("Нейтральное слово");
});

test("add dialog: back from «Несколько слов» (button and Esc), the text stays", async ({ page }) => {
  await mockSuggest(page, [LA_THUNE]);
  await mockEnrich(page, () => null);
  await openAdd(page);
  await addSheet(page).getByRole("button", { name: "Список" }).click();
  const list = page.getByRole("dialog", { name: "Несколько слов" });
  await list.getByRole("textbox", { name: /по одному на строку/ }).fill("bosser — работать");
  await list.getByRole("button", { name: "Назад к поиску" }).click();
  await expect(page.getByRole("dialog", { name: "Новое слово" })).toBeVisible();
  await expect(headword(page)).toBeFocused();

  await addSheet(page).getByRole("button", { name: "Список" }).click();
  await expect(list.getByRole("textbox", { name: /по одному на строку/ })).toHaveValue("bosser — работать");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Новое слово" })).toBeVisible();
});

test("add dialog: «Стереть» clears the headword; the quick form warns about a duplicate", async ({ page }) => {
  const suggest = await gateSuggest(page, () => 500);
  await mockEnrich(page, () => null);
  await openAdd(page);
  await headword(page).fill("abc");
  await addSheet(page).getByRole("button", { name: "Стереть" }).click();
  await expect(headword(page)).toHaveValue("");
  await expect(headword(page)).toBeFocused();

  await headword(page).fill("une blague");
  suggest.release();
  await expect(addSheet(page).getByRole("textbox", { name: "Русский" })).toBeVisible();
  await expect(addSheet(page).getByRole("note", { name: "Повтор" })).toContainText("Уже есть в теме «Повседневное»");
});

test("«Упражнения»: a right click on a set offers the phone's long-press actions; the request panel copies its request", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openReview(page);
  await seedExerciseSets(page, [SLANG_SET]);
  await page.goto("/exercises");
  const tile = page.getByRole("link", { name: new RegExp(`^${SLANG_SET.title}:`) });
  await expect(tile).toBeVisible();

  // Long press on phones = right click here: Начать / Скопировать запрос на похожий / Удалить (undo).
  await tile.click({ button: "right" });
  const menu = page.getByRole("dialog", { name: SLANG_SET.title });
  await expect(menu.getByRole("button", { name: "Начать" })).toBeVisible();
  await expect(menu.getByRole("button", { name: "Скопировать запрос на похожий" })).toBeVisible();
  await menu.getByRole("button", { name: "Удалить" }).click();
  await expect(page.getByText(`Набор «${SLANG_SET.title}» удалён`)).toBeVisible();
  await expect(tile).toHaveCount(0);
  await page.getByRole("button", { name: "Отменить", exact: true }).click();
  await expect(tile).toBeVisible();

  // The phone's request sheet is the right column here: themes, size, new words, copy.
  const panel = page.getByRole("complementary", { name: "Попросить набор" });
  await panel.getByRole("button", { name: /^Полиция/ }).click();
  await panel.getByRole("radio", { name: "16" }).click();
  const text = "Сделай упражнение в Карточках по теме «Полиция», 16 вопросов, можно новые слова.";
  await expect(panel.getByText(text)).toBeVisible();
  await panel.getByRole("button", { name: "Скопировать запрос" }).click();
  await expect(panel.getByRole("button", { name: "Скопировано" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text);
});

test("«Упражнение по трудным словам»: the panel's «Откуда слова», the quick tiles, the strip's menu and «Готово на сегодня»", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openReview(page);
  const difficult = ["se casser", "les flics", "vas-y"];
  const due = ["une blague", "arrête"];
  await seedCardStates(page, Object.fromEntries(SEED_WORDS.map((fr) => [fr, difficult.includes(fr) ? "difficult" : due.includes(fr) ? "due" : "known"] as const)));
  await seedExerciseSets(page, [SLANG_SET]);
  const clipboard = () => page.evaluate(() => navigator.clipboard.readText());
  const difficultText = "Сделай упражнение в Карточках по трудным словам из всех тем, 12 вопросов.";

  // «Упражнения»: the right column has the phone's «Откуда слова»; the grid has the quick tiles.
  await page.goto("/exercises");
  const panel = page.getByRole("complementary", { name: "Попросить набор" });
  const from = panel.getByRole("radiogroup", { name: "Откуда слова" });
  await from.getByRole("radio", { name: "Трудные: 3" }).click();
  await expect(panel.getByText(difficultText)).toBeVisible();
  await expect(panel.getByRole("group", { name: "Темы" })).toHaveCount(0);
  await expect(panel.getByRole("checkbox", { name: /Можно новые слова/ })).toHaveCount(0);
  await page.getByRole("button", { name: /^К повторению: 2 слова из всех тем/ }).click();
  expect(await clipboard()).toBe("Сделай упражнение в Карточках по словам к повторению из всех тем, 12 вопросов.");
  await expect(page.getByText("Ждём набор из чата").first()).toBeVisible();

  // Библиотека: a right click on «Трудные» in the strip = the phone ledger's long press.
  await page.goto("/library");
  const strip = page.getByRole("group", { name: "Фильтр" });
  const hard = strip.getByRole("button", { name: /^Трудные/ });
  await hard.click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Трудные" });
  await expect(menu.getByRole("menuitem", { name: "Показать в библиотеке" })).toBeVisible();
  await menu.getByRole("menuitem", { name: /^Упражнение по ним в Claude/ }).click();
  expect(await clipboard()).toBe(difficultText);
  await expect(page.locator("[data-snackbar]")).toContainText("Запрос скопирован");
  await expect(hard).toHaveAttribute("aria-pressed", "false");
  await page.waitForTimeout(900); // a second menu within 800 ms of the first is taken for the same press
  await hard.click({ button: "right" });
  await page.getByRole("menu", { name: "Трудные" }).getByRole("menuitem", { name: "Показать в библиотеке" }).click();
  await expect(hard).toHaveAttribute("aria-pressed", "true");

  // «Готово на сегодня» (nothing due once the due words are reviewed): the quiet row.
  await seedCardStates(page, { "une blague": "known", arrête: "known" });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Готово на сегодня" })).toBeVisible();
  await page.getByRole("button", { name: /^Упражнение по трудным словам/ }).click();
  expect(await clipboard()).toBe(difficultText);
  await expect(page.getByText("Запрос скопирован", { exact: true })).toBeVisible();
});

test("«План дня»: the summary opens the plan popover; «Изменить план» opens the settings sub-page", async ({ page }) => {
  // The app's defaults with 10 new words a day (lib/core/study-plan.ts DEFAULT_STUDY_PLAN).
  await seedStudyPlan(page, { new_words: 10, review_cap: 200, new_order: "level", mix: "mixed", ru_fr: "after" });
  await openReview(page);
  const summary = page.getByRole("button", { name: "План на сегодня: 10 новых" });
  await expect(summary).toHaveAttribute("aria-haspopup", "dialog");
  await summary.click();
  const popover = page.getByRole("dialog", { name: "План на сегодня" });
  await expect(popover).toBeVisible();
  await expect(summary).toHaveAttribute("aria-expanded", "true");
  // Under the summary, 360 wide.
  const [s, p] = [(await summary.boundingBox())!, (await popover.boundingBox())!];
  expect(p.y).toBeGreaterThan(s.y + s.height - 1);
  expect(Math.round(p.width)).toBe(360);
  await expect(popover.getByText("10 из 10")).toBeVisible();
  await expect(popover.getByText("Отложено")).toBeVisible();
  await expect(popover.getByText("10 слов · до 200")).toBeVisible();
  await expect(page.getByText("закрыть план")).toBeVisible();

  // The review keys are off while it is open; Esc closes it and focus returns to the summary.
  await page.keyboard.press("Space");
  await expect(page.locator("[data-review-answer]")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
  await expect(summary).toBeFocused();
  await expect(page.getByText("закрыть план")).toHaveCount(0);

  // A click outside closes it too.
  await summary.click();
  await expect(popover).toBeVisible();
  await page.mouse.click(1300, 700);
  await expect(popover).toBeHidden();

  await summary.click();
  await popover.getByRole("link", { name: /Изменить план/ }).click();
  await expect(page).toHaveURL(/\/settings\/plan$/);
  const nav = page.getByRole("navigation", { name: "Разделы настроек" });
  await expect(nav.getByRole("link", { name: "План повторения" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { level: 2, name: "План повторения" })).toBeVisible();
  await expect(page.getByText("10 слов в день · до 200 повторений", { exact: true })).toBeVisible();

  const fresh = page.getByRole("spinbutton", { name: "Новых слов в день" });
  await expect(fresh).toHaveAttribute("aria-valuenow", "10");
  await fresh.press("ArrowUp");
  await expect(fresh).toHaveAttribute("aria-valuenow", "11");
  await page.locator("label", { hasText: "По темам" }).click();
  await expect(page.getByRole("radio", { name: /^По темам/ })).toBeChecked();
  await page.getByRole("radiogroup", { name: "Новые в сессии" }).getByRole("radio", { name: "После повторения" }).click();
  await expect.poll(async () => (await dbRows<{ id: string; value: Record<string, unknown> }>(page, "user_prefs")).find((r) => r.id === "study_plan")?.value).toEqual({
    new_words: 11,
    review_cap: 200,
    new_order: "themes",
    mix: "after",
    ru_fr: "after",
  });
  await expect(page.getByText("Настройка общая для всех устройств — Claude тоже её видит.")).toBeVisible();

  // Back to «Повторение»: the row carries the new summary.
  await page.getByRole("link", { name: "Повторение", exact: true }).last().click();
  await expect(page).toHaveURL(/\/settings#set-review$/);
  await expect(page.locator("#set-review").getByRole("link", { name: /^План повторения/ })).toContainText("11 слов в день · до 200 повторений");
});
