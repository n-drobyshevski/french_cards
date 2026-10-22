import { expect, test, type CDPSession, type Page } from "@playwright/test";
import { loggedRatings, openReview, questionCard } from "./fixtures";
import { cssAnimations, played, recordMotion, vibrations } from "./review-loading";

// Review motion on phones (mockups/MOTION-SPEC.md R3–R8, R10, §5.2–5.5, §5.12): the reveal as a
// rewrite, the swipe stamp and the card behind, grade exits, undo, the progress line and
// «Готово на сегодня». Run-time motion is read from the recorded element.animate() calls, CSS
// motion from getAnimations().

test.use({ hasTouch: true, isMobile: true });

const grades = (page: Page) => page.getByRole("group", { name: "Оценка" });
const translateY = (value: string | number | undefined) => Number(/^0 (-?[\d.]+)px$/.exec(String(value))?.[1]);

/** A finger held on the card, moved step by step (real touch input over CDP). */
async function finger(page: Page, selector: string) {
  const box = (await page.locator(selector).boundingBox())!;
  const cdp: CDPSession = await page.context().newCDPSession(page);
  const x0 = box.x + box.width / 2;
  const y = box.y + box.height * 0.6;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y }] });
  let x = x0;
  return {
    width: box.width,
    /** Moves to `dx` from the start in small slow steps. */
    async to(dx: number) {
      const target = x0 + dx;
      const steps = Math.max(1, Math.ceil(Math.abs(target - x) / 12));
      const from = x;
      for (let i = 1; i <= steps; i++) {
        x = from + ((target - from) * i) / steps;
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
        await page.waitForTimeout(24);
      }
    },
    async lift() {
      await page.waitForTimeout(150); // let the velocity window run out: a slow release
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await cdp.detach();
    },
  };
}

const stamp = (page: Page, side: "good" | "again") => page.locator(`[data-review-card] [data-stamp="${side}"]`);
const stackScale = (page: Page) =>
  page.locator("[data-review-stack]").evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);

test("reveal is a rewrite: the headword glides up, then the answer writes in; back, it glides home (R3)", async ({ page }) => {
  await recordMotion(page);
  await openReview(page);

  await questionCard(page).tap();
  await expect(page.locator("[data-review-answer]")).toBeVisible();
  // FLIP: the headword starts where it stood (centred, lower) and glides to its answer place.
  const [up] = await played(page, "headword-glide");
  expect(translateY(up.keyframes[0].translate)).toBeGreaterThan(40);
  expect(up.duration).toBe(200);
  // The answer block rises in once the headword has mostly arrived; the grade bar fades in after it.
  const answer = await cssAnimations(page, "[data-review-answer]");
  expect(answer.filter((a) => a.name === "enter-rise").map((a) => [a.delay, a.duration])).toContainEqual([120, 240]);
  const bar = await cssAnimations(page, '[data-review-focus]:has([aria-label="Оценка"])');
  expect(bar).toContainEqual({ name: "fade-in", delay: 200, duration: 110 });
  // No 3D turn anywhere.
  expect(await page.locator("[data-review-answer]").evaluate((el) => getComputedStyle(el).transform)).toBe("none");

  await page.locator("[data-review-answer]").tap({ position: { x: 40, y: 400 } });
  await expect(questionCard(page)).toBeVisible();
  const back = await played(page, "headword-glide");
  expect(back).toHaveLength(2);
  expect(translateY(back[1].keyframes[0].translate)).toBeLessThan(-40);
});

test("reduced motion: the answer fades in 110 ms at once and the headword jumps (R3)", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await recordMotion(page);
  await openReview(page);
  await questionCard(page).tap();
  await expect(page.locator("[data-review-answer]")).toBeVisible();
  expect(await played(page, "headword-glide")).toEqual([]);
  const answer = await cssAnimations(page, "[data-review-answer]");
  expect(answer.filter((a) => a.name === "enter-rise").map((a) => [a.delay, a.duration])).toContainEqual([0, 110]);
});

