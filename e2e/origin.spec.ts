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

test("the origin is edited by hand in the word card and shows on the answer side", async ({ page }) => {
  await openReview(page);
  await page.goto("/library");
  await page.getByRole("searchbox", { name: "Поиск по FR и RU" }).fill("blague");
  await page.getByText("une blague", { exact: true }).click();
  const card = page.getByRole("dialog", { name: "Карточка слова" });
  // Empty, the field is not shown: «+ Поле» offers it (a noun: no «Спряжение»).
  await expect(card.getByRole("button", { name: "Изменить происхождение" })).toHaveCount(0);
  await card.getByRole("button", { name: "Поле", exact: true }).click();
  const menu = page.getByRole("menu", { name: "Какое поле" });
  await expect(menu.getByRole("menuitem")).toHaveText([/^Происхождение/, /^Своё поле/]);
  await menu.getByRole("menuitem", { name: /^Происхождение/ }).click();
  await card.getByRole("textbox", { name: "Происхождение" }).fill("  от blaguer   „шутить“ ");
  await card.getByRole("button", { name: "Сохранить" }).click();
  await expect(card.getByText(ORIGIN)).toBeVisible();
  await expect(card.getByRole("textbox", { name: "Происхождение" })).toHaveCount(0);
  // Filled, it is a field with its pencil and no longer in the menu.
  await expect(card.getByRole("button", { name: "Изменить происхождение" })).toBeVisible();
  await card.getByRole("button", { name: "Поле", exact: true }).click();
  await expect(page.getByRole("menu", { name: "Какое поле" })).toHaveCount(0);
  await expect(card.getByPlaceholder("Название")).toBeVisible();
  await card.getByRole("button", { name: "Отмена" }).click();

  await openReview(page);
  await questionCard(page).click();
  await expect(page.getByText(ORIGIN)).toBeVisible();
});

test("the conjugation is edited by hand in the word card and goes back to the dictionary's", async ({ page }) => {
  await openReview(page);
  await page.goto("/library");
  await page.getByRole("searchbox", { name: "Поиск по FR и RU" }).fill("casser");
  await page.getByText("se casser", { exact: true }).click();
  const card = page.getByRole("dialog", { name: "Карточка слова" });
  await expect(card.getByText("je me casse · tu te casses · il se casse…")).toBeVisible();
  await expect(card.getByText("из словаря · être")).toBeVisible();

  await card.getByRole("button", { name: "Изменить спряжение" }).click();
  const first = card.getByRole("textbox", { name: "Présent, je" });
  await expect(first).toHaveValue("je me casse");
  await first.fill("");
  await card.getByRole("button", { name: "Сохранить" }).click();
  await expect(card.getByRole("alert")).toHaveText("Заполните все формы — не хватает 1");
  await first.fill("je me tire");
  await card.getByRole("button", { name: "Сохранить" }).click();
  await expect(card.getByText("je me tire · tu te casses · il se casse…")).toBeVisible();
  await expect(card.getByText("своё · être")).toBeVisible();

  await card.getByRole("button", { name: "Изменить спряжение" }).click();
  await card.getByRole("button", { name: "Вернуть из словаря" }).click();
  await expect(card.getByText("из словаря · être")).toBeVisible();
  await expect(card.getByText("je me casse · tu te casses · il se casse…")).toBeVisible();
});
