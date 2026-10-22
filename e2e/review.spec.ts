import { expect, test } from "@playwright/test";
import { openReview, tabBar } from "./fixtures";

test.describe("review", () => {
  test("first run seeds the prototype words and default themes", async ({ page }) => {
    await openReview(page);
    await expect(page.getByText("11 новых", { exact: true })).toBeVisible();
    await expect(page.getByText("00 / 11", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Карточка une blague/ })).toBeVisible();

    await tabBar(page).getByRole("link", { name: "Библиотека" }).click();
    await expect(page.getByRole("heading", { name: "Библиотека" })).toBeVisible();
    await expect(page.getByText("11 слов", { exact: true }).first()).toBeVisible();
    for (const theme of ["Повседневное", "Деньги", "Еда", "Полиция", "Тусовка", "Эмоции", "Люди"]) {
      await expect(page.getByRole("link", { name: new RegExp(`^${theme}:`) })).toBeVisible();
    }

    // Reloading does not seed twice.
    await page.reload();
    await expect(page.getByText("11 слов", { exact: true }).first()).toBeVisible();
  });

  test("flip a card, grade it and undo the grade", async ({ page }) => {
    await openReview(page);
    const undo = page.getByRole("button", { name: "Отменить последний ответ" });
    await expect(undo).toBeDisabled();

    await page.getByRole("button", { name: "Показать ответ" }).click();
    await expect(page.getByText("шутка", { exact: true })).toBeVisible();
    const grades = page.getByRole("group", { name: "Оценка" });
    await expect(grades.getByRole("button")).toHaveCount(3);
    await expect(grades.getByRole("button", { name: /^Не знаю, следующий показ/ })).toBeVisible();
    await expect(grades.getByRole("button", { name: /^Сложно, следующий показ/ })).toBeVisible();

    await grades.getByRole("button", { name: /^Знаю, следующий показ/ }).click();
    await expect(page.getByText("01 / 11", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Карточка une blague/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Показать ответ" })).toBeVisible();
    await expect(page.getByText(/^Знаю ·/)).toBeVisible();

    // Undo from the header button: the same card comes back unanswered and the count resets.
    await expect(undo).toBeEnabled();
    await undo.click();
    await expect(page.getByText("00 / 11", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Карточка une blague/ })).toBeVisible();
    await expect(undo).toBeDisabled();
  });

  test("the snackbar «Отменить» also undoes, and Space/1-3 work from the keyboard", async ({ page }) => {
    await openReview(page);
    await page.keyboard.press("Space");
    await expect(page.getByText("шутка", { exact: true })).toBeVisible();
    await page.keyboard.press("1");
    await expect(page.getByText("01 / 11", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Отменить", exact: true }).click();
    await expect(page.getByText("00 / 11", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Карточка une blague/ })).toBeVisible();
  });
});

test.describe("review focus", () => {
  test("keyboard reveal moves focus to the answer; grading moves it to the next «Показать ответ»", async ({ page }) => {
    await openReview(page);
    const reveal = page.getByRole("button", { name: "Показать ответ" });
    await reveal.focus();
    await page.keyboard.press("Enter");
    const answer = page.getByRole("article", { name: "une blague — шутка" });
    await expect(answer).toBeVisible();
    await expect(answer).toBeFocused();

    const good = page.getByRole("group", { name: "Оценка" }).getByRole("button", { name: /^Знаю, следующий показ/ });
    await good.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("01 / 11", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Показать ответ" })).toBeFocused();
  });
});
