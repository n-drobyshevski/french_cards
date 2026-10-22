import { expect, test, type Locator, type Page } from "@playwright/test";
import { motionSettled } from "./fixtures";

// Word rows on phones (MOTION-SPEC L7, L8, L10, §5.10): the long press charges and lifts the row,
// deleted rows are struck out and close, moved rows close, «Отменить» opens them again with the
// spotlight, and a swipe past 60 % locks «Удалить». Real touch input (CDP), as in swipe.spec.ts.
test.use({ hasTouch: true, isMobile: true });

const list = (page: Page, name: string) => page.getByRole("list", { name });
const rowButton = (page: Page, fr: string) => page.getByRole("button", { name: new RegExp(`^${fr} —`) });
/** The row's <li>, whatever state it is in (a closing row is hidden from the accessibility tree). */
const rowItem = (page: Page, fr: string) => page.locator("li").filter({ has: page.locator(`button[aria-label^="${fr} —"]`) });

async function openAllWords(page: Page) {
  await page.goto("/library");
  await page.getByRole("button", { name: "Все слова: 11", exact: true }).click();
  await expect(list(page, "Все слова").getByRole("listitem")).toHaveCount(11);
}

/** The French word of the first row (the newest word), which is on screen. */
async function firstWord(page: Page, listName: string): Promise<string> {
  const label = await list(page, listName).getByRole("listitem").first().getByRole("button").first().getAttribute("aria-label");
  return label!.split(" — ")[0];
}

/**
 * Records, from now on, what happens to the row of `fr` that a polling assertion could miss: the
 * strike-out line drawn, its Collapse closing.
 */
async function watchRow(page: Page, fr: string) {
  await page.evaluate((fr) => {
    const seen = { struck: false, closed: false };
    (window as unknown as { __row: typeof seen }).__row = seen;
    const check = () => {
      const button = document.querySelector(`button[aria-label^="${CSS.escape(fr)} —"]`);
      const li = button?.closest("li");
      if (!li) return;
      if (li.querySelector("[data-strike]")) seen.struck = true;
      if (li.querySelector('[data-state="closed"]')) seen.closed = true;
    };
    new MutationObserver(check).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-state"] });
  }, fr);
  return () => page.evaluate(() => (window as unknown as { __row: { struck: boolean; closed: boolean } }).__row);
}

async function touchDown(page: Page, target: Locator) {
  const box = (await target.boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
  return {
    async move(dx: number, steps = 12) {
      for (let i = 1; i <= steps; i++) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: point.x + (dx * i) / steps, y: point.y }] });
        await page.waitForTimeout(16);
      }
    },
    async up() {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await cdp.detach();
    },
  };
}

test("a held row charges, then lifts while its menu is open", async ({ page }) => {
  await openAllWords(page);
  const fr = await firstWord(page, "Все слова");
  const row = rowButton(page, fr);

  const tap = await touchDown(page, row);
  // The press tint is on at once (the --selected charge layer fills under it over --dur-long-press).
  await expect(row.locator("[data-pressed]")).toHaveCount(1);
  await tap.up();
  await expect(row.locator("[data-pressed]")).toHaveCount(0);
  // Whatever the release opened (the word sheet; on a slow machine maybe the menu), close it.
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await motionSettled(page);

  const held = await touchDown(page, row);
  await page.waitForTimeout(700);
  await held.up();
  const menu = page.getByRole("dialog", { name: fr });
  await expect(menu).toBeVisible();
  // The page under the modal sheet is hidden from the accessibility tree: find the row by its label.
  const under = page.locator(`button[aria-label^="${fr} —"]`);
  await expect(under).toHaveAttribute("data-lifted", "");
  await expect(under.locator("[data-pressed]")).toHaveCount(0);

  await menu.getByRole("button", { name: "Закрыть" }).click();
  await expect(menu).toBeHidden();
  await expect(under).not.toHaveAttribute("data-lifted", "");
});

