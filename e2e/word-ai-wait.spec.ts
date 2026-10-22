import { expect, test, type Page, type Route } from "@playwright/test";
import { enriched, gateSuggest, type EnrichWordWire, type SuggestionWire } from "./fixtures";

// AI on words already in the library (mockups/MOTION-SPEC.md E1, E2): «Обновить перевод и заметку»
// in the word sheet and the «Дополнить карточки» plan.

/** Records every paper fade that starts from now on, by the lit element's `data-refresh` fields. */
async function watchSpotlights(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __spots: string[] }).__spots = seen;
    document.addEventListener(
      "animationstart",
      (e) => {
        if (e.animationName === "spotlight") seen.push(...((e.target as HTMLElement).dataset.refresh?.split(" ") ?? []));
      },
      true,
    );
  });
  return () => page.evaluate(() => [...(window as unknown as { __spots: string[] }).__spots]);
}

const FLICS: SuggestionWire = {
  fr: "les flics",
  ru: "менты, копы",
  note: "Нейтральнее, чем «les keufs».",
  example_fr: "Les flics sont là.",
  example_ru: "Менты здесь.",
  pos: "noun",
  gender: "m",
  slang_level: 1,
  verlan: false,
  folder: "politsiya",
  folder_alternatives: [],
  new_folder: null,
  confidence: "high",
};

async function openFlics(page: Page) {
  await page.goto("/library");
  await page.getByRole("searchbox", { name: "Поиск по FR и RU" }).fill("flics");
  await page.getByText("les flics", { exact: true }).click();
  return page.getByRole("dialog", { name: "Карточка слова" });
}

test("«Обновить перевод и заметку»: «Подбираем…» at once with «Отмена»; a slow wait gets the status line", async ({ page }, testInfo) => {
  const suggest = await gateSuggest(page, () => [FLICS]);
  const card = await openFlics(page);
  await card.getByRole("button", { name: "Обновить перевод и заметку" }).click();

  const pending = card.getByRole("button", { name: "Подбираем…" });
  await expect(pending).toHaveAttribute("aria-busy", "true");
  const cancel = card.getByRole("button", { name: "Отмена", exact: true });
  await expect(cancel).toBeVisible();
  // After 1.5 s (not before): the status line under the button row.
  const line = card.getByText("Подбираем перевод и заметку").first();
  const slot = line.locator("xpath=ancestor::*[@data-state][1]");
  await expect(slot).toHaveAttribute("data-state", "closed");
  await expect(slot).toHaveAttribute("data-state", "open");
  await expect(line).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("refresh-waiting.png") });

  // «Отмена» stops at once and keeps the word as it is.
  await cancel.click();
  await expect(card.getByRole("button", { name: "Обновить перевод и заметку" })).not.toHaveAttribute("aria-busy", "true");
  await expect(cancel).toHaveCount(0);
  await expect(card.getByText("копы", { exact: true })).toBeVisible();

  // Again, answered: the changes open in place of the button; accepted fields are lit.
  await card.getByRole("button", { name: "Обновить перевод и заметку" }).click();
  suggest.release();
  const diff = card.getByRole("region", { name: "Предлагаемые изменения" }).or(card.locator('section[aria-label="Предлагаемые изменения"]'));
  await expect(diff).toBeVisible();
  const spots = await watchSpotlights(page);
  await diff.getByRole("button", { name: /Принять/ }).click();
  await expect(card.locator('[data-refresh~="ru"]')).toHaveText("менты, копы");
  await expect.poll(spots).toEqual(expect.arrayContaining(["ru", "note", "example"]));
  await expect(card.getByText("Перевод и заметка обновлены")).toBeVisible();
});

test("«Дополнить карточки»: steps, a bar per batch and «Применить» disabled with its reason until the plan is ready", async ({ page }, testInfo) => {
  let open!: () => void;
  const gate = new Promise<void>((resolve) => (open = resolve));
  await page.route("**/api/ai/enrich", async (route: Route) => {
    await gate;
    const { words } = route.request().postDataJSON() as { words: EnrichWordWire[] };
    await route.fulfill({ json: { results: words.map((w) => ({ id: w.id, ...enriched(w) })) } });
  });
  await page.goto("/library");
  await page.getByRole("button", { name: /Дополнить карточки/ }).click();
  const sheet = page.getByRole("dialog", { name: "Дополнить карточки" });

  const progress = sheet.locator("[data-enrich-progress]");
  await expect(progress.getByRole("list", { name: "Этапы" }).getByRole("listitem")).toHaveCount(2);
  await expect(progress.getByText(/^Примеры и уровень · 0 \/ \d+$/)).toBeVisible();
  await expect(progress.getByText("ИДЁТ")).toBeVisible();
  await expect(progress.getByText("Подбираем примеры").first()).toBeVisible();
  const apply = sheet.getByRole("button", { name: /Применить/ });
  await expect(apply).toBeDisabled();
  await expect(sheet.getByText("Можно применить, когда план готов")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("enrich-plan-waiting.png") });

  open();
  await expect(sheet.locator("section[aria-label^='Примеры:']")).toBeVisible();
  await expect(progress).toHaveCount(0);
  await expect(apply).toBeEnabled();
  await expect(sheet.getByText("Можно применить, когда план готов")).toHaveCount(0);
  // The groups wrote in as blocks (enter-rise).
  const names = await sheet.locator("section[aria-label]").evaluateAll((els) => els.map((el) => getComputedStyle(el).animationName));
  expect(names.every((n) => n === "enter-rise")).toBe(true);
});
