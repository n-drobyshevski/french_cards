import { expect, test, type Page } from "@playwright/test";
import { dbRows, exerciseCard, openReview, seedExerciseSets, SLANG_SET } from "./fixtures";

// «Упражнения» on desktop (DESKTOP-SPEC §2/§4/§8, D-Exercise-List, D-Exercise-Player): the sidebar
// item (second), G E, and the player's keys — 1–4 answer at once, 0 «Не знаю», Enter «Дальше»
// (on a right answer too), Esc leaves and keeps the run. Desktop-chromium project, 1440×800.

const sidebar = (page: Page) => page.getByRole("complementary", { name: "Разделы" });
const stamp = (page: Page, verdict: "right" | "wrong") => page.locator(`[data-exercise-stamp="${verdict}"]`);
const tile = (page: Page) => page.getByRole("link", { name: new RegExp(`^${SLANG_SET.title}:`) });

async function seeded(page: Page) {
  await openReview(page);
  await seedExerciseSets(page, [SLANG_SET]);
}

/** The digit key of the option with (or, with `not`, without) this text. */
async function keyFor(page: Page, text: string, not = false): Promise<string> {
  const texts = await page.locator("button[data-option]").allInnerTexts();
  const i = texts.findIndex((t) => t.includes(text) !== not);
  expect(i).toBeGreaterThanOrEqual(0);
  return String(i + 1);
}

/** Keys right after a view opens, and right after an answer (the stamp's landing), are dropped by design. */
const settle = (page: Page, ms = 450) => page.waitForTimeout(ms);

test("G then E opens «Упражнения»; the sidebar lists it second, with the unplayed count", async ({ page }) => {
  await seeded(page);
  await page.reload();
  await expect(page.getByRole("button", { name: /^Карточка .*, перевернуть$/ })).toBeVisible();
  const nav = sidebar(page);
  const names = await nav.getByRole("link").allInnerTexts();
  const order = ["Повторение", "Упражнения", "Библиотека", "Контекст", "Импорт"].map((n) => names.findIndex((t) => t.startsWith(n)));
  expect(order.every((i) => i >= 0)).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  await expect(nav.getByRole("link", { name: /^Упражнения/ })).toHaveText(/Упражнения\s*1/);

  await page.keyboard.press("g");
  await page.keyboard.press("e");
  await expect(page).toHaveURL(/\/exercises$/);
  await expect(nav.getByRole("link", { name: /^Упражнения/ })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { level: 1, name: "Упражнения" })).toBeVisible();
  await expect(tile(page)).toBeVisible();
  // The request builder sits in the right column.
  await expect(page.getByRole("complementary", { name: "Попросить набор" })).toContainText("Скопировать запрос");
});

test("the sidebar item opens the list; the rail carries it at medium width", async ({ page }) => {
  await seeded(page);
  await page.goto("/library");
  await sidebar(page).getByRole("link", { name: /^Упражнения/ }).click();
  await expect(page).toHaveURL(/\/exercises$/);
  await expect(tile(page)).toContainText("Новый");

  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.getByRole("link", { name: "Упражнения, 1 новый набор" })).toBeVisible();
  await page.goto("/library");
  await page.getByRole("link", { name: "Упражнения, 1 новый набор" }).click();
  await expect(page).toHaveURL(/\/exercises$/);
});

