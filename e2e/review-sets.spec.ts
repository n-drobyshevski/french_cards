import { expect, test, type Page } from "@playwright/test";
import { openReview } from "./fixtures";

// «Мои наборы» (mockups: Повторение «C · Мои наборы»): saved card sets in the review picker.
// Seed words: Эмоции 2 (c'est dur, je vais me tuer), Полиция 1 (les flics); fam. level: les flics,
// je vais me tuer, vas-y.

const picker = (page: Page) => page.getByRole("dialog", { name: "Что повторять" });

/** The theme half of the split chip: «Что повторять: все темы» / «Что повторять: Разговорное». */
const themeChip = (page: Page, current: string) =>
  page.getByRole("button", { name: `Что повторять: ${current === "Все темы" ? "все темы" : current}`, exact: true });

async function openPicker(page: Page, current = "Все темы") {
  await themeChip(page, current).click();
  await expect(picker(page)).toBeVisible();
}

test("a practice set: build it, it opens straight into a practice round", async ({ page }) => {
  await openReview(page);
  await openPicker(page);
  await picker(page).getByRole("button", { name: "Новый набор" }).click();

  const editor = page.getByRole("dialog", { name: "Новый набор" });
  await expect(editor.getByRole("button", { name: /^Сохранить/ })).toBeDisabled();
  await editor.getByLabel("Название").fill("Эмоции и копы");
  const themes = editor.getByRole("group", { name: "Темы" });
  await themes.getByRole("checkbox", { name: "Эмоции" }).click();
  await themes.getByRole("checkbox", { name: "Полиция" }).click();
  await editor.getByRole("radiogroup", { name: "Как повторять" }).getByRole("radio", { name: "Тренировка" }).click();
  await expect(editor.getByText("3 карточки вперемешку. Расписание не меняется.")).toBeVisible();
  await editor.getByRole("button", { name: /^Сохранить/ }).click();

  await expect(editor).toBeHidden();
  await expect(picker(page)).toBeHidden();
  await expect(page.getByText("Тренировка набора · не влияет на расписание")).toBeVisible();
  await expect(page.getByText("00 / 03", { exact: true })).toBeVisible();

  // Remembered: after the round the picker lists it, selected, with its summary.
  await page.getByRole("button", { name: "Закончить практику" }).click();
  await openPicker(page, "Эмоции и копы");
  const sets = picker(page).getByRole("radiogroup", { name: "Мои наборы" });
  await expect(sets.getByRole("radio", { name: /Эмоции и копы/ })).toHaveAttribute("aria-checked", "true");
  await expect(sets.getByText("Полиция, Эмоции")).toBeVisible();
  await expect(sets.getByText("3 · тренировка")).toBeVisible();
});

test("a schedule set narrows today's queue; editing and deleting it (with undo)", async ({ page }) => {
  await openReview(page);
  await openPicker(page);
  await picker(page).getByRole("button", { name: "Новый набор" }).click();
  const editor = page.getByRole("dialog", { name: "Новый набор" });
  await editor.getByLabel("Название").fill("Разговорное");
  await editor.getByRole("group", { name: "Уровень сленга" }).getByRole("checkbox", { name: "fam." }).click();
  await expect(editor.getByText("Сейчас 3 карточки к повторению. Оценки сдвигают интервалы, как обычно.")).toBeVisible();
  await editor.getByRole("button", { name: /^Сохранить/ }).click();

  await expect(themeChip(page, "Разговорное")).toBeVisible();
  await expect(page.getByText("00 / 03", { exact: true })).toBeVisible();
  await expect(page.getByText("Тренировка набора · не влияет на расписание")).toHaveCount(0);

  // Edit: add «arg.» (se casser) → 4 cards.
  await openPicker(page, "Разговорное");
  await picker(page).getByRole("button", { name: "Изменить набор «Разговорное»" }).click();
  const edit = page.getByRole("dialog", { name: "Изменить набор" });
  await expect(edit.getByLabel("Название")).toHaveValue("Разговорное");
  await edit.getByRole("group", { name: "Уровень сленга" }).getByRole("checkbox", { name: "arg." }).click();
  await edit.getByRole("button", { name: /^Сохранить/ }).click();
  await expect(page.getByText("00 / 04", { exact: true })).toBeVisible();

  // Delete: the review falls back to every theme; «Отменить» brings the set back.
  await openPicker(page, "Разговорное");
  await picker(page).getByRole("button", { name: "Изменить набор «Разговорное»" }).click();
  await page.getByRole("dialog", { name: "Изменить набор" }).getByRole("button", { name: "Удалить набор" }).click();
  await expect(page.getByText("Набор «Разговорное» удалён")).toBeVisible();
  await expect(picker(page).getByRole("radio", { name: /Разговорное/ })).toHaveCount(0);
  await expect(picker(page).getByRole("radio", { name: /^Все темы/ })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Отменить", exact: true }).click();
  await expect(picker(page).getByRole("radio", { name: /Разговорное/ })).toBeVisible();
  await picker(page).getByRole("button", { name: "Закрыть" }).click();
  await expect(themeChip(page, "Все темы")).toBeVisible();
  await expect(page.getByText("00 / 11", { exact: true })).toBeVisible();
});
