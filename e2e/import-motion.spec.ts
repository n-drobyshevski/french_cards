import { expect, test, type Page } from "@playwright/test";
import { screenshotPng, vocab, type VocabItemWire } from "./fixtures";

// Screenshot import while it waits (MOTION-SPEC I1, I7): honest steps, a bar that moves only on
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
const steps = (page: Page) => page.getByRole("list", { name: "Этапы" });
const scan = (page: Page) => page.locator("[data-scan]");

test("waiting for the first word: step 01 reads, the bar holds at 20 %, the scan line travels; rows move it on", async ({ page }) => {
  await streamExtract(page);
  await choose(page);

  // Uploaded, nothing found yet: the step says what is happening, not what was found.
  await expect(steps(page).getByRole("listitem")).toHaveText([/^01Читаем скриншотИДЁТ$/, /^02Слова, перевод и уровень$/, /^03Проверка повторов$/]);
  await expect(steps(page).locator("[aria-current=step]")).toHaveText(/Читаем скриншот/);
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
  await expect(steps(page).locator("[aria-current=step]")).toHaveText(/Слова, перевод и уровень/);
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
