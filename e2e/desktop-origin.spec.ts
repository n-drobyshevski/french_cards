import { expect, test, type Page } from "@playwright/test";

// «Происхождение» on desktop: edited in the library's detail pane, shown in the table's RU column.

const grid = (page: Page) => page.getByRole("grid");
const row = (page: Page, fr: string) => grid(page).getByRole("row", { name: new RegExp(`^${fr} —`) });
const pane = (page: Page) => page.getByRole("complementary", { name: "Карточка слова" });

test("the origin is edited in the detail pane and shows in the table", async ({ page }) => {
  await page.goto("/library");
  await row(page, "les flics").click();
  await expect(pane(page).getByRole("heading", { name: "les flics" })).toBeVisible();
  await expect(pane(page).getByText("не указано")).toBeVisible();
  await pane(page).getByRole("button", { name: "Изменить происхождение" }).click();
  const input = pane(page).getByRole("textbox", { name: "Происхождение" });
  await expect(input).toBeFocused();
  await input.fill("от flicaille, арго XIX века");
  await input.press("Enter");
  await expect(pane(page).getByText("от flicaille, арго XIX века")).toBeVisible();
  await expect(row(page, "les flics")).toContainText("· от flicaille, арго XIX века");
});
