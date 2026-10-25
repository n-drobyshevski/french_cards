import { expect, test, type Page } from "@playwright/test";
import { dbRows, openReview, seedCardStates, seedLearningCard, seedStudyPlan, SEED_WORDS, withoutLegacyPlan } from "./fixtures";

// «План дня» on phones (SPEC «План дня и уровень языка»; boards Review-Settings-C, Review-Header-A/B,
// Review-Plan-Sheet, Review-Wait, Review-Done-Plan-A; mobile-research «План на сегодня» B and «Wait
// screen» B): the settings screen «План повторения» saving
// the synced `study_plan` row, the review summary opening «План на сегодня», «Всё равно добавить
// новые», and the wait screen.

/** The app's defaults with a plan of 10 new words a day (the rest as lib/core/study-plan.ts DEFAULT_STUDY_PLAN). */
const PLAN_10 = { new_words: 10, review_cap: 200, new_order: "level", mix: "mixed", ru_fr: "after" } as const;

const studyPlanRow = async (page: Page) =>
  (await dbRows<{ id: string; value: Record<string, unknown>; updated_at: string }>(page, "user_prefs")).find((r) => r.id === "study_plan");

/**
 * Review logs over the last week, by hand: `n` misses of young review cards two days ago (no word
 * of the library: only the plan's 7-day accuracy reads them). Reload afterwards.
 */
async function seedMissedReviews(page: Page, n: number) {
  await page.evaluate(
    (count) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("kartochki");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction("review_log", "readwrite");
          const store = tx.objectStore("review_log");
          const at = Date.now() - 2 * 24 * 60 * 60 * 1000;
          for (let i = 0; i < count; i++) {
            const review = new Date(at + i * 60_000).toISOString();
            store.put({
              id: `e2e-miss-${i}`,
              word_id: `e2e-gone-${i}`,
              direction: "fr_ru",
              rating: 1,
              state: 2,
              due: review,
              stability: 2,
              difficulty: 6,
              elapsed_days: 2,
              scheduled_days: 2,
              review,
              prev: null,
              updated_at: review,
              deleted_at: null,
            });
          }
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    n,
  );
}

test.describe("«План повторения» in Settings", () => {
  test("the row opens the plan screen; every change saves the synced plan at once", async ({ page }) => {
    // No stored plan: the app's defaults, the number migrated from «Новых карточек в день» (15 → 8 words).
    await withoutLegacyPlan(page);
    await page.goto("/settings");
    const row = page.getByRole("link", { name: /^План повторения/ });
    await expect(row).toContainText("8 новых · до 200 в день");
    // The old stepper is gone from Settings.
    await expect(page.getByRole("group", { name: "Новых карточек в день" })).toHaveCount(0);
    await row.click();

    await expect(page).toHaveURL(/\/settings\/plan$/);
    await expect(page.getByRole("heading", { level: 1, name: "План повторения" })).toBeVisible();
    // Phones: no summary line or footnote on the plan screen (the Settings row carries the summary).

    const fresh = page.getByRole("group", { name: "Новых слов в день" });
    await expect(fresh.locator("output")).toHaveText("8");
    await fresh.getByRole("button", { name: "Больше" }).click();
    await expect(fresh.locator("output")).toHaveText("9");

    const cap = page.getByRole("group", { name: "Повторений в день" });
    await expect(cap.locator("output")).toHaveText("200");
    await cap.getByRole("button", { name: "Больше" }).click();
    await expect(cap.locator("output")).toHaveText("225");

    const order = page.getByRole("radiogroup", { name: "Порядок" });
    await expect(order.getByRole("radio", { name: "По уровню языка" })).toBeChecked();
    // The first-run themes are not numbered.
    await expect(order.getByRole("radio", { name: "По темам" })).toHaveAccessibleDescription("По порядку тем");
    await order.getByText("По темам").click();
    await expect(order.getByRole("radio", { name: "По темам" })).toBeChecked();

    const mix = page.getByRole("radiogroup", { name: "Новые" });
    await expect(mix.getByRole("radio", { name: "Вперемешку" })).toBeChecked();
    await mix.getByRole("radio", { name: "После повторения" }).click();
    await expect(mix.getByRole("radio", { name: "После повторения" })).toBeChecked();

    const sides = page.getByRole("radiogroup", { name: "Обратная сторона" });
    await expect(sides.getByRole("radio", { name: "После 3 дней узнавания" })).toBeChecked();
    await sides.getByText("Только узнавание").click();
    await expect(sides.getByRole("radio", { name: "Только узнавание" })).toBeChecked();

    await expect.poll(async () => (await studyPlanRow(page))?.value).toEqual({
      new_words: 9,
      review_cap: 225,
      new_order: "themes",
      mix: "after",
      ru_fr: "recognition",
    });

    // «Назавтра» shares one limit counted in cards: the copy says so.
    await sides.getByText("Назавтра").click();
    await expect(page.getByRole("group", { name: "Новых карточек в день" }).locator("output")).toHaveText("9");

    // Back to Settings: the row shows the new summary; a reload keeps the plan.
    await page.getByRole("button", { name: "Назад к настройкам" }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole("link", { name: /^План повторения/ })).toContainText("9 новых карточек · до 225 в день");
    await page.reload();
    await expect(page.getByRole("link", { name: /^План повторения/ })).toContainText("9 новых карточек · до 225 в день");
  });

  test("«Повторений в день» goes past 975 to «без лимита» and back", async ({ page }) => {
    await seedStudyPlan(page, { ...PLAN_10, review_cap: 975 });
    await page.goto("/settings/plan");
    const cap = page.getByRole("group", { name: "Повторений в день" });
    await expect(cap.locator("output")).toHaveText("975");
    await cap.getByRole("button", { name: "Больше" }).click();
    await expect(cap.locator("output")).toHaveText(/без лимита/);
    await expect(cap.getByRole("button", { name: "Больше" })).toBeDisabled();
    await expect.poll(async () => (await studyPlanRow(page))?.value.review_cap).toBeNull();
    await cap.getByRole("button", { name: "Меньше" }).click();
    await expect(cap.locator("output")).toHaveText("975");
  });
});

