import { expect, test, type Locator, type Page } from "@playwright/test";
import { openReview, seedCardStates, seedExerciseSets, SEED_WORDS, SLANG_SET } from "./fixtures";

// «Упражнение по трудным словам» on phones (SPEC.md «Упражнения»; boards Exercise-S-Request-Scope,
// -Entry-Library-Done; the quick tiles are desktop only since list B): a set made only of the difficult and/or due words of every
// theme. The app never calls Claude: every entry point copies a request for the chat. On the
// first-run seed words: 3 difficult, 4 due today, the rest reviewed and not due.

const DIFFICULT = ["se casser", "les flics", "vas-y"];
const DUE = ["une blague", "arrête", "c'est dur", "le gras"];

const TEXT = {
  difficult: "Сделай упражнение в Карточках по трудным словам из всех тем, 12 вопросов.",
  due: "Сделай упражнение в Карточках по словам к повторению из всех тем, 12 вопросов.",
};

/** First-run seed, then the card states (every word not named is reviewed and not due). */
async function seedStates(page: Page, difficult: readonly string[] = DIFFICULT, due: readonly string[] = DUE) {
  await openReview(page);
  const states: Record<string, "difficult" | "due" | "known"> = {};
  for (const fr of SEED_WORDS) states[fr] = difficult.includes(fr) ? "difficult" : due.includes(fr) ? "due" : "known";
  await seedCardStates(page, states);
}

const clipboard = (page: Page) => page.evaluate(() => navigator.clipboard.readText());

/** A held finger: touch start, wait past the long-press delay, touch end (CDP, like a real phone). */
async function longPress(page: Page, locator: Locator) {
  const box = (await locator.boundingBox())!;
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
  await page.waitForTimeout(700);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

test("the empty-state builder: «Трудные» / «К повторению» chips change the request and drop the theme options", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await seedStates(page);
  await page.goto("/exercises");
  // Phones (proposals «Empty» B): one chip flow, the scopes first; «Оба» stays a chat-only choice.
  const card = page.getByRole("region", { name: "Запрос для Claude" });
  const text = card.locator("p", { hasText: /^Сделай упражнение/ });
  const chips = card.getByRole("group", { name: "Из чего составить" });
  const difficult = chips.getByRole("button", { name: "Трудные: 3" });
  const due = chips.getByRole("button", { name: "К повторению: 4" });

  await expect(difficult).toHaveAttribute("aria-pressed", "false");
  await expect(due).toBeEnabled();
  await expect(chips.getByRole("button", { name: /^Трудные и к повторению/ })).toHaveCount(0);
  await expect(text).toHaveText("Сделай упражнение в Карточках по всем темам, 12 вопросов, можно новые слова.");

  await difficult.click();
  await expect(difficult).toHaveAttribute("aria-pressed", "true");
  await expect(text).toHaveText(TEXT.difficult);
  // No «своя тема», no new words: only those words.
  await card.getByRole("button", { name: /^Ещё/ }).click();
  await expect(card.getByRole("textbox", { name: "Своя тема" })).toHaveCount(0);
  await expect(card.getByRole("switch", { name: "Можно новые слова" })).toHaveCount(0);
  await expect(card.getByText("Только ваши трудные слова из всех тем. Если их мало, набор будет короче.")).toBeVisible();

  await card.getByRole("radio", { name: "8", exact: true }).click();
  await expect(text).toHaveText("Сделай упражнение в Карточках по трудным словам из всех тем, 8 вопросов.");
  await due.click();
  await expect(due).toHaveAttribute("aria-pressed", "true");
  await expect(difficult).toHaveAttribute("aria-pressed", "false");
  await expect(text).toHaveText("Сделай упражнение в Карточках по словам к повторению из всех тем, 8 вопросов.");

  // A tap on the scope again goes back to the themes: «своя тема» and new words return.
  await due.click();
  await expect(card.getByRole("switch", { name: "Можно новые слова" })).toBeVisible();
  await expect(text).toHaveText("Сделай упражнение в Карточках по всем темам, 8 вопросов, можно новые слова.");

  await difficult.click();
  await card.getByRole("button", { name: "только скопировать" }).click();
  await expect(card.getByRole("link", { name: "Скопировано" })).toBeVisible();
  expect(await clipboard(page)).toBe("Сделай упражнение в Карточках по трудным словам из всех тем, 8 вопросов.");
  await expect(page.getByRole("button", { name: "Ждём набор из чата. Обновить" })).toBeVisible();
});

