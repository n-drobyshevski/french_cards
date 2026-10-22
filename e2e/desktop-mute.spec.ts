import { expect, test, type Page } from "@playwright/test";

// «На паузе» on desktop: set from the detail pane, found with the filter strip, undone with «Вернуть».

const grid = (page: Page) => page.getByRole("grid");
const row = (page: Page, fr: string) => grid(page).getByRole("row", { name: new RegExp(`^${fr} —`) });
const pane = (page: Page) => page.getByRole("complementary", { name: "Карточка слова" });

test("a word paused from the detail pane shows under «На паузе» and comes back with «Вернуть»", async ({ page }) => {
  await page.goto("/library");
  const filter = page.getByRole("group", { name: "Фильтр" });
  await expect(filter.getByRole("button", { name: /На паузе/ })).toHaveCount(0);
  await row(page, "les flics").click();
  await pane(page).getByRole("button", { name: "На паузу" }).click();
  await expect(pane(page).getByText("На паузе — не показывается в повторениях")).toBeVisible();
  await expect(row(page, "les flics")).toContainText("на паузе");

  await filter.getByRole("button", { name: /На паузе/ }).click();
  await expect(grid(page).getByRole("row", { name: / — / })).toHaveCount(1);
  await expect(row(page, "les flics")).toBeVisible();

  await pane(page).getByRole("button", { name: "Вернуть", exact: true }).click();
  await expect(pane(page).getByText("На паузе — не показывается в повторениях")).toHaveCount(0);
});
