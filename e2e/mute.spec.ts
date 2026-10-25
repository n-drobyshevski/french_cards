import { expect, test, type Page } from "@playwright/test";
import { openReview, questionCard } from "./fixtures";

// «На паузу» and «Удалить слово» for the review card's word: phones reach them through the pencil,
// in the word sheet's «⋯» (L-Review-Ans-B; the desktop card buttons: desktop-mute.spec.ts); a paused
// word stays in the library («на паузе») and comes back from its word card.

/** The current card's prompt (the French word on a FR → RU card). */
async function prompt(page: Page): Promise<string> {
  const name = (await questionCard(page).getAttribute("aria-label")) ?? "";
  return name.replace(/^Карточка /, "").replace(/, перевернуть$/, "");
}

/** From the answer side: the pencil, then the word sheet's «⋯» action (`/^На паузу/`, «Удалить слово»). */
async function takeOut(page: Page, action: RegExp | string) {
  await page.getByRole("button", { name: "Изменить карточку" }).click();
  await page.getByRole("dialog", { name: "Карточка слова" }).getByRole("button", { name: /^Действия со словом/ }).click();
  await page.getByRole("button", { name: action }).click();
}

test("«На паузу» takes the card out of review; «Вернуть» in the word card brings it back", async ({ page }) => {
  await openReview(page);
  await expect(page.getByText("00 / 11", { exact: true })).toBeVisible();
  const fr = await prompt(page);
  // The phone card carries no «На паузу» of its own.
  await expect(page.getByRole("button", { name: "На паузу" })).toHaveCount(0);
  await questionCard(page).click();
  await takeOut(page, /^На паузу/);
  await expect(page.getByText("На паузе — в повторениях не появится")).toBeVisible();
  // Escape closes the top sheet: wait until the «⋯» actions sheet has left, then close the word's.
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.getByText("00 / 10", { exact: true })).toBeVisible();
  expect(await prompt(page)).not.toBe(fr);

  await page.goto("/library");
  await page.getByRole("searchbox", { name: "Поиск по FR и RU" }).fill(fr);
  const row = page.getByText(fr, { exact: true }).locator("xpath=ancestor::*[contains(@class,'h-16')][1]");
  await expect(row).toContainText("на паузе");
  await page.getByText(fr, { exact: true }).click();
  const card = page.getByRole("dialog", { name: "Карточка слова" });
  await expect(card.getByText("На паузе — не показывается в повторениях")).toBeVisible();
  await expect(card.getByRole("button", { name: "На паузу" })).toHaveCount(0);
  await card.getByRole("button", { name: "Вернуть", exact: true }).click();
  await expect(card.getByText("На паузе — не показывается в повторениях")).toHaveCount(0);
  await expect(card.getByRole("button", { name: "На паузу" })).toBeVisible();

  await openReview(page);
  await expect(page.getByText("00 / 11", { exact: true })).toBeVisible();
});

test("the trash deletes the word from the review card, «Отменить» brings it back", async ({ page }) => {
  await openReview(page);
  const fr = await prompt(page);
  await questionCard(page).click();
  await takeOut(page, "Удалить слово");
  await expect(page.getByText(`Удалено · ${fr}`)).toBeVisible();
  await expect(page.getByText("00 / 10", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Отменить", exact: true }).click();
  await expect(page.getByText("00 / 11", { exact: true })).toBeVisible();
  expect(await prompt(page)).toBe(fr);
});

test("the phone filter sheet lists «На паузе» once a word is paused", async ({ page }) => {
  await openReview(page);
  const fr = await prompt(page);
  await questionCard(page).click();
  await takeOut(page, /^На паузу/);
  await expect(page.getByText("На паузе — в повторениях не появится")).toBeVisible();
  await page.goto("/library");
  await page.getByRole("button", { name: /Фильтр/ }).first().click();
  const sheet = page.getByRole("dialog", { name: "Фильтр и порядок" });
  await sheet.getByRole("radio", { name: /На паузе/ }).click();
  await sheet.getByRole("button", { name: /Показать/ }).click();
  await expect(page.getByText(fr, { exact: true })).toBeVisible();
});

test("a theme «на паузе» leaves review until «Вернуть в повторения» on its page", async ({ page }) => {
  await openReview(page);
  await expect(page.getByText("00 / 11", { exact: true })).toBeVisible();

  await page.goto("/library");
  // The context-menu event (a long press) opens the theme's actions.
  await page.getByRole("link", { name: /^Эмоции:/ }).dispatchEvent("contextmenu");
  const menu = page.getByRole("dialog", { name: "Эмоции" });
  await menu.getByRole("switch", { name: "На паузе" }).click();
  await expect(page.getByText("Тема «Эмоции» на паузе")).toBeVisible();
  await expect(menu.getByRole("link", { name: /Повторить тему/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("link", { name: /^Эмоции: .*, на паузе,/ })).toBeVisible();

  await openReview(page);
  await expect(page.getByText(/^00 \/ (\d+)$/)).not.toHaveText("00 / 11");

  await page.goto("/library");
  await page.getByRole("link", { name: /^Эмоции:/ }).click();
  // The theme page's own mark in its header (the library's drawer row also prints «на паузе», and
  // the word rows below say it in their schedule column once they load).
  await expect(page.getByRole("main").getByText("на паузе", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Вернуть в повторения" }).click();
  await expect(page.getByRole("link", { name: /Повторить тему/ })).toBeVisible();

  await openReview(page);
  await expect(page.getByText("00 / 11", { exact: true })).toBeVisible();
});