test("the question side swipes with a stamp that ramps, locks at the threshold and falls back; the card behind grows (R4, R5)", async ({ page }) => {
  await recordMotion(page);
  await openReview(page);
  const next = page.locator("[data-review-stack]");
  // The next card waits behind with its real question side, out of reach.
  await expect(next).toHaveAttribute("aria-hidden", "true");
  await expect(next).toHaveAttribute("inert", "");
  await expect(next.locator("[lang=fr]").first()).not.toHaveText("");
  expect(await stackScale(page)).toBeCloseTo(0.96, 3);

  const touch = await finger(page, "[data-review-reveal]");
  const threshold = touch.width / 3;
  await touch.to(threshold * 0.6);
  await expect(stamp(page, "good")).not.toHaveAttribute("data-locked");
  const ramp = Number(await stamp(page, "good").evaluate((el) => (el as HTMLElement).style.opacity));
  expect(ramp).toBeGreaterThan(0.1);
  expect(ramp).toBeLessThanOrEqual(0.6);
  const midway = await stackScale(page);
  expect(midway).toBeGreaterThan(0.965);
  expect(midway).toBeLessThan(0.99);

  // Past the threshold the stamp locks: full ink, landing 1.04 → 1; the haptic tick plays.
  await touch.to(threshold + 20);
  await expect(stamp(page, "good")).toHaveAttribute("data-locked", "");
  expect((await cssAnimations(page, '[data-review-card] [data-stamp="good"]')).map((a) => [a.name, a.duration])).toContainEqual(["stamp-land", 300]);
  await expect(stamp(page, "good")).toHaveCSS("opacity", "1");
  expect(await stackScale(page)).toBeCloseTo(0.99, 3);
  expect(await vibrations(page)).toEqual([20]);

  // Back under it: the stamp falls back to at most .6.
  await touch.to(threshold * 0.7);
  await expect(stamp(page, "good")).not.toHaveAttribute("data-locked");
  await expect.poll(async () => Number(await stamp(page, "good").evaluate((el) => getComputedStyle(el).opacity))).toBeLessThanOrEqual(0.6);

  // A slow release under the threshold springs back, and the card is at rest again (no stuck settle).
  await touch.lift();
  await expect(page.locator("[data-review-card]")).not.toHaveAttribute("style", /transform/);
  expect(await loggedRatings(page)).toEqual([]);
  await expect(page.locator("[data-review-answer]")).toHaveCount(0);
});

test("a decided swipe flies on at its own speed while the next card settles out of the stack (R4, R5)", async ({ page }) => {
  await recordMotion(page);
  await openReview(page);
  const following = await page.locator("[data-review-stack] [lang=fr]").first().textContent();

  const touch = await finger(page, "[data-review-reveal]");
  await touch.to(-touch.width / 3 - 30);
  await touch.lift();
  await expect.poll(() => loggedRatings(page)).toEqual([1]);

  const [exit] = await played(page, "card-exit");
  expect(exit.duration).toBeGreaterThanOrEqual(120);
  expect(exit.duration).toBeLessThanOrEqual(220);
  const to = Number(/^translateX\((-?[\d.]+)px\)/.exec(String(exit.keyframes[1].transform))?.[1]);
  expect(to).toBeCloseTo(-touch.width * 1.2, 0);
  const [arrive] = await played(page, "card-arrive");
  expect(arrive.duration).toBe(350);
  expect(Number(arrive.keyframes[0].scale)).toBeCloseTo(0.99, 2);
  expect(arrive.at - exit.at).toBeLessThan(50);
  // The card that settled is the one that waited behind.
  await expect(questionCard(page)).toHaveAccessibleName(`Карточка ${following}, перевернуть`);
  expect(await vibrations(page)).toEqual([20, [35, 80, 35]]);
});

test("grade buttons fill, hold 120 ms, then send the card ← / ↓ / →; the progress line steps as scaleX (R6, R8)", async ({ page }) => {
  await recordMotion(page);
  await openReview(page);
  const fill = page.locator("[data-progress-fill]");
  await expect(fill).toHaveAttribute("style", /scaleX\(0\)/);
  await expect(fill).toHaveCSS("transform-origin", "0px 0.5px");

  const cases = [
    { name: /^Знаю/, to: "translateX(56px) rotate(3deg)", haptic: 40 },
    { name: /^Сложно/, to: "translateY(24px)", haptic: 20 },
    { name: /^Не знаю/, to: "translateX(-56px) rotate(-3deg)", haptic: [35, 80, 35] },
  ];
  for (const [i, c] of cases.entries()) {
    await questionCard(page).tap();
    const button = grades(page).getByRole("button", { name: c.name });
    await expect(button).toBeVisible();
    // Pressed: the button fills with its tone (on-ink text) and holds it until the card leaves.
    const pressed = await button.evaluate(async (el) => {
      const at = performance.now();
      (el as HTMLElement).click();
      let filled = false;
      while (el.isConnected && performance.now() - at < 400 && !filled) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        filled = el.hasAttribute("data-flash") && getComputedStyle(el).color === "rgb(255, 255, 255)";
      }
      return { at, filled };
    });
    expect(pressed.filled).toBe(true);
    const pressedAt = pressed.at;
    await expect.poll(async () => (await played(page, "card-exit")).length).toBe(i + 1);
    const exit = (await played(page, "card-exit"))[i];
    expect(exit.at - pressedAt).toBeGreaterThanOrEqual(110);
    expect(exit.duration).toBe(140);
    expect(exit.keyframes.at(-1)).toMatchObject({ transform: c.to, opacity: 0 });
    // The next card rises from the stack at the same moment.
    const arrive = (await played(page, "card-arrive"))[i];
    expect(Math.abs(arrive.at - exit.at)).toBeLessThan(50);
    expect((await vibrations(page)).at(-1)).toEqual(c.haptic);
    await expect(page.locator("[data-review-answer]")).toHaveCount(0);
  }
  expect(await loggedRatings(page)).toEqual([3, 2, 1]);
  await expect(page.getByText(/^03 \/ \d\d$/)).toBeVisible();
  expect(await fill.evaluate((el) => (el as HTMLElement).style.transform)).toMatch(/^scaleX\(0\.\d+\)$/);
});

