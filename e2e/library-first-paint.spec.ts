import { expect, test } from "@playwright/test";
// The e2e «План повторения» (LEGACY_PLAN, seeded before each test): the stepper below counts its cards.
import "./fixtures";

// First paint without flashes (mockups/MOTION-SPEC.md §3.1, L2, T1): stored choices are on screen
// from the first client frame (localStorage mirror), never the defaults first.

test("after choosing «Все слова», a reload never shows the theme tiles first", async ({ page }) => {
  await page.goto("/library");
  await page.getByRole("button", { name: "Все слова: 11", exact: true }).click();
  await expect(page.getByText("Все слова · 11")).toBeVisible();

  // Watch every DOM change from the very start of the next load for the «Темы» view.
  await page.addInitScript(() => {
    const w = window as unknown as { __themesSeen: boolean };
    w.__themesSeen = false;
    const check = () => {
      if (document.querySelector('[aria-label^="Все слова одним списком"], a[aria-label^="Эмоции:"]')) w.__themesSeen = true;
    };
    new MutationObserver(check).observe(document, { childList: true, subtree: true });
  });
  await page.reload();
  await expect(page.getByText("Все слова · 11")).toBeVisible();
  await expect(page.getByRole("list", { name: "Все слова" }).getByRole("listitem")).toHaveCount(11);
  expect(await page.evaluate(() => (window as unknown as { __themesSeen: boolean }).__themesSeen)).toBe(false);
});

test("a theme page opens with its title, numbers and «Повторить тему» in the first frame", async ({ page }) => {
  await page.goto("/library");
  const tile = page.getByRole("link", { name: /^Эмоции:/ });
  await expect(tile).toBeVisible();

  // Record what each painted frame shows after the tap.
  await page.evaluate(() => {
    const w = window as unknown as { __frames: { title: string; footer: boolean }[] };
    w.__frames = [];
    const sample = () => {
      if (location.pathname.startsWith("/library/")) {
        w.__frames.push({
          title: document.querySelector("main h1")?.textContent ?? "",
          footer: !!document.querySelector("[data-folder-footer] > *"),
        });
      }
      if (w.__frames.length < 30) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await tile.click();
  await expect(page.getByRole("heading", { name: "Эмоции", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: /Повторить тему|Тренировка всей темы/ })).toBeVisible();
  await page.waitForFunction(() => (window as unknown as { __frames: unknown[] }).__frames.length >= 5);
  const frames = await page.evaluate(() => (window as unknown as { __frames: { title: string; footer: boolean }[] }).__frames);
  expect(frames.length).toBeGreaterThan(0);
  for (const f of frames) {
    expect(f.title).toBe("Эмоции");
    expect(f.footer).toBe(true);
  }
});

test("settings show the stored values from the first painted frame after a reload", async ({ page }) => {
  // «План повторения» is synced (user_prefs, no localStorage mirror): until it is read its stepper is
  // drawn valueless, never with a wrong number. The e2e plan counts cards («Назавтра»): 20 a day.
  await page.goto("/settings/plan");
  const stepper = page.getByRole("group", { name: "Новых карточек в день" });
  await expect(stepper.locator("output")).toHaveText("20");
  await stepper.getByRole("button", { name: "Больше" }).click();
  await expect(stepper.locator("output")).toHaveText("21");
  await page.goto("/settings");
  await page.getByRole("radiogroup", { name: "Кнопки оценки" }).getByRole("radio", { name: /^Две кнопки/ }).click();

  // Every painted frame: the stepper number as it is visible (transparent = valueless, allowed).
  await page.addInitScript(() => {
    const w = window as unknown as { __seen: string[] };
    w.__seen = [];
    const sample = () => {
      const out = document.querySelector('[role="group"][aria-label="Новых карточек в день"] output');
      if (out) {
        const color = getComputedStyle(out).color;
        const transparent = color === "transparent" || /rgba\(.*,\s*0\)$/.test(color);
        if (!transparent && !w.__seen.includes(out.textContent ?? "")) w.__seen.push(out.textContent ?? "");
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.reload();
  await expect(page.getByRole("radiogroup", { name: "Кнопки оценки" }).getByRole("radio", { name: /^Две кнопки/ })).toBeChecked();
  await page.goto("/settings/plan");
  await expect(page.getByRole("group", { name: "Новых карточек в день" }).locator("output")).toHaveText("21");
  expect(await page.evaluate(() => (window as unknown as { __seen: string[] }).__seen)).toEqual(["21"]);
});
