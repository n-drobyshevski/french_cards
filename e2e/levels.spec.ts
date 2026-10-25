import { expect, test, type Page } from "@playwright/test";

// «Уровень языка» on phones (SPEC.md «План дня и уровень языка», boards Level-Badge-A, Level-Word,
// Level-Edit, Level-Filter-A). The seed library's levels come from the bundled dictionaries:
// «une blague» and «le gras» ≈A1 (FLELex), «arrête» ≈B2 (frequency), «les flics» ≈C1 (FLELex);
// the other seven words have none («se casser» is argot, the rest are expressions FLELex lacks).

const allWords = (page: Page) => page.getByRole("list", { name: "Все слова" });
const row = (page: Page, fr: string) => page.getByRole("button", { name: new RegExp(`^${fr} —`) });
const card = (page: Page) => page.getByRole("dialog", { name: "Карточка слова" });

async function openAllWords(page: Page) {
  await page.goto("/library");
  await page.getByRole("button", { name: "Все слова: 11", exact: true }).click();
  await expect(allWords(page).getByRole("listitem")).toHaveCount(11);
}

test("rows and the word card show the estimate as «≈A1», words without one «—»", async ({ page }) => {
  await openAllWords(page);
  // The estimates come in once the dictionaries are loaded.
  await expect(row(page, "une blague")).toHaveAccessibleName(/, ≈A1,/);
  // Rows are buttons (their content is presentational): the mark is found by its data attribute.
  await expect(row(page, "une blague").locator('[data-level="A1"]')).toHaveText("≈A1");
  await expect(row(page, "une blague").locator('[data-level="A1"]')).toHaveAttribute("aria-label", "Уровень языка: примерно A1, оценка");
  await expect(row(page, "les flics")).toHaveAccessibleName(/, ≈C1,/);
  await expect(row(page, "vas-y").locator('[data-level="none"]')).toHaveText("—");

  await row(page, "une blague").click();
  // Phones (L-Word-B): the level is printed once on the grammar line; a tap opens where it comes from.
  const level = card(page).getByRole("button", { name: /^Уровень языка: примерно A1, оценка, по словарю FLELex\./ });
  await expect(level).toHaveText("≈A1");
  await level.click();
  await expect(card(page).getByText("Оценка по словарю FLELex, точна примерно в половине случаев.")).toBeVisible();
});

test("the review card shows the level on the answer side only", async ({ page }) => {
  await page.goto("/");
  const question = page.getByRole("button", { name: /^Карточка .*, перевернуть$/ });
  await expect(question).toBeVisible();
  await expect(page.locator("[data-level]")).toHaveCount(0);
  await question.click();
  const answer = page.locator("[data-review-answer]");
  await expect(answer).toBeVisible();
  // No stored plan: new words come by level, so the first card is an ≈A1 word («une blague» or
  // «le gras»), its level in the answer header («нейтр. · ≈A1»).
  await expect(answer).toContainText(/une blague|le gras/);
  await expect(answer.locator("[data-level]")).toHaveCount(1);
  await expect(answer.locator("[data-level]")).toHaveText("≈A1");
});

test("«Уровень языка» filters the library, «без уровня» included; «По уровню языка» orders it", async ({ page }) => {
  await openAllWords(page);
  await expect(row(page, "une blague")).toHaveAccessibleName(/≈A1/);
  await page.getByRole("button", { name: /Фильтр/ }).first().click();
  const sheet = page.getByRole("dialog", { name: "Фильтр и порядок" });
  const levels = sheet.getByRole("group", { name: "Уровень языка" });
  await expect(levels.getByRole("checkbox", { name: "A1, 2" })).toBeVisible();
  await expect(levels.getByRole("checkbox", { name: "без уровня, 7" })).toBeVisible();
  await expect(sheet.getByText("Считаются и оценки «≈», и уровни, которые вы указали.")).toBeVisible();
  // The slang group is «Сленг» now.
  await expect(sheet.getByRole("group", { name: "Сленг" })).toBeVisible();

  await levels.getByRole("checkbox", { name: "A1, 2" }).click();
  await expect(sheet.getByRole("button", { name: "Показать 2 слова" })).toBeVisible();
  await levels.getByRole("checkbox", { name: "C1, 1" }).click();
  await expect(sheet.getByRole("button", { name: "Показать 3 слова" })).toBeVisible();
  await levels.getByRole("checkbox", { name: "без уровня, 7" }).click();
  await expect(sheet.getByRole("button", { name: "Показать 10 слов" })).toBeVisible();
  await levels.getByRole("checkbox", { name: "без уровня, 7" }).click();

  await sheet.getByRole("radio", { name: "По уровню языка" }).click();
  await sheet.getByRole("button", { name: "Показать 3 слова" }).click();
  const found = page.getByRole("list", { name: "Найденные слова" });
  await expect(found.getByRole("listitem")).toHaveCount(3);
  // A1 first, C1 last.
  await expect(found.getByRole("listitem").last()).toContainText("les flics");
});

