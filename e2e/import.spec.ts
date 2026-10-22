import { expect, test } from "@playwright/test";
import { EXTRACTED, mockExtract, screenshotPng } from "./fixtures";

test("import a screenshot: rows stream in, the user reviews them and adds the checked ones", async ({ page }) => {
  const contentTypes: string[] = [];
  await mockExtract(page, EXTRACTED, (ct) => contentTypes.push(ct));
  await page.goto("/import");
  await expect(page.getByRole("button", { name: "Выбрать скриншот" })).toBeVisible();

  const png = await screenshotPng(page);
  await page.locator("input[type=file][accept='image/png,image/jpeg,image/webp']").setInputFiles({
    name: "chat.png",
    mimeType: "image/png",
    buffer: png,
  });

  await expect(page.getByRole("heading", { name: "Найдено 4 слова" })).toBeVisible();
  expect(contentTypes[0]).toMatch(/^multipart\/form-data/);

  const rows = page.getByRole("list", { name: "Найденные слова" });
  await expect(rows.getByText("ДОГАДКА")).toBeVisible();
  await expect(rows.getByText("На скриншоте «chlou» — похоже на опечатку")).toBeVisible();
  await expect(rows.getByText("УЖЕ ЕСТЬ")).toBeVisible();
  await expect(rows.getByText("Je kiffe trop ce son.")).toBeVisible();
  await expect(page.getByText(/Отмечено\s*2\s*из\s*4/i)).toBeVisible();

  await page.getByRole("button", { name: "Добавить 2 слова" }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByText(/Добавлено 2/)).toBeVisible();
  await expect(page.getByText("13 слов", { exact: true }).first()).toBeVisible();

  await page.getByRole("link", { name: /^Эмоции:/ }).click();
  await expect(page.getByText("kiffer", { exact: true })).toBeVisible();
  await expect(page.getByText("chelou", { exact: true })).toHaveCount(0);
  await page.getByText("kiffer", { exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Карточка слова" }).getByText("Je kiffe trop ce son.")).toBeVisible();
});
