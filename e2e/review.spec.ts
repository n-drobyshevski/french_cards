import { expect, test } from "@playwright/test";
import { mockSuggest, openReview, questionCard, tabBar, type SuggestionWire } from "./fixtures";
import { slowDatabase, watchPlaceholder } from "./review-loading";

test.describe("review", () => {
  test("first run seeds the prototype words and default themes", async ({ page }) => {
    await openReview(page);
    await expect(page.getByText("11 новых", { exact: true })).toBeVisible();
    await expect(page.getByText("00 / 11", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Карточка une blague/ })).toBeVisible();

    await tabBar(page).getByRole("link", { name: "Библиотека" }).click();
    await expect(page.getByRole("heading", { name: "Библиотека" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Все слова: 11", exact: true })).toBeVisible();
    for (const theme of ["Повседневное", "Деньги", "Еда", "Полиция", "Тусовка", "Эмоции", "Люди"]) {
      await expect(page.getByRole("link", { name: new RegExp(`^${theme}:`) })).toBeVisible();
    }

    // Reloading does not seed twice.
    await page.reload();
    await expect(page.getByRole("button", { name: "Все слова: 11", exact: true })).toBeVisible();
  });

  test("flip a card, grade it and undo the grade", async ({ page }) => {
    await openReview(page);
    const undo = page.getByRole("button", { name: "Отменить последний ответ" });
    await expect(undo).toBeDisabled();

    await questionCard(page).click();
    await expect(page.getByText("шутка", { exact: true })).toBeVisible();
    const grades = page.getByRole("group", { name: "Оценка" });
    await expect(grades.getByRole("button")).toHaveCount(3);
    await expect(grades.getByRole("button", { name: /^Не знаю, следующий показ/ })).toBeVisible();
    await expect(grades.getByRole("button", { name: /^Сложно, следующий показ/ })).toBeVisible();

    await grades.getByRole("button", { name: /^Знаю, следующий показ/ }).click();
    await expect(page.getByText("01 / 11", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Карточка une blague/ })).toHaveCount(0);
    await expect(questionCard(page)).toBeVisible();
    await expect(page.locator("[data-snackbar]")).toHaveCount(0);

    // Undo from the header button: the same card comes back unanswered and the count resets.
    await expect(undo).toBeEnabled();
    await undo.click();
    await expect(page.getByText("00 / 11", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Карточка une blague/ })).toBeVisible();
    await expect(undo).toBeDisabled();
  });

  test("Space/1-3 work from the keyboard, Z undoes", async ({ page }) => {
    await openReview(page);
    await page.keyboard.press("Space");
    await expect(page.getByText("шутка", { exact: true })).toBeVisible();
    await page.keyboard.press("1");
    await expect(page.getByText("01 / 11", { exact: true })).toBeVisible();
    await page.keyboard.press("z");
    await expect(page.getByText("00 / 11", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Карточка une blague/ })).toBeVisible();
  });
});

test.describe("review focus", () => {
  test("keyboard reveal moves focus to the answer; grading moves it to the next question card", async ({ page }) => {
    await openReview(page);
    const reveal = questionCard(page);
    await reveal.focus();
    await page.keyboard.press("Enter");
    const answer = page.getByRole("article", { name: "une blague — шутка" });
    await expect(answer).toBeVisible();
    await expect(answer).toBeFocused();

    const good = page.getByRole("group", { name: "Оценка" }).getByRole("button", { name: /^Знаю, следующий показ/ });
    await good.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("01 / 11", { exact: true })).toBeVisible();
    await expect(questionCard(page)).toBeFocused();
  });
});

test("flipping does not move or resize the card; hidden grade buttons are unreachable before it", async ({ page }) => {
  await openReview(page);
  const before = await questionCard(page).boundingBox();
  await expect(page.getByRole("group", { name: "Оценка" })).toHaveCount(0);
  await expect(page.locator("[data-review-focus][inert]")).toHaveCount(1);

  await questionCard(page).click();
  const answer = page.locator("[data-review-answer]");
  await expect(page.getByRole("group", { name: "Оценка" })).toBeVisible();
  await page.waitForTimeout(300); // let the turn animation finish before measuring
  const after = await answer.boundingBox();
  expect(after).toEqual(before);
});

