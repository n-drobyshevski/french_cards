import { expect, test, type Page } from "@playwright/test";
import { addSheet, enriched, KIFFER_EXAMPLES, KIFFER_LOOKUP, mockContext, mockEnrich, mockLookup, openReview } from "./fixtures";

// «Контекст» on desktop (D-Context): the bilingual table, the right rail, the example dialog, G C.

const field = (page: Page) => page.getByRole("textbox", { name: "Слово или фраза" });
const rows = (page: Page) => page.getByRole("list", { name: "Примеры" }).getByRole("listitem");

test("kiffer: the table, the chips, synonyms and conjugation in the rail, an example into a new word", async ({ page }) => {
  await mockLookup(page, () => KIFFER_LOOKUP);
  await mockContext(page, () => KIFFER_EXAMPLES);
  await mockEnrich(page, (w) => enriched(w, { pos: "verb", gender: "none", slang_level: 1, example_fr: null, example_ru: null }));
  await page.goto("/context");
  const nav = page.getByRole("navigation", { name: "Основная навигация" });
  await expect(nav.getByRole("link", { name: "Контекст" })).toHaveAttribute("aria-current", "page");

  await field(page).fill("kiffer");
  await field(page).press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "kiffer" })).toBeVisible();
  await expect(rows(page)).toHaveCount(3);
  await expect(rows(page).first()).toContainText("Честно, я так тащусь от этого трека");

  const chips = page.getByRole("group", { name: "Значения" });
  await chips.getByRole("button", { name: /кайфовать/ }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("On a kiffé la soirée");
  await chips.getByRole("button", { name: "Все · 3" }).click();
  await expect(rows(page)).toHaveCount(3);

  const rail = page.getByRole("complementary", { name: "Синонимы и спряжение" });
  await expect(rail.getByRole("button", { name: "surkiffer — дико тащиться" })).toBeVisible();
  await expect(rail.getByText("kiffons")).toBeVisible();
  await expect(rail.getByText("kifferont")).toBeHidden();
  await rail.getByRole("button", { name: /Все времена/ }).click();
  await expect(rail.getByText("kifferont")).toBeVisible();

  await page.getByRole("button", { name: `В карточку: ${KIFFER_EXAMPLES[0].fr}` }).click();
  const dialog = page.getByRole("dialog", { name: "Пример" });
  await expect(dialog.getByRole("link", { name: /Vos sons du moment/ })).toHaveAttribute("target", "_blank");
  await dialog.getByRole("button", { name: "Добавить слово с этим примером" }).click();
  const add = addSheet(page);
  await expect(add.getByRole("textbox", { name: "Французский" })).toHaveValue("kiffer");
  await expect(add.getByRole("textbox", { name: "Русский", exact: true })).toHaveValue("тащиться, нравиться, кайфовать");
});

test("G then C opens «Контекст»; / focuses its search", async ({ page }) => {
  await openReview(page);
  await page.keyboard.press("g");
  await page.keyboard.press("c");
  await expect(page).toHaveURL(/\/context$/);
  await expect(page.getByRole("heading", { level: 1, name: "Контекст" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Основная навигация" }).getByRole("link", { name: "Контекст" })).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("/");
  await expect(field(page)).toBeFocused();
});
