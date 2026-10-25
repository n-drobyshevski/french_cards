import { expect, test, type Page } from "@playwright/test";
import {
  dbRows,
  exerciseCard,
  loggedRatings,
  openReview,
  optionTile,
  seedExerciseSets,
  SLANG_SET,
  tabBar,
  wrongOption,
} from "./fixtures";

// «Упражнения» on phones (SPEC.md «Упражнения»; plan picks D1 B, D3 B, D4 C, D5 C, D6 B, D7 A).
// Sets come from the chat through sync; here they are put straight into IndexedDB (SLANG_SET:
// choice «les flics», cloze «vas-y», register «se casser», pairs, and the new web word «avoir la
// flemme» with its intro card). Items play in the set's order; a miss comes back after 3 others.

const stamp = (page: Page, verdict: "right" | "wrong") => page.locator(`[data-exercise-stamp="${verdict}"]`);
const result = (page: Page) => page.getByRole("region", { name: "Результат ответа" });
const next = (page: Page) => page.getByRole("button", { name: "Дальше", exact: true });
/** «Дальше» after an answer: taps in the stamp's first 230 ms are dropped by design (RESULT_LOCK_MS), so wait them out. */
async function goOn(page: Page) {
  await page.waitForTimeout(300);
  await next(page).click();
}
const tile = (page: Page, title: string) => page.getByRole("link", { name: new RegExp(`^${title}:`) });
/** Text the phone and desktop layouts both carry (one of them hidden). */
const shown = (page: Page, text: string) => page.getByText(text, { exact: true }).filter({ visible: true });
const pair = (page: Page, side: "fr" | "ru", text: string) => page.locator(`button[data-pair="${side}"]`, { hasText: text });
/** The phone player's tick row: a button named with the exact count («Вопрос 2 из 5, плюс 1 повтор»). */
const progressTicks = (page: Page) => page.getByRole("button", { name: /^Вопрос \d+ из \d+/ });

/** First-run seed, the set, then the list (a fresh load: the live queries do not see raw IndexedDB writes). */
async function openList(page: Page) {
  await openReview(page);
  await seedExerciseSets(page, [SLANG_SET]);
  await page.goto("/exercises");
  await expect(tile(page, SLANG_SET.title)).toBeVisible();
}

async function startSet(page: Page) {
  await openList(page);
  await tile(page, SLANG_SET.title).click();
  await expect(page).toHaveURL(/\/exercises\/play$/);
  await expect(exerciseCard(page)).toHaveAttribute("data-exercise-card", "choice");
  await expect(exerciseCard(page)).toContainText("les flics");
}

async function matchAllPairs(page: Page) {
  for (const [fr, ru] of [
    ["une blague", "шутка"],
    ["le gras", "жир"],
    ["arrête", "прекрати"],
    ["c'est dur", "это тяжело"],
  ]) {
    await pair(page, "fr", fr).click();
    await pair(page, "ru", ru).click();
  }
}

