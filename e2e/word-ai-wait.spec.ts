import { expect, test, type Page, type Route } from "@playwright/test";
import { enriched, mockSuggest, type EnrichWordWire, type SuggestionWire } from "./fixtures";

// AI on words already in the library (mockups/MOTION-SPEC.md E2): «Заполнить автоматически» in the
// note form and «Определить уровень и часть речи» in the word form, and the «Дополнить карточки» plan.

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

test("the note and the word form fill from the word's suggestion; nothing is saved until ✓", async ({ page }, testInfo) => {
  const asked: unknown[] = [];
  await mockSuggest(page, [{ ...FLICS, slang_level: 2, gender: "mf" }], (body) => asked.push(body));
  const card = await openFlics(page);

  // «Заметка»: the suggestion's note fills the open form.
  await card.getByRole("button", { name: "Изменить заметку" }).click();
  const noteForm = card.getByRole("form", { name: "Изменить заметку" });
  await noteForm.getByRole("button", { name: "Заполнить автоматически" }).click();
  await expect(noteForm.getByRole("textbox", { name: "Заметка" })).toHaveValue(FLICS.note!);
  expect(asked).toEqual([expect.objectContaining({ q: "les flics", direction: "fr" })]);
  await noteForm.getByRole("button", { name: "Сохранить" }).click();
  await expect(noteForm).toHaveCount(0);
  await expect(card.getByText(FLICS.note!)).toBeVisible();

  // «Определить»: the slang level, verlan and part of speech (shown as a caption until saved).
  await card.getByRole("button", { name: "Изменить слово и перевод" }).click();
  const entry = card.getByRole("form", { name: "Изменить слово" });
  await expect(entry.getByRole("radio", { name: "fam." })).toHaveAttribute("aria-checked", "true");
  await entry.getByRole("button", { name: "Определить уровень и часть речи" }).click();
  await expect(entry.getByRole("radio", { name: "arg." })).toHaveAttribute("aria-checked", "true");
  await expect(entry.getByRole("status").filter({ hasText: "Часть речи" })).toContainText("n. m. et f.");
  await page.screenshot({ path: testInfo.outputPath("detect-entry.png") });
  await entry.getByRole("button", { name: "Сохранить" }).click();
  await expect(entry).toHaveCount(0);
  await expect(card.getByText("n. m. et f.").first()).toBeVisible();
  await expect(card.getByText("копы", { exact: true })).toBeVisible();
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
