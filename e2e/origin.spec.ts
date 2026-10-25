import { expect, test, type Page } from "@playwright/test";
import { mockFill, openReview, questionCard } from "./fixtures";

// «Происхождение» (word.origin, written from the chat): in library rows and on the card's answer
// side, hidden with Settings → «Оформление» → «Происхождение слов».

const ORIGIN = "от blaguer „шутить“";

/** Writes an origin on the seeded word straight into IndexedDB, as a sync from the chat would. */
async function setOrigin(page: Page, fr: string, origin: string) {
  await patchWord(page, fr, { origin });
}

/** Changes the seeded word straight in IndexedDB. */
async function patchWord(page: Page, fr: string, patch: Record<string, unknown>) {
  await page.evaluate(
    ([word, changes]) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("kartochki");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction(["words"], "readwrite");
          const store = tx.objectStore("words");
          const all = store.getAll();
          all.onsuccess = () => {
            const w = (all.result as { fr: string; deleted_at: string | null }[]).find((x) => x.fr === word && !x.deleted_at);
            if (w) store.put({ ...w, ...changes });
          };
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    [fr, patch] as const,
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
  // Phones: the origin is under «Ещё · …» at the card's foot.
  await page.locator("[data-review-answer]").getByRole("button", { name: /^Ещё/ }).click();
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
  // Empty, the field is not shown: «+ Поле» under «Ещё» offers it (a noun: no «Спряжение»).
  await expect(card.getByRole("button", { name: "Изменить происхождение" })).toHaveCount(0);
  await card.getByRole("button", { name: /^Ещё\s?·/ }).click();
  await card.getByRole("button", { name: "Поле", exact: true }).click();
  const menu = page.getByRole("menu", { name: "Какое поле" });
  await expect(menu.getByRole("menuitem")).toHaveText([/^Заметка/, /^Происхождение/, /^Своё поле/]);
  await menu.getByRole("menuitem", { name: /^Происхождение/ }).click();
  await card.getByRole("textbox", { name: "Происхождение" }).fill("  от blaguer   „шутить“ ");
  await card.getByRole("button", { name: "Сохранить" }).click();
  await expect(card.getByText(ORIGIN)).toBeVisible();
  await expect(card.getByRole("textbox", { name: "Происхождение" })).toHaveCount(0);
  // Filled, its text is the edit button and it is no longer in the menu.
  await expect(card.getByRole("button", { name: "Изменить происхождение" })).toBeVisible();
  await card.getByRole("button", { name: "Поле", exact: true }).click();
  await expect(page.getByRole("menu", { name: "Какое поле" }).getByRole("menuitem")).toHaveText([/^Заметка/, /^Своё поле/]);
  await page.getByRole("menu", { name: "Какое поле" }).getByRole("menuitem", { name: /^Своё поле/ }).click();
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
  await card.getByRole("button", { name: /^Ещё\s?·/ }).click();
  await expect(card.getByText("je me casse · tu te casses · il se casse…")).toBeVisible();
  await expect(card.getByText("из словаря · être")).toBeVisible();
  // «Все формы»: a card per tense, the endings apart.
  await card.getByRole("button", { name: "Все формы — 4 времени" }).click();
  await expect(card.getByRole("article", { name: "Futur" })).toContainText("ils se casseront");
  await card.getByRole("button", { name: "Свернуть" }).click();
  await expect(card.getByRole("article", { name: "Futur" })).toHaveCount(0);
  // The eye beside «Изменить» («Проверь себя») opens all the forms behind blanks; «Выйти» shows them.
  await card.getByRole("button", { name: "Проверь себя" }).click();
  await expect(card.getByRole("button", { name: "Проверь себя" })).toHaveAttribute("aria-pressed", "true");
  await expect(card.getByRole("article", { name: "Futur" }).getByRole("button", { name: /^Показать форму/ })).toHaveCount(6);
  await card.getByRole("article", { name: "Futur" }).getByRole("button", { name: "Показать форму: ils se" }).click();
  await expect(card.getByText("открыто 1 из 24", { exact: false })).toBeVisible();
  await card.getByRole("button", { name: "Выйти" }).click();
  await expect(card.getByRole("article", { name: "Futur" })).toContainText("ils se casseront");
  await card.getByRole("button", { name: "Свернуть" }).click();

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

test("«Заполнить автоматически» fills the origin and a conjugation the dictionary lacks", async ({ page }) => {
  const asked: string[] = [];
  const forms = (stem: string) => ["je", "tu", "il", "nous", "vous", "ils"].map((p) => `${p} ${stem}`);
  await mockFill(
    page,
    (body) =>
      body.field === "origin"
        ? "верлан от choper „поймать“"
        : { auxiliary: "avoir", remark: null, tenses: { present: forms("pécho"), passe_compose: forms("a pécho"), imparfait: forms("péchait"), futur: forms("va pécho") } },
    (body) => asked.push(`${body.field}:${body.fr}`),
  );
  await openReview(page);
  // A verb the dictionary does not know: «+ Поле» offers «Спряжение».
  await patchWord(page, "une blague", { fr: "pécho", ru: "склеить, снять", pos: "verb", gender: "none" });
  await page.goto("/library");
  await page.getByRole("searchbox", { name: "Поиск по FR и RU" }).fill("pécho");
  await page.getByText("pécho", { exact: true }).click();
  const card = page.getByRole("dialog", { name: "Карточка слова" });

  await card.getByRole("button", { name: /^Ещё\s?·/ }).click();
  await card.getByRole("button", { name: "Поле", exact: true }).click();
  await page.getByRole("menu", { name: "Какое поле" }).getByRole("menuitem", { name: /^Происхождение/ }).click();
  await card.getByRole("button", { name: "Заполнить автоматически" }).click();
  await expect(card.getByRole("textbox", { name: "Происхождение" })).toHaveValue("верлан от choper „поймать“");
  await card.getByRole("button", { name: "Сохранить" }).click();
  await expect(card.getByText("верлан от choper „поймать“")).toBeVisible();

  await card.getByRole("button", { name: "Поле", exact: true }).click();
  await page.getByRole("menu", { name: "Какое поле" }).getByRole("menuitem", { name: /^Спряжение/ }).click();
  await expect(card.getByRole("textbox", { name: "Présent, je" })).toHaveValue("");
  await card.getByRole("button", { name: "Заполнить автоматически" }).click();
  await expect(card.getByRole("textbox", { name: "Présent, je" })).toHaveValue("je pécho");
  await expect(card.getByRole("textbox", { name: "Futur, ils" })).toHaveValue("ils va pécho");
  await card.getByRole("button", { name: "Сохранить" }).click();
  await expect(card.getByText("своё · avoir")).toBeVisible();
  expect(asked).toEqual(["origin:pécho", "conjugation:pécho"]);
});

test("a verb the dictionary knows has no «Заполнить автоматически» in its conjugation form", async ({ page }) => {
  await openReview(page);
  await page.goto("/library");
  await page.getByRole("searchbox", { name: "Поиск по FR и RU" }).fill("casser");
  await page.getByText("se casser", { exact: true }).click();
  const card = page.getByRole("dialog", { name: "Карточка слова" });
  await card.getByRole("button", { name: /^Ещё\s?·/ }).click();
  await card.getByRole("button", { name: "Изменить спряжение" }).click();
  await expect(card.getByRole("textbox", { name: "Présent, je" })).toHaveValue("je me casse");
  await expect(card.getByRole("button", { name: "Заполнить автоматически" })).toHaveCount(0);
});
