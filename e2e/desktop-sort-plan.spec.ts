import { expect, test, type Page, type Route } from "@playwright/test";
import { mockExtract, screenshotPng, vocab } from "./fixtures";

// «Разложить по темам» dialog on desktop while the plan is built (MOTION-SPEC S1), 1440×800.

async function importToInbox(page: Page) {
  await mockExtract(page, [vocab({ fr: "la caisse", ru: "тачка" }), vocab({ fr: "le tromé", ru: "метро" }), vocab({ fr: "la bécane", ru: "мотик" })]);
  await page.goto("/import");
  await page.locator("input[type=file][accept='image/png,image/jpeg,image/webp']").setInputFiles({
    name: "chat.png",
    mimeType: "image/png",
    buffer: await screenshotPng(page),
  });
  await page.getByRole("button", { name: /Добавить 3 слова/ }).click();
  await expect(page).toHaveURL(/\/library$/);
}

test("the plan dialog shows its steps and why «Применить» is not available yet", async ({ page }) => {
  await importToInbox(page);
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route("**/api/ai/classify", async (route: Route) => {
    const body = route.request().postDataJSON() as { mode: string; words: { id: string }[]; folders: { slug: string; name: string }[] };
    await held;
    if (body.mode === "taxonomy") {
      const folders = body.folders.map((f) => ({ slug: f.slug, name: f.name, description: "", status: "keep", example_ids: [] }));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ folders, removed: [] }) });
      return;
    }
    const daily = body.folders.find((f) => f.name === "Повседневное")!.slug;
    const assignments = body.words.map((w) => ({ id: w.id, folder: daily, confidence: "high" }));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ assignments }) });
  });

  await page.getByRole("button", { name: "Разложить по темам" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Предлагаемые перемещения" });
  await expect(dialog.getByRole("list", { name: "Этапы" }).getByRole("listitem")).toHaveText([/^01ТемыИДЁТ$/, /^02Слова · 0 \/ 3$/]);
  await expect(dialog.getByText("Можно применить, когда план готов")).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Применить/ })).toHaveAttribute("aria-disabled", "true");

  release();
  await expect(dialog.getByRole("region", { name: "Повседневное: 3 слова" })).toBeVisible();
  await expect(dialog.getByText("Можно отменить в течение 7 дней.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Применить/ })).not.toHaveAttribute("aria-disabled", "true");
});
