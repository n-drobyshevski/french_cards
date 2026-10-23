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
const timer = (page: Page) => page.getByRole("button", { name: "Дальше через 1 с · нажмите, чтобы остаться" });
const tile = (page: Page, title: string) => page.getByRole("link", { name: new RegExp(`^${title}:`) });
/** Text the phone and desktop layouts both carry (one of them hidden). */
const shown = (page: Page, text: string) => page.getByText(text, { exact: true }).filter({ visible: true });
const pair = (page: Page, side: "fr" | "ru", text: string) => page.locator(`button[data-pair="${side}"]`, { hasText: text });

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
  await expect(shown(page, "1 набор · составлены в чате")).toBeVisible();
  const t = tile(page, SLANG_SET.title);
  await expect(t).toContainText("5 вопросов");
  await expect(t).toContainText("Новый");
  await expect(page.getByRole("button", { name: /Попросить набор/ }).last()).toBeVisible();

  await t.click();
  await expect(page).toHaveURL(/\/exercises\/play$/);
  await expect(exerciseCard(page)).toBeVisible();
  await expect(tabBar(page)).toHaveCount(0);
  await expect(shown(page, "Упражнение · не влияет на расписание")).toBeVisible();
});

test("a round: wrong → «ПОВТОР», right auto-advances, a tap holds it, «Не знаю», the new word's intro, the receipt", async ({ page }) => {
  await startSet(page);
  await expect(shown(page, "01 / 05")).toBeVisible();

  // q1 wrong: the НЕВЕРНО stamp, the right answer and explain_ru on the line; it waits for «Дальше».
  await wrongOption(page, "копы").click();
  await expect(stamp(page, "wrong")).toHaveText("НЕВЕРНО");
  await expect(result(page)).toContainText("копы");
  await expect(result(page)).toContainText("flic — разговорное «полицейский»");
  await expect(optionTile(page, "копы")).toContainText("верный ответ");
  await page.waitForTimeout(1600);
  await expect(exerciseCard(page)).toContainText("les flics");
  await next(page).click();

  // q2 cloze, right: ВЕРНО, the 1 s timer line, then the next card by itself.
  await expect(exerciseCard(page)).toHaveAttribute("data-exercise-card", "cloze");
  await expect(shown(page, "02 / 05")).toBeVisible();
  await expect(shown(page, "+1")).toBeVisible();
  await optionTile(page, "vas-y").click();
  await expect(stamp(page, "right")).toHaveText("ВЕРНО");
  await expect(timer(page)).toBeVisible();
  await expect(exerciseCard(page)).toHaveAttribute("data-exercise-card", "register", { timeout: 4000 });

  // q3 register, right, then a tap holds the advance: «Дальше» takes the timer's place.
  await expect(exerciseCard(page)).toContainText("se casser");
  await page.locator('button[data-option="3"]').click(); // arg. (level 2)
  await expect(stamp(page, "right")).toBeVisible();
  await timer(page).click();
  await expect(timer(page)).toHaveCount(0);
  await expect(next(page)).toBeVisible();
  await page.waitForTimeout(1600);
  await expect(exerciseCard(page)).toHaveAttribute("data-exercise-card", "register");
  await next(page).click();

  // q4 pairs: «Не знаю» shows the answers and waits.
  await expect(exerciseCard(page)).toHaveAttribute("data-exercise-card", "pairs");
  await page.getByRole("button", { name: "Не знаю" }).click();
  await expect(stamp(page, "wrong")).toBeVisible();
  await goOn(page);

  // q1 again (after 3 others): «ПОВТОР».
  await expect(exerciseCard(page)).toContainText("les flics");
  await expect(exerciseCard(page)).toContainText("ПОВТОР");
  await expect(exerciseCard(page)).toContainText("Ошиблись раньше — ещё раз");
  await optionTile(page, "копы").click();
  await expect(stamp(page, "right")).toBeVisible();

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

  // The pairs board again, solved without a miss.
  await expect(exerciseCard(page)).toHaveAttribute("data-exercise-card", "pairs", { timeout: 4000 });
  await expect(exerciseCard(page)).toContainText("ПОВТОР");
  await matchAllPairs(page);
  await expect(stamp(page, "right")).toBeVisible();

  // Done: the receipt, the misses, the new word.
  await expect(page.getByRole("heading", { level: 1, name: "Готово" })).toBeVisible({ timeout: 4000 });
  await expect(page.getByRole("region", { name: "Итоги упражнения" })).toHaveText(/Вопросов\s*5\s*С первого раза\s*3\s*Точность\s*60\s%/);
  // «Не знаю» on the pairs board counts every pair still open as a miss, each under «Ошибки».
  const mistakes = page.getByRole("region", { name: "Ошибки" });
  await expect(mistakes).toContainText("les flics");
  for (const fr of ["une blague", "le gras", "arrête", "c'est dur"]) await expect(mistakes).toContainText(fr);
  await expect(page.getByRole("button", { name: "Повторить ошибки (5)" })).toBeVisible();
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
  await expect(exerciseCard(page)).toHaveAttribute("data-exercise-card", "register", { timeout: 4000 });
  await page.locator('button[data-option="3"]').click();
  const intro = page.getByRole("article", { name: "Новое слово" });
  await expect(intro).toBeVisible({ timeout: 4000 });
  // The card promises it: «вопрос — следующим».
  await expect(page.getByText("вопрос — следующим")).toBeVisible();
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
  await expect(page.getByRole("region", { name: "Итоги упражнения" })).toHaveText(/С первого раза\s*0/);

  const fresh = page.getByRole("region", { name: "Новые слова" });
  await expect(fresh).toContainText("Новые слова (1)");
  const box = fresh.getByRole("checkbox", { name: /avoir la flemme/ });
  await expect(box).toHaveAttribute("aria-checked", "true");
  await fresh.getByRole("button", { name: "Добавить в библиотеку (1)" }).click();
  await expect(page.getByText("Добавлено: 1 слово")).toBeVisible();
  await expect(fresh).toContainText("в библиотеке");
  await expect(fresh.getByRole("button", { name: /Добавить в библиотеку/ })).toHaveCount(0);
  const added = (await dbRows<{ fr: string; source: string; deleted_at: string | null }>(page, "words")).filter((w) => w.fr === "avoir la flemme");
  expect(added).toHaveLength(1);
  expect(added[0]).toMatchObject({ source: "chat", deleted_at: null });

  await page.getByRole("button", { name: "Отменить", exact: true }).click();
  await expect(fresh.getByRole("button", { name: "Добавить в библиотеку (1)" })).toBeVisible();
  await expect(fresh).not.toContainText("в библиотеке");
  const after = (await dbRows<{ fr: string; deleted_at: string | null }>(page, "words")).filter((w) => w.fr === "avoir la flemme");
  expect(after.every((w) => w.deleted_at !== null)).toBe(true);
});