test("the list: tiles with «Новый», the «Упражнения» tab is active; the player hides the tab bar", async ({ page }) => {
  await openList(page);
  const bar = tabBar(page);
  await expect(bar.getByRole("link")).toHaveText(["Повторение", "Упражнения", "Библиотека"]);
  await expect(bar.getByRole("link", { name: "Упражнения" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { level: 1, name: "Упражнения" })).toBeVisible();
  const t = tile(page, SLANG_SET.title);
  // Phones (E1 A, X-List-A): the themes in italics, «5 ВОПРОСОВ» and the red band until played; the name has the counts.
  await expect(shown(page, "Повседневное, Полиция · + 1 новое слово из веба")).toBeVisible();
  await expect(shown(page, "5 вопросов")).toBeVisible();
  await expect(t).toHaveAccessibleName(`${SLANG_SET.title}: Повседневное, Полиция, 5 вопросов, 1 новое слово из веба. Ещё не играли`);
  // One way to ask on phones: the dashed «Новый набор» tile in the grid, no header button.
  await expect(page.getByRole("button", { name: /Попросить набор/ })).toBeHidden();
  await page.getByRole("button", { name: "Новый набор: Claude напишет его в чате. Выбрать темы" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  await t.click();
  await expect(page).toHaveURL(/\/exercises\/play$/);
  await expect(exerciseCard(page)).toBeVisible();
  await expect(tabBar(page)).toHaveCount(0);
  // L-ExPlayer-B: × and the tick row only; the schedule line is gone from the player on phones.
  await expect(progressTicks(page)).toHaveAccessibleName("Вопрос 1 из 5");
  await expect(shown(page, "Упражнение · не влияет на расписание")).toHaveCount(0);
});

test("a round: wrong → «ПОВТОР», right waits for «Дальше» too, «Не знаю», the new word's intro, the receipt", async ({ page }) => {
  await startSet(page);
  await expect(progressTicks(page)).toHaveAccessibleName("Вопрос 1 из 5");
  // The card sits on a small deck: 2 edges while 2–9 questions are left.
  await expect(page.locator("[data-deck-edge]")).toHaveCount(2);

  // q1 wrong (X-Player-B): the НЕВЕРНО stamp, the wrong pick struck through and the right answer
  // written into the card's blank, explain_ru under it; «Дальше» is the only action, and it waits.
  await expect(exerciseCard(page).locator("s")).toHaveCount(0);
  await wrongOption(page, "копы").click();
  await expect(stamp(page, "wrong")).toHaveText("НЕВЕРНО");
  await expect(exerciseCard(page).locator("s")).toHaveCount(1);
  await expect(exerciseCard(page)).toContainText("Верный ответ: копы");
  await expect(exerciseCard(page)).toContainText("flic — разговорное «полицейский»");
  await expect(optionTile(page, "копы")).toContainText("верный ответ");
  await expect(result(page).getByRole("button")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Слово ›" })).toHaveCount(0);
  await page.waitForTimeout(1600);
  await expect(exerciseCard(page)).toContainText("les flics");
  // The headword opens the word sheet instead of «Слово ›».
  await page.getByRole("button", { name: "Открыть карточку слова «les flics»" }).click();
  const sheet = page.getByRole("dialog", { name: "Карточка слова" });
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await next(page).click();

  // q2 cloze, right: ВЕРНО, and the card stays until «Дальше» (nothing moves on by itself).
  await expect(exerciseCard(page)).toHaveAttribute("data-exercise-card", "cloze");
  await expect(progressTicks(page)).toHaveAccessibleName("Вопрос 2 из 5, плюс 1 повтор");
  // The miss is outlined in the row, the current question taller, its repeat a hollow tick ahead.
  await expect(progressTicks(page).locator("[data-mark]")).toHaveCount(6);
  await expect(progressTicks(page).locator('[data-mark="miss"]')).toHaveCount(1);
  await expect(progressTicks(page).locator('[data-mark="requeued"]')).toHaveCount(1);
  await optionTile(page, "vas-y").click();
  await expect(stamp(page, "right")).toHaveText("ВЕРНО");
  // The word drops into the sentence's gap, nothing struck through.
  await expect(exerciseCard(page).getByRole("img", { name: "пропуск" })).toHaveCount(0);
  await expect(exerciseCard(page)).toContainText("Allez, vas-y, on t'attend !");
  await expect(exerciseCard(page).locator("s")).toHaveCount(0);
  await expect(next(page)).toBeVisible();
  await expect(page.getByText(/Дальше через/)).toHaveCount(0);
  await page.waitForTimeout(1600);
  await expect(exerciseCard(page)).toHaveAttribute("data-exercise-card", "cloze");
  await next(page).click();

  // q3 register, right.
  await expect(exerciseCard(page)).toContainText("se casser");
  await page.locator('button[data-option="3"]').click(); // arg. (level 2)
  await expect(stamp(page, "right")).toBeVisible();
  await goOn(page);

  // q4 pairs: «Не знаю» shows the answers and waits.
  await expect(exerciseCard(page)).toHaveAttribute("data-exercise-card", "pairs");
  await page.getByRole("button", { name: "Не знаю" }).click();
  await expect(stamp(page, "wrong")).toBeVisible();
  await goOn(page);

  // q1 again (after 3 others): «ПОВТОР».
  await expect(exerciseCard(page)).toContainText("les flics");
  await expect(exerciseCard(page)).toContainText("ПОВТОР");
  await optionTile(page, "копы").click();
  await expect(stamp(page, "right")).toBeVisible();
  await goOn(page);

  // The web word's intro card comes before its first question.
  const intro = page.getByRole("article", { name: "Новое слово" });
  await expect(intro).toBeVisible({ timeout: 4000 });
  await expect(intro).toContainText("avoir la flemme");
  await expect(intro).toContainText("лениться, неохота");
  await expect(intro).toContainText("lalanguefrancaise.com");
  await expect(intro).toContainText("Слова ещё нет в библиотеке");
  await page.getByRole("button", { name: "Понятно" }).click();
  await expect(exerciseCard(page)).toContainText("avoir la flemme");
  await optionTile(page, "лениться, неохота").click();
  await expect(stamp(page, "right")).toBeVisible();
  await goOn(page);

  // The pairs board again, solved without a miss.
  await expect(exerciseCard(page)).toHaveAttribute("data-exercise-card", "pairs", { timeout: 4000 });
  await expect(exerciseCard(page)).toContainText("ПОВТОР");
  await matchAllPairs(page);
  await expect(stamp(page, "right")).toBeVisible();
  await goOn(page);

  // Done (X-Done-B): the result card, the misses as slips, the new word.
  await expect(page.getByRole("heading", { level: 1, name: "Готово" })).toBeVisible({ timeout: 4000 });
  // Phones: the set's index card, the session strip (one cell per answer) and «N из M с первого раза» from the same marks.
  const tally = page.getByRole("article", { name: `Итог набора «${SLANG_SET.title}»` });
  await expect(tally).toContainText(SLANG_SET.title);
  await expect(tally).toContainText(/3\s*из\s*5\s*с первого раза/);
  await expect(tally.getByRole("img", { name: "5 вопросов: 3 с первого раза, 2 ошибки, 2 повтора" })).toBeVisible();
  await expect(tally.locator("[data-mark]")).toHaveCount(7);
  // «Не знаю» on the pairs board counts every pair still open as a miss, each a slip under «Ошибки» with its miss mark.
  const mistakes = page.getByRole("region", { name: "Ошибки" });
  await expect(mistakes).toContainText("les flics");
  for (const fr of ["une blague", "le gras", "arrête", "c'est dur"]) await expect(mistakes).toContainText(fr);
  await expect(mistakes.locator('[data-mark="miss"]')).toHaveCount(5);
  await expect(page.getByRole("button", { name: "Повторить ошибки (5)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "К наборам" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Попросить следующий набор" })).toBeHidden();
  // The tab bar is back on the done screen (SPEC «Упражнения» → Done), «Упражнения» active.
  await expect(tabBar(page).getByRole("link", { name: "Упражнения" })).toHaveAttribute("aria-current", "page");

  const runs = await dbRows<{ finished_at: string | null; answers: { item_id: string; outcome: string; attempt: number }[] }>(page, "exercise_runs");
  expect(runs).toHaveLength(1);
  expect(runs[0].finished_at).not.toBeNull();
  expect(runs[0].answers.map((a) => `${a.item_id}:${a.attempt}:${a.outcome}`)).toEqual([
    "q1:1:wrong",
    "q2:1:correct",
    "q3:1:correct",
    "q4:1:dont_know",
    "q4:1:dont_know",
    "q4:1:dont_know",
    "q4:1:dont_know",
    "q1:2:correct",
    "q5:1:correct",
    "q4:2:correct",
  ]);
  // Exercises never touch the schedule.
  expect(await loggedRatings(page)).toEqual([]);
});

test("a new word's question comes right after its intro card, even when a miss comes back there", async ({ page }) => {
  // The new word's item fourth: a miss on the first item comes back after 3 others, i.e. right at the intro.
  const [q1, q2, q3, q4, q5] = SLANG_SET.items;
  await openReview(page);
  await seedExerciseSets(page, [{ ...SLANG_SET, id: "x-e2e-intro", items: [q1, q2, q3, q5, q4] }]);
  await page.goto("/exercises");
  await tile(page, SLANG_SET.title).click();
  await expect(exerciseCard(page)).toContainText("les flics");
  await wrongOption(page, "копы").click();
  await goOn(page);
  await optionTile(page, "vas-y").click();
  await goOn(page);
  await expect(exerciseCard(page)).toHaveAttribute("data-exercise-card", "register");
  await page.locator('button[data-option="3"]').click();
  await goOn(page);
  const intro = page.getByRole("article", { name: "Новое слово" });
  await expect(intro).toBeVisible({ timeout: 4000 });
  // Phones carry no set footer during play (L-ExPlayer-B): «вопрос — следующим» is desktop only.
  await expect(page.getByText("вопрос — следующим")).toBeHidden();
  await page.getByRole("button", { name: "Понятно" }).click();
  await expect(intro).toHaveCount(0);
  await expect(exerciseCard(page)).toContainText("avoir la flemme");
});

test("done: add the new word to the library, then undo", async ({ page }) => {
  await startSet(page);
  // Not knowing anything still finishes the round after three tries per item; the fastest way through.
  const done = page.getByRole("heading", { level: 1, name: "Готово" });
  const understood = page.getByRole("button", { name: "Понятно" });
  const dontKnow = page.getByRole("button", { name: "Не знаю" });
  for (let i = 0; i < 30; i++) {
    await expect(understood.or(dontKnow).or(done).first()).toBeVisible();
    if (await done.isVisible()) break;
    if (await understood.isVisible()) {
      await understood.click();
      // The intro card leaves (its exit animation) before the question comes in.
      await expect(page.getByRole("article", { name: "Новое слово" })).toHaveCount(0);
      continue;
    }
    await dontKnow.click();
    await goOn(page);
  }
  await expect(done).toBeVisible();
  await expect(page.getByRole("article", { name: /^Итог набора/ })).toContainText(/\b0\s*из\s*5\s*с первого раза/);

  // Phones (X-Done-B): the web word as a card in a dashed frame (not yet on record) with «Положить в библиотеку».
  const fresh = page.getByRole("region", { name: "Новое слово из веба" });
  const card = fresh.locator("[data-new-word]");
  await expect(card).toContainText("avoir la flemme");
  await expect(card).toHaveAttribute("data-new-word", "web");
  await expect(card).toHaveCSS("border-top-style", "dashed");
  await fresh.getByRole("button", { name: "Положить в библиотеку" }).click();
  await expect(page.locator("[data-snackbar]")).toContainText("Добавлено · avoir la flemme");
  // Added: the frame turns solid and the action gives way to «В библиотеке».
  await expect(card).toHaveAttribute("data-new-word", "saved");
  await expect(card).toHaveCSS("border-top-style", "solid");
  await expect(card).toContainText("В библиотеке");
  await expect(fresh.getByRole("button", { name: "Положить в библиотеку" })).toHaveCount(0);
  const added = (await dbRows<{ fr: string; source: string; deleted_at: string | null }>(page, "words")).filter((w) => w.fr === "avoir la flemme");
  expect(added).toHaveLength(1);
  expect(added[0]).toMatchObject({ source: "chat", deleted_at: null });

  await page.getByRole("button", { name: "Отменить", exact: true }).click();
  await expect(fresh.getByRole("button", { name: "Положить в библиотеку" })).toBeVisible();
  await expect(card).toHaveAttribute("data-new-word", "web");
  await expect(card).not.toContainText("В библиотеке");
  const after = (await dbRows<{ fr: string; deleted_at: string | null }>(page, "words")).filter((w) => w.fr === "avoir la flemme");
  expect(after.every((w) => w.deleted_at !== null)).toBe(true);

  // A miss slip opens the word's card.
  await page.getByRole("region", { name: "Ошибки" }).getByRole("button", { name: /^les flics — копы.*Открыть карточку$/ }).click();
  await expect(page.getByRole("dialog", { name: "Карточка слова" })).toContainText("les flics");
});

test("reduced motion: a right answer waits for «Дальше»", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await startSet(page);
  await optionTile(page, "копы").click();
  await expect(stamp(page, "right")).toBeVisible();
  await expect(next(page)).toBeVisible();
  await page.waitForTimeout(2000);
  await expect(exerciseCard(page)).toContainText("les flics");
  await next(page).click();
  await expect(exerciseCard(page)).toHaveAttribute("data-exercise-card", "cloze");
});

test("× mid-round saves and leaves; «Продолжить» picks the run up", async ({ page }) => {
  await startSet(page);
  await optionTile(page, "копы").click();
  await goOn(page);
  await expect(exerciseCard(page)).toHaveAttribute("data-exercise-card", "cloze");

  await page.getByRole("button", { name: "Выйти" }).click();
  await expect(page).toHaveURL(/\/exercises$/);
  const resume = page.getByRole("region", { name: "Незаконченный набор" });
  await expect(resume).toContainText(SLANG_SET.title);
  // The set's tile moves into the card: its themes, the tick row (the next question taller) and «1/5».
  await expect(tile(page, SLANG_SET.title)).toHaveCount(0);
  await expect(resume).toContainText("Повседневное, Полиция");
  await expect(resume.getByRole("img", { name: "Вопрос 2 из 5. С первого раза 1, ошибок 0" })).toBeVisible();
  await expect(resume).toContainText("1/5");
  const go = resume.getByRole("link", { name: "Продолжить" });

  await go.click();
  await expect(page).toHaveURL(/\/exercises\/play$/);
  await expect(exerciseCard(page)).toHaveAttribute("data-exercise-card", "cloze");
  await expect(progressTicks(page)).toHaveAccessibleName("Вопрос 2 из 5");
  const runs = await dbRows<{ answers: unknown[]; finished_at: string | null }>(page, "exercise_runs");
  expect(runs).toHaveLength(1);
  expect(runs[0].answers).toHaveLength(1);
});

test("× on the last card, once answered, finishes the run", async ({ page }) => {
  await startSet(page);
  await optionTile(page, "копы").click();
  await goOn(page);
  await expect(exerciseCard(page)).toHaveAttribute("data-exercise-card", "cloze");
  await optionTile(page, "vas-y").click();
  await goOn(page);
  await expect(exerciseCard(page)).toHaveAttribute("data-exercise-card", "register");
  await page.locator('button[data-option="3"]').click();
  await goOn(page);
  await expect(exerciseCard(page)).toHaveAttribute("data-exercise-card", "pairs");
  await matchAllPairs(page);
  await goOn(page);
  await page.getByRole("button", { name: "Понятно" }).click();
  await expect(exerciseCard(page)).toContainText("avoir la flemme");
  await optionTile(page, "лениться, неохота").click();
  await expect(stamp(page, "right")).toBeVisible();
  // Leave without «Дальше»: every item is settled, so the run is finished on the way out.
  await page.getByRole("button", { name: "Выйти" }).click();
  await expect(page).toHaveURL(/\/exercises$/);
  await expect(tile(page, SLANG_SET.title)).toContainText("5/5");
  await expect(page.getByRole("region", { name: "Незаконченный набор" })).toHaveCount(0);
  const runs = await dbRows<{ finished_at: string | null; answers: unknown[] }>(page, "exercise_runs");
  expect(runs).toHaveLength(1);
  expect(runs[0].answers).toHaveLength(5);
  expect(runs[0].finished_at).not.toBeNull();
});

test("the empty state builds the request and copies it", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openReview(page);
  await page.goto("/exercises");
  await expect(tabBar(page).getByRole("link", { name: "Упражнения" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Упражнений пока нет" })).toBeAttached();

  // Phones (X-Request-B): the kind row, the request as one sentence whose slots open in place, two steps.
  const card = page.getByRole("region", { name: "Запрос для Claude" });
  const request = card.getByRole("group", { name: /^Запрос для Claude:/ });
  const said = (text: string) => expect(request).toHaveAccessibleName(`Запрос для Claude: ${text}`);
  await expect(card.getByRole("radiogroup", { name: "Что повторить" }).getByRole("radio", { name: "Слова по темам" })).toHaveAttribute("aria-checked", "true");
  await said("Сделай в Карточках 12 вопросов по всем темам — можно новые слова.");
  // The themes slot starts open: its chips sit under the sentence.
  await card.getByRole("group", { name: "Темы, можно несколько" }).getByRole("button", { name: /^Полиция/ }).click();
  await said("Сделай в Карточках 12 вопросов по теме «Полиция» — можно новые слова.");
  // The sentence reads the themes without quotes; the copied text has them. «Авто» shows its level
  // slot but copies nothing (the slang of «Полиция» has no level for it: «уровня авто»).
  await expect(card.locator("[data-request-sentence]")).toHaveText("Сделай в Карточках 12 вопросов уровня авто по теме Полиция — можно новые слова.");
  await card.getByRole("button", { name: "Вопросов: 12, изменить" }).click();
  await card.getByRole("radio", { name: "8", exact: true }).click();
  await card.getByRole("button", { name: "Новые слова: можно, изменить" }).click();
  await said("Сделай в Карточках 8 вопросов по теме «Полиция» — без новых слов.");

  // «Спряжение»: a short verb test (6 / 8 / 10, 8 first), no new-words slot; back to the themes keeps 8.
  await card.getByRole("radio", { name: "Спряжение глаголов" }).click();
  await said("Сделай в Карточках 8 вопросов на спряжение глаголов по теме «Полиция».");
  await expect(card.getByRole("button", { name: /^Новые слова/ })).toHaveCount(0);
  await expect(card.getByRole("radio", { name: "10", exact: true })).toBeVisible();
  await card.getByRole("radio", { name: "Слова по темам" }).click();
  await said("Сделай в Карточках 8 вопросов по теме «Полиция» — без новых слов.");

  await expect(card.getByRole("link", { name: "Скопировать и открыть Claude" })).toBeVisible();
  await card.getByRole("button", { name: "Только скопировать" }).click();
  await expect(card.getByRole("link", { name: "Скопировано" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("Сделай в Карточках 8 вопросов по теме «Полиция» — без новых слов.");
  // Now we wait for the set from the chat: on phones the waiting tile is the whole state (list B).
  await expect(page.getByRole("button", { name: "Ждём набор из чата. Обновить" })).toBeVisible();
});

test("«Чаще в упражнениях» on: the request builder says so and links to Settings; the request text stays", async ({ page }) => {
  await openReview(page);
  await page.goto("/exercises");
  const card = page.getByRole("region", { name: "Запрос для Claude" });
  const request = card.getByRole("group", { name: /^Запрос для Claude:/ });
  await expect(request).toBeAttached();
  // Off by default: no line.
  await expect(card.getByText(/^Чаще /)).toHaveCount(0);

  await page.goto("/settings/exercises");
  await page.getByRole("radiogroup", { name: "Чаще в упражнениях" }).getByRole("radio", { name: "Трудные", exact: true }).click();
  await page.getByRole("radiogroup", { name: "Сколько в наборе" }).getByRole("radio", { name: "Почти все" }).click();
  await expect(page.getByRole("radiogroup", { name: "Сколько в наборе" }).getByRole("radio", { name: "Почти все" })).toBeChecked();

  await page.goto("/exercises");
  // Phones (X-Request-B): one quiet line under the sentence.
  await expect(card.getByText("Чаще трудные · почти весь набор", { exact: true })).toBeVisible();
  await expect(request).toHaveAccessibleName("Запрос для Claude: Сделай в Карточках 12 вопросов по всем темам — можно новые слова.");
  const link = card.getByRole("link", { name: "Настройки ›" });
  await expect(link).toHaveAttribute("href", "/settings/exercises");
  await link.click();
  await expect(page).toHaveURL(/\/settings\/exercises$/);
  await expect(page.getByRole("radiogroup", { name: "Чаще в упражнениях" })).toBeInViewport();
});

test.describe("offline", () => {
  // The service worker serves the player's shell and chunks; e2e blocks it everywhere else.
  test.use({ serviceWorkers: "allow" });

  test("cold start of /exercises/play offline resumes the round from the device", async ({ page, context }) => {
    test.setTimeout(60_000);
    await openList(page);
    await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 30_000 });
    await page.waitForFunction(
      async () => !!(await caches.match("/exercises/play", { cacheName: "pages" })),
      null,
      { timeout: 30_000 },
    );
    await tile(page, SLANG_SET.title).click();
    await expect(exerciseCard(page)).toContainText("les flics");
    await optionTile(page, "копы").click();
    await goOn(page);
    await expect(exerciseCard(page)).toHaveAttribute("data-exercise-card", "cloze");

    await context.setOffline(true);
    try {
      await page.reload();
      await expect(exerciseCard(page)).toHaveAttribute("data-exercise-card", "cloze");
      await expect(progressTicks(page)).toBeVisible();
      await optionTile(page, "vas-y").click();
      await expect(stamp(page, "right")).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });
});
