import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  addSheet,
  enriched,
  gateSuggest,
  holdDatabase,
  LA_THUNE,
  mockEnrich,
  mockSuggest,
  openReview,
  questionCard,
  SE_CASSER_LA_TETE,
  tabBar,
  type SuggestionWire,
} from "./fixtures";

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
  await expect(page.getByRole("button", { name: "Все слова: 12", exact: true })).toBeVisible();
  await page.getByRole("link", { name: /^Деньги:/ }).click();
  await expect(page.getByRole("heading", { name: "Деньги" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^la thune — / })).toBeVisible();
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
  await expect(page.getByText("01 / 12", { exact: true })).toBeVisible();
});

test("the filled form: Return moves from French to Russian, then saves; fields are 16px on touch", async ({ page }) => {
  await mockSuggest(page, [LA_THUNE]);
  await openReview(page);
  await tabBar(page).getByRole("button", { name: "Добавить" }).click();
  const sheet = addSheet(page);
  await sheet.getByPlaceholder("Слово или выражение — FR или RU").fill("la thu");
  await sheet.getByRole("button", { name: "Выбрать: la thune — бабки, деньги" }).click();
  // The picked row holds its ink fill for --dur-flash before the form replaces it (A5).
  await expect(sheet.getByRole("textbox", { name: "Французский" })).toBeVisible();

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

test("a word typed by hand gets its slang level, an example and a theme before saving", async ({ page }) => {
  const sent: string[] = [];
  const themes: string[][] = [];
  await mockSuggest(page, []);
  await mockEnrich(
    page,
    (w) =>
      enriched(w, {
        example_fr: "Il a garé sa caisse devant chez moi.",
        example_ru: "Он припарковал тачку у моего дома.",
        folder: "NEW",
        new_folder: { slug: "transport", name: "Транспорт", description: "Машины, метро и поездки." },
      }),
    (words, folders) => {
      sent.push(...words.map((w) => `${w.fr}|${w.ru}`));
      themes.push((folders ?? []).map((f) => f.slug));
    },
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
  await expect(sheet.getByRole("radio", { name: "новая тема: Транспорт" })).toBeChecked();
  await expect(sheet.getByText("подобрано автоматически")).toBeVisible();
  expect(sent).toEqual(["la caisse|тачка"]);
  expect(themes[0]).toContain("dengi");

  // A level picked by hand is what gets saved.
  await sheet.getByRole("radio", { name: "арго" }).click();
  await sheet.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(sheet).toBeHidden();

  await tabBar(page).getByRole("link", { name: "Библиотека" }).click();
  await page.getByRole("searchbox", { name: "Поиск по FR и RU" }).or(page.getByRole("textbox", { name: "Поиск по FR и RU" })).fill("caisse");
  await page.getByText("la caisse", { exact: true }).click();
  const card = page.getByRole("dialog", { name: "Карточка слова" });
  await expect(card.getByText("Il a garé sa caisse devant chez moi.")).toBeVisible();
  await expect(card.getByRole("group", { name: /арго/ }).first()).toBeVisible();
  await expect(card.getByText("Транспорт")).toBeVisible();
});

test("a theme chosen by hand is kept when detection comes back", async ({ page }) => {
  await mockSuggest(page, []);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/ai/enrich", async (route) => {
    await gate;
    const { words } = route.request().postDataJSON() as { words: { id: string; fr: string; ru: string }[] };
    await route.fulfill({ json: { results: words.map((w) => ({ id: w.id, ...enriched(w, { folder: "dengi" }) })) } });
  });
  await openReview(page);
  await tabBar(page).getByRole("button", { name: "Добавить" }).click();
  const sheet = addSheet(page);
  await sheet.getByPlaceholder("Слово или выражение — FR или RU").fill("la caisse");
  await sheet.getByRole("button", { name: "Заполнить вручную" }).click();
  await sheet.getByRole("textbox", { name: "Русский", exact: true }).fill("тачка");
  await sheet.getByRole("radio", { name: "Эмоции" }).click();
  release();
  await expect(sheet.getByText("определён автоматически")).toBeVisible();
  await expect(sheet.getByRole("radio", { name: "Эмоции" })).toBeChecked();
  await expect(sheet.getByRole("radio", { name: "Деньги" })).not.toBeChecked();
});

test("pasted rows show their slang level, example and theme and are saved with them", async ({ page }) => {
  await mockSuggest(page, []);
  await mockEnrich(page, (w) =>
    w.fr === "chelou"
      ? enriched(w, { pos: "adj", gender: "none", slang_level: 2, verlan: true, folder: "emotsii" })
      : enriched(w, { folder: "INBOX" }),
  );
  await openReview(page);
  await tabBar(page).getByRole("button", { name: "Добавить" }).click();
  await addSheet(page).getByRole("button", { name: "Список" }).click();
  const sheet = page.getByRole("dialog", { name: /Несколько слов/ });
  await sheet.getByRole("textbox", { name: "Список слов" }).fill("la caisse — тачка\nchelou — стрёмный");
  await expect(sheet.getByText("Exemple avec chelou.")).toBeVisible();
  await expect(sheet.getByText("Exemple avec la caisse.")).toBeVisible();
  await expect(sheet.getByRole("combobox")).toHaveValue("auto");
  const rows = sheet.getByRole("checkbox");
  await expect(rows.filter({ hasText: "chelou" }).getByText("Эмоции")).toBeVisible();
  await expect(rows.filter({ hasText: "la caisse" }).getByText("Входящие")).toBeVisible();
  await sheet.getByRole("button", { name: "Добавить 2 слова" }).click();
  await expect(sheet).toBeHidden();

  await tabBar(page).getByRole("link", { name: "Библиотека" }).click();
  await page.getByRole("searchbox", { name: "Поиск по FR и RU" }).or(page.getByRole("textbox", { name: "Поиск по FR и RU" })).fill("chelou");
  await page.getByText("chelou", { exact: true }).click();
  const card = page.getByRole("dialog", { name: "Карточка слова" });
  await expect(card.getByText("Exemple avec chelou.")).toBeVisible();
  await expect(card.getByText("Эмоции")).toBeVisible();
});

// ---------------------------------------------------------------------------------------
// Loading and motion (mockups/MOTION-SPEC.md A2, A3, A7, A8)

const LE_FRIC: SuggestionWire = { ...LA_THUNE, fr: "le fric", ru: "бабло", slang_level: 1 };
const top = async (l: Locator) => (await l.boundingBox())!.y;
const heights = (l: Locator) => l.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));