test("«Удалить слово» strikes the row out, closes it and «Отменить» opens it again with the spotlight", async ({ page }) => {
  await openAllWords(page);
  const seen = await watchRow(page, "une blague");
  await rowButton(page, "une blague").dispatchEvent("contextmenu");
  const menu = page.getByRole("dialog", { name: "une blague" });
  await menu.getByRole("button", { name: "Удалить слово" }).click();

  // After the menu has gone: the strike-out line, then the row closes (Collapse) instead of vanishing.
  await expect.poll(seen).toEqual({ struck: true, closed: true });
  await expect(rowItem(page, "une blague")).toHaveCount(0);
  await expect(list(page, "Все слова").getByRole("listitem")).toHaveCount(10);
  const snack = page.locator("[data-snackbar]");
  await expect(snack).toContainText("Удалено · une blague");

  await snack.getByRole("button", { name: "Отменить" }).click();
  await expect(rowButton(page, "une blague")).toBeVisible();
  await expect(rowButton(page, "une blague").locator(".spotlight")).toHaveCount(1);
  await expect(rowButton(page, "une blague").locator("[data-strike]")).toHaveCount(0);
  await motionSettled(page);
  await expect(list(page, "Все слова").getByRole("listitem")).toHaveCount(11);
});

test("moving a word out of its theme closes its row; the snackbar names the theme", async ({ page }) => {
  await page.goto("/library");
  await page.getByRole("link", { name: /^Эмоции:/ }).click();
  const words = list(page, "Слова темы «Эмоции»");
  await expect(words.getByRole("listitem")).toHaveCount(2);

  const seen = await watchRow(page, "c'est dur");
  await rowButton(page, "c'est dur").dispatchEvent("contextmenu");
  await page.getByRole("dialog", { name: "c'est dur" }).getByRole("button", { name: "Переместить в тему" }).click();
  const picker = page.getByRole("dialog", { name: "Переместить в тему" });
  await picker.getByRole("radio", { name: /^Повседневное/ }).click();

  await expect.poll(async () => (await seen()).closed).toBe(true);
  await expect(words.getByRole("listitem")).toHaveCount(1);
  await expect(page.locator("[data-snackbar]")).toContainText("Перемещено в «Повседневное»");
  await expect(rowItem(page, "c'est dur")).toHaveCount(0);
});

test("a swipe past 60 % locks «Удалить» and the release deletes", async ({ page }) => {
  await openAllWords(page);
  const fr = await firstWord(page, "Все слова");
  const row = rowButton(page, fr);
  const width = (await row.boundingBox())!.width;
  const touch = await touchDown(page, row);
  await touch.move(-width * 0.75);
  // «Удалить» fills the revealed area; «Переместить» has folded away.
  await expect.poll(async () => (await rowItem(page, fr).getByText("Переместить").boundingBox())?.width ?? 0).toBeLessThan(2);
  await touch.up();
  await expect(page.locator("[data-snackbar]")).toContainText(`Удалено · ${fr}`);
  await expect(rowItem(page, fr)).toHaveCount(0);
});

test("a quick flick opens the actions even when short", async ({ page }) => {
  await openAllWords(page);
  const fr = await firstWord(page, "Все слова");
  const box = (await rowButton(page, fr).boundingBox())!;
  const y = box.y + box.height / 2;
  const x = box.x + box.width / 2;
  // Event times set explicitly, so the speed does not depend on how busy the machine is: 70px in
  // 40ms (1.75 px/ms), short of half the actions (80px).
  const t0 = Date.now() / 1000;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }], timestamp: t0 });
  for (let i = 1; i <= 4; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x - (70 * i) / 4, y }], timestamp: t0 + i * 0.01 });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [], timestamp: t0 + 0.05 });
  await cdp.detach();
  await expect(rowItem(page, fr).getByRole("button", { name: "Удалить" })).toBeVisible();
});

test("the lift is 2px up, and only a colour change under reduced motion", async ({ page }) => {
  await openAllWords(page);
  const lift = async () => {
    // The library remembers «Все слова».
    await page.goto("/library");
    await expect(list(page, "Все слова").getByRole("listitem")).toHaveCount(11);
    const fr = await firstWord(page, "Все слова");
    await rowButton(page, fr).dispatchEvent("contextmenu");
    await expect(page.getByRole("dialog", { name: fr })).toBeVisible();
    await motionSettled(page);
    return page.locator(`button[aria-label^="${fr} —"] > span`).evaluate((el) => getComputedStyle(el).translate);
  };
  expect(await lift()).toBe("0px -2px");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(["none", "0px", "0px 0px"]).toContain(await lift());
});