test("a scope with no words is disabled in the sheet and says why; phones have no quick tiles", async ({ page }) => {
  await seedStates(page, DIFFICULT, []);
  await seedExerciseSets(page, [SLANG_SET]);
  await page.goto("/exercises");
  await expect(page.getByRole("link", { name: new RegExp(`^${SLANG_SET.title}:`) })).toBeVisible();
  // List B: one way to ask, the header button (the quick tiles stay on desktop).
  await expect(page.getByRole("button", { name: /^Трудные слова: 3 слова из всех тем/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^К повторению:/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Попросить набор", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Попросить набор" });
  const from = sheet.getByRole("radiogroup", { name: "Откуда слова" });
  await expect(from.getByRole("radio", { name: "К повторению: нет слов к повторению" })).toBeDisabled();
  await expect(from.getByRole("radio", { name: "Трудные: 3" })).toBeEnabled();
  await expect(from.getByRole("radio", { name: "Трудные и к повторению: 3" })).toBeEnabled();
});

test("the sheet copies a scoped request and the list waits for the set; a scoped set says «Трудные · все темы»", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await seedStates(page);
  await seedExerciseSets(page, [{ ...SLANG_SET, id: "x-e2e-scoped", title: "Трудные слова", folders: [], scope: "difficult", new_words: [], items: SLANG_SET.items.filter((i) => !i.new_ref) }]);
  await page.goto("/exercises");
  await expect(page.getByRole("link", { name: /^Трудные слова:/ })).toContainText("Трудные · все темы");

  await page.getByRole("button", { name: "Попросить набор", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Попросить набор" });
  await sheet.getByRole("radiogroup", { name: "Откуда слова" }).getByRole("radio", { name: "К повторению: 4" }).click();
  await sheet.getByRole("button", { name: "Скопировать запрос" }).click();
  expect(await clipboard(page)).toBe(TEXT.due);
  await expect(page.locator("[data-snackbar]")).toContainText("Запрос скопирован");
  // Phones (proposals «Waiting» B): the waiting tile at the head of the grid is the whole state.
  await expect(page.getByRole("button", { name: "Ждём набор из чата. Обновить" })).toBeVisible();
});

test("Library: a long press on «трудных» / «к повт.» offers the filter and an exercise; a tap stays the filter", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await seedStates(page);
  await page.goto("/library");
  const difficult = page.getByRole("button", { name: "Трудные: 3" });
  const due = page.getByRole("button", { name: "К повторению: 4" });
  await expect(difficult).toBeVisible();

  await longPress(page, difficult);
  const sheet = page.getByRole("dialog", { name: "3 трудных слова" });
  await expect(sheet).toBeVisible();
  // The finger lifting did not toggle the filter (the page under the sheet is hidden from the a11y tree).
  await expect(page.locator('button[aria-label="Трудные: 3"]')).toHaveAttribute("aria-pressed", "false");
  await sheet.getByRole("button", { name: "Показать в библиотеке" }).click();
  await expect(sheet).toBeHidden();
  await expect(difficult).toHaveAttribute("aria-pressed", "true");

  // The context-menu event (Android's long press, the keyboard's menu key) opens it too.
  await due.dispatchEvent("contextmenu");
  const dueSheet = page.getByRole("dialog", { name: "4 к повторению" });
  await dueSheet.getByRole("button", { name: /^Упражнение по ним в Claude/ }).click();
  await expect(dueSheet).toBeHidden();
  expect(await clipboard(page)).toBe(TEXT.due);
  await expect(page.locator("[data-snackbar]")).toContainText("Запрос скопирован");

  // A plain tap is still the filter.
  await due.click();
  await expect(due).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("phones: «Готово на сегодня» leaves the difficult-words exercise to «Упражнения»", async ({ page }) => {
  // Nothing due: the review opens on «Готово на сегодня» (L-Done-B: no exercise row on phones;
  // desktop keeps it, e2e/desktop-parity.spec.ts).
  await seedStates(page, DIFFICULT, []);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Готово на сегодня" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Упражнение по трудным словам/ })).toHaveCount(0);
});

test("«Готово на сегодня» has no exercise row without difficult words", async ({ page }) => {
  await seedStates(page, [], []);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Готово на сегодня" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Упражнение по трудным словам/ })).toHaveCount(0);
});