/** Waits for running one-off animations (row rise, slot collapse); loops like the ink run are skipped. */
const settle = (page: Page) =>
  page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    ).then(() => {}),
  );

async function openSheet(page: Page) {
  await openReview(page);
  await tabBar(page).getByRole("button", { name: "Добавить" }).click();
  const sheet = addSheet(page);
  return { sheet, input: sheet.getByPlaceholder("Слово или выражение — FR или RU") };
}

test("«Варианты» hold their 72px slots from the first letter; the wait and the rows fill them in place", async ({ page }, testInfo) => {
  const suggest = await gateSuggest(page, () => [LA_THUNE, SE_CASSER_LA_TETE, LE_FRIC]);
  const { sheet, input } = await openSheet(page);
  await input.fill("la thu");
  const variants = sheet.locator("[data-variants]");
  const manual = sheet.getByRole("button", { name: "Заполнить вручную" });
  // Measured from the «Варианты» header: «Словарь» above fills in on its own when the lexique loads (A4).
  const heading = sheet.getByRole("heading", { name: "Варианты" });
  const below = async () => {
    await settle(page);
    return (await top(manual)) - (await top(heading));
  };

  // Reserved at once (3 = the «Вариантов» setting), blank during the debounce.
  await expect(variants.locator("[data-variant-slot]")).toHaveCount(3);
  const reserved = await below();

  // 150 ms after the debounce: one status line and skeleton rows, in the same slots.
  await expect(variants.getByText("Подбираем варианты", { exact: true }).first()).toBeVisible();
  const skeletons = variants.locator('[data-variant-slot="skeleton"]');
  await expect(skeletons).toHaveCount(3);
  expect(await heights(skeletons)).toEqual([72, 72, 72]);
  expect(await below()).toBeCloseTo(reserved, 0);
  await page.screenshot({ path: testInfo.outputPath("variants-waiting.png") });

  suggest.release();
  const rows = sheet.getByRole("button", { name: /^Выбрать:/ });
  await expect(rows).toHaveCount(3);
  expect(await heights(rows)).toEqual([72, 72, 72]);
  await expect(variants.getByText("3 варианта", { exact: true })).toBeVisible();
  // Nothing below moved, and no skeleton is left behind.
  expect(await below()).toBeCloseTo(reserved, 0);
  await expect(variants.locator('[data-variant-slot="skeleton"]')).toHaveCount(0);
  // The count fades out after 1.2 s.
  await expect
    .poll(() =>
      variants.getByText("3 варианта", { exact: true }).evaluate((el) => {
        let opacity = 1;
        for (let n: Element | null = el; n; n = n.parentElement) opacity *= Number(getComputedStyle(n).opacity);
        return opacity;
      }),
    )
    .toBeLessThan(0.01);
});

