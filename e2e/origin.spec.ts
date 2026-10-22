import { expect, test, type Page } from "@playwright/test";
import { openReview, questionCard } from "./fixtures";

// «Происхождение» (word.origin, written from the chat): in library rows and on the card's answer
// side, hidden with Settings → «Оформление» → «Происхождение слов».

const ORIGIN = "от blaguer „шутить“";

/** Writes an origin on the seeded word straight into IndexedDB, as a sync from the chat would. */
async function setOrigin(page: Page, fr: string, origin: string) {
  await page.evaluate(
    ([word, text]) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("kartochki");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction(["words"], "readwrite");
          const store = tx.objectStore("words");
          const all = store.getAll();
          all.onsuccess = () => {
            const w = (all.result as { fr: string; deleted_at: string | null }[]).find((x) => x.fr === word && !x.deleted_at);
            if (w) store.put({ ...w, origin: text });
          };
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    [fr, origin] as const,
  );
}

async function libraryRow(page: Page) {
  await page.goto("/library");
  await page.getByRole("searchbox", { name: "Поиск по FR и RU" }).fill("blague");
  return page.getByText("une blague", { exact: true }).locator("xpath=ancestor::*[contains(@class,'h-16')][1]");
}

test("origin shows in the library row and on the answer side, and the setting hides both", async ({ page }) => {
  await openReview(page);
  await setOrigin(page, "une blague", ORIGIN);

  await page.reload();
  await expect(questionCard(page)).toBeVisible();
  await questionCard(page).click();
  await expect(page.getByText("Откуда", { exact: true })).toBeVisible();
  await expect(page.getByText(ORIGIN)).toBeVisible();

  await expect(await libraryRow(page)).toContainText(`· ${ORIGIN}`);

  await page.goto("/settings");
  const toggle = page.getByRole("switch", { name: "Происхождение слов" });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");

  await expect(await libraryRow(page)).not.toContainText(ORIGIN);
  await openReview(page);
  await questionCard(page).click();
  await expect(page.getByText("шутка", { exact: true })).toBeVisible();
  await expect(page.getByText(ORIGIN)).toHaveCount(0);
});