test("a tap on an abbreviation on the answer explains it instead of flipping the card", async ({ page }) => {
  await openReview(page);
  await questionCard(page).click();
  const answer = page.locator("[data-review-answer]");
  await expect(answer).toBeVisible();
  const abbr = answer.getByRole("button", { name: / — / }).first();
  await abbr.click();
  await expect(answer.getByRole("tooltip")).toBeVisible();
  await expect(answer).toBeVisible();
  // The hint stays on screen.
  const box = (await answer.getByRole("tooltip").boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(15);
  expect(box.x + box.width).toBeLessThanOrEqual(390 - 15);
  // A tap elsewhere on the card closes the hint and flips the card back as usual.
  await answer.click({ position: { x: 40, y: 300 } });
  await expect(answer).toHaveCount(0);
});

test.describe("loading and moving on (MOTION-SPEC R1, R2, R9)", () => {
  test("the loading placeholder has the card's final geometry; bars only after 300 ms; nothing shifts", async ({ page }) => {
    await slowDatabase(page, 1500);
    await page.goto("/");
    const placeholder = page.locator("[data-review-placeholder]");
    await expect(placeholder).toBeVisible();
    const slot = (await placeholder.boundingBox())!;
    const gradeSlot = (await page.locator("[data-review-focus][inert]").boundingBox())!;
    // Blank first; the two static bars fade in after --loading-delay.
    const bars = placeholder.locator(".delayed-in");
    await expect(bars).toHaveCount(2);
    await expect(bars.first()).toHaveCSS("opacity", "1");

    await expect(questionCard(page)).toBeVisible();
    await expect(placeholder).toHaveCount(0);
    await expect(page.getByText("00 / 11", { exact: true })).toBeVisible();
    expect(await questionCard(page).boundingBox()).toEqual(slot);
    expect(await page.locator("[data-review-focus][inert]").boundingBox()).toEqual(gradeSlot);
    // CLS 0 in practice; allow sub-pixel noise (the old placeholder scored > 0.1).
    expect(await page.evaluate(() => window.__cls)).toBeLessThan(0.001);
  });

  test("grading and undo go straight to the next card, with no blank card in between", async ({ page }) => {
    await openReview(page);
    await watchPlaceholder(page);
    await page.keyboard.press("Space");
    await expect(page.getByText("шутка", { exact: true })).toBeVisible();
    await page.keyboard.press("3");
    await expect(page.getByText("01 / 11", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Карточка une blague/ })).toHaveCount(0);

    // A button grade, then two undos back to the first card.
    const second = (await questionCard(page).getAttribute("aria-label"))!;
    await questionCard(page).click();
    await page.getByRole("group", { name: "Оценка" }).getByRole("button", { name: /^Не знаю, следующий показ/ }).click();
    await expect(page.locator("[data-review-answer]")).toHaveCount(0);
    await expect(questionCard(page)).toBeVisible();

    await page.keyboard.press("z");
    await expect(page.getByRole("button", { name: second })).toBeVisible();
    await page.keyboard.press("z");
    await expect(page.getByText("00 / 11", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Карточка une blague/ })).toBeVisible();
    expect(await page.evaluate(() => window.__placeholderSeen)).toBe(false);
  });

  test("the review snackbar overlays the card's footer above the grade bar; the card keeps its size", async ({ page }) => {
    await openReview(page);
    await page.keyboard.press("Space");
    await page.keyboard.press("3");
    await expect(page.getByText("01 / 11", { exact: true })).toBeVisible();
    const before = (await questionCard(page).boundingBox())!;

    await page.keyboard.press("z");
    const bar = page.locator("[data-snackbar]", { hasText: "Ответ отменён" });
    await expect(bar).toBeVisible();
    await expect(page.getByRole("button", { name: /Карточка une blague/ })).toBeVisible();
    await expect(async () => {
      const card = (await questionCard(page).boundingBox())!;
      const box = (await bar.boundingBox())!;
      const grades = (await page.locator("[data-review-focus][inert]").boundingBox())!;
      expect(card).toEqual(before);
      expect(box.y + box.height).toBeCloseTo(grades.y - 8, 0);
      expect(box.y).toBeLessThan(card.y + card.height);
    }).toPass();
  });
});

test.describe("editing from review (canvas «Повторение — правка карточки», A)", () => {
  test("edit the card from its answer side: a translation is proposed, the card is not graded", async ({ page }) => {
    const vanne: SuggestionWire = {
      fr: "une vanne",
      ru: "прикол, подкол",
      note: null,
      example_fr: null,
      example_ru: null,
      pos: "noun",
      gender: "f",
      slang_level: 1,
      verlan: false,
      folder: "INBOX",
      folder_alternatives: [],
      new_folder: null,
      confidence: "high",
    };
    const asked: string[] = [];
    await mockSuggest(page, [vanne], (body) => asked.push((body as { q: string }).q));
    await openReview(page);

    // Only the answer side has the pencil.
    await expect(page.getByRole("button", { name: "Изменить карточку" })).toHaveCount(0);
    await questionCard(page).click();
    await page.getByRole("button", { name: "Изменить карточку" }).click();
    const sheet = page.getByRole("dialog", { name: "Карточка слова" });
    await expect(sheet).toBeVisible();
    // Review keys stay quiet while the sheet is open.
    await page.keyboard.press("3");
    await expect(page.getByText("00 / 11", { exact: true })).toBeVisible();

    await sheet.getByRole("button", { name: "Изменить слово и перевод" }).click();
    await sheet.getByLabel("Французский").fill("une vanne");
    const proposal = sheet.getByRole("status").filter({ hasText: "Вариант" });
    await expect(proposal).toContainText("прикол, подкол");
    expect(asked).toContain("une vanne");
    await proposal.getByRole("button", { name: "Подставить" }).click();
    await expect(sheet.getByLabel("Русский")).toHaveValue("прикол, подкол");
    // What the field says is not proposed again.
    await expect(sheet.getByText("прикол, подкол", { exact: true })).toHaveCount(0);
    await sheet.getByRole("button", { name: "Сохранить" }).click();
    await sheet.getByRole("button", { name: "Закрыть" }).click();
    await expect(sheet).toHaveCount(0);

    // Back on the same card, still unanswered, with the new text.
    const answer = page.locator("[data-review-answer]");
    await expect(answer.getByRole("heading", { name: "une vanne" })).toBeVisible();
    await expect(answer.getByText("прикол, подкол", { exact: true })).toBeVisible();
    await expect(page.getByText("00 / 11", { exact: true })).toBeVisible();

    // E opens it again from the keyboard.
    await page.keyboard.press("e");
    await expect(sheet).toBeVisible();
  });
});
