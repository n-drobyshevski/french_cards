import { expect, test, type Page, type Route } from "@playwright/test";
import { mockExtract, screenshotPng, vocab } from "./fixtures";

// «Разложить по темам» while the plan is built (MOTION-SPEC S1): two honest steps, a determinate
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
  await expect(steps).toHaveCount(0);
  await expect(apply).toBeEnabled();
  await expect(sheet.getByText("Можно применить, когда план готов")).toHaveCount(0);
  await expect(sheet.getByText("Можно отменить в течение 7 дней.")).toBeVisible();
});
