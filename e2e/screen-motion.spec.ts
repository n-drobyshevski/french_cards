import { expect, test, type Page, type Route } from "@playwright/test";
import { addSheet, mockExtract, mockSuggest, openReview, questionCard, screenshotPng, tabBar, vocab } from "./fixtures";

// Screen-level polish (mockups/MOTION-SPEC.md R12, A9, S4, L5, L9): the last-grade echo on the
// progress line, the duplicate notice opening as a Collapse, the sort plan's count swap and dim,
// stale search results and the spotlight on a saved field.

test.use({ hasTouch: true, isMobile: true });

const INK = "rgb(17, 17, 17)";

test("the progress step of a grade takes its tone, then fades to ink (R12)", async ({ page }) => {
  await openReview(page);
  const grades = page.getByRole("group", { name: "Оценка" });

  await questionCard(page).tap();
  await grades.getByRole("button", { name: /^Знаю/ }).click();
  const echo = page.locator("[data-progress-echo]");
  await expect(echo).toHaveAttribute("data-progress-echo", "good");
  // It spans the step just taken (from 0) and grows with the fill; the colour runs over --dur-spotlight.
  expect(await echo.evaluate((el) => (el as HTMLElement).style.left)).toBe("0%");
  const transitions = await echo.evaluate((el) =>
    el.getAnimations().map((a) => [(a as CSSTransition).transitionProperty, a.effect?.getComputedTiming().duration]),
  );
  expect(transitions).toContainEqual(["background-color", 1200]);
  expect(transitions).toContainEqual(["scale", 200]);
  if (process.env.MOTION_SHOTS) await page.screenshot({ path: `${process.env.MOTION_SHOTS}/grade-echo.png`, clip: { x: 0, y: 0, width: 390, height: 140 } });
  await expect(echo).toHaveCSS("background-color", INK, { timeout: 3000 });

  // «Не знаю»: the next step echoes in again-red, starting where the last one ended.
  await questionCard(page).tap();
  await grades.getByRole("button", { name: /^Не знаю/ }).click();
  await expect(echo).toHaveAttribute("data-progress-echo", "again");
  expect(parseFloat(await echo.evaluate((el) => (el as HTMLElement).style.left))).toBeGreaterThan(0);
  expect(await echo.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(INK);
});

test("the duplicate notice opens as a Collapse and closes the same way; no red (A9)", async ({ page }) => {
  await mockSuggest(page, []);
  await openReview(page);
  await tabBar(page).getByRole("button", { name: "Добавить" }).click();
  const sheet = addSheet(page);
  const input = sheet.getByPlaceholder("Слово или выражение — FR или RU");
  await input.fill("les flics");
  const notice = sheet.getByRole("alert").filter({ hasText: /Уже есть/ });
  await expect(notice).toBeVisible();
  const collapse = notice.locator("xpath=../..");
  await expect(collapse).toHaveAttribute("data-state", "open");
  const transition = await collapse.evaluate((el) => getComputedStyle(el).transitionProperty);
  expect(transition).toContain("grid-template-rows");
  expect(await notice.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");

  // Another word: the notice closes (height, then gone), not cut.
  await input.fill("les fli");
  await expect(collapse).toHaveAttribute("data-state", "closed");
  await expect(sheet.getByText(/Уже есть/)).toHaveCount(0);
});

test("a sort-plan group switched off dims and «Применить N» swaps its count (S4)", async ({ page }) => {
  await mockExtract(page, [vocab({ fr: "la caisse", ru: "тачка" }), vocab({ fr: "le tromé", ru: "метро" }), vocab({ fr: "la bécane", ru: "мотик" })]);
  await page.goto("/import");
  await page.locator("input[type=file][accept='image/png,image/jpeg,image/webp']").setInputFiles({
    name: "chat.png",
    mimeType: "image/png",
    buffer: await screenshotPng(page),
  });
  await page.getByRole("button", { name: "Добавить 3 слова" }).click();
  await expect(page).toHaveURL(/\/library$/);
  await page.route("**/api/ai/classify", async (route: Route) => {
    const body = route.request().postDataJSON() as { mode: string; words: { id: string }[]; folders: { slug: string; name: string }[] };
    if (body.mode === "taxonomy") {
      const folders = body.folders.map((f) => ({ slug: f.slug, name: f.name, description: "", status: "keep", example_ids: [] }));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ folders, removed: [] }) });
      return;
    }
    const daily = body.folders.find((f) => f.name === "Повседневное")!.slug;
    const assignments = body.words.map((w) => ({ id: w.id, folder: daily, confidence: "high" }));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ assignments }) });
  });
  await page.getByRole("button", { name: /Разложить/ }).first().click();
  const sheet = page.getByRole("dialog", { name: "Предлагаемые перемещения" });
  const group = sheet.getByRole("region", { name: "Повседневное: 3 слова" });
  await expect(group).toBeVisible();
  const apply = sheet.getByRole("button", { name: /^Применить/ });
  await expect(apply).toHaveAccessibleName("Применить 3");

  // Record animation starts from before the click: the fades are short enough to end before a
  // getAnimations() call lands under load.
  await apply.evaluate((el) => {
    const names: string[] = [];
    (window as unknown as { __applyFades: string[] }).__applyFades = names;
    el.addEventListener("animationstart", (e) => names.push((e as AnimationEvent).animationName));
  });
  await group.getByRole("switch").click();
  // The old count fades out while the new one fades in, in one cell.
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __applyFades: string[] }).__applyFades))
    .toEqual(expect.arrayContaining(["fade-out", "fade-in"]));
  await expect(apply).toHaveAccessibleName("Применить 0");
  await expect(apply).toBeDisabled();
  const label = group.locator(".transition-opacity").first();
  await expect(label).toHaveCSS("opacity", "0.5");
  if (process.env.MOTION_SHOTS) await page.screenshot({ path: `${process.env.MOTION_SHOTS}/sort-plan-off.png` });
});

