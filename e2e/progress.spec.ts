import { expect, test, type Page } from "@playwright/test";
import { openReview, questionCard } from "./fixtures";

// «Прогресс» on phones (Progress-Screen-A, Progress-Empty, Progress-Entry): opened from the Library
// header, empty until something is studied, then today's reviews show in the calendar.

async function gradeKnown(page: Page, n: number) {
  for (let i = 0; i < n; i++) {
    await questionCard(page).click();
    await page.getByRole("group", { name: "Оценка" }).getByRole("button", { name: /^Знаю, следующий показ/ }).click();
  }
}

test("the Library header opens «Прогресс»; it stays empty before the first review", async ({ page }) => {
  await page.goto("/library");
  await page.getByRole("link", { name: "Прогресс" }).click();
  await expect(page).toHaveURL(/\/progress$/);
  await expect(page.getByRole("heading", { name: "Прогресс" })).toBeVisible();
  await expect(page.getByText("Повтори первые карточки — каждый учебный день сохранится здесь сам.")).toBeVisible();
  await expect(page.getByRole("link", { name: /К повторению/ })).toBeVisible();
});

test("today's reviews show in the ledger and the calendar", async ({ page }) => {
  await openReview(page);
  await gradeKnown(page, 2);
  await expect(page.getByText("02 / 11", { exact: true })).toBeVisible();

  await page.goto("/progress");
  await expect(page.getByRole("table", { name: /^Ведомость за/ })).toBeVisible();
  await expect(page.getByText("Повтори первые карточки", { exact: false })).toHaveCount(0);
  const today = page.getByRole("button", { name: /2 повторения, сегодня$/ });
  await expect(today).toBeVisible();
  await today.click();
  await expect(page.getByRole("button", { name: /Свернуть/ })).toBeVisible();
});
