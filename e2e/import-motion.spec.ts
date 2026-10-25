import { expect, test, type Page } from "@playwright/test";
import { motionSettled, screenshotPng, vocab, type VocabItemWire } from "./fixtures";

// Screenshot import while it waits (MOTION-SPEC I1–I7, B4): honest steps, a bar that moves only on
// real events, the scan line as the one loop. The extract answer is a real stream the test feeds
// line by line (page.route can only answer with the whole body at once).

declare global {
  interface Window {
    __extract: { started: boolean; push: (line: unknown) => void; close: () => void };
  }
}

async function streamExtract(page: Page) {
  await page.addInitScript(() => {
    const encoder = new TextEncoder();
    let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
    const pending: Uint8Array[] = [];
    window.__extract = {
      started: false,
      push: (line) => {
        const chunk = encoder.encode(JSON.stringify(line) + "\n");
        if (controller) controller.enqueue(chunk);
        else pending.push(chunk);
      },
      close: () => controller?.close(),
    };
    const original = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.includes("/api/ai/extract")) return original(input, init);
      window.__extract.started = true;
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          controller = c;
          for (const chunk of pending.splice(0)) c.enqueue(chunk);
        },
      });
      return Promise.resolve(new Response(body, { status: 200, headers: { "Content-Type": "application/x-ndjson; charset=utf-8" } }));
    };
  });
}

const push = (page: Page, line: unknown) => page.evaluate((l) => window.__extract.push(l), line);

const ROWS: VocabItemWire[] = [
  vocab({ fr: "la meuf", ru: "девушка", slang_level: 2, verlan: true }),
  vocab({ fr: "bouffer", ru: "жрать", pos: "verb", gender: "none", slang_level: 2 }),
  vocab({ fr: "un pote", ru: "кореш", slang_level: 1 }),
];

async function choose(page: Page) {
  await page.goto("/import");
  await expect(page.getByRole("button", { name: "Выбрать скриншот" })).toBeVisible();
  await page.locator("input[type=file][accept='image/png,image/jpeg,image/webp']").setInputFiles({
    name: "chat.png",
    mimeType: "image/png",
    buffer: await screenshotPng(page),
  });
  await expect.poll(() => page.evaluate(() => window.__extract.started)).toBe(true);
}

const bar = (page: Page) => page.getByRole("progressbar", { name: "Прогресс распознавания" });
/** Phones (Import-Processing B): no step list; the status line says the step. */
const steps = (page: Page) => page.getByRole("list", { name: "Этапы" });
const status = (page: Page, text: RegExp | string) => page.getByRole("status").filter({ hasText: text });
const scan = (page: Page) => page.locator("[data-scan]");

