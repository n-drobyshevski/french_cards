import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import { addSheet, enriched, gateSuggest, LA_THUNE, mockSuggest, openReview, tabBar, type EnrichWordWire } from "./fixtures";

// Quick add: waiting and landing (mockups/MOTION-SPEC.md A4, A5, A6, A10, B4; boards M-Add-Suggest,
// M-Add-Detect). /api/ai/* and the lexique are held or mocked per test.

async function openSheet(page: Page) {
  await openReview(page);
  await tabBar(page).getByRole("button", { name: "Добавить" }).click();
  const sheet = addSheet(page);
  return { sheet, input: sheet.getByPlaceholder("Слово или выражение — FR или RU") };
}

const top = async (l: Locator) => (await l.boundingBox())!.y;
const heights = (l: Locator) => l.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
/**
 * Records every paper fade that starts from now on, by the lit element's `data-spot` (or «row»
 * for anything else), so a check after a slow step does not miss a 1.2 s fade that has ended.
 */
async function watchSpotlights(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __spots: string[] }).__spots = seen;
    document.addEventListener(
      "animationstart",
      (e) => {
        if (e.animationName !== "spotlight") return;
        const el = e.target as HTMLElement;
        seen.push(...(el.dataset.spot?.split(" ") ?? [el.getAttribute("role") ?? el.tagName.toLowerCase()]));
      },
      true,
    );
  });
  return () => page.evaluate(() => [...(window as unknown as { __spots: string[] }).__spots]);
}

/** Holds POST /api/ai/enrich until `release()`; `fail` answers 500. */
async function gateEnrich(page: Page, make: (w: EnrichWordWire) => ReturnType<typeof enriched>, opts: { fail?: boolean } = {}) {
  let open!: () => void;
  const gate = new Promise<void>((resolve) => (open = resolve));
  await page.route("**/api/ai/enrich", async (route: Route) => {
    await gate;
    if (opts.fail) {
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "upstream_error" }) });
      return;
    }
    const { words } = route.request().postDataJSON() as { words: EnrichWordWire[] };
    await route.fulfill({ json: { results: words.map((w) => ({ id: w.id, ...make(w) })) } });
  });
  return { release: () => open() };
}

test("«Словарь» holds its 3 rows while the lexique loads; the words fill them in place", async ({ page }, testInfo) => {
  let open!: () => void;
  const gate = new Promise<void>((resolve) => (open = resolve));
  await page.route("**/lexique/fr-lemmas.json", async (route) => {
    await gate;
    await route.continue();
  });
  await mockSuggest(page, [LA_THUNE]);
  const { sheet, input } = await openSheet(page);
  await input.fill("se cass");

  const dictionary = sheet.locator("[data-dictionary]");
  const heading = sheet.getByRole("heading", { name: "Словарь" });
  const variants = sheet.getByRole("heading", { name: "Варианты" });
  await expect(heading).toBeVisible();
  const slots = dictionary.locator("[data-dictionary-slot]");
  await expect(slots).toHaveCount(3);
  expect(await heights(slots)).toEqual([44, 44, 44]);
  await expect(dictionary).toHaveAttribute("aria-busy", "true");
  // The bars only paint after --loading-delay (300 ms).
  await expect.poll(() => slots.first().locator("[aria-hidden]").first().evaluate((el) => Number(getComputedStyle(el).opacity))).toBeGreaterThan(0.9);
  const before = await top(variants);
  await page.screenshot({ path: testInfo.outputPath("dictionary-loading.png") });

  open();
  await expect(sheet.getByRole("button", { name: "Подставить: se casser" })).toBeVisible();
  await expect(dictionary).not.toHaveAttribute("aria-busy", "true");
  // Rows took the slots: nothing below moved (fewer words would close the spare slots instead).
  const rows = sheet.getByRole("button", { name: /^Подставить:/ });
  if ((await rows.count()) === 3) expect(await top(variants)).toBeCloseTo(before, 0);
  await expect(dictionary.locator('[data-dictionary-slot="loading"]')).toHaveCount(0);
});

test("a picked «Вариант» ink-fills, then the fields it filled are lit together", async ({ page }) => {
  await mockSuggest(page, [LA_THUNE]);
  const { sheet, input } = await openSheet(page);
  await input.fill("la thu");
  const row = sheet.getByRole("button", { name: "Выбрать: la thune — бабки, деньги" });
  const spots = await watchSpotlights(page);
  // The row is only there for --dur-flash after the tap: note its ink fill as it happens.
  await row.evaluate((el) => {
    const w = window as unknown as { __picked: string | null };
    w.__picked = null;
    new MutationObserver(() => {
      if (el.hasAttribute("data-picked")) w.__picked ??= el.className;
    }).observe(el, { attributes: true, attributeFilter: ["data-picked"] });
  });
  await row.click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __picked: string | null }).__picked)).toContain("bg-ink");

  const ru = sheet.getByRole("textbox", { name: "Русский", exact: true });
  await expect(ru).toHaveValue("бабки, деньги");
  await expect.poll(spots).toEqual(expect.arrayContaining(["fr", "ru", "note", "example", "slang", "theme"]));
});

