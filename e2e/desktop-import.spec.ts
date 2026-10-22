import { expect, test, type Page, type Route } from "@playwright/test";
import { EXTRACTED, mockExtract, NDJSON, screenshotPng } from "./fixtures";

// Desktop screenshot import (mockups/D-Import-*.dc.html, DESKTOP-SPEC §4 «Import review»), 1440×800.

const sidebar = (page: Page) => page.getByRole("complementary", { name: "Разделы" });
const fileInput = (page: Page) => page.locator("input[type=file][accept='image/png,image/jpeg,image/webp']");
const rows = (page: Page) => page.getByRole("list", { name: "Найденные слова" });

async function chooseScreenshot(page: Page) {
  await fileInput(page).setInputFiles({ name: "chat.png", mimeType: "image/png", buffer: await screenshotPng(page) });
}

const ndjson = (lines: unknown[]) => lines.map((l) => JSON.stringify(l)).join("\n") + "\n";

test("the drop tray sits beside the sidebar with the margin notes", async ({ page }) => {
  await page.goto("/import");
  await expect(sidebar(page).getByRole("link", { name: "Импорт" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { level: 1, name: "Импорт со скриншота" })).toBeVisible();
  const tray = page.getByRole("region", { name: "Скриншот со словами" });
  await expect(tray).toBeVisible();
  await expect(tray.getByRole("button", { name: "Выбрать скриншот" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Примечания" }).getByText("ДОГАДКА")).toBeVisible();
  await expect(page.locator("[data-tabbar]")).toBeHidden();

  const box = (await tray.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(248);
  expect(Math.round(box.width)).toBe(720);
  expect(Math.round(box.height)).toBe(432);
});

test("a chosen screenshot goes through processing to the review beside the screenshot", async ({ page }) => {
  // Hold the answer until the processing screen has been checked.
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/ai/extract", async (route: Route) => {
    await held;
    await route.fulfill({
      status: 200,
      contentType: NDJSON,
      body: ndjson([
        { type: "meta", images: 1 },
        ...EXTRACTED.map((item, index) => ({ type: "item", index, item })),
        { type: "done", count: EXTRACTED.length },
      ]),
    });
  });
  await page.goto("/import");
  await chooseScreenshot(page);

  await expect(page.getByRole("heading", { name: "Распознаём слова…" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Прогресс распознавания" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Скриншот" }).getByRole("img", { name: "Скриншот" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Стоп" })).toBeVisible();
  release();

  await expect(page.getByRole("heading", { name: "Найдено 4 слова" })).toBeVisible();
  const shotPane = page.getByRole("complementary", { name: "Скриншот" });
  const shot = shotPane.getByRole("button", { name: /Скриншот 1 из 1, открыть в полном размере/ });
  await expect(shot).toBeVisible();
  await expect(sidebar(page)).toBeVisible();

  // Screenshot column (456 at 1440) on the left, the rows to its right.
  const pane = (await shotPane.boundingBox())!;
  const list = (await rows(page).boundingBox())!;
  expect(Math.round(pane.x)).toBe(248);
  expect(Math.round(pane.width)).toBe(456);
  expect(list.x).toBeGreaterThanOrEqual(pane.x + pane.width);

  await expect(rows(page).getByText("ДОГАДКА")).toBeVisible();
  await expect(rows(page).getByText("УЖЕ ЕСТЬ")).toBeVisible();
  await expect(rows(page).getByText("На скриншоте «chlou» — похоже на опечатку")).toBeVisible();

  // Zoom dialog.
  await shot.click();
  const zoom = page.getByRole("dialog", { name: "Скриншот" });
  await expect(zoom).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(zoom).toBeHidden();
});

test("rows toggle by click and keys, themes change, ⌘↵ adds the checked words", async ({ page }) => {
  await mockExtract(page, EXTRACTED);
  await page.goto("/import");
  await chooseScreenshot(page);
  await expect(page.getByRole("heading", { name: "Найдено 4 слова" })).toBeVisible();
  await expect(page.getByText(/Отмечено\s*2\s*из\s*4/i)).toBeVisible();
  const add = page.getByRole("button", { name: /^Добавить \d+ слов/ });
  await expect(add).toHaveText(/Добавить 2 слова/);

  // Click the checkbox gutter.
  await rows(page).getByRole("checkbox", { name: "Добавить «le fric»" }).click();
  await expect(page.getByText(/Отмечено\s*1\s*из\s*4/i)).toBeVisible();
  await expect(rows(page).getByRole("checkbox", { name: "«les flics» уже есть" })).toHaveAttribute("aria-disabled", "true");

  // X toggles the current row (le fric, the one just clicked); J moves down.
  await page.keyboard.press("x");
  await expect(page.getByText(/Отмечено\s*2\s*из\s*4/i)).toBeVisible();
  await page.keyboard.press("j");
  await page.keyboard.press("j");
  await expect(rows(page).locator("[aria-current=true]")).toContainText("chelou");

  // ↵ edits the current row inline, Esc cancels.
  await page.keyboard.press("Enter");
  const editor = page.getByRole("form", { name: "Правка «chelou»" });
  await expect(editor.getByRole("textbox", { name: "Французский" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(editor).toBeHidden();
  // ↵ again and save: the amber row is checked and no longer amber.
  await page.keyboard.press("Enter");
  await editor.getByRole("textbox", { name: "Русский" }).fill("стрёмный");
  await editor.getByRole("textbox", { name: "Русский" }).press("Enter");
  await expect(editor).toBeHidden();
  await expect(rows(page).getByText("На скриншоте «chlou» — похоже на опечатку")).toHaveCount(0);
  await expect(page.getByText(/Отмечено\s*3\s*из\s*4/i)).toBeVisible();

  // Theme menu per row.
  await rows(page).getByRole("button", { name: /^Тема для «le fric»: Деньги/ }).click();
  const menu = page.getByRole("menu", { name: "Тема для «le fric»" });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitemradio", { name: /Еда/ }).click();
  await expect(menu).toBeHidden();
  await expect(rows(page).getByRole("button", { name: /^Тема для «le fric»: Еда/ })).toBeVisible();

  // Ctrl+A (⌘A on Mac) clears everything, again selects all addable rows.
  await rows(page).getByRole("checkbox", { name: "Добавить «le fric»" }).focus();
  await page.keyboard.press("ControlOrMeta+a");
  await expect(page.getByText(/Отмечено\s*0\s*из\s*4/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Ничего не отмечено" })).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("ControlOrMeta+a");
  await expect(page.getByText(/Отмечено\s*3\s*из\s*4/i)).toBeVisible();

  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByText(/Добавлено 3/)).toBeVisible();
});

test("pasting an image elsewhere in the app starts the import", async ({ page }) => {
  await mockExtract(page, EXTRACTED);
  await page.goto("/library");
  await expect(sidebar(page).getByRole("link", { name: /^Библиотека/ })).toHaveAttribute("aria-current", "page");
  const png = (await screenshotPng(page)).toString("base64");

  // A paste into a text field stays there.
  const pasteInto = (selector: string | null) =>
    page.evaluate(
      ([b64, sel]) => {
        const bytes = Uint8Array.from(atob(b64!), (c) => c.charCodeAt(0));
        const data = new DataTransfer();
        data.items.add(new File([bytes], "shot.png", { type: "image/png" }));
        const target = sel ? document.querySelector<HTMLElement>(sel)! : document.body;
        if (sel) target.focus();
        else (document.activeElement as HTMLElement | null)?.blur();
        target.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
      },
      [png, selector] as const,
    );

  // The desk replaces its placeholder (no input) once the words are read; wait for the real field.
  await expect(page.locator("main input[type=search]")).toBeVisible();
  await pasteInto("main input[type=search]");
  await page.waitForTimeout(300);
  await expect(page).toHaveURL(/\/library/);

  await pasteInto(null);
  await expect(page).toHaveURL(/\/import/);
  await expect(page.getByRole("heading", { name: "Найдено 4 слова" })).toBeVisible();
  await expect(page).toHaveURL(/\/import$/);
});

test("dropping an image file on the window shows the overlay and starts the import", async ({ page }) => {
  await mockExtract(page, EXTRACTED);
  await page.goto("/");
  await expect(sidebar(page)).toBeVisible();
  const png = (await screenshotPng(page)).toString("base64");

  await page.evaluate((b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const data = new DataTransfer();
    data.items.add(new File([bytes], "shot.png", { type: "image/png" }));
    (window as unknown as { __drop: DataTransfer }).__drop = data;
    document.body.dispatchEvent(new DragEvent("dragenter", { dataTransfer: data, bubbles: true, cancelable: true }));
  }, png);
  await expect(page.getByText("Отпустите, чтобы распознать")).toBeVisible();

  await page.evaluate(() => {
    const data = (window as unknown as { __drop: DataTransfer }).__drop;
    document.body.dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }));
  });
  await expect(page.getByText("Отпустите, чтобы распознать")).toBeHidden();
  await expect(page.getByRole("heading", { name: "Найдено 4 слова" })).toBeVisible();
});