test("undo brings the card back from the side it left, question up, over the card dropping into the stack (R7)", async ({ page }) => {
  await recordMotion(page);
  await openReview(page);
  const first = (await questionCard(page).getAttribute("aria-label"))!;
  await questionCard(page).tap();
  await grades(page).getByRole("button", { name: /^Не знаю/ }).tap();
  await expect.poll(() => loggedRatings(page)).toEqual([1]);
  await expect(questionCard(page)).not.toHaveAccessibleName(first);

  await page.getByRole("button", { name: "Отменить последний ответ" }).tap();
  await expect(questionCard(page)).toHaveAccessibleName(first);
  expect(await loggedRatings(page)).toEqual([]);
  const back = (await played(page, "card-arrive")).at(-1)!;
  expect(back.keyframes[0].translate).toBe("-56px 0");
  expect(back.duration).toBe(240);
  expect(await played(page, "card-return-fade")).toHaveLength(1);
  expect(await played(page, "stack-drop")).toHaveLength(1);
  expect((await vibrations(page)).at(-1)).toBe(20);
});

test("the last grade fills the progress line and holds it; then «Готово на сегодня» plays once (R8, R10)", async ({ page }) => {
  await recordMotion(page);
  // Whether the progress line was ever full while the card layout was still up.
  await page.addInitScript(() => {
    (window as unknown as { __fullBeforeDone: boolean }).__fullBeforeDone = false;
    new MutationObserver(() => {
      const fill = document.querySelector<HTMLElement>("[data-progress-fill]");
      if (fill?.style.transform === "scaleX(1)" && !document.querySelector("[data-session-done]")) {
        (window as unknown as { __fullBeforeDone: boolean }).__fullBeforeDone = true;
      }
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["style"] });
  });
  await openReview(page);
  const done = page.getByRole("heading", { name: "Готово на сегодня" });
  for (let i = 0; i < 60; i++) {
    await expect(questionCard(page).or(done)).toBeVisible();
    if (await done.isVisible()) break;
    await page.keyboard.press("Space");
    await expect(page.locator("[data-review-answer]")).toBeVisible();
    await page.keyboard.press("3");
    await expect(page.locator("[data-review-answer]")).toHaveCount(0);
  }
  await expect(done).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __fullBeforeDone: boolean }).__fullBeforeDone)).toBe(true);

  await expect(page.locator("[data-session-done][data-moment]")).toHaveCount(1);
  expect(await cssAnimations(page, "[data-done-rule]")).toEqual([{ name: "rule-draw", delay: 320, duration: 400 }]);
  await expect(page.locator("[data-date-stamp]")).toHaveText(/^\d\d\.\d\d$/);
  expect((await cssAnimations(page, "[data-date-stamp]")).map((a) => [a.name, a.delay])).toContainEqual(["stamp-land", 1100]);
  // One «done» haptic, with the stamp; keys never vibrate.
  await expect.poll(() => vibrations(page), { timeout: 3000 }).toEqual([[30, 60, 30, 60, 50]]);

  // A cold open of the finished day shows the view as it is: no moment, no haptic.
  await page.reload();
  await expect(done).toBeVisible();
  await expect(page.locator("[data-session-done]")).not.toHaveAttribute("data-moment");
  await page.waitForTimeout(1300);
  expect(await vibrations(page)).toEqual([]);
});
