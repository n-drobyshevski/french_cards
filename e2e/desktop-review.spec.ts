import { expect, test, type Page } from "@playwright/test";
import { motionSettled, openReview, questionCard } from "./fixtures";
import { slowDatabase } from "./review-loading";

// Desktop review (mockups/DESKTOP-SPEC.md §5 #1–#4): running head, the landscape index card centred
// in the content area, grade buttons with key caps, the hint line, practice and «Готово на сегодня».
// Runs in the desktop-chromium project (1440×800, mouse).

const answerCard = (page: Page) => page.locator("[data-review-answer]");
const grades = (page: Page) => page.getByRole("group", { name: "Оценка" });
const doneHeading = (page: Page) => page.getByRole("heading", { name: "Готово на сегодня" });

/** Content area right of the 248px sidebar. */
const CONTENT = { left: 248, width: 1440 - 248 };

test("loading: the placeholder is the index card at its final place under the drawn running head (R1)", async ({ page }) => {
  await slowDatabase(page, 1500);
  await page.goto("/");
  const placeholder = page.locator("[data-review-placeholder]");
  await expect(placeholder).toBeVisible();
  const slot = (await placeholder.boundingBox())!;
  expect(slot.width).toBe(720);
  expect(slot.height).toBe(432);
  await expect(page.getByRole("button", { name: "Все клавиши" })).toBeVisible();
  await expect(placeholder.locator(".delayed-in").first()).toHaveCSS("opacity", "1");

  await expect(questionCard(page)).toBeVisible();
  await expect(page.getByText("00 / 11", { exact: true })).toBeVisible();
  expect(await questionCard(page).boundingBox()).toEqual(slot);
  // CLS 0 in practice; allow sub-pixel noise (the old placeholder scored > 0.1).
  expect(await page.evaluate(() => window.__cls)).toBeLessThan(0.001);
});

