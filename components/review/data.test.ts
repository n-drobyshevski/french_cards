import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createFolder, deleteFolder } from "@/lib/folders";
import { endOfStudyDay } from "@/lib/session";
import { addWord, gradeCard } from "@/lib/words";
import { loadDoneScreen, loadReviewScreen, sessionMarks, wordOrdinals } from "./data";

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

describe("sessionMarks", () => {
  it("marks each answer in the order given: a miss, a card back again, else the first try", () => {
    const log = (word_id: string, rating: 1 | 2 | 3 | 4, minute: number, direction: "fr_ru" | "ru_fr" = "fr_ru") => ({
      word_id,
      direction,
      rating,
      review: new Date(NOON.getTime() + minute * 60_000).toISOString(),
    });
    expect(sessionMarks([log("b", 1, 2), log("a", 3, 1), log("b", 3, 5), log("a", 2, 3, "ru_fr"), log("b", 1, 6)])).toEqual([
      "first",
      "miss",
      "first",
      "requeued",
      "miss",
    ]);
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
    // The strip counts the same answers: the second one is the card coming back.
    expect(done.marks).toEqual(["first", "requeued"]);
    expect(done.nextDue).not.toBeNull();
    expect(Date.parse(done.nextDue!)).toBeGreaterThan(later.getTime());
    expect(done.at).toBe(later.toISOString());

    const otherDirection = await loadDoneScreen({ direction: "ru_fr" }, later);
    expect(otherDirection.nextDue).toBeNull();
  });

  it("a review card held for tomorrow (buried) is next shown when the day ends", async () => {
    const w = await addWord({ fr: "relou", ru: "занудный", both_directions: true }, new Date(NOON.getTime() - 30 * DAY));
    for (const [direction, h] of [["fr_ru", 1], ["ru_fr", 2]] as const) {
      const cur = (await db.review_state.get(`${w.id}:${direction}`))!;
      const due = new Date(NOON.getTime() + h * 3_600_000);
      await db.review_state.put({ ...cur, state: 2, stability: 5, difficulty: 5, reps: 3, scheduled_days: 5, last_review: new Date(due.getTime() - 5 * DAY).toISOString(), due: due.toISOString() });
    }
    await gradeCard(w.id, "fr_ru", 3, new Date(NOON.getTime() + 3_600_000));
    const later = new Date(NOON.getTime() + 2 * 3_600_000);
    const done = await loadDoneScreen({}, later);
    expect(done.summary.dueTomorrow).toBe(1);
    expect(done.nextDue).toBe(endOfStudyDay(later).toISOString());
  });
});
