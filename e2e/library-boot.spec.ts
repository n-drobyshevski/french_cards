import { expect, test } from "@playwright/test";

// First-run setup failure (MOTION-SPEC B1): the library says so in place of the theme tiles, and
// «Повторить» runs the setup again. The failure is simulated by refusing every IndexedDB write
// until the test lets them through.

test("a failed first-run setup shows «Не удалось подготовить базу»; «Повторить» brings the tiles", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __failWrites: boolean };
    w.__failWrites = true;
    for (const method of ["put", "add"] as const) {
      const original = IDBObjectStore.prototype[method];
      IDBObjectStore.prototype[method] = function (this: IDBObjectStore, ...args: Parameters<typeof original>) {
        if (w.__failWrites) throw new DOMException("Writes are off in this test", "UnknownError");
        return original.apply(this, args);
      } as typeof original;
    }
  });
  await page.goto("/library");

  const notice = page.getByRole("alert").filter({ hasText: "Не удалось подготовить базу" });
  await expect(notice).toBeVisible();
  await expect(page.getByRole("link", { name: /^Эмоции:/ })).toHaveCount(0);

  await page.evaluate(() => {
    (window as unknown as { __failWrites: boolean }).__failWrites = false;
  });
  await notice.getByRole("button", { name: "Повторить" }).click();
  await expect(notice).toBeHidden();
  await expect(page.getByRole("link", { name: /^Эмоции:/ })).toBeVisible();
});
