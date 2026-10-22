import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createFolder, deleteFolder } from "@/lib/folders";
import { addWord, gradeCard } from "@/lib/words";
import { loadDoneScreen, loadReviewScreen, wordOrdinals } from "./data";

const DAY = 86_400_000;
/** Local noon, 21 Oct 2026. */
const NOON = new Date(2026, 9, 21, 12, 0, 0);

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("loadReviewScreen", () => {
  it("counts library and filter words, with orphaned words in «Входящие»", async () => {
    const money = await createFolder({ name: "Деньги" }, NOON);
    const gone = await createFolder({ name: "Старое" }, NOON);
    await addWord({ fr: "la thune", ru: "бабки", folder_id: money.id }, NOON);
    await addWord({ fr: "chelou", ru: "стрёмный", folder_id: gone.id }, NOON);
    await addWord({ fr: "bouffer", ru: "жрать" }, NOON);
    await deleteFolder(gone.id, NOON);

    const all = await loadReviewScreen({}, NOON);
    expect(all.libraryWords).toBe(3);
    expect(all.filterWords).toBe(3);
    expect(all.session.queue.length).toBeGreaterThan(0);

    const inbox = await loadReviewScreen({ folderId: null }, NOON);
    expect(inbox.filterWords).toBe(2);

    const folder = await loadReviewScreen({ folderId: money.id, direction: "fr_ru" }, NOON);
    expect(folder.filterWords).toBe(1);
    expect(folder.session.queue.map((i) => i.word.fr)).toEqual(["la thune"]);
  });

  it("numbers live words by creation order, like the add sheet", async () => {
    const a = await addWord({ fr: "la thune", ru: "бабки" }, new Date(NOON.getTime() - 2 * DAY));
    const b = await addWord({ fr: "chelou", ru: "стрёмный" }, new Date(NOON.getTime() - DAY));
    const c = await addWord({ fr: "bouffer", ru: "жрать" }, NOON);
    const data = await loadReviewScreen({}, NOON);
    expect([a, b, c].map((w) => data.ordinals.get(w.id))).toEqual([1, 2, 3]);
  });
});

describe("wordOrdinals", () => {
  it("gives words with the same timestamp the same number", () => {
    const map = wordOrdinals([
      { id: "c", created_at: "2026-10-03" },
      { id: "a", created_at: "2026-10-01" },
      { id: "b1", created_at: "2026-10-02" },
      { id: "b2", created_at: "2026-10-02" },
    ]);
    expect(Object.fromEntries(map)).toEqual({ a: 1, b1: 2, b2: 2, c: 4 });
  });
});

describe("loadDoneScreen", () => {
  it("reports the next due card after today", async () => {
    const w = await addWord({ fr: "kiffer", ru: "тащиться", both_directions: false }, new Date(NOON.getTime() - DAY));
    await gradeCard(w.id, "fr_ru", 3, NOON);
    await gradeCard(w.id, "fr_ru", 3, new Date(NOON.getTime() + 11 * 60_000));
    const later = new Date(NOON.getTime() + 12 * 60_000);
    const done = await loadDoneScreen({}, later);
    expect(done.summary.reviewed).toBe(2);
    expect(done.nextDue).not.toBeNull();
    expect(Date.parse(done.nextDue!)).toBeGreaterThan(later.getTime());
    expect(done.at).toBe(later.toISOString());

    const otherDirection = await loadDoneScreen({ direction: "ru_fr" }, later);
    expect(otherDirection.nextDue).toBeNull();
  });
});
