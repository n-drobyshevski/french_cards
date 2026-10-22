import { expect, test, type Page } from "@playwright/test";
import { addSheet, gateSuggest, holdDatabase, LA_THUNE, mockEnrich, mockSuggest, openReview, SE_CASSER_LA_TETE } from "./fixtures";

// Desktop «Новое слово» dialog (mockups/D-Add-*.dc.html, DESKTOP-SPEC §4 «Add dialog»). Runs in the
// desktop-chromium project (1440×800); /api/ai/* is mocked.

const headword = (page: Page) => addSheet(page).getByRole("combobox", { name: "Слово или выражение — FR или RU" });
const option = (page: Page, name: string) => page.getByRole("option", { name, exact: true });

/** Types a headword and waits for the mocked «Варианты» (Enter while they load only hurries them). */
async function search(page: Page, text: string) {
  await headword(page).fill(text);
  await expect(option(page, "Выбрать: la thune — бабки, деньги")).toBeVisible();
}

/** N opens the dialog; global keys may stay off until settings have loaded, so retry until it opens. */
async function pressN(page: Page) {
  await expect(async () => {
    if (!(await addSheet(page).isVisible())) await page.keyboard.press("n");
    await expect(addSheet(page)).toBeVisible({ timeout: 1000 });
  }).toPass();
}

async function openDialog(page: Page) {
  await mockSuggest(page, [LA_THUNE, SE_CASSER_LA_TETE]);
  await mockEnrich(page, () => null);
  await openReview(page);
  await pressN(page);
  await expect(headword(page)).toBeFocused();
}

test("N opens the dialog centred with the recent words", async ({ page }) => {
  await openDialog(page);
  const dialog = addSheet(page);
  const box = (await dialog.boundingBox())!;
  expect(box.width).toBe(640);
  expect(Math.abs(box.x + box.width / 2 - 720)).toBeLessThan(2);
  expect(box.y).toBe(40);
  await expect(dialog.getByText("Карточка № 012")).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Скриншот" })).toHaveAttribute("href", "/import");
  await expect(dialog.getByRole("listbox", { name: "Недавние" }).getByRole("option")).toHaveCount(3);
  await expect(dialog.getByText("по списку")).toBeVisible();
});