test("a level picked in the edit form is the user's («B1», no «≈»); «Авто» brings the estimate back", async ({ page }) => {
  await openAllWords(page);
  await expect(row(page, "une blague")).toHaveAccessibleName(/≈A1/);
  await row(page, "une blague").click();
  // Phones: «Изменить» sits in the level's source line, opened from the level on the grammar line.
  await card(page).getByRole("button", { name: /^Уровень языка: / }).click();
  await card(page).getByRole("button", { name: "Изменить уровень языка" }).click();

  const form = card(page).getByRole("form", { name: "Изменить слово" });
  const options = form.getByRole("radiogroup", { name: "Уровень языка" });
  await expect(options.getByRole("radio", { name: "Авто" })).toHaveAttribute("aria-checked", "true");
  // The estimate's segment is marked.
  await expect(options.getByRole("radio", { name: "A1, сейчас оценка" })).toBeVisible();
  await expect(form.getByText("подобрано автоматически · ≈A1 по словарю FLELex")).toBeVisible();
  await options.getByRole("radio", { name: "B1", exact: true }).click();
  await form.getByRole("button", { name: "Сохранить" }).click();

  await expect(card(page).getByRole("button", { name: /^Уровень языка: B1, вы указали\./ })).toHaveText("B1");
  await page.keyboard.press("Escape");
  await expect(row(page, "une blague")).toHaveAccessibleName(/, B1,/);

  await row(page, "une blague").click();
  await card(page).getByRole("button", { name: /^Уровень языка: / }).click();
  await card(page).getByRole("button", { name: "Изменить уровень языка" }).click();
  await expect(options.getByRole("radio", { name: "B1", exact: true })).toHaveAttribute("aria-checked", "true");
  await options.getByRole("radio", { name: "Авто" }).click();
  await form.getByRole("button", { name: "Сохранить" }).click();
  await expect(card(page).getByRole("button", { name: /^Уровень языка: примерно A1, оценка, по словарю FLELex\./ })).toHaveText("≈A1");
});

test("«Определить уровень языка» proposes levels by group, saves the checked ones «от Claude» and undoes them", async ({ page }) => {
  // The six words with no estimate that are not argot (Level-Fill): Claude rates them; one gets none.
  const proposed: Record<string, string | null> = {
    "dépêche-toi": "A2",
    "je vais me tuer": "B1",
    "c'est dur": "A2",
    "être dehors": "B1",
    "qu'est-ce qui se passe ?": "A2",
    "vas-y": null,
  };
  let scope: unknown;
  await page.route("**/api/ai/enrich", async (route) => {
    const body = route.request().postDataJSON() as { scope?: string; words: { id: string; fr: string }[] };
    scope = body.scope;
    await route.fulfill({ json: { levels: body.words.map((w) => ({ id: w.id, cefr: proposed[w.fr] ?? null })) } });
  });
  await page.goto("/library");
  await page.getByRole("button", { name: /^Уход за карточками/ }).click();
  await expect(page.getByText("6 без уровня")).toBeVisible();
  await page.getByRole("button", { name: "Определить уровень языка" }).click();
  const sheet = page.getByRole("dialog", { name: /Уровень языка/ });
  await expect(sheet.getByText("Уровень языка для 6 слов")).toBeVisible();
  expect(scope).toBe("level");
  await expect(sheet.getByText("без уровня", { exact: true })).toBeVisible();
  await expect(sheet.getByText("не сохраняем")).toBeVisible();
  // Group B1 off: only the three A2 words are saved.
  await sheet.getByRole("switch", { name: "B1: сохранить все" }).click();
  await sheet.getByRole("button", { name: /Сохранить уровни/ }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText("Уровень языка: 3 слова")).toBeVisible();

  await page.getByRole("button", { name: "Все слова: 11", exact: true }).click();
  await expect(row(page, "c'est dur")).toHaveAccessibleName(/, ≈A2,/);
  await expect(row(page, "être dehors")).toHaveAccessibleName(/, без уровня,/);
  await row(page, "c'est dur").click();
  await expect(card(page).getByText("· от Claude")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Отменить", exact: true }).click();
  await expect(page.getByText("Уровни отменены")).toBeVisible();
  await expect(row(page, "c'est dur")).toHaveAccessibleName(/, без уровня,/);
});