test.describe("«План на сегодня»", () => {
  test("a normal day: the summary opens the plan sheet; «Изменить план ›» opens the settings", async ({ page }) => {
    await seedStudyPlan(page, PLAN_10);
    await openReview(page);
    // 11 new words, 7 themes: 10 today, at most 4 from one theme.
    const summary = page.getByRole("button", { name: "План на сегодня: 10 новых" });
    await expect(summary).toHaveText("10 новых");
    await expect(page.locator("[data-plan-summary]")).toHaveAttribute("aria-label", "План на сегодня: 10 новых"); // phones: the counts are in its name
    await expect(page.getByText("00 / 10", { exact: true })).toBeVisible();
    // No reason subline on a normal day.
    await expect(page.locator("[data-plan-subline]")).toHaveCount(0);
    // A new card carries «НОВОЕ» in its header (D3 B), and says so to screen readers.
    const question = page.getByRole("button", { name: /^Карточка .*, перевернуть$/ });
    await expect(question.getByText("НОВОЕ", { exact: true })).toBeVisible();
    await expect(question).toHaveAccessibleDescription("новая карточка");

    await summary.click();
    const sheet = page.getByRole("dialog", { name: "План на сегодня" });
    await expect(sheet).toBeVisible();
    // Phones: the day strip, its exact numbers in its name; zero parts and the settings value stay off.
    await expect(sheet.getByRole("img", { name: "К повторению 0, новых слов 10 из 10, обратных сторон 0" })).toBeVisible();
    await expect(sheet.locator("[data-slot=on]")).toHaveCount(10);
    await expect(sheet.locator("[data-plan-strip] p")).toHaveText("Нов. 10/10");
    await expect(sheet.getByRole("button", { name: "Всё равно добавить новые" })).toBeHidden();
    await expect(sheet.getByText("10 слов · до 200")).toHaveCount(0);

    await sheet.getByRole("link", { name: /Изменить план/ }).click();
    await expect(page).toHaveURL(/\/settings\/plan$/);
    await expect(page.getByRole("heading", { level: 1, name: "План повторения" })).toBeVisible();
  });

  test("accuracy holds new words back: the reason subline and line; «Всё равно добавить новые» lifts it for today", async ({ page }) => {
    await seedStudyPlan(page, PLAN_10);
    await openReview(page);
    // 30 young reviews missed this week: accuracy 0 % → the day's new words halve (10 → 5).
    await seedMissedReviews(page, 30);
    await page.reload();

    const subline = page.locator("[data-plan-subline]");
    await expect(subline).toHaveText(/Новых\s*5 из 10\s*·\s*точность за неделю\s*0\s%/);
    await expect(subline).toHaveAttribute("role", "status");
    await expect(page.locator("[data-plan-summary]")).toHaveAttribute("aria-label", "План на сегодня: 5 новых"); // phones: the counts are in its name

    await page.getByRole("button", { name: "План на сегодня: 5 новых" }).click();
    const sheet = page.getByRole("dialog", { name: "План на сегодня" });
    await expect(sheet.getByRole("img", { name: /новых слов 5 из 10/ })).toBeVisible();
    await expect(sheet.locator("[data-slot=on]")).toHaveCount(5);
    await expect(sheet.getByText(/^Точность за неделю 0\s% — новых сегодня меньше\.$/)).toBeVisible();
    const lift = sheet.getByRole("button", { name: "Всё равно добавить новые" });
    await expect(lift).toHaveAccessibleDescription("Только на сегодня. Завтра план снова подстроится.");

    await lift.click();
    // The day is lifted to the ceiling: the empty slots fill, the button, the reason and the subline go.
    await expect(sheet.getByRole("img", { name: /новых слов 10 из 10/ })).toBeVisible();
    await expect(sheet.locator("[data-slot=on]")).toHaveCount(10);
    await expect(sheet.getByRole("button", { name: "Всё равно добавить новые" })).toBeHidden();
    await expect(sheet.getByText(/новых сегодня меньше/)).toHaveCount(0);
    await expect(subline).toHaveCount(0);
    await expect(page.locator("[data-plan-summary]")).toHaveAttribute("aria-label", "План на сегодня: 10 новых"); // phones: the counts are in its name

    // Device-local, for this study day only: its own settings row, never synced.
    const override = (await dbRows<{ id: string; new_override_day?: string | null }>(page, "settings")).find((r) => r.id === "plan_override");
    expect(override?.new_override_day).toBeTruthy();
    expect((await dbRows<{ id: string }>(page, "outbox")).some((r) => JSON.stringify(r).includes("plan_override"))).toBe(false);

    // The ✕ is for keyboards only on a phone auto-height sheet.
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await page.reload();
    await expect(page.locator("[data-plan-summary]")).toHaveAttribute("aria-label", "План на сегодня: 10 новых"); // phones: the counts are in its name
    await expect(page.locator("[data-plan-subline]")).toHaveCount(0);
  });
});

