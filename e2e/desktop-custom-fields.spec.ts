import { expect, test, type Page } from "@playwright/test";

// «Свои поля» from 768 up (mockups/DESKTOP-SPEC.md «Свои поля»): the settings section with its
// dialog and ↑ / ↓ on each row, and filling a field in the library's detail pane. Runs in the
// desktop-chromium project (1440×800) on the first-run seed words.

const section = (page: Page) => page.locator("#set-fields");
const grid = (page: Page) => page.getByRole("grid", { name: /^Слова/ });
const pane = (page: Page) => page.getByRole("complementary", { name: "Карточка слова" });

async function addField(page: Page, name: string, hint: string) {
  await section(page).getByRole("button", { name: "Добавить поле" }).click();
  const dialog = page.getByRole("dialog", { name: "Новое поле" });
  await expect(dialog.getByLabel("Название")).toBeFocused();
  await dialog.getByLabel("Название").fill(name);
  await dialog.getByLabel("Что писать").fill(hint);
  await dialog.getByRole("button", { name: /^Сохранить/ }).click();
  await expect(dialog).toBeHidden();
}

test("the settings section lists, edits and reorders the fields; the pane fills one", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("navigation", { name: "Разделы настроек" }).getByRole("link", { name: "Свои поля" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Свои поля" })).toBeVisible();

  await addField(page, "Синонимы", "2–3 синонима на французском");
  await addField(page, "Род", "m. или f.");
  const names = section(page).getByRole("button", { name: /^Изменить поле/ });
  await expect(names).toHaveText([/^Синонимы/, /^Род/]);

  // A name already taken is refused inline.
  await section(page).getByRole("button", { name: "Изменить поле «Род»" }).click();
  const dialog = page.getByRole("dialog", { name: "Изменить поле" });
  await dialog.getByLabel("Название").fill("синонимы");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(dialog.getByRole("alert")).toHaveText("Поле «синонимы» уже есть");
  await dialog.getByLabel("Название").fill("Род слова");
  await dialog.getByText("Заполнять автоматически").click();
  await dialog.getByRole("button", { name: /^Сохранить/ }).click();
  await expect(dialog).toBeHidden();
  await expect(section(page).getByRole("button", { name: "Изменить поле «Род слова»" })).toContainText("авто");

  await section(page).getByRole("button", { name: "Поднять поле «Род слова»" }).click();
  await expect(names).toHaveText([/^Род слова/, /^Синонимы/]);
  await expect(section(page).getByRole("button", { name: "Поднять поле «Род слова»" })).toBeDisabled();

  // The word pane lists both shared fields; fill one.
  await page.goto("/library");
  await grid(page)
    .getByRole("row", { name: /^les flics —/ })
    .click();
  await expect(pane(page).getByRole("heading", { name: "les flics" })).toBeVisible();
  await pane(page).getByRole("button", { name: "Добавить: Синонимы" }).click();
  const value = pane(page).getByRole("textbox", { name: "Синонимы" });
  await expect(value).toBeFocused();
  await value.fill("les keufs, la police");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(pane(page).getByText("les keufs, la police")).toBeVisible();
  await expect(pane(page).getByRole("button", { name: "Добавить: Род слова" })).toBeVisible();
});
