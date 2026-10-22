import { expect, test, type Page } from "@playwright/test";
import { addSheet, openReview } from "./fixtures";

// Desktop Settings and Login (mockups/DESKTOP-SPEC.md §5 boards 20 and 21). Runs in the
// desktop-chromium project (1440×800), local-only mode.

const sectionNav = (page: Page) => page.getByRole("navigation", { name: "Разделы настроек" });

async function openSettings(page: Page) {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { level: 1, name: "Настройки" })).toBeVisible();
}

test("section nav with scroll-spy, form in a 640 column", async ({ page }) => {
  await openSettings(page);
  const nav = sectionNav(page);
  await expect(nav).toBeVisible();
  for (const name of ["Повторение", "Оформление", "ИИ", "Клавиши", "Данные"]) {
    await expect(nav.getByRole("link", { name })).toBeVisible();
  }
  await expect(nav.getByRole("link", { name: "Повторение" })).toHaveAttribute("aria-current", "true");
  // No phone header (back arrow) and no phone-only rows on desktop.
  await expect(page.getByRole("button", { name: "Назад" })).toHaveCount(0);
  await expect(page.getByText("Вибрация", { exact: true })).toHaveCount(0);

  const heading = page.getByRole("heading", { level: 2, name: "Повторение" });
  const box = await heading.boundingBox();
  expect(box!.x).toBe(520);

  await nav.getByRole("link", { name: "Данные" }).click();
  await expect(nav.getByRole("link", { name: "Данные" })).toHaveAttribute("aria-current", "true");
  await expect(nav.getByRole("link", { name: "Повторение" })).not.toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("heading", { level: 2, name: "Данные" })).toBeInViewport();
  await expect(page.getByText("только на этом устройстве")).toBeVisible();
  await expect(page).toHaveURL(/#set-data$/);

  // Once the smooth scroll has settled, scrolling back to the top hands «current» back.
  let last = -1;
  await expect(async () => {
    const y = await page.evaluate(() => window.scrollY);
    const settled = y === last;
    last = y;
    expect(settled).toBe(true);
  }).toPass({ intervals: [200] });
  await page.mouse.move(800, 400);
  await page.mouse.wheel(0, -5000);
  await expect(nav.getByRole("link", { name: "Повторение" })).toHaveAttribute("aria-current", "true");
});

test("checkboxes, text options and the direction select", async ({ page }) => {
  await openSettings(page);
  const swipes = page.getByRole("checkbox", { name: "Свайпы для оценки" });
  const before = await swipes.isChecked();
  await swipes.click();
  await expect(swipes).toBeChecked({ checked: !before });

  const grades = page.getByRole("radiogroup", { name: "Кнопки оценки" });
  await expect(grades.getByRole("radio", { name: /Три кнопки/ })).toBeChecked();
  await grades.getByRole("radio", { name: /Две кнопки/ }).click();
  await expect(grades.getByRole("radio", { name: /Две кнопки/ })).toBeChecked();

  const themes = page.getByRole("radiogroup", { name: "Тема" });
  await themes.getByRole("radio", { name: "Тёмная" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await themes.getByRole("radio", { name: "Тёмная" }).press("ArrowRight");
  await expect(themes.getByRole("radio", { name: "Система" })).toBeChecked();
  await expect(themes.getByRole("radio", { name: "Система" })).toBeFocused();

  const select = page.getByRole("button", { name: /Направление по умолчанию/ });
  await expect(select).toContainText("FR → RU");
  await select.click();
  const list = page.getByRole("listbox", { name: "Направление по умолчанию" });
  await expect(list).toBeVisible();
  await expect(list.getByRole("option", { name: /FR → RU/ })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(list).toBeHidden();
  await expect(select).toContainText("RU → FR");
  await expect(select).toBeFocused();

  const stepper = page.getByRole("spinbutton", { name: "Новых карточек в день" });
  await expect(stepper).toHaveAttribute("aria-valuenow", "15");
  await page.getByRole("button", { name: "Больше" }).click();
  await expect(stepper).toHaveAttribute("aria-valuenow", "20");
  await stepper.press("ArrowDown");
  await expect(stepper).toHaveAttribute("aria-valuenow", "15");

  await page.reload();
  await expect(page.getByRole("button", { name: /Направление по умолчанию/ })).toContainText("RU → FR");
  await expect(page.getByRole("radiogroup", { name: "Кнопки оценки" }).getByRole("radio", { name: /Две кнопки/ })).toBeChecked();
});

test("«Однобуквенные сочетания» off stops N; back on, N opens the add dialog", async ({ page }) => {
  await openSettings(page);
  const single = page.getByRole("checkbox", { name: "Однобуквенные сочетания" });
  await expect(single).toBeChecked();
  await expect(single).toHaveAccessibleDescription(/N, \/, J, K, X, M и другие/);
  await single.click();
  await expect(single).not.toBeChecked();

  await openReview(page);
  await page.waitForTimeout(300);
  await page.keyboard.press("n");
  await page.keyboard.press("Shift+Slash");
  await page.waitForTimeout(300);
  await expect(addSheet(page)).toBeHidden();
  await expect(page.getByRole("dialog", { name: "Клавиши" })).toBeHidden();

  await openSettings(page);
  await page.getByRole("checkbox", { name: "Однобуквенные сочетания" }).click();
  await expect(page.getByRole("checkbox", { name: "Однобуквенные сочетания" })).toBeChecked();
  await openReview(page);
  await page.waitForTimeout(300);
  await page.keyboard.press("n");
  await expect(addSheet(page)).toBeVisible();
});

test("«Подсказки клавиш при повторении» persists", async ({ page }) => {
  await openSettings(page);
  const hints = page.getByRole("checkbox", { name: "Подсказки клавиш при повторении" });
  await expect(hints).toBeChecked();
  await hints.click();
  await expect(hints).not.toBeChecked();
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Подсказки клавиш при повторении" })).not.toBeChecked();
});

test("«?» opens «Клавиши»", async ({ page }) => {
  await openSettings(page);
  const button = page.getByRole("button", { name: "Все клавиши" });
  await expect(button).toHaveAttribute("aria-keyshortcuts", "Shift+Slash");
  await button.click();
  const dialog = page.getByRole("dialog", { name: "Клавиши" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("medium (1024): rail, no section nav, same form", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await openSettings(page);
  await expect(sectionNav(page)).toBeHidden();
  await expect(page.getByRole("checkbox", { name: "Однобуквенные сочетания" })).toBeVisible();
});

test("phones keep today's settings, without «Клавиши»", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openSettings(page);
  await expect(page.getByRole("switch", { name: "Свайпы для оценки" })).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByText("Однобуквенные сочетания")).toHaveCount(0);
  await expect(sectionNav(page)).toHaveCount(0);
});

test("/login: centred 400px column (local-only: «ВХОД НЕ НУЖЕН»)", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { level: 1, name: "Карточки для Лизи" })).toBeVisible();
  const panel = page.getByText("ВХОД НЕ НУЖЕН");
  await expect(panel).toBeVisible();
  const card = page.locator("main > div").filter({ has: panel });
  const box = await card.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBe(400);
  expect(box!.x).toBe(520);
  expect(box!.y).toBe(232);
  // The primary sits inside the panel on desktop.
  const open = card.getByRole("link", { name: "Открыть карточки" });
  await expect(open).toBeVisible();
  const openBox = await open.boundingBox();
  expect(openBox!.width).toBe(350);
  expect(openBox!.height).toBe(44);
  await expect(page.getByText("Вход по паролю работает и в приложении на главном экране iPhone.")).toBeVisible();
});
