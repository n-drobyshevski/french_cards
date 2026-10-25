import { expect, test } from "@playwright/test";
import { openReview, seedExerciseSets, SLANG_SET } from "./fixtures";

// «Уровень набора» on phones (X-Level-A, pick L1 A; X-Level-Tile-A, pick L2 A): the level slot after
// the count in the request sentence opens «Авто ≈B1 · A2 · B1 · B2 · C1» with a line on what the
// level changes; a picked level is copied («уровня B2»), «Авто» copies nothing. A set's tile says
// its level by the size («5 ВОПРОСОВ · B1», «≈A2» from «Авто»).

test("the level slot: «Авто» by default, a picked level goes into the request, «Авто» takes it out again", async ({ page }) => {
  await openReview(page);
  await page.goto("/exercises");
  const card = page.getByRole("region", { name: "Запрос для Claude" });
  const request = card.getByRole("group", { name: /^Запрос для Claude:/ });
  const plain = "Запрос для Claude: Сделай в Карточках 12 вопросов по всем темам — можно новые слова.";
  await expect(request).toHaveAccessibleName(plain);

  const slot = card.getByRole("button", { name: /^Уровень: авто/ });
  await expect(slot).toHaveText(/^уровня\s(≈(A2|B1|B2|C1)|авто)$/);
  await expect(slot).toHaveAttribute("aria-expanded", "false");
  await slot.click();
  await expect(slot).toHaveAttribute("aria-expanded", "true");
  const levels = card.getByRole("radiogroup", { name: "Уровень набора" });
  await expect(levels.getByRole("radio")).toHaveCount(5);
  await expect(levels.getByRole("radio", { name: /^Авто/ })).toHaveAttribute("aria-checked", "true");
  await expect(card.locator("[data-level-hint]")).toContainText("По уровню выбранных слов");
  // One slot open at a time: the themes closed.
  await expect(card.getByRole("group", { name: "Темы, можно несколько" })).toHaveCount(0);

  await levels.getByRole("radio", { name: "B2" }).click();
  await expect(request).toHaveAccessibleName("Запрос для Claude: Сделай в Карточках 12 вопросов уровня B2 по всем темам — можно новые слова.");
  await expect(card.getByRole("button", { name: "Уровень: B2, изменить" })).toHaveText("уровня B2");
  await expect(card.locator("[data-level-hint]")).toContainText("B2 — длиннее и абстрактнее");
  // Arrows move the choice, as in the kind row.
  await levels.getByRole("radio", { name: "B2" }).press("ArrowRight");
  await expect(levels.getByRole("radio", { name: "C1" })).toBeFocused();
  await expect(request).toHaveAccessibleName(/уровня C1/);

  await levels.getByRole("radio", { name: /^Авто/ }).click();
  await expect(request).toHaveAccessibleName(plain);
});

test("a set's tile says its level by the size; «Авто» reads «≈»", async ({ page }) => {
  await openReview(page);
  await seedExerciseSets(page, [
    { ...SLANG_SET, level: "B1" },
    { ...SLANG_SET, id: "x-e2e-auto", title: "Автоуровень", created_at: "2026-10-21T09:00:00.000Z", level: "A2", level_auto: true },
  ]);
  await page.goto("/exercises");
  const picked = page.getByRole("link", { name: new RegExp(`^${SLANG_SET.title}:`) });
  await expect(picked).toContainText("5 вопросов · B1");
  await expect(picked).toHaveAccessibleName(/5 вопросов, уровень B1, /);
  const auto = page.getByRole("link", { name: /^Автоуровень:/ });
  await expect(auto).toContainText("5 вопросов · ≈A2");
  await expect(auto).toHaveAccessibleName(/уровень примерно A2/);
});
