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

test("an opened day stays inside the screen with a long mistake", async ({ page }) => {
  await openReview(page);
  await questionCard(page).click();
  await page.getByRole("group", { name: "Оценка" }).getByRole("button", { name: /^Не знаю, следующий показ/ }).click();
  await expect(page.getByText("01 / 11", { exact: true })).toBeVisible();
  // The missed word gets a long French phrase, written straight into IndexedDB.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("kartochki");
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(["words", "review_log"], "readwrite");
          const logs = tx.objectStore("review_log").getAll();
          logs.onsuccess = () => {
            const missed = (logs.result as { word_id: string; rating: number }[]).find((l) => l.rating === 1)!;
            const get = tx.objectStore("words").get(missed.word_id);
            get.onsuccess = () => tx.objectStore("words").put({ ...get.result, fr: "s'en battre complètement les couilles avec une mandoline" });
          };
          tx.oncomplete = () => (db.close(), resolve());
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.goto("/progress");
  await page.getByRole("button", { name: /1 повторение, сегодня$/ }).click();
  await expect(page.getByRole("button", { name: /^s'en battre complètement/ })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const collapse = await page.getByRole("button", { name: /^Свернуть/ }).boundingBox();
  expect(collapse!.x + collapse!.width).toBeLessThanOrEqual(390);
});

test("the Library subline shows the words reviewed today and opens «Прогресс»", async ({ page }) => {
  await openReview(page);
  await gradeKnown(page, 2);
  await expect(page.getByText("02 / 11", { exact: true })).toBeVisible();
  await page.goto("/library");
  const today = page.getByRole("link", { name: "Сегодня повторено 2 слова. Прогресс" });
  await expect(today).toHaveText("2 повторено сегодня");
  await today.click();
  await expect(page).toHaveURL(/\/progress$/);
});
