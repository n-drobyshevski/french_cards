import { expect, test } from "@playwright/test";
import { openReview, seedExerciseSets, SLANG_SET } from "./fixtures";

// «Уровень набора» on desktop (D-Exercise-Level): a «Уровень» row (Авто · A2 · B1 · B2 · C1, several
// at once) under «Вопросов» in the right column's builder, with a line on what the levels change;
// the request text adds «, уровень B1–B2». A set's tile says its levels by the size.

test("the builder's «Уровень» row puts one or several levels into the request; the tile shows a set's levels", async ({ page }) => {
  await openReview(page);
  await seedExerciseSets(page, [{ ...SLANG_SET, levels: ["B2"] }]);
  await page.goto("/exercises");
  const panel = page.getByRole("complementary", { name: "Попросить набор" });
  const level = panel.getByRole("group", { name: "Уровень" });
  await expect(level.getByRole("button", { name: "Авто" })).toHaveAttribute("aria-pressed", "true");
  await expect(panel).toContainText("Сделай упражнение в Карточках по всем темам, 12 вопросов, можно новые слова.");
  await expect(panel.locator("[data-level-hint]")).toContainText("По уровню выбранных слов");

  await level.getByRole("button", { name: "B1" }).click();
  await expect(panel).toContainText("Сделай упражнение в Карточках по всем темам, 12 вопросов, уровень B1, можно новые слова.");
  await expect(panel.locator("[data-level-hint]")).toContainText("B1 — фразы на 8–12 слов");
  await level.getByRole("button", { name: "B2" }).click();
  await expect(panel).toContainText("12 вопросов, уровень B1–B2, можно новые слова.");
  await expect(level.getByRole("button", { name: "Авто" })).toHaveAttribute("aria-pressed", "false");
  await level.getByRole("button", { name: "Авто" }).click();
  await expect(panel).toContainText("Сделай упражнение в Карточках по всем темам, 12 вопросов, можно новые слова.");

  await expect(page.getByRole("link", { name: new RegExp(`^${SLANG_SET.title}:`) })).toContainText("5 вопросов · B2");
});
