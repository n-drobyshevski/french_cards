import { expect, test } from "@playwright/test";
import { openReview, tabBar } from "./fixtures";

// Shared motion primitives (mockups/MOTION-SPEC.md K7, T2, N2, A1): the toggle thumb travels, the
// snackbar leaves the way it came, sheets use the motion tokens instead of vaul's 500ms.

test("the toggle thumb slides with a transform and the switch presses in", async ({ page }) => {
  await page.goto("/settings/review");
  const toggle = page.getByRole("switch", { name: "Свайпы для оценки" });
  await expect(toggle).toBeVisible();
  const thumb = toggle.locator("[data-toggle-thumb]");
  const look = () =>
    thumb.evaluate((el) => {
      const style = getComputedStyle(el);
      return { translate: style.translate, transition: style.transitionProperty };
    });
  const before = await look();
  // A value that arrives on its own only fades; a tap slides the thumb.
  expect(before.transition).not.toContain("translate");
  await toggle.click();
  await expect.poll(async () => (await look()).translate).not.toBe(before.translate);
  expect((await look()).transition).toContain("translate");
  expect(await toggle.evaluate((el) => getComputedStyle(el).transitionProperty)).toContain("scale");
  await toggle.click();
  await expect.poll(async () => (await look()).translate).toBe(before.translate);
});

test("a new review snackbar enters while the old one leaves 8px down, then the old one is removed", async ({ page }) => {
  await openReview(page);
  for (const counter of ["01 / 11", "02 / 11"]) {
    await page.keyboard.press("Space");
    await page.keyboard.press("3");
    await expect(page.getByText(counter, { exact: true })).toBeVisible();
  }
  await page.keyboard.press("z");
  await expect(page.getByText("01 / 11", { exact: true })).toBeVisible();
  const bar = page.locator("[data-snackbar]", { hasText: "Ответ отменён" });
  await expect(bar).toBeVisible();
  expect(await bar.evaluate((el) => getComputedStyle(el.parentElement!).animationName)).toBe("snackbar-in");

  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __leaving: string[] }).__leaving = seen;
    new MutationObserver((records) => {
      for (const r of records)
        for (const node of r.addedNodes)
          if (node instanceof HTMLElement && node.classList.contains("snackbar-out")) seen.push(getComputedStyle(node).animationName);
    }).observe(document.body, { subtree: true, childList: true });
  });
  await page.keyboard.press("z");
  await expect(page.getByText("00 / 11", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __leaving: string[] }).__leaving)).toEqual(["snackbar-out"]);
  // Only the live bar carries the hook; the leaving copy is gone after --dur-exit.
  await expect(page.locator("[data-snackbar]")).toHaveCount(1);
  await expect(page.locator(".snackbar-out")).toHaveCount(0);
});

test("sheets open in --dur-sheet and close in --dur-enter", async ({ page }) => {
  await openReview(page);
  await tabBar(page).getByRole("button", { name: "Добавить" }).click();
  const drawer = page.locator("[data-vaul-drawer]");
  await expect(drawer).toHaveAttribute("data-state", "open");
  expect(await drawer.evaluate((el) => getComputedStyle(el).animationDuration)).toBe("0.38s");

  await page.evaluate(() => {
    const el = document.querySelector("[data-vaul-drawer]")!;
    new MutationObserver(() => {
      if (el.getAttribute("data-state") === "closed")
        (window as unknown as { __close: string }).__close ||= getComputedStyle(el).animationDuration;
    }).observe(el, { attributes: true, attributeFilter: ["data-state"] });
  });
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __close: string }).__close)).toBe("0.24s");
});