test("player keys: 1–4 answer, Enter goes on, 0 is «Не знаю», Esc leaves and keeps the run", async ({ page }) => {
  await seeded(page);
  await page.goto("/exercises");
  await tile(page).click();
  await expect(page).toHaveURL(/\/exercises\/play$/);
  await expect(exerciseCard(page)).toContainText("les flics");
  const hints = page.getByLabel("Клавиши", { exact: true });
  await expect(hints).toHaveText(/1–4\s*выбрать\s*·\s*0\s*не знаю\s*·\s*Enter\s*дальше\s*·\s*Esc\s*выйти/i);
  await settle(page);

  // A wrong pick by its key: НЕВЕРНО, the line waits with focus on «Дальше» (its ring shows); Enter goes on.
  await page.keyboard.press(await keyFor(page, "копы", true));
  await expect(stamp(page, "wrong")).toBeVisible();
  await expect(page.getByRole("region", { name: "Результат ответа" })).toContainText("копы");
  await expect(page.locator("button[data-advance]").filter({ visible: true })).toBeFocused();
  await settle(page, 300);
  await page.keyboard.press("Enter");
  await expect(exerciseCard(page)).toHaveAttribute("data-exercise-card", "cloze");
  // Focus follows to the new card, so Tab goes on from there (not from the top of the page).
  await expect(exerciseCard(page)).toBeFocused();

  // A right pick by its key waits too, with focus on «Дальше»; Enter goes on.
  await page.keyboard.press(await keyFor(page, "vas-y"));
  await expect(stamp(page, "right")).toBeVisible();
  await expect(page.locator("button[data-advance]").filter({ visible: true })).toBeFocused();
  await settle(page, 1600);
  await expect(exerciseCard(page)).toHaveAttribute("data-exercise-card", "cloze");
  await page.keyboard.press("Enter");
  await expect(exerciseCard(page)).toContainText("se casser");

  // 0: «Не знаю», with the right answer on the line.
  await page.keyboard.press("0");
  await expect(stamp(page, "wrong")).toBeVisible();
  await expect(page.getByRole("region", { name: "Результат ответа" })).toContainText("свалить");
  await settle(page, 300);
  await page.keyboard.press("Enter");
  await expect(exerciseCard(page)).toHaveAttribute("data-exercise-card", "pairs");
  // A pairs board has no options: digits do nothing, 0 still gives up.
  await expect(hints).not.toContainText("выбрать");
  await page.keyboard.press("1");
  await expect(stamp(page, "wrong")).toHaveCount(0);

  // Esc leaves; the run is kept and «Продолжить» offers it.
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/exercises$/);
  const resume = page.getByRole("region", { name: "Незаконченный набор" });
  await expect(resume.getByRole("link", { name: /Продолжить/ })).toContainText("3 из 5");
  const runs = await dbRows<{ answers: { item_id: string; outcome: string }[]; finished_at: string | null }>(page, "exercise_runs");
  expect(runs).toHaveLength(1);
  expect(runs[0].finished_at).toBeNull();
  expect(runs[0].answers.map((a) => `${a.item_id}:${a.outcome}`)).toEqual(["q1:wrong", "q2:correct", "q3:dont_know"]);

  // Back in: the open items in the set's order, the missed one first as a repeat.
  await resume.getByRole("link", { name: /Продолжить/ }).click();
  await expect(exerciseCard(page)).toContainText("les flics");
  await expect(exerciseCard(page)).toContainText("ПОВТОР");
  await settle(page);
  await page.keyboard.press("0");
  await expect(stamp(page, "wrong")).toBeVisible();
});

test("a new word's card: Enter is «Понятно»; the done screen leaves with Esc", async ({ page }) => {
  await seeded(page);
  await page.goto(`/exercises/play?set=${SLANG_SET.id}`);
  await expect(exerciseCard(page)).toBeVisible();
  await settle(page);
  const done = page.getByRole("heading", { level: 1, name: "Готово" });
  const intro = page.getByRole("article", { name: "Новое слово" });
  let introSeen = false;
  // Give up on everything by keys: three tries an item, then the done screen.
  for (let i = 0; i < 30; i++) {
    await expect(exerciseCard(page).or(intro).or(done).first()).toBeVisible();
    if (await done.isVisible()) break;
    if (await intro.isVisible()) {
      introSeen = true;
      await expect(page.getByLabel("Клавиши", { exact: true })).toHaveText(/Enter\s*понятно/i);
      await page.keyboard.press("Enter");
      await expect(intro).toHaveCount(0);
      continue;
    }
    await page.keyboard.press("0");
    await expect(stamp(page, "wrong")).toBeVisible();
    await settle(page, 300);
    await page.keyboard.press("Enter");
    // Keys swap the card in place (a fade): the next one comes without a stamp.
    await expect(stamp(page, "wrong")).toHaveCount(0);
    await settle(page, 50);
  }
  expect(introSeen).toBe(true);
  await expect(done).toBeVisible();
  await settle(page);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/exercises$/);
});