test("the card is a 720×432 index card centred under the running head", async ({ page }) => {
  await openReview(page);
  const card = questionCard(page);
  const box = (await card.boundingBox())!;
  expect(box.width).toBe(720);
  expect(box.height).toBe(432);
  expect(box.width).toBeLessThanOrEqual(800);
  expect(Math.abs(box.x + box.width / 2 - (CONTENT.left + CONTENT.width / 2))).toBeLessThan(1);
  expect(box.y).toBeGreaterThan(56);

  // Call number in the card header, desktop footer copy with the Space cap, the hint line.
  await expect(card.getByText(/^FR · № \d{3}$/)).toBeVisible();
  await expect(card.getByText("Щелчок или")).toBeVisible();
  await expect(card.locator("kbd", { hasText: "Пробел" })).toBeVisible();
  await expect(page.getByText("после переворота:")).toBeVisible();

  // Running head: counts and progress on one line, «?» opens «Клавиши».
  await expect(page.getByText("11 новых", { exact: true })).toBeVisible();
  await expect(page.getByText("00 / 11", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Настройки" }).filter({ visible: true })).toHaveCount(1); // only the sidebar's
  await page.getByRole("button", { name: "Все клавиши" }).click();
  await expect(page.getByRole("dialog", { name: "Клавиши" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Клавиши" })).toBeHidden();
});

test("a click flips both ways without moving the card; keys 1/2/3 grade, with caps on the buttons", async ({ page }) => {
  await openReview(page);
  const before = await questionCard(page).boundingBox();
  await questionCard(page).click();
  await expect(answerCard(page)).toBeVisible();
  await page.waitForTimeout(300); // the turn animation
  expect(await answerCard(page).boundingBox()).toEqual(before);

  for (const [name, cap] of [
    [/^Не знаю/, "1"],
    [/^Сложно/, "2"],
    [/^Знаю/, "3"],
  ] as const) {
    const button = grades(page).getByRole("button", { name });
    await expect(button.locator("kbd")).toHaveText(cap);
    await expect(button.locator("kbd")).toBeVisible();
  }
  await expect(page.getByText("не знаю / знаю")).toBeVisible();

  // A click on the answer turns it back to the question.
  await answerCard(page).click({ position: { x: 600, y: 300 } });
  await expect(answerCard(page)).toHaveCount(0);
  await expect(questionCard(page)).toBeVisible();

  // Space flips, 3 grades «Знаю» with no snackbar (undo is in the running head); Z undoes,
  // and the «Ответ отменён» snackbar floats centred in the content area.
  await page.keyboard.press("Space");
  await expect(answerCard(page)).toBeVisible();
  await page.keyboard.press("3");
  await expect(page.getByText("01 / 11", { exact: true })).toBeVisible();
  await expect(page.locator("[data-snackbar]")).toHaveCount(0);

  await page.keyboard.press("z");
  await expect(page.getByText("00 / 11", { exact: true })).toBeVisible();
  const snackbar = page.locator("[data-snackbar]");
  await expect(snackbar).toContainText(/^Ответ отменён/);
  await motionSettled(page);
  const snackBox = (await snackbar.boundingBox())!;
  expect(snackBox.height).toBe(44);
  expect(snackBox.width).toBeLessThanOrEqual(480);
  expect(Math.abs(snackBox.x + snackBox.width / 2 - (CONTENT.left + CONTENT.width / 2))).toBeLessThan(1);
});

test("with a mouse, dragging the answer does not grade it", async ({ page }) => {
  await openReview(page);
  await questionCard(page).click();
  const box = (await answerCard(page).boundingBox())!;
  const y = box.y + box.height * 0.6;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 320, y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  await expect(page.getByText("00 / 11", { exact: true })).toBeVisible();
  await expect(page.locator("[data-snackbar]")).toHaveCount(0);
});

test("«Готово на сегодня»: focus on «Повторить ошибки», P starts practice, Esc ends it", async ({ page }) => {
  await openReview(page);
  const done = doneHeading(page);
  // Answer every card from the keyboard: the first one «Не знаю», the rest «Знаю».
  for (let i = 0; i < 60; i++) {
    await expect(questionCard(page).or(done)).toBeVisible();
    if (await done.isVisible()) break;
    await page.keyboard.press("Space");
    await expect(answerCard(page)).toBeVisible();
    await page.keyboard.press(i === 0 ? "1" : "3");
    await expect(answerCard(page)).toHaveCount(0);
  }
  await expect(done).toBeVisible();

  const repeat = page.getByRole("button", { name: /^Повторить ошибки \(\d+\)$/ });
  await expect(repeat).toBeFocused();
  const practice = page.getByRole("button", { name: /Ещё практика/ });
  await expect(practice.locator("kbd")).toHaveText("P");
  await expect(page.getByRole("button", { name: /Добавить слова/ }).locator("kbd")).toHaveText("N");
  await expect(page.getByRole("heading", { name: "Трудные" })).toBeVisible();

  await page.waitForTimeout(450); // keys are ignored right after the screen changes
  await page.keyboard.press("p");
  const endPractice = page.getByRole("button", { name: "Закончить практику" });
  await expect(endPractice).toBeVisible();
  await expect(page.getByText("Практика · не влияет на расписание")).toBeVisible();
  await expect(page.getByText("закончить практику", { exact: true })).toBeVisible();

  await page.waitForTimeout(450);
  await page.keyboard.press("Escape");
  await expect(done).toBeVisible();
  await expect(repeat).toBeFocused();

  // ↵ presses the focused «Повторить ошибки»: one mistake to practise, then the round ends.
  await page.waitForTimeout(450);
  await page.keyboard.press("Enter");
  await expect(endPractice).toBeVisible();
  await page.waitForTimeout(450);
  await page.keyboard.press("Space");
  await expect(answerCard(page)).toBeVisible();
  await page.keyboard.press("3");
  await expect(page.getByText("Практика окончена")).toBeVisible();
  await expect(done).toBeVisible();
});

test("medium width: rail, 640×384 card", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await openReview(page);
  const box = (await questionCard(page).boundingBox())!;
  expect(box.width).toBe(640);
  expect(box.height).toBe(384);
  expect(Math.abs(box.x + box.width / 2 - (72 + (1024 - 72) / 2))).toBeLessThan(1);
  await expect(page.getByText("после переворота:")).toBeVisible();

  // Under 760 tall the hint line goes away.
  await page.setViewportSize({ width: 1024, height: 700 });
  await expect(page.getByText("после переворота:")).toBeHidden();
});
