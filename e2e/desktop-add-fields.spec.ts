import { expect, test, type Page } from "@playwright/test";
import { addSheet, LA_THUNE, mockEnrich, mockSuggest, openReview } from "./fixtures";

// «+ Поле» in the desktop «Новое слово» dialog.

const headword = (page: Page) => addSheet(page).getByRole("combobox", { name: "Слово или выражение — FR или RU" });

test("«+ Поле» in the dialog adds an origin and a field of its own", async ({ page }) => {
  await mockSuggest(page, [LA_THUNE]);
  await mockEnrich(page, () => null);
  await openReview(page);
  await expect(async () => {
    if (!(await addSheet(page).isVisible())) await page.keyboard.press("n");
    await expect(addSheet(page)).toBeVisible({ timeout: 1000 });
  }).toPass();
  await headword(page).fill("la thu");
  await page.getByRole("option", { name: "Выбрать: la thune — бабки, деньги", exact: true }).click();

  const sheet = addSheet(page);
  const menu = page.getByRole("menu", { name: "Какое поле" });
  await sheet.getByRole("button", { name: "Поле", exact: true }).click();
  await menu.getByRole("menuitem", { name: /^Происхождение/ }).click();
  await sheet.getByRole("textbox", { name: "Происхождение" }).fill("старое арго, от thune «милостыня»");
  // A noun with its origin: nothing else to offer, so «+ Поле» adds a field of its own at once.
  await sheet.getByRole("button", { name: "Поле", exact: true }).click();
  await expect(menu).toHaveCount(0);
  await expect(sheet.getByRole("textbox", { name: "Название поля 1" })).toBeFocused();
  await sheet.getByRole("textbox", { name: "Название поля 1" }).fill("Где услышал");
  await sheet.getByRole("textbox", { name: "Значение поля 1" }).fill("в сериале");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(sheet).toBeHidden();

  await page.goto("/library");
  const row = page.getByRole("grid").getByRole("row", { name: /^la thune —/ });
  await expect(row).toContainText("старое арго, от thune «милостыня»");
  await row.click();
  const pane = page.getByRole("complementary", { name: "Карточка слова" });
  await expect(pane.getByText("в сериале")).toBeVisible();
});
