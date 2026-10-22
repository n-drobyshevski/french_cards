import { expect, test } from "@playwright/test";
import { openReview } from "./fixtures";

// Desktop dialogs (mockups/MOTION-SPEC.md D5): in with an 8px rise, out with a fade 4px down; the
// scrim fades the same way. Runs in the desktop-chromium project.

test("dialogs rise in and fade out with their scrim", async ({ page }) => {
  await openReview(page);
  await page.keyboard.press("Shift+Slash");
  const dialog = page.getByRole("dialog", { name: "Клавиши" });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((el) => getComputedStyle(el).animationName)).toBe("dialog-in");

  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __out: string[] }).__out = seen;
    for (const el of document.querySelectorAll(".dialog-panel, .dialog-scrim"))
      new MutationObserver(() => {
        if (el.getAttribute("data-state") === "closed") seen.push(getComputedStyle(el).animationName);
      }).observe(el, { attributes: true, attributeFilter: ["data-state"] });
  });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  expect((await page.evaluate(() => (window as unknown as { __out: string[] }).__out)).sort()).toEqual(["dialog-out", "fade-out"]);
});