test("waiting for the first word: the status reads, the (hidden) bar holds at 20 %, the scan line travels; rows move it on", async ({ page }) => {
  await streamExtract(page);
  await choose(page);

  // Uploaded, nothing found yet: the status says what is happening, not what was found.
  await expect(steps(page)).toHaveCount(0);
  await expect(page.getByText("Текст найден")).toHaveCount(0);
  await expect(bar(page)).toHaveAttribute("aria-valuenow", "20");
  await expect(scan(page)).toHaveAttribute("data-scan", "travel");
  await expect(scan(page)).toHaveClass(/motion-loop/);
  await expect(page.getByRole("status").filter({ hasText: "Читаем скриншот" })).toBeAttached();
  // Elapsed time joins the status line after 3 s; the bar has not crept meanwhile.
  await expect(page.getByText(/^0:0[3-5]$/)).toBeVisible({ timeout: 6_000 });
  await expect(bar(page)).toHaveAttribute("aria-valuenow", "20");
  if (process.env.MOTION_SHOTS) await page.screenshot({ path: `${process.env.MOTION_SHOTS}/import-waiting.png` });

  // The first row is the first real event after the upload: 30 %, step 02, scan line stops.
  await push(page, { type: "meta", images: 1 });
  await expect(bar(page)).toHaveAttribute("aria-valuenow", "20");
  await push(page, { type: "item", index: 0, item: ROWS[0] });
  await expect(bar(page)).toHaveAttribute("aria-valuenow", "30");
  await expect(page.getByText("la meuf", { exact: true })).toBeVisible();
  await expect(scan(page)).toHaveAttribute("data-scan", "static");
  await expect(page.getByText(/^Найдено\s*1$/)).toBeVisible();

  await push(page, { type: "item", index: 1, item: ROWS[1] });
  await expect(page.getByText(/^Найдено\s*2$/)).toBeVisible();
  const second = Number(await bar(page).getAttribute("aria-valuenow"));
  expect(second).toBeGreaterThan(30);
  expect(second).toBeLessThan(90);
  // A 4-row skeleton stack keeps trailing the rows while the stream is open.
  await expect(page.locator("[data-skeleton-stack] > div")).toHaveCount(4);

  await push(page, { type: "item", index: 2, item: ROWS[2] });
  await push(page, { type: "done", count: 3 });
  await page.evaluate(() => window.__extract.close());
  await expect(page.getByRole("heading", { name: "Найдено 3 слова" })).toBeVisible();

  // I7: «Добавляем…», then the library with «Добавлено 3 слова · Отменить».
  await page.getByRole("button", { name: "Добавить 3 слова" }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByText("Добавлено 3 слова", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Отменить", exact: true })).toBeVisible();
});

test("under reduced motion the scan line stands at the bar's % instead of travelling", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await streamExtract(page);
  await choose(page);
  await expect(scan(page)).toHaveAttribute("data-scan", "travel");
  await expect.poll(() => scan(page).evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  await expect.poll(() => scan(page).evaluate((el) => el.style.translate)).toBe("0px 20%");
});

// ---------------------------------------------------------------------------------------------
// Stop, finish, fail, rate limit, checkboxes, offline (MOTION-SPEC I2–I6, B4).

const found = (page: Page) => page.getByRole("list", { name: "Распознанные слова" });
const review = (page: Page) => page.getByRole("list", { name: "Найденные слова" });

test("«Стоп» keeps what arrived: «Остановлено · 1 слово», «Повторить» in the same slot with focus, then «Дальше»", async ({ page }) => {
  await streamExtract(page);
  await choose(page);
  await push(page, { type: "meta", images: 1 });
  await push(page, { type: "item", index: 0, item: ROWS[0] });
  await expect(found(page).getByText("la meuf", { exact: true })).toBeVisible();

  const stopButton = page.getByRole("button", { name: "Стоп" });
  const slot = (await stopButton.boundingBox())!;
  await stopButton.click();

  // The same screen, stopped: status, frozen bar, skeletons gone.
  await expect(page.getByText("Остановлено · 1 слово", { exact: true }).first()).toBeVisible();
  await expect(bar(page)).toHaveAttribute("aria-valuenow", "30");
  await expect(found(page).getByText("la meuf", { exact: true })).toBeVisible();
  await expect.poll(() => page.locator("[data-skeleton-stack]").evaluate((el) => el.getBoundingClientRect().height)).toBe(0);

  // «Стоп» became «Повторить» in place and kept the focus; «Дальше с 1 словом» is the primary.
  const retry = page.getByRole("button", { name: "Повторить" });
  await expect(retry).toBeFocused();
  expect(await retry.boundingBox()).toEqual(slot);
  const next = page.getByRole("button", { name: "Дальше с 1 словом" });
  await expect(next).toBeVisible();
  if (process.env.MOTION_SHOTS) await page.screenshot({ path: `${process.env.MOTION_SHOTS}/import-stopped.png` });

  await next.click();
  await expect(page.getByRole("heading", { name: "Найдено 1 слово" })).toBeVisible();
  await expect(page.getByText("Остановлено · 1 слово", { exact: true }).first()).toBeVisible();
  await expect(review(page).getByText("la meuf", { exact: true })).toBeVisible();
});

test("done holds «Готово» and the full bar, then the review takes over row for row; the summary folds into a strip", async ({ page }) => {
  await streamExtract(page);
  await choose(page);
  await push(page, { type: "meta", images: 1 });
  for (const [index, item] of ROWS.entries()) await push(page, { type: "item", index, item });
  await expect(found(page).getByRole("listitem").filter({ hasText: "un pote" })).toBeVisible();
  await motionSettled(page);
  const streamed = await found(page)
    .getByRole("listitem")
    .evaluateAll((els) => els.filter((el) => !el.getAttribute("aria-hidden")).map((el) => Math.round(el.getBoundingClientRect().top)));
  expect(streamed).toHaveLength(3);

  await push(page, { type: "done", count: 3 });
  await page.evaluate(() => window.__extract.close());
  // The finished state, held before the review (--dur-done-hold).
  await expect(page.getByText("Готово", { exact: true })).toBeVisible();
  await expect(bar(page)).toHaveAttribute("aria-valuenow", "100");
  await expect(status(page, "Найдено 3 слова")).toBeAttached();

  await expect(page.getByRole("heading", { name: "Найдено 3 слова" })).toBeVisible();
  await motionSettled(page);
  const reviewed = await review(page)
    .getByRole("listitem")
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
  // Row for row, same order and spacing; the finished summary has folded into the 44px strip above.
  const shift = streamed[0] - reviewed[0];
  expect(shift).toBeGreaterThan(0);
  expect(reviewed.map((top) => top + shift)).toEqual(streamed);
  await expect(page.getByRole("button", { name: "Скриншот", exact: true })).toHaveAttribute("aria-expanded", "false");
  await expect(steps(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Добавить 3 слова" })).toBeVisible();
  if (process.env.MOTION_SHOTS) await page.screenshot({ path: `${process.env.MOTION_SHOTS}/import-review-same-top.png` });
});

test("checkboxes: the tick draws on a toggle, an unchecked row dims, the count crossfades", async ({ page }) => {
  await streamExtract(page);
  await choose(page);
  await push(page, { type: "meta", images: 1 });
  for (const [index, item] of ROWS.entries()) await push(page, { type: "item", index, item });
  await push(page, { type: "done", count: 3 });
  await page.evaluate(() => window.__extract.close());
  await expect(page.getByRole("button", { name: "Добавить 3 слова" })).toBeVisible();

  const box = review(page).getByRole("checkbox", { name: "bouffer" });
  const row = review(page).getByRole("listitem").filter({ has: page.getByRole("checkbox", { name: "bouffer" }) });
  await box.click();
  await expect(box).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("button", { name: "Добавить 2 слова" })).toBeVisible();
  await expect.poll(() => row.getByRole("button", { name: /^bouffer/ }).evaluate((el) => getComputedStyle(el).opacity)).toBe("0.5");
  await expect(box).toHaveClass(/press-sm/);

  // Checking again fills the box and draws the tick (stroke-dashoffset from its starting style).
  const drawn = await box.evaluate(async (el) => {
    (el as HTMLElement).click();
    await new Promise(requestAnimationFrame);
    const path = el.querySelector("path");
    return path ? path.getAnimations().map((a) => (a as CSSTransition).transitionProperty) : null;
  });
  expect(drawn).toContain("stroke-dashoffset");
  await expect(box).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("button", { name: "Добавить 3 слова" })).toBeVisible();
  await expect.poll(() => row.getByRole("button", { name: /^bouffer/ }).evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
});

test("a failure takes the rows' place: the summary stays, «Не удалось», «Повторить»", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/ai/extract", async (route) => {
    calls++;
    if (calls === 1) {
      await route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "upstream_error" }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/x-ndjson; charset=utf-8",
      body: [{ type: "meta", images: 1 }, ...ROWS.map((item, index) => ({ type: "item", index, item })), { type: "done", count: 3 }]
        .map((l) => JSON.stringify(l))
        .join("\n"),
    });
  });
  await page.goto("/import");
  await page.locator("input[type=file][accept='image/png,image/jpeg,image/webp']").setInputFiles({
    name: "chat.png",
    mimeType: "image/png",
    buffer: await screenshotPng(page),
  });

  const notice = page.getByRole("alert").filter({ hasText: "Скриншот не прочитан — попробуйте ещё раз" });
  await expect(notice).toBeVisible();
  await expect(page.getByRole("region", { name: "Обработка скриншота" })).toBeVisible();
  await expect(page.getByText("Не удалось", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Выбрать другой скриншот" })).toBeVisible();
  if (process.env.MOTION_SHOTS) await page.screenshot({ path: `${process.env.MOTION_SHOTS}/import-error.png` });

  await page.getByRole("button", { name: "Повторить" }).click();
  await expect(page.getByRole("heading", { name: "Найдено 3 слова" })).toBeVisible();
});

