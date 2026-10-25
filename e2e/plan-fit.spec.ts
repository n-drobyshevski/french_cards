import { expect, test, type Page } from "@playwright/test";

// «План и прогресс» (Plan-Fit-A-Settings): with two weeks of using the whole plan, light load and
// good answers, «План повторения» offers more new words; «Поставить 15» applies it, «Вернуть» undoes.

/** 16 study days in the last 3 weeks: 10 new FR→RU words and 58 reviews of older cards each day. */
async function seedSurplus(page: Page) {
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open("kartochki");
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const all = <T,>(store: string) =>
      new Promise<T[]>((resolve) => {
        const q = db.transaction(store).objectStore(store).getAll();
        q.onsuccess = () => resolve(q.result as T[]);
      });
    const words = await all<Record<string, unknown> & { id: string }>("words");
    const states = await all<Record<string, unknown> & { word_id: string; direction: string }>("review_state");
    const w0 = words[0];
    const now = Date.now();
    const iso = (t: number) => new Date(t).toISOString();
    const tx = db.transaction(["words", "review_state", "review_log", "user_prefs"], "readwrite");
    for (let i = 0; i < 500; i++) {
      const id = `seedw-${i}`;
      tx.objectStore("words").put({ ...w0, id, fr: `mot${i}`, ru: `слово${i}`, created_at: iso(now - 40 * 864e5), updated_at: iso(now - 40 * 864e5) });
      for (const dir of ["fr_ru", "ru_fr"]) {
        const s = states.find((x) => x.word_id === w0.id && x.direction === dir)!;
        tx.objectStore("review_state").put({ ...s, id: `${id}:${dir}`, word_id: id, direction: dir });
      }
    }
    let n = 0;
    let wi = 0;
    for (const d of [1, 2, 3, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 18, 20]) {
      const base = new Date(now - d * 864e5);
      base.setHours(12, 0, 0, 0);
      const log = (word_id: string, direction: string, state: number, rating: number, at: number) =>
        tx.objectStore("review_log").put({
          id: `seedl-${n++}`, word_id, direction, rating, state, due: iso(+base), stability: state ? 10 : 1, difficulty: 5,
          elapsed_days: state ? 3 : 0, scheduled_days: state ? 5 : 1, review: iso(at),
          prev: { id: `${word_id}:${direction}`, word_id, direction, state, stability: state ? 10 : 0 }, updated_at: iso(+base), deleted_at: null,
        });
      for (let k = 0; k < 10; k++) log(`seedw-${wi++}`, "fr_ru", 0, 3, +base + k * 1000);
      for (let k = 0; k < 58; k++) log(`seedw-${300 + (k % 150)}`, k % 2 ? "ru_fr" : "fr_ru", 2, k % 9 === 0 ? 1 : 3, +base + 60000 + k * 1000);
    }
    tx.objectStore("user_prefs").put({
      id: "study_plan",
      value: { new_words: 10, review_cap: 200, new_order: "level", ru_fr: "after", mix: "mixed" },
      updated_at: iso(now - 30 * 864e5),
      deleted_at: null,
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
}

test("«План повторения» offers more new words after two full weeks; «Поставить 15», then «Вернуть»", async ({ page }) => {
  await page.goto("/settings/plan");
  await expect(page.getByRole("heading", { name: "План повторения" })).toBeVisible();
  await seedSurplus(page);
  await page.reload();

  await expect(page.getByText(/^За 2 недели обычно: все 10 новых/)).toBeVisible();
  await expect(page.getByText("Можно брать 15 в день")).toBeVisible();
  const words = page.getByRole("group", { name: "Новых слов в день" }).locator("output");
  await page.getByRole("button", { name: /^Поставить 15/ }).click();
  await expect(words).toHaveText("15");
  await expect(page.getByText("Можно брать 15 в день")).toHaveCount(0);
  await page.getByRole("button", { name: /^Вернуть/ }).click();
  await expect(words).toHaveText("10");
});