test("a narrower query keeps the row that still fits; the rest wait in the slots under it", async ({ page }, testInfo) => {
  const suggest = await gateSuggest(page, () => [LA_THUNE, SE_CASSER_LA_TETE]);
  const { sheet, input } = await openSheet(page);
  const variants = sheet.locator("[data-variants]");
  await input.fill("la th");
  suggest.release();
  const thune = sheet.getByRole("button", { name: "Выбрать: la thune — бабки, деньги" });
  await expect(sheet.getByRole("button", { name: /^Выбрать:/ })).toHaveCount(2);
  // Measured from the «Варианты» header («Словарь» above may list fewer words for the longer query).
  const heading = sheet.getByRole("heading", { name: "Варианты" });
  const offset = async () => {
    await settle(page);
    return (await top(thune)) - (await top(heading));
  };
  const y = await offset();

  suggest.hold();
  await input.fill("la thu");
  await expect(variants.getByText("Подбираем варианты", { exact: true }).first()).toBeVisible();
  await expect(sheet.getByRole("button", { name: /^Выбрать:/ })).toHaveCount(1);
  await expect(variants.locator('[data-variant-slot="skeleton"]')).toHaveCount(2);
  expect(await offset()).toBeCloseTo(y, 0);
  await page.screenshot({ path: testInfo.outputPath("variants-streaming.png") });

  suggest.release();
  await expect(sheet.getByRole("button", { name: /^Выбрать:/ })).toHaveCount(2);
  expect(await offset()).toBeCloseTo(y, 0);
});

test("a failed «Варианты» request stays inside its section: «Словарь» does not move, the quick form opens below", async ({ page }, testInfo) => {
  let fail = true;
  const suggest = await gateSuggest(page, () => (fail ? 500 : [SE_CASSER_LA_TETE]));
  const { sheet, input } = await openSheet(page);
  await input.fill("se cass");
  const variants = sheet.locator("[data-variants]");
  const dictionary = sheet.getByRole("heading", { name: "Словарь" });
  const heading = sheet.getByRole("heading", { name: "Варианты" });
  await expect(variants.getByText("Подбираем варианты", { exact: true }).first()).toBeVisible();
  const before = [await top(dictionary), await top(heading)];

  suggest.release();
  const error = variants.locator("[data-variant-error]");
  await expect(error).toContainText("Не удалось подобрать варианты");
  await expect(variants.getByText("Не удалось", { exact: true })).toBeVisible();
  expect((await error.boundingBox())!.height).toBe(72);
  expect([await top(dictionary), await top(heading)]).toEqual(before);
  // The quick form opens under the error, not above «Словарь».
  const ru = sheet.getByRole("textbox", { name: "Русский" });
  await expect(ru).toBeVisible();
  expect(await top(ru)).toBeGreaterThan((await top(error)) + 71);
  await expect(variants.locator('[data-variant-slot="skeleton"]')).toHaveCount(0);
  // Settled: the spare slots have closed (--dur-exit + --dur-move) and the form has risen in.
  await page.waitForTimeout(400);
  await page.screenshot({ path: testInfo.outputPath("variants-error.png") });

  fail = false;
  await error.getByRole("button", { name: "Повторить" }).click();
  await expect(sheet.getByRole("button", { name: "Выбрать: se casser la tête — ломать голову" })).toBeVisible();
  expect([await top(dictionary), await top(heading)]).toEqual(before);
});

