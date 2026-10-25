import { expect, test, type Page, type Route } from "@playwright/test";
import { mockExtract, screenshotPng, vocab } from "./fixtures";

// «Разложить по темам» while the plan is built (MOTION-SPEC S1–S5, B4): two honest steps, a determinate
// bar on the assign batches, skeleton groups, «Применить» disabled with its reason.

/** Three words in «Входящие», placed automatically (seeded words are hand-placed and never move). */
async function importToInbox(page: Page) {
  await mockExtract(page, [
    vocab({ fr: "la caisse", ru: "тачка" }),
    vocab({ fr: "le tromé", ru: "метро" }),
    vocab({ fr: "la bécane", ru: "мотик" }),
  ]);
  await page.goto("/import");
  await page.locator("input[type=file][accept='image/png,image/jpeg,image/webp']").setInputFiles({
    name: "chat.png",
    mimeType: "image/png",
    buffer: await screenshotPng(page),
  });
  await page.getByRole("button", { name: "Добавить 3 слова" }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByRole("link", { name: /^Входящие: 3 слова/ })).toBeVisible();
}

/** Holds each pass of /api/ai/classify until the test releases it. */
async function holdClassify(page: Page) {
  let releaseTaxonomy!: () => void;
  let releaseAssign!: () => void;
  const taxonomy = new Promise<void>((r) => (releaseTaxonomy = r));
  const assign = new Promise<void>((r) => (releaseAssign = r));
  await page.route("**/api/ai/classify", async (route: Route) => {
    const body = route.request().postDataJSON() as {
      mode: "taxonomy" | "assign";
      words: { id: string }[];
      folders: { slug: string; name: string }[];
    };
    if (body.mode === "taxonomy") {
      await taxonomy;
      const folders = body.folders.map((f) => ({ slug: f.slug, name: f.name, description: "", status: "keep", example_ids: [] }));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ folders, removed: [] }) });
      return;
    }
    await assign;
    const daily = body.folders.find((f) => f.name === "Повседневное")!.slug;
    const assignments = body.words.map((w) => ({ id: w.id, folder: daily, confidence: "high" }));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ assignments }) });
  });
  return { releaseTaxonomy, releaseAssign };
}

test("the plan shows its two steps, a bar on the batches and «Применить» disabled with the reason", async ({ page }) => {
  await importToInbox(page);
  const { releaseTaxonomy, releaseAssign } = await holdClassify(page);
  await page.getByRole("button", { name: /Разложить/ }).first().click();

  const sheet = page.getByRole("dialog", { name: "Предлагаемые перемещения" });
  const steps = sheet.getByRole("list", { name: "Этапы" });
  const apply = sheet.getByRole("button", { name: "Применить" });

  // Step 01: themes, no total yet.
  await expect(sheet.getByText("3 слова без ручной темы")).toBeVisible();
  await expect(steps.getByRole("listitem")).toHaveText([/^01ТемыИДЁТ$/, /^02Слова · 0 \/ 3$/]);
  await expect(sheet.getByText("Составляем план", { exact: true }).first()).toBeVisible();
  await expect(apply).toBeDisabled();
  await expect(sheet.getByText("Можно применить, когда план готов")).toBeVisible();
  // «Применить» reads as disabled (white, muted text), not as a greyed ink slab.
  expect(await apply.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
  expect(await apply.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgb(17, 17, 17)");

  // Step 02: words in batches; the bar is determinate from here.
  releaseTaxonomy();
  await expect(steps.getByRole("listitem")).toHaveText([/^01Темы$/, /^02Слова · 0 \/ 3ИДЁТ$/]);
  await expect(sheet.getByText(/^Раскладываем слова\s*0 \/ 3$/)).toBeVisible();
  await expect(apply).toBeDisabled();
  if (process.env.MOTION_SHOTS) await page.screenshot({ path: `${process.env.MOTION_SHOTS}/sort-plan-step2.png` });

  releaseAssign();
  await expect(sheet.getByRole("region", { name: "Повседневное: 3 слова" })).toBeVisible();
  // Ready (S2), phones: the finished steps and the subline fold away; the status line turns into the
  // result, the hand-placed words are said under it.
  await expect(sheet.locator("ol[aria-label=Этапы]").locator("xpath=ancestor::*[@data-state][1]")).toHaveAttribute("data-state", "closed");
  await expect(sheet.getByText(/^\d+ вручную не трогаем$/)).toBeVisible();
  await expect(sheet.getByText("3 перемещения", { exact: true })).toBeVisible();
  await expect(apply).toBeEnabled();
  await expect(sheet.getByText("Можно применить, когда план готов")).toHaveCount(0);
  await expect(sheet.getByText("Можно отменить в течение 7 дней.")).toBeVisible();
});

/** Answers both passes: every word to «Повседневное». `fail` decides the status of each call (200 = answer). */
async function answerClassify(page: Page, fail: (mode: string, call: number) => { status: number; retryAfter?: number } | null = () => null) {
  let call = 0;
  await page.route("**/api/ai/classify", async (route: Route) => {
    const body = route.request().postDataJSON() as {
      mode: "taxonomy" | "assign";
      words: { id: string }[];
      folders: { slug: string; name: string }[];
    };
    const failure = fail(body.mode, call++);
    if (failure) {
      await route.fulfill({
        status: failure.status,
        contentType: "application/json",
        headers: failure.retryAfter ? { "Retry-After": String(failure.retryAfter) } : {},
        body: JSON.stringify({ error: failure.status === 429 ? "rate_limited" : "upstream_error" }),
      });
      return;
    }
    if (body.mode === "taxonomy") {
      const folders = body.folders.map((f) => ({ slug: f.slug, name: f.name, description: "", status: "keep", example_ids: [] }));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ folders, removed: [] }) });
      return;
    }
    const daily = body.folders.find((f) => f.name === "Повседневное")!.slug;
    const assignments = body.words.map((w) => ({ id: w.id, folder: daily, confidence: "high" }));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ assignments }) });
  });
}

