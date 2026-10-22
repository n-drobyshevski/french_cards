import { expect, test, type Page } from "@playwright/test";
import { openReview, questionCard } from "./fixtures";
import { cssAnimations, played, recordMotion } from "./review-loading";

// Desktop review motion (mockups/MOTION-SPEC.md D1, D2, R7; board M-D-Review-Keys): keyboard and
// mouse grades flash the button, then the next card is simply there — no travel; Space writes the
// answer in place; Z brings the card back with opacity only. Runs in the desktop-chromium project.

const answerCard = (page: Page) => page.locator("[data-review-answer]");
const grades = (page: Page) => page.getByRole("group", { name: "Оценка" });

interface Watch {
  __leavingSeen: boolean;
  __flashed: string[];
}

/**
 * Before the page loads: `__leavingSeen` turns true if a leaving (exiting) card ever mounts, and
 * `__flashed` collects the names of grade buttons that flashed.
 */
async function watchCards(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Watch;
    w.__leavingSeen = false;
    w.__flashed = [];
    new MutationObserver((records) => {
      if (document.querySelector("[data-review-leaving]")) w.__leavingSeen = true;
      for (const r of records) {
        const el = r.target as Element;
        if (r.type === "attributes" && el.hasAttribute("data-flash")) w.__flashed.push(el.querySelector("span:not([aria-hidden])")?.textContent ?? "");
      }
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-flash"] });
  });
}
const watched = (page: Page) => page.evaluate(() => ({ ...(window as unknown as Watch) }) as Watch);

test("Space writes the answer in place (opacity, 110 ms); the headword does not glide (D2)", async ({ page }) => {
  await recordMotion(page);
  await openReview(page);
  const head = await questionCard(page).locator("[lang=fr]").first().boundingBox();
  await page.keyboard.press("Space");
  await expect(answerCard(page)).toBeVisible();
  expect(await played(page, "headword-glide")).toEqual([]);
  const answer = await cssAnimations(page, "[data-review-answer]");
  expect(answer.length).toBeGreaterThan(0);
  expect(answer.every((a) => a.name === "fade-in" && a.delay === 0 && a.duration === 110)).toBe(true);
  // Same ruled line on both sides.
  expect((await answerCard(page).locator("h2").boundingBox())!.y).toBeCloseTo(head!.y, 0);
});

test("keys and clicks grade with a 120 ms flash, then the next card is there without travel (D1)", async ({ page }) => {
  await recordMotion(page);
  await watchCards(page);
  await openReview(page);

  await page.keyboard.press("Space");
  await expect(answerCard(page)).toBeVisible();
  const before = (await questionCard(page).or(answerCard(page)).boundingBox())!;
  await page.keyboard.press("3");
  await expect(page.getByText("01 / 11", { exact: true })).toBeVisible();
  await expect(questionCard(page)).toBeVisible();

  // A mouse click on a grade button: the same flash, the same swap.
  await questionCard(page).click();
  await grades(page).getByRole("button", { name: /^Сложно/ }).click();
  await expect(page.getByText(/^02 \/ \d\d$/)).toBeVisible();
  await expect(questionCard(page)).toBeVisible();

  const seen = await watched(page);
  expect(seen.__flashed).toEqual(["Знаю", "Сложно"]);
  expect(seen.__leavingSeen).toBe(false);
  expect(await played(page, "card-exit")).toEqual([]);
  expect(await played(page, "card-arrive")).toEqual([]);
  expect(await questionCard(page).boundingBox()).toEqual(before);
});

test("Z brings the last card back in place, opacity only (R7 desktop)", async ({ page }) => {
  await recordMotion(page);
  await openReview(page);
  const first = (await questionCard(page).getAttribute("aria-label"))!;
  await page.keyboard.press("Space");
  await page.keyboard.press("1");
  await expect(questionCard(page)).not.toHaveAccessibleName(first);
  await page.keyboard.press("z");
  await expect(questionCard(page)).toHaveAccessibleName(first);
  expect(await played(page, "card-return-fade")).toHaveLength(1);
  expect(await played(page, "card-arrive")).toEqual([]);
});

test("the card presses to .98 under the pointer and comes back (§5.1)", async ({ page }) => {
  await openReview(page);
  const box = (await questionCard(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  const layer = page.locator("[data-review-card] > [data-pressed]");
  await expect(layer).toHaveCount(1);
  await expect(layer).toHaveCSS("scale", "0.98");
  await page.mouse.up();
  await expect(answerCard(page)).toBeVisible();
  await expect(page.locator("[data-review-card] > [data-pressed]")).toHaveCount(0);
});
