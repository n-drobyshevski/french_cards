import { expect, test } from "@playwright/test";
import { enriched, mockClassifyAssign, mockEnrich } from "./fixtures";

test("library search matches French and Russian, ignoring accents", async ({ page }) => {
  await page.goto("/library");
  await expect(page.getByRole("button", { name: "Все слова: 11", exact: true })).toBeVisible();
  const search = page.getByRole("searchbox", { name: "Поиск по FR и RU" });

  await search.fill("depeche");
  const results = page.getByRole("region", { name: "Слова" }).or(page.locator("section[aria-label='Слова']"));
  await expect(results.getByText("dépêche-toi", { exact: true })).toBeVisible();
  await expect(results.getByText("une blague", { exact: true })).toHaveCount(0);

  await search.fill("копы");
  await expect(results.getByText("les flics", { exact: true })).toBeVisible();
  await expect(results.getByText("dépêche-toi", { exact: true })).toHaveCount(0);

  await search.fill("zzzz");
  await expect(page.getByText(/Ничего не нашлось|не найдено/i).first()).toBeVisible();
});

test("a theme opens with its words and «Повторить тему» filters review to it", async ({ page }) => {
  await page.goto("/library");
  await page.getByRole("link", { name: /^Эмоции:/ }).click();
  await expect(page.getByRole("heading", { name: "Эмоции" })).toBeVisible();
  await expect(page.getByText("c'est dur", { exact: true })).toBeVisible();
  await expect(page.getByText("je vais me tuer", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Повторить тему" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: "Эмоции" })).toBeVisible();
  await expect(page.getByText("00 / 02", { exact: true })).toBeVisible();
});

test("an undo snackbar raised inside the word sheet is part of the sheet", async ({ page }) => {
  await page.goto("/library");
  await page.getByRole("searchbox", { name: "Поиск по FR и RU" }).fill("flics");
  await page.getByText("les flics", { exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Карточка слова" });
  await expect(sheet).toBeVisible();

  // Phones (L-Word-B): the rare actions are behind the sheet's «⋯».
  await sheet.getByRole("button", { name: /^Действия со словом/ }).click();
  await page.getByRole("button", { name: /^Сбросить прогресс/ }).click();
  await expect(sheet.getByText("Прогресс сброшен")).toBeVisible();
  const undo = sheet.getByRole("button", { name: "Отменить", exact: true });
  await undo.focus();
  await expect(undo).toBeFocused();
});

test("«Дополнить карточки» proposes examples, applies the checked ones and undoes them", async ({ page }) => {
  await mockEnrich(page, (w) => enriched(w));
  await page.goto("/library");
  // The chores are folded into «Уход за карточками».
  await page.getByRole("button", { name: /^Уход за карточками/ }).click();
  await page.getByRole("button", { name: /Дополнить карточки/ }).click();
  const sheet = page.getByRole("dialog", { name: "Дополнить карточки" });
  await expect(sheet.getByRole("region", { name: /^Примеры:/ }).or(sheet.locator("section[aria-label^='Примеры:']"))).toBeVisible();
  await expect(sheet.getByText("Exemple avec les flics.")).toBeVisible();

  // Uncheck one example: it is not written.
  await sheet.getByRole("checkbox", { name: /les flics/ }).click();
  const apply = sheet.getByRole("button", { name: /Применить/ });
  await expect(apply).toBeEnabled();
  await apply.click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText(/^Обновлено \d+ слов/)).toBeVisible();

  const search = page.getByRole("searchbox", { name: "Поиск по FR и RU" });
  await page.getByRole("button", { name: "Отменить", exact: true }).click();
  await expect(page.getByText("Изменения отменены")).toBeVisible();
  await search.fill("flics");
  await page.getByText("les flics", { exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Карточка слова" }).getByText("Exemple avec les flics.")).toHaveCount(0);
});

test("the library shows theme drawers or every word, and remembers the choice", async ({ page }) => {
  await page.goto("/library");
  const all = page.getByRole("button", { name: "Все слова: 11", exact: true });
  await expect(page.getByRole("link", { name: /^Эмоции:/ })).toBeVisible();
  // A drawer is a table-of-contents row: course number, name, count.
  await expect(page.getByRole("link", { name: /^Эмоции:/ })).toContainText(/^06Эмоции2$/);

  await all.click();
  await expect(all).toHaveCount(0);
  await expect(page.getByText("Все слова · 11")).toBeVisible();
  const list = page.getByRole("list", { name: "Все слова" });
  await expect(list.getByText("les flics", { exact: true })).toBeVisible();
  await expect(list.getByText("dépêche-toi", { exact: true })).toBeVisible();
  await expect(list.getByRole("listitem")).toHaveCount(11);
  await expect(page.getByRole("link", { name: /^Эмоции:/ })).toHaveCount(0);

  // Remembered on this device.
  await page.reload();
  await expect(page.getByText("Все слова · 11")).toBeVisible();

  // A search narrows the list.
  await page.getByRole("searchbox", { name: "Поиск по FR и RU" }).fill("flics");
  await expect(page.getByText("Найдено 1 слово")).toBeVisible();
  await page.getByRole("button", { name: "Очистить поиск" }).click();

  await page.getByRole("button", { name: "К темам" }).click();
  await expect(page.getByRole("link", { name: /^Эмоции:/ })).toBeVisible();
  // The «Все слова» row opens the list again.
  await page.getByRole("button", { name: "Все слова: 11", exact: true }).click();
  await expect(page.getByText("Все слова · 11")).toBeVisible();
});

test("the subline leaves out zero counts, the filter sheet narrows and orders the list", async ({ page }) => {
  await page.goto("/library");
  // The search sits at the bottom, right above the tab bar.
  const search = page.getByRole("searchbox", { name: "Поиск по FR и RU" });
  const tabs = page.getByRole("navigation", { name: "Основная навигация" });
  const [searchBox, tabsBox] = await Promise.all([search.boundingBox(), tabs.boundingBox()]);
  expect(searchBox!.y + searchBox!.height).toBeLessThanOrEqual(tabsBox!.y);
  expect(tabsBox!.y - (searchBox!.y + searchBox!.height)).toBeLessThan(40);

  // Nothing is due or difficult on a new device: no «0 к повт.», no subline at all (its toggles and
  // long-press menu: exercise-scope.spec.ts).
  await expect(page.getByRole("link", { name: /^Эмоции:/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^К повторению:/ })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Быстрый фильтр" })).toHaveCount(0);

  await page.getByRole("button", { name: "Фильтр и порядок" }).click();
  const sheet = page.getByRole("dialog", { name: "Фильтр и порядок" });
  await sheet.getByRole("radiogroup", { name: "Тема" }).getByRole("radio", { name: "Эмоции" }).click();
  await expect(sheet.getByRole("button", { name: "Показать 2 слова" })).toBeVisible();
  await sheet.getByRole("checkbox", { name: "fam." }).click();
  await sheet.getByRole("button", { name: "Показать 1 слово" }).click();
  await expect(sheet).toBeHidden();

  await expect(page.getByText("Найдено 1 слово · Эмоции")).toBeVisible();
  await expect(page.getByRole("list", { name: "Найденные слова" }).getByText("je vais me tuer", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Фильтр и порядок, выбрано: 2" })).toBeVisible();

  await page.getByRole("button", { name: "Сбросить фильтр" }).click();
  await expect(page.getByRole("link", { name: /^Эмоции:/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Фильтр и порядок", exact: true })).toBeVisible();

  // The order alone opens the whole list in that order.
  await page.getByRole("button", { name: "Фильтр и порядок" }).click();
  await sheet.getByRole("radio", { name: "По алфавиту" }).click();
  await sheet.getByRole("button", { name: "Показать 11 слов" }).click();
  await expect(page.getByRole("list", { name: "Все слова" }).getByRole("listitem").first()).toContainText("arrête");
});

test("a tap on an abbreviation in the word sheet explains it", async ({ page }) => {
  await page.goto("/library");
  await page.getByRole("searchbox", { name: "Поиск по FR и RU" }).fill("flics");
  await page.getByText("les flics", { exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Карточка слова" });

  await sheet.getByRole("button", { name: "n. m. — nom masculin" }).click();
  const hint = sheet.getByRole("tooltip");
  await expect(hint).toContainText("Существительное мужского рода");
  await expect(sheet.getByRole("button", { name: "n. m. — nom masculin" })).toHaveAttribute("aria-expanded", "true");

  // The slang level explains itself too; one hint at a time.
  await sheet.getByRole("button", { name: "fam. — familier" }).click();
  await expect(sheet.getByRole("tooltip")).toHaveCount(1);
  await expect(sheet.getByRole("tooltip")).toContainText("Разговорное");

  // Escape closes the hint, not the sheet.
  await page.keyboard.press("Escape");
  await expect(sheet.getByRole("tooltip")).toHaveCount(0);
  await expect(sheet).toBeVisible();
});

/** A held finger: touch start, wait past the long-press delay, touch end (CDP, like a real phone). */
async function longPress(page: import("@playwright/test").Page, locator: import("@playwright/test").Locator) {
  const box = (await locator.boundingBox())!;
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
  await page.waitForTimeout(700);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

test("a long press on a theme opens its actions instead of the theme", async ({ page }) => {
  await page.goto("/library");
  const tile = page.getByRole("link", { name: /^Эмоции:/ });
  await longPress(page, tile);

  const menu = page.getByRole("dialog", { name: "Эмоции" });
  await expect(menu).toBeVisible();
  await expect(page).toHaveURL(/\/library$/);
  await expect(menu.getByRole("link", { name: /Повторить тему/ })).toBeVisible();
  await expect(menu.getByRole("switch", { name: "Закрепить тему" })).toBeVisible();

  await menu.getByRole("link", { name: "Открыть тему" }).click();
  await expect(page.getByRole("heading", { name: "Эмоции" })).toBeVisible();
  await expect(page).toHaveURL(/\/library\/.+/);
});

test("deleting a theme from its long-press menu can be undone", async ({ page }) => {
  await page.goto("/library");
  // The context-menu event (Android's long press, the keyboard's menu key) opens the menu too.
  await page.getByRole("link", { name: /^Еда:/ }).dispatchEvent("contextmenu");
  const menu = page.getByRole("dialog", { name: "Еда" });
  await menu.getByRole("button", { name: "Удалить тему" }).click();
  await expect(menu).toBeHidden();

  await expect(page.getByText("Тема «Еда» удалена · 1 слово во «Входящих»")).toBeVisible();
  await expect(page.getByRole("link", { name: /^Еда:/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Входящие:/ })).toBeVisible();

  await page.getByRole("button", { name: "Отменить", exact: true }).click();
  await expect(page.getByRole("link", { name: /^Еда:/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Входящие:/ })).toHaveCount(0);
});

test("«Название, описание и цвет» from the long-press menu renames the theme", async ({ page }) => {
  await page.goto("/library");
  await longPress(page, page.getByRole("link", { name: /^Полиция:/ }));
  await page.getByRole("dialog", { name: "Полиция" }).getByRole("button", { name: "Название, описание и цвет" }).click();
  const form = page.getByRole("dialog", { name: "Изменить тему" });
  const name = form.getByRole("textbox").first();
  await name.fill("Менты");
  await form.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByRole("link", { name: /^Менты:/ })).toBeVisible();
});

test("«Расформировать» spreads a theme's words over the other themes and can be undone", async ({ page }) => {
  const sent: string[][] = [];
  await mockClassifyAssign(page, (w, folders) => (w.fr === "je vais me tuer" ? folders.find((f) => f.name === "Повседневное")!.slug : "INBOX"), {
    onRequest: (body) => sent.push(body.folders.map((f) => f.name)),
  });
  await page.goto("/library");
  await longPress(page, page.getByRole("link", { name: /^Эмоции:/ }));
  await page.getByRole("dialog", { name: "Эмоции" }).getByRole("button", { name: /Расформировать/ }).click();

  const sheet = page.getByRole("dialog", { name: "Расформировать «Эмоции»" });
  await expect(sheet.getByRole("region", { name: "Повседневное: 1 слово" })).toBeVisible();
  await expect(sheet.getByRole("region", { name: "Входящие: 1 слово" })).toBeVisible();
  // The theme itself is not offered as a target.
  expect(sent[0]).not.toContain("Эмоции");

  // «c'est dur» goes to «Еда» by hand.
  await sheet.getByRole("button", { name: "c'est dur — изменить тему" }).click();
  await page.getByRole("dialog", { name: "Куда переместить" }).getByRole("radio", { name: /Еда/ }).click();
  await expect(sheet.getByRole("region", { name: "Еда: 1 слово" })).toBeVisible();
  await expect(sheet.getByText("вручную")).toBeVisible();

  await sheet.getByRole("button", { name: "Расформировать" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText("Тема «Эмоции» расформирована · 2 слова в других темах")).toBeVisible();
  await expect(page.getByRole("link", { name: /^Эмоции:/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Еда: 2 слова/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Повседневное: 8 слов/ })).toBeVisible();

  await page.getByRole("button", { name: "Отменить", exact: true }).click();
  await expect(page.getByRole("link", { name: /^Эмоции: 2 слова/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Еда: 1 слово/ })).toBeVisible();
});

test("without suggestions «Расформировать» can still send every word to «Входящие»", async ({ page }) => {
  await mockClassifyAssign(page, () => "INBOX", { status: 503 });
  await page.goto("/library");
  await page.getByRole("link", { name: /^Эмоции:/ }).click();
  await expect(page.getByRole("heading", { name: "Эмоции" })).toBeVisible();
  await page.getByRole("button", { name: "Ещё действия с темой" }).click();
  await page.getByRole("dialog", { name: "Эмоции" }).getByRole("button", { name: /Расформировать/ }).click();

  const sheet = page.getByRole("dialog", { name: "Расформировать «Эмоции»" });
  await expect(sheet.getByRole("alert")).toContainText("недоступна");
  await sheet.getByRole("button", { name: "Всё во «Входящие»" }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByText("Тема «Эмоции» расформирована · 2 во «Входящих»")).toBeVisible();
  await expect(page.getByRole("link", { name: /^Входящие:/ })).toBeVisible();
});

test("«Тренировка всей темы» runs every card of the theme without touching the schedule", async ({ page }) => {
  await page.goto("/library");
  await longPress(page, page.getByRole("link", { name: /^Эмоции:/ }));
  await page.getByRole("dialog", { name: "Эмоции" }).getByRole("link", { name: "Тренировка всей темы" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Тренировка темы · не влияет на расписание")).toBeVisible();
  await expect(page.getByText("00 / 02", { exact: true })).toBeVisible();
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: /^Карточка (c'est dur|je vais me tuer), перевернуть$/ }).click();
    await page.getByRole("button", { name: /^Знаю/ }).click();
  }
  await expect(page.getByText("Практика окончена")).toBeVisible();

  // Nothing was graded for real: both cards are still new.
  await page.goto("/library");
  await longPress(page, page.getByRole("link", { name: /^Эмоции:/ }));
  await expect(page.getByRole("dialog", { name: "Эмоции" }).getByRole("link", { name: /Повторить тему/ })).toContainText("2");
});