test("applying: the sheet closes, «Разложено 3 слова · Отменить», the target tile is lit once", async ({ page }) => {
  await importToInbox(page);
  await answerClassify(page);
  await page.getByRole("button", { name: /Разложить/ }).first().click();
  const sheet = page.getByRole("dialog", { name: "Предлагаемые перемещения" });
  await expect(sheet.getByRole("region", { name: "Повседневное: 3 слова" })).toBeVisible();
  await expect(sheet.getByText("3 перемещения", { exact: true })).toBeVisible();
  if (process.env.MOTION_SHOTS) await page.screenshot({ path: `${process.env.MOTION_SHOTS}/sort-plan-ready.png` });

  // The theme tile lights once the sheet has cleared.
  const tile = page.getByRole("link", { name: /^Повседневное:/ });
  const lit = tile.evaluate(
    (el) =>
      new Promise<boolean>((resolve) => {
        const seen = () => el.getAnimations().some((a) => (a as CSSAnimation).animationName === "spotlight");
        const timer = window.setInterval(() => {
          if (seen()) {
            window.clearInterval(timer);
            resolve(true);
          }
        }, 20);
        window.setTimeout(() => resolve(false), 5000);
      }),
  );
  await sheet.getByRole("button", { name: /Применить/ }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText("Разложено 3 слова", { exact: true })).toBeVisible();
  await expect(page.getByRole("status").getByRole("button", { name: "Отменить" })).toBeVisible();
  expect(await lit).toBe(true);
  await expect(page.getByRole("link", { name: /^Входящие/ })).toHaveCount(0);
});

test("a failure takes the skeletons' place with «Повторить»; the failed step says «НЕ УДАЛОСЬ»", async ({ page }) => {
  await importToInbox(page);
  let broken = true;
  await answerClassify(page, (mode) => (broken && mode === "taxonomy" ? { status: 502 } : null));
  await page.getByRole("button", { name: /Разложить/ }).first().click();
  const sheet = page.getByRole("dialog", { name: "Предлагаемые перемещения" });

  const notice = sheet.getByRole("alert").filter({ hasText: "Не удалось составить план" });
  await expect(notice).toBeVisible();
  await expect(sheet.getByRole("list", { name: "Этапы" }).getByRole("listitem").first()).toHaveText(/^01ТемыНЕ УДАЛОСЬ$/);
  // Same height as the three skeleton groups it replaced.
  expect(Math.round((await notice.boundingBox())!.height)).toBeGreaterThanOrEqual(480);
  await expect(sheet.getByRole("button", { name: "Применить" })).toBeDisabled();

  broken = false;
  await notice.getByRole("button", { name: "Повторить" }).click();
  await expect(sheet.getByRole("region", { name: "Повседневное: 3 слова" })).toBeVisible();
});

test("429: «Слишком много запросов · повторим через 0:02», then one automatic retry", async ({ page }) => {
  await importToInbox(page);
  await answerClassify(page, (mode, call) => (call === 0 ? { status: 429, retryAfter: 2 } : null));
  await page.getByRole("button", { name: /Разложить/ }).first().click();
  const sheet = page.getByRole("dialog", { name: "Предлагаемые перемещения" });
  await expect(sheet.getByText(/^Слишком много запросов · повторим через\s*0:0[12]$/)).toBeVisible();
  await expect(sheet.getByRole("region", { name: "Повседневное: 3 слова" })).toBeVisible({ timeout: 8_000 });
});

test("offline, «Разложить» is disabled with the reason before any wait", async ({ page }) => {
  await importToInbox(page);
  await page.context().setOffline(true);
  const offline = page.getByRole("button", { name: "Нужна сеть" });
  await expect(offline).toBeDisabled();
  await page.context().setOffline(false);
  await expect(page.getByRole("button", { name: /Разложить/ }).first()).toBeEnabled();
});