/** Records whether `text` ever shows up on the page (a MutationObserver from the start). */
async function watchText(page: Page, text: string) {
  await page.evaluate((t) => {
    const w = window as unknown as { __seen: boolean };
    w.__seen = false;
    new MutationObserver(() => {
      if (document.body.textContent?.includes(t)) w.__seen = true;
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  }, text);
  return () => page.evaluate(() => (window as unknown as { __seen: boolean }).__seen);
}

test("a quick search replaces the results in place, without «Ищем…» (L5)", async ({ page }) => {
  await page.goto("/library");
  await expect(page.getByRole("button", { name: /^Все слова: \d+/ })).toBeVisible();
  const seen = await watchText(page, "Ищем…");
  const search = page.getByRole("searchbox", { name: "Поиск по FR и RU" });
  await search.fill("fl");
  await expect(page.getByText("les flics", { exact: true })).toBeVisible();
  await search.fill("flics");
  await expect(page.getByRole("status").filter({ hasText: /^Найдено/ })).toBeVisible();
  expect(await seen()).toBe(false);
});

test("a saved field edit in the word sheet is lit with the spotlight (L9)", async ({ page }) => {
  await page.goto("/library");
  await page.getByRole("searchbox", { name: "Поиск по FR и RU" }).fill("flics");
  await page.getByText("les flics", { exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Карточка слова" });
  await sheet.getByRole("button", { name: "Изменить заметку" }).click();
  await sheet.getByRole("textbox", { name: "Заметка" }).fill("Тест заметки");
  const field = sheet.locator('[data-edited="note"]');
  const lit = field.evaluate(
    (el) =>
      new Promise<boolean>((resolve) => {
        const timer = window.setInterval(() => {
          if (el.getAnimations().some((a) => (a as CSSAnimation).animationName === "spotlight")) {
            window.clearInterval(timer);
            resolve(true);
          }
        }, 20);
        window.setTimeout(() => resolve(false), 4000);
      }),
  );
  await sheet.getByRole("button", { name: "Сохранить" }).click();
  await expect(sheet.getByText("Тест заметки")).toBeVisible();
  expect(await lit).toBe(true);
});