test.describe("wait screen", () => {
  test("a learning card due later today: «Через 30 мин — ещё 1 карточка» on the return line, then «Готово на сегодня»", async ({ page }) => {
    // Near 04:00 the card would fall into the next study day.
    const minutesToFour = await page.evaluate(() => {
      const d = new Date();
      const four = new Date(d);
      four.setHours(4, 0, 0, 0);
      if (four <= d) four.setDate(four.getDate() + 1);
      return (four.getTime() - d.getTime()) / 60_000;
    });
    test.skip(minutesToFour < 45, "the study day ends at 04:00");

    await openReview(page);
    await seedCardStates(page, Object.fromEntries(SEED_WORDS.map((fr) => [fr, "known" as const])));
    await seedLearningCard(page, "une blague", 30);
    await page.reload();

    await expect(page.getByText("Ждёт 1 карточка", { exact: true })).toBeVisible();
    const wait = page.locator("[data-review-wait]");
    await expect(page.getByRole("heading", { level: 1, name: /^Через (29|30) мин — ещё 1 карточка$/ })).toBeVisible();
    // The card comes back in minutes: neither its answer nor its prompt is on screen, only its time.
    await expect(page.getByRole("img", { name: /^Карточки вернутся: 1 через (29|30) мин$/ })).toBeVisible();
    await expect(wait.locator("[data-return-card]")).toHaveCount(1);
    await expect(wait).not.toContainText("шутка");
    await expect(wait).not.toContainText("une blague");
    await expect(wait.getByRole("link", { name: /Упражнения/ })).toHaveCount(0);
    // «Почему позже?» opens the paragraph in place (first sessions only).
    const why = page.getByRole("button", { name: "Почему позже?" });
    await expect(why).toHaveAttribute("aria-expanded", "false");
    await why.click();
    await expect(why).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText("Эти слова вы только что учили.", { exact: false })).toBeVisible();
    // No card and no plan summary button while waiting.
    await expect(page.locator("[data-plan-summary]")).toHaveCount(0);

    await page.getByRole("button", { name: "Готово на сегодня" }).click();
    await expect(page.getByRole("heading", { name: "Готово на сегодня" })).toBeVisible();
    // Phones: the plan lives in Settings and the plan sheet, not on the done screen.
    await expect(page.locator("[data-done-plan]")).toHaveCount(0);
  });
});
