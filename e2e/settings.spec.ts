import { expect, test } from "@playwright/test";

test("switching the theme to dark applies at once and survives a reload", async ({ page }) => {
  await page.goto("/settings");
  const themes = page.getByRole("radiogroup", { name: "Тема" });
  await expect(themes.getByRole("radio", { name: "Система" })).toBeChecked();

  await themes.getByRole("radio", { name: "Тёмная" }).click();
  await expect(themes.getByRole("radio", { name: "Тёмная" })).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(18, 18, 18)");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.goto("/");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(18, 18, 18)");

  await page.goto("/settings");
  await page.getByRole("radiogroup", { name: "Тема" }).getByRole("radio", { name: "Светлая" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(241, 241, 238)");
});

test("settings show local-only sync and the privacy line", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByText("только на этом устройстве")).toBeVisible();
  await expect(page.getByText(/отправляются в Anthropic \(Claude\)/)).toBeVisible();
});