test("reduced motion: a right answer waits for «Дальше»", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await startSet(page);
  await optionTile(page, "копы").click();
  await expect(stamp(page, "right")).toBeVisible();
  await expect(timer(page)).toHaveCount(0);
  await expect(next(page)).toBeVisible();
  await page.waitForTimeout(2000);
  await expect(exerciseCard(page)).toContainText("les flics");
  await next(page).click();
  await expect(exerciseCard(page)).toHaveAttribute("data-exercise-card", "cloze");
});

test("× mid-round saves and leaves; «Продолжить» picks the run up", async ({ page }) => {
  await startSet(page);
  await optionTile(page, "копы").click();
  await expect(exerciseCard(page)).toHaveAttribute("data-exercise-card", "cloze", { timeout: 4000 });

  await page.getByRole("button", { name: "Выйти" }).click();
  await expect(page).toHaveURL(/\/exercises$/);
  const resume = page.getByRole("region", { name: "Незаконченный набор" });
  await expect(resume).toContainText(SLANG_SET.title);
  // The set's tile moves into the card.
  await expect(tile(page, SLANG_SET.title)).toHaveCount(0);
  const go = resume.getByRole("link", { name: /Продолжить/ });
  await expect(go).toContainText("1 из 5");

  await go.click();
  await expect(page).toHaveURL(/\/exercises\/play$/);
  await expect(exerciseCard(page)).toHaveAttribute("data-exercise-card", "cloze");
  await expect(shown(page, "02 / 05")).toBeVisible();
  const runs = await dbRows<{ answers: unknown[]; finished_at: string | null }>(page, "exercise_runs");
  expect(runs).toHaveLength(1);
  expect(runs[0].answers).toHaveLength(1);
});

test("× on the last card, once answered, finishes the run", async ({ page }) => {
  await startSet(page);
  await optionTile(page, "копы").click();
  await expect(exerciseCard(page)).toHaveAttribute("data-exercise-card", "cloze", { timeout: 4000 });
  await optionTile(page, "vas-y").click();
  await expect(exerciseCard(page)).toHaveAttribute("data-exercise-card", "register", { timeout: 4000 });
  await page.locator('button[data-option="3"]').click();
  await expect(exerciseCard(page)).toHaveAttribute("data-exercise-card", "pairs", { timeout: 4000 });
  await matchAllPairs(page);
  await page.getByRole("button", { name: "Понятно" }).click({ timeout: 4000 });
  await expect(exerciseCard(page)).toContainText("avoir la flemme");
  await optionTile(page, "лениться, неохота").click();
  await expect(stamp(page, "right")).toBeVisible();
  // Leave before the hairline runs out: every item is settled, so the run is finished on the way out.
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
  await expect(page.getByRole("heading", { name: "Упражнений пока нет" })).toBeVisible();

  const card = page.getByRole("region", { name: "Запрос для Claude" });
  const text = card.locator("p", { hasText: /^Сделай упражнение/ });
  await expect(text).toHaveText("Сделай упражнение в Карточках по всем темам, 12 вопросов, можно новые слова.");
  await card.getByRole("button", { name: /^Полиция/ }).click();
  await expect(text).toHaveText("Сделай упражнение в Карточках по теме «Полиция», 12 вопросов, можно новые слова.");
  await card.getByRole("radio", { name: "8" }).click();
  await card.getByRole("switch", { name: "Можно новые слова" }).click();
  await expect(text).toHaveText("Сделай упражнение в Карточках по теме «Полиция», 8 вопросов.");

  await card.getByRole("button", { name: "Скопировать запрос" }).click();
  await expect(card.getByRole("button", { name: "Скопировано" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("Сделай упражнение в Карточках по теме «Полиция», 8 вопросов.");
  // Now we wait for the set from the chat.
  await expect(page.getByText("Ждём набор из чата").first()).toBeVisible();
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
    await expect(exerciseCard(page)).toHaveAttribute("data-exercise-card", "cloze", { timeout: 4000 });

    await context.setOffline(true);
    try {
      await page.reload();
      await expect(exerciseCard(page)).toHaveAttribute("data-exercise-card", "cloze");
      await expect(shown(page, "Упражнение · не влияет на расписание")).toBeVisible();
      await optionTile(page, "vas-y").click();
      await expect(stamp(page, "right")).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });
});