test("typing shows «Словарь» and «Варианты»; arrows move through both, Enter picks", async ({ page }) => {
  await openDialog(page);
  const input = headword(page);
  await input.fill("se cass");

  const dictionary = addSheet(page).getByRole("listbox", { name: "Словарь" });
  await expect(dictionary.getByRole("option", { name: "Подставить: se casser" })).toBeVisible();
  const first = option(page, "Выбрать: la thune — бабки, деньги");
  const second = option(page, "Выбрать: se casser la tête — ломать голову");
  await expect(first).toHaveAttribute("aria-selected", "true");
  await expect(input).toHaveAttribute("aria-activedescendant", (await first.getAttribute("id"))!);

  // ↑ from the first «Вариант» reaches the last «Словарь» row; ↓ comes back and goes on.
  await page.keyboard.press("ArrowUp");
  await expect(dictionary.getByRole("option").last()).toHaveAttribute("aria-selected", "true");
  await expect(first).toHaveAttribute("aria-selected", "false");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(second).toHaveAttribute("aria-selected", "true");
  await expect(input).toBeFocused();

  await page.keyboard.press("Enter");
  const fr = addSheet(page).getByRole("textbox", { name: "Французский" });
  await expect(fr).toHaveValue("se casser la tête");
  await expect(fr).toBeFocused();
  await expect(addSheet(page).getByRole("radio", { name: "Повседневное" })).toBeChecked();
  await expect(addSheet(page).getByText("подобрано автоматически")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(addSheet(page).getByRole("textbox", { name: "Русский", exact: true })).toBeFocused();
});

test("Esc from the form goes back to the search and keeps the draft; Ctrl/⌘+Enter adds it", async ({ page }) => {
  await openDialog(page);
  await headword(page).fill("se cass");
  await option(page, "Выбрать: se casser la tête — ломать голову").click();
  const ru = addSheet(page).getByRole("textbox", { name: "Русский", exact: true });
  await ru.fill("ломать себе голову");

  await page.keyboard.press("Escape");
  await expect(headword(page)).toBeFocused();
  await expect(headword(page)).toHaveValue("se cass");
  // The draft's option is the default now; Enter reopens the draft as it was left.
  await expect(option(page, "Выбрать: se casser la tête — ломать голову")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(ru).toHaveValue("ломать себе голову");

  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(addSheet(page)).toBeHidden();
  await expect(page.getByText("Добавлено · se casser la tête")).toBeVisible();

  // Saved as edited: it heads «Недавние» next time.
  await pressN(page);
  await expect(option(page, "Открыть: se casser la tête — ломать себе голову")).toBeVisible();
});

test("a changed headword drops the kept draft", async ({ page }) => {
  await openDialog(page);
  await search(page, "se cass");
  await page.keyboard.press("Enter");
  const ru = addSheet(page).getByRole("textbox", { name: "Русский", exact: true });
  await expect(ru).toHaveValue("бабки, деньги");
  await ru.fill("бабосы");
  await page.keyboard.press("Escape");
  await headword(page).press("Backspace");
  await expect(option(page, "Выбрать: la thune — бабки, деньги")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(ru).toHaveValue("бабки, деньги");
});

test("Esc: one layer per press; typed text keeps the dialog open on a scrim click", async ({ page }) => {
  await openDialog(page);
  await search(page, "se cass");
  await page.keyboard.press("Enter");
  await expect(addSheet(page).getByRole("textbox", { name: "Французский" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(headword(page)).toBeVisible();
  await page.mouse.click(1300, 400);
  await expect(addSheet(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(addSheet(page)).toBeHidden();

  // Empty: the scrim closes it.
  await pressN(page);
  await page.mouse.click(1300, 400);
  await expect(addSheet(page)).toBeHidden();
});

test("Shift+Ctrl/⌘+Enter adds and starts over, with «Отменить» in the footer", async ({ page }) => {
  await openDialog(page);
  await search(page, "la thu");
  await page.keyboard.press("Enter");
  await expect(addSheet(page).getByRole("textbox", { name: "Французский" })).toHaveValue("la thune");
  await page.keyboard.press("Shift+ControlOrMeta+Enter");

  await expect(headword(page)).toHaveValue("");
  await expect(headword(page)).toBeFocused();
  await expect(addSheet(page).getByText("Добавлено · la thune")).toBeVisible();
  await expect(addSheet(page).getByText("Карточка № 013")).toBeVisible();
  await addSheet(page).getByRole("button", { name: "Отменить" }).click();
  await expect(addSheet(page).getByText("Карточка № 012")).toBeVisible();
});

test("«Список»: the parse table, then Ctrl/⌘+Enter adds the checked rows", async ({ page }) => {
  await openDialog(page);
  await addSheet(page).getByRole("button", { name: "Список" }).click();
  const dialog = page.getByRole("dialog", { name: "Несколько слов" });
  const text = dialog.getByRole("textbox", { name: /по одному на строку/ });
  await expect(text).toBeFocused();
  await text.fill("bosser — работать\nles flics — копы\nxyz");

  await expect(dialog.getByText("Список · 3 строки")).toBeVisible();
  await expect(dialog.getByRole("checkbox", { name: /^bosser/ })).toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: /^les flics/ })).not.toBeChecked();
  await expect(dialog.getByText("Уже есть", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("checkbox", { name: /^xyz/ })).toBeDisabled();
  await expect(dialog.getByText("1 из 3")).toBeVisible();

  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Добавлено 1 слово")).toBeVisible();
});

test("a failed «Варианты» request stays in its section; «Словарь» stays put and the quick form opens below", async ({ page }) => {
  let fail = true;
  const suggest = await gateSuggest(page, () => (fail ? 500 : [LA_THUNE]));
  await mockEnrich(page, () => null);
  await openReview(page);
  await pressN(page);
  await headword(page).fill("se cass");
  const dialog = addSheet(page);
  const dictionary = dialog.getByRole("listbox", { name: "Словарь" });
  await expect(dictionary.getByRole("option").first()).toBeVisible();
  const variants = dialog.locator("[data-variants]");
  await expect(variants.locator('[data-variant-slot="skeleton"]').first()).toBeVisible();
  const before = (await dictionary.boundingBox())!.y;

  suggest.release();
  const error = variants.locator("[data-variant-error]");
  await expect(error).toContainText("Не удалось подобрать варианты");
  expect((await error.boundingBox())!.height).toBe(72);
  expect((await dictionary.boundingBox())!.y).toBe(before);
  const ru = dialog.getByRole("textbox", { name: "Русский" });
  await expect(ru).toBeVisible();
  expect((await ru.boundingBox())!.y).toBeGreaterThan((await error.boundingBox())!.y + 71);

  fail = false;
  await error.getByRole("button", { name: "Повторить" }).click();
  await expect(option(page, "Выбрать: la thune — бабки, деньги")).toBeVisible();
  expect((await dictionary.boundingBox())!.y).toBe(before);
});

test("while Ctrl/⌘+Enter saves, «Добавить и ещё» keeps its look and only «Добавить» says «Добавляем…»", async ({ page }) => {
  await openDialog(page);
  await search(page, "la thu");
  await page.keyboard.press("Enter");
  const dialog = addSheet(page);
  await expect(dialog.getByRole("textbox", { name: "Французский" })).toHaveValue("la thune");
  const more = dialog.getByRole("button", { name: "Добавить и ещё", exact: true });
  const look = () => more.evaluate((el) => [getComputedStyle(el).opacity, getComputedStyle(el).color, getComputedStyle(el).borderColor]);
  const idle = await look();

  const release = await holdDatabase(page);
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(dialog.getByRole("button", { name: "Добавляем…", exact: true })).toHaveAttribute("aria-busy", "true");
  await expect(more).toHaveAttribute("aria-disabled", "true");
  expect(await look()).toEqual(idle);
  await release();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Добавлено · la thune")).toBeVisible();
});