test("while «Добавить» saves, only it says «Добавляем…»; «Добавить и ещё» keeps its look", async ({ page }) => {
  await mockSuggest(page, [LA_THUNE]);
  const { sheet, input } = await openSheet(page);
  await input.fill("la thu");
  await sheet.getByRole("button", { name: "Выбрать: la thune — бабки, деньги" }).click();
  const more = sheet.getByRole("button", { name: "Добавить и ещё" });
  const look = () => more.evaluate((el) => [getComputedStyle(el).opacity, getComputedStyle(el).color, getComputedStyle(el).borderColor]);
  const idle = await look();

  const release = await holdDatabase(page);
  await sheet.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(sheet.getByRole("button", { name: "Добавляем…" })).toHaveAttribute("aria-busy", "true");
  await expect(more).toHaveAttribute("aria-disabled", "true");
  await expect(more).not.toHaveAttribute("aria-busy", "true");
  expect(await look()).toEqual(idle);
  await release();
  await expect(sheet).toBeHidden();
});

test("after «Добавить» the sheet leaves as it was, and the snackbar comes once it has gone", async ({ page }) => {
  await mockSuggest(page, [LA_THUNE]);
  const { sheet, input } = await openSheet(page);
  await input.fill("la thu");
  await sheet.getByRole("button", { name: "Выбрать: la thune — бабки, деньги" }).click();
  await expect(sheet.getByText("Карточка № 012")).toBeVisible();

  await page.evaluate(() => {
    const seen = { duplicate: false, nextCard: false, clickAt: 0, snackbarAt: 0 };
    (window as unknown as { __seen: typeof seen }).__seen = seen;
    document.addEventListener("click", () => (seen.clickAt ||= performance.now()), true);
    new MutationObserver(() => {
      const text = document.querySelector('[role="dialog"]')?.textContent ?? "";
      if (text.includes("Уже есть")) seen.duplicate = true;
      if (text.includes("Карточка № 013")) seen.nextCard = true;
      const bar = document.querySelector("[data-snackbar]");
      if (!seen.snackbarAt && bar) seen.snackbarAt = performance.now();
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  await sheet.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText("Добавлено · la thune")).toBeVisible();

  const seen = await page.evaluate(() => (window as unknown as { __seen: Record<string, number | boolean> }).__seen);
  expect(seen.duplicate).toBe(false);
  expect(seen.nextCard).toBe(false);
  expect((seen.snackbarAt as number) - (seen.clickAt as number)).toBeGreaterThanOrEqual(200);
});

test("«Добавить и ещё» clears the form, refocuses the headword and puts the word on top of «Недавние»", async ({ page }) => {
  await mockSuggest(page, [LA_THUNE]);
  const { sheet, input } = await openSheet(page);
  await input.fill("la thu");
  await sheet.getByRole("button", { name: "Выбрать: la thune — бабки, деньги" }).click();
  await sheet.getByRole("button", { name: "Добавить и ещё" }).click();

  await expect(input).toHaveValue("");
  await expect(input).toBeFocused();
  await expect(sheet.getByText("Добавлено · la thune")).toBeVisible();
  await expect(sheet.getByRole("button", { name: /^Открыть: / }).first()).toHaveAccessibleName("Открыть: la thune — бабки, деньги");
});