test("a typed word: after 300 ms the level, example and theme show their unknown state, then land lit", async ({ page }, testInfo) => {
  await mockSuggest(page, []);
  const enrich = await gateEnrich(page, (w) => enriched(w, { slang_level: 2, folder: "dengi" }));
  const { sheet, input } = await openSheet(page);
  await input.fill("la caisse");
  await sheet.getByRole("button", { name: "Заполнить вручную" }).click();
  await sheet.getByRole("textbox", { name: "Русский", exact: true }).fill("тачка");

  await expect(sheet.getByText("определяется…")).toBeVisible();
  await expect(sheet.getByRole("img", { name: "Уровень сленга определяется" })).toBeVisible();
  const levels = sheet.getByRole("radiogroup", { name: "Уровень сленга" });
  await expect(levels.getByRole("radio", { checked: true })).toHaveCount(0);
  await expect(sheet.locator("[data-example-pending]")).toBeVisible();
  await expect(sheet.getByText("подбираем тему…")).toBeVisible();
  // «Добавить» is never blocked by detection.
  await expect(sheet.getByRole("button", { name: "Добавить", exact: true })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath("detect-waiting.png") });

  const spots = await watchSpotlights(page);
  enrich.release();
  await expect(sheet.getByText("определён автоматически")).toBeVisible();
  await expect(levels.getByRole("radio", { name: "арго" })).toBeChecked();
  await expect(sheet.getByText("определяется…")).toHaveCount(0);
  await expect(sheet.locator("[data-example-pending]")).toHaveCount(0);
  await expect.poll(spots).toEqual(expect.arrayContaining(["slang", "example", "theme"]));
  // Typed by the user: never lit by detection.
  expect(await spots()).not.toContain("ru");
});

test("a failed detection says «не определилось», quietly", async ({ page }) => {
  await mockSuggest(page, []);
  const enrich = await gateEnrich(page, (w) => enriched(w), { fail: true });
  const { sheet, input } = await openSheet(page);
  await input.fill("la caisse");
  await sheet.getByRole("button", { name: "Заполнить вручную" }).click();
  await sheet.getByRole("textbox", { name: "Русский", exact: true }).fill("тачка");
  await expect(sheet.getByText("определяется…")).toBeVisible();
  enrich.release();
  await expect(sheet.getByText("не определилось")).toBeVisible();
  await expect(sheet.getByRole("alert")).toHaveCount(0);
  await expect(sheet.locator("[data-example-pending]")).toHaveCount(0);
});

test("«Список»: rows are 56px from the start; one status line counts them in", async ({ page }, testInfo) => {
  await mockSuggest(page, []);
  const enrich = await gateEnrich(page, (w) => enriched(w, { folder: "INBOX" }));
  await openSheet(page);
  await addSheet(page).getByRole("button", { name: /^Списком/ }).click();
  const sheet = page.getByRole("dialog", { name: /Несколько слов/ });
  await sheet.getByRole("textbox", { name: "Список слов" }).fill("la caisse — тачка\nchelou — стрёмный");

  const rows = sheet.getByRole("checkbox");
  await expect(rows).toHaveCount(2);
  expect(await heights(rows)).toEqual([56, 56]);
  const status = sheet.locator("[data-list-status]");
  await expect(status.getByText("Определяем").first()).toBeVisible();
  await expect(status.getByText("0 / 2", { exact: true })).toBeVisible();
  await expect(rows.first()).toHaveAttribute("aria-busy", "true");
  await page.screenshot({ path: testInfo.outputPath("list-waiting.png") });

  const spots = await watchSpotlights(page);
  enrich.release();
  await expect(status.getByText("Готово · 2 слова").first()).toBeVisible();
  expect(await heights(rows)).toEqual([56, 56]);
  // Each row's level, theme and example landed with the paper fade.
  await expect.poll(async () => (await spots()).filter((s) => s === "checkbox").length).toBe(2);
});

test("offline: «Варианты» say so before any wait, quietly, and fill in when the network is back", async ({ page, context }) => {
  const suggest = await gateSuggest(page, () => [LA_THUNE]);
  suggest.release();
  const { sheet, input } = await openSheet(page);
  await context.setOffline(true);
  await input.fill("la thu");

  const notice = sheet.locator('[data-variant-error="offline"]');
  await expect(notice).toContainText("Нет сети — варианты появятся, когда она вернётся");
  await expect(sheet.locator('[data-variant-slot="skeleton"]')).toHaveCount(0);
  await expect(sheet.getByText("Подбираем варианты")).toHaveCount(0);
  // Not an error look: no red rule, muted text, no «Повторить».
  expect(await notice.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe("0px");
  await expect(notice.getByRole("button", { name: "Повторить" })).toHaveCount(0);

  await context.setOffline(false);
  await expect(sheet.getByRole("button", { name: "Выбрать: la thune — бабки, деньги" })).toBeVisible();
  await expect(notice).toHaveCount(0);
});

test("reduced motion keeps the paper fade (colour only)", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockSuggest(page, [LA_THUNE]);
  const { sheet, input } = await openSheet(page);
  await input.fill("la thu");
  const spots = await watchSpotlights(page);
  await sheet.getByRole("button", { name: "Выбрать: la thune — бабки, деньги" }).click();
  await expect(sheet.getByRole("textbox", { name: "Русский", exact: true })).toHaveValue("бабки, деньги");
  await expect.poll(spots).toContain("ru");
});
