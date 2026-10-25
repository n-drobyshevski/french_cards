import { expect, test } from "@playwright/test";
import { openReview, seedExerciseSets, SLANG_SET } from "./fixtures";

// «Уровень набора» on desktop (D-Exercise-Level): a «Уровень» row (Авто · A2 · B1 · B2 · C1) under
// «Вопросов» in the right column's builder, with a line on what the level changes; the request
// text adds «, уровень B2». A set's tile says its level by the size.

test("the builder's «Уровень» row puts the level into the request; the tile shows a set's level", async ({ page }) => {
  await openReview(page);
  await seedExerciseSets(page, [{ ...SLANG_SET, level: "B2" }]);
  await page.goto("/exercises");
  const panel = page.getByRole("complementary", { name: "Попросить набор" });
  const level = panel.getByRole("radiogroup", { name: "Уровень" });
  await expect(level.getByRole("radio", { name: "Авто" })).toHaveAttribute("aria-checked", "true");
  await expect(panel).toContainText("Сделай упражнение в Карточках по всем темам, 12 вопросов, можно новые слова.");
  await expect(panel.locator("[data-level-hint]")).toContainText("По уровню выбранных слов");

  await level.getByRole("radio", { name: "B1" }).click();
  await expect(panel).toContainText("Сделай упражнение в Карточках по всем темам, 12 вопросов, уровень B1, можно новые слова.");
  await expect(panel.locator("[data-level-hint]")).toContainText("B1 — фразы на 8–12 слов");

  await expect(page.getByRole("link", { name: new RegExp(`^${SLANG_SET.title}:`) })).toContainText("5 вопросов · B2");
});
