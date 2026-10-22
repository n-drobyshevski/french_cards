import { expect, test, type Page } from "@playwright/test";
import { buildApkg, FIXTURE_CRT, loadNodeSql } from "../lib/anki/test-fixtures";
import { mockAnki, type AnkiNoteWire, vocab } from "./fixtures";

const DAY_MS = 86_400_000;

/** A v18 deck (zstd collection): a reviewed card, a new one with HTML and sound, and a word the library has. */
async function deckFile(): Promise<Buffer> {
  const SQL = await loadNodeSql();
  const today = Math.floor((Date.now() / 1000 - FIXTURE_CRT) / 86_400);
  const bytes = buildApkg({
    SQL,
    schema: "v18",
    notes: [
      {
        fields: ["la meuf", "девушка"],
        cards: [
          {
            type: 2,
            due: today + 10,
            ivl: 20,
            factor: 2500,
            reps: 6,
            data: '{"s":21.5,"d":4.8}',
            reviews: [Date.now() - 10 * DAY_MS],
          },
        ],
      },
      { fields: ["<b>chelou</b>[sound:chelou.mp3]", "weird, strange"] },
      { fields: ["les flics", "полицейские"] },
    ],
  });
  return Buffer.from(bytes);
}

async function stateOf(page: Page, fr: string) {
  return page.evaluate(
    (word) =>
      new Promise<{ direction: string; state: number; stability: number; due: string }[]>((resolve, reject) => {
        const open = indexedDB.open("kartochki");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction(["words", "review_state"]);
          const words = tx.objectStore("words").getAll();
          const states = tx.objectStore("review_state").getAll();
          tx.oncomplete = () => {
            const w = (words.result as { id: string; fr: string; deleted_at: string | null }[]).find(
              (x) => x.fr === word && !x.deleted_at,
            );
            resolve(
              (states.result as { word_id: string; direction: string; state: number; stability: number; due: string }[]).filter(
                (s) => s.word_id === w?.id,
              ),
            );
            open.result.close();
          };
        };
      }),
    fr,
  );
}

test("import an Anki deck: known words stay out, missing data is filled, progress is carried over", async ({ page }) => {
  const sent: AnkiNoteWire[] = [];
  await mockAnki(
    page,
    (note) => {
      const front = note.fields[0]?.text ?? "";
      if (front === "la meuf")
        return { ...vocab({ fr: "la meuf", ru: "девушка", slang_level: 1, gender: "f" }), skip: false, fr_field: "Front" };
      if (front === "chelou")
        return {
          ...vocab({
            fr: "chelou",
            ru: "странный",
            ru_suggested: true,
            note: "weird, strange",
            pos: "adj",
            gender: "none",
            verlan: true,
          }),
          skip: false,
          fr_field: "Front",
        };
      return null;
    },
    (notes) => sent.push(...notes),
  );

  await page.goto("/import");
  await page.getByRole("button", { name: /Колода Anki/ }).waitFor();
  await page.locator("input[type=file][accept='.apkg,.colpkg,.txt,.csv,.tsv']").setInputFiles({
    name: "argot.apkg",
    mimeType: "application/octet-stream",
    buffer: await deckFile(),
  });

  await expect(page.getByText(/^Français · 3 карточки$/)).toBeVisible();
  await expect(page.getByText(/К дополнению 2 · уже есть 1/)).toBeVisible();
  const carry = page.getByRole("switch", { name: "Перенести прогресс из Anki" });
  await expect(carry).toHaveAttribute("aria-checked", "true");

  await page.getByRole("button", { name: "Дополнить 2 карточки" }).click();
  await expect(page.getByRole("heading", { name: "Найдено 2 слова" })).toBeVisible();
  // HTML and sound are gone before anything is sent; the known word never leaves the device.
  expect(sent.map((n) => n.fields[0].text)).toEqual(["la meuf", "chelou"]);

  const rows = page.getByRole("list", { name: "Найденные слова" });
  await expect(rows.getByText("ДОГАДКА")).toBeVisible();
  await expect(page.getByText(/прогресс переносится/)).toBeVisible();

  await page.getByRole("button", { name: "Добавить 2 слова" }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByText(/Добавлено 2/)).toBeVisible();

  const meuf = await stateOf(page, "la meuf");
  const forward = meuf.find((s) => s.direction === "fr_ru");
  expect(forward).toMatchObject({ state: 2, stability: 21.5 });
  expect(new Date(forward!.due).getTime()).toBeGreaterThan(Date.now() + 8 * DAY_MS);
  expect(meuf.find((s) => s.direction === "ru_fr")).toMatchObject({ state: 0 });
  expect((await stateOf(page, "chelou")).every((s) => s.state === 0)).toBe(true);
});