test("429: the wait is counted down in the open and retried once by itself", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/ai/extract", async (route) => {
    calls++;
    if (calls === 1) {
      await route.fulfill({
        status: 429,
        headers: { "Retry-After": "2" },
        contentType: "application/json",
        body: JSON.stringify({ error: "rate_limited" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/x-ndjson; charset=utf-8",
      body: [{ type: "meta", images: 1 }, { type: "item", index: 0, item: ROWS[0] }, { type: "done", count: 1 }]
        .map((l) => JSON.stringify(l))
        .join("\n"),
    });
  });
  await page.goto("/import");
  await page.locator("input[type=file][accept='image/png,image/jpeg,image/webp']").setInputFiles({
    name: "chat.png",
    mimeType: "image/png",
    buffer: await screenshotPng(page),
  });

  await expect(page.getByText(/^Слишком много запросов · повторим через\s*0:0[12]$/)).toBeVisible();
  await expect(bar(page)).toHaveAttribute("aria-valuenow", "20");
  await expect(page.getByText("Повторим один раз сами")).toBeVisible();

  await expect(page.getByRole("heading", { name: "Найдено 1 слово" })).toBeVisible({ timeout: 8_000 });
  expect(calls).toBe(2);
});

test("offline is said before the wait: «Нужна сеть» with the reason, not an error", async ({ page }) => {
  await page.goto("/import");
  const pick = page.getByRole("button", { name: "Выбрать скриншот" });
  await expect(pick).toBeEnabled();
  await page.context().setOffline(true);
  const offline = page.getByRole("button", { name: "Нужна сеть" });
  await expect(offline).toBeDisabled();
  await expect(page.getByText(/Распознавание работает только онлайн/)).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: /сеть|онлайн/ })).toHaveCount(0);
  await page.context().setOffline(false);
  await expect(pick).toBeEnabled();
});
