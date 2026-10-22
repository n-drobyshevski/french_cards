import { expect, test, type Page } from "@playwright/test";
import { openReview } from "./fixtures";

// Real touch input (CDP), not mouse: on touch the browser captures the pointer implicitly on the
// child under the finger and may claim horizontal drags for its own back gesture. Both broke
// swiping on phones while mouse-driven tests passed.
test.use({ hasTouch: true, isMobile: true });

async function touchSwipe(page: Page, direction: 1 | -1) {
  const card = page.locator("[data-review-answer]");
  const box = await card.boundingBox();
  if (!box) throw new Error("answer card not visible");
  const cdp = await page.context().newCDPSession(page);
  const x0 = box.x + box.width / 2;
  const y = box.y + box.height * 0.45; // inside the scrollable body of the card
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y }] });
  for (let i = 1; i <= 10; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x0 + direction * i * 18, y: y + i * 0.5 }] });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

async function touchDrag(page: Page, selector: string, dx: number, dy: number) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`${selector} not visible`);
  const cdp = await page.context().newCDPSession(page);
  const x0 = box.x + box.width / 2;
  const y0 = box.y + box.height * 0.6;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y: y0 }] });
  for (let i = 1; i <= 10; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x0 + (dx * i) / 10, y: y0 + (dy * i) / 10 }] });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

test("swiping the question card up flips it; a downward drag does not", async ({ page }) => {
  await openReview(page);
  const front = page.getByRole("button", { name: /^Карточка .*, перевернуть$/ });
  await expect(front).toBeVisible();

  await touchDrag(page, "main button[aria-label^='Карточка']", 0, 120);
  await page.waitForTimeout(300);
  await expect(page.locator("[data-review-answer]")).toHaveCount(0);

  await touchDrag(page, "main button[aria-label^='Карточка']", 4, -160);
  await expect(page.locator("[data-review-answer]")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Знаю/ })).toBeVisible();
});

test("a tap on the question card still flips it", async ({ page }) => {
  await openReview(page);
  await page.getByRole("button", { name: /^Карточка .*, перевернуть$/ }).tap();
  await expect(page.locator("[data-review-answer]")).toBeVisible();
});

test("swiping the answer card with a finger grades it: right = Знаю, left = Не знаю", async ({ page }) => {
  await openReview(page);

  await page.getByRole("button", { name: "Показать ответ" }).click();
  const first = await page.locator("[data-review-answer] h2").innerText();
  await touchSwipe(page, 1);
  await expect(page.getByText(`Знаю · ${first}`)).toBeVisible();
  await expect(page).toHaveURL(/\/$/);

  await page.getByRole("button", { name: "Показать ответ" }).click();
  const second = await page.locator("[data-review-answer] h2").innerText();
  await touchSwipe(page, -1);
  await expect(page.getByText(`Не знаю · ${second}`)).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});
