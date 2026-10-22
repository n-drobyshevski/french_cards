import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { createFolder } from "./folders";
import {
  advancePractice,
  buildPracticeQueue,
  buildQueue,
  endOfStudyDay,
  getDaySummary,
  getSessionCounts,
  loadSession,
  startOfStudyDay,
} from "./session";
import { updateSettings } from "./settings";
import type { Direction, ReviewState, Word } from "./types";
import { addWord, gradeCard, softDeleteWord, undoLastReview } from "./words";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Local noon, 21 Oct 2026. */
const NOON = new Date(2026, 9, 21, 12, 0, 0);
const at = (ms: number) => new Date(NOON.getTime() + ms);

let seq = 0;
async function word(fr: string, extra: Partial<Word> = {}): Promise<Word> {
  seq++;
  return addWord({ fr, ru: `ru-${fr}`, ...extra }, new Date(NOON.getTime() - 30 * DAY + seq * 1000));
}

/** Overwrites a card as a Review card due at `due`. */
async function setReview(w: Word, direction: Direction, due: Date, extra: Partial<ReviewState> = {}) {
  const id = `${w.id}:${direction}`;
  const cur = (await db.review_state.get(id))!;
  await db.review_state.put({
    ...cur,
    state: 2,
    stability: 5,
    difficulty: 5,
    reps: 3,
    scheduled_days: 5,
    last_review: new Date(due.getTime() - 5 * DAY).toISOString(),
    due: due.toISOString(),
    ...extra,
  });
}

const keys = (q: { key: string }[]) => q.map((i) => i.key);

beforeEach(async () => {
  seq = 0;
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("study day", () => {
  it("starts at 04:00 local time", () => {
    expect(startOfStudyDay(NOON)).toEqual(new Date(2026, 9, 21, 4));
    expect(endOfStudyDay(NOON)).toEqual(new Date(2026, 9, 22, 4));
    const night = new Date(2026, 9, 22, 2, 30);
    expect(startOfStudyDay(night)).toEqual(new Date(2026, 9, 21, 4));
  });
});

describe("loadSession", () => {
  it("puts due cards first, then new cards up to the daily limit", async () => {
    await updateSettings({ new_per_day: 2 });
    const a = await word("a", { both_directions: false });
    const b = await word("b", { both_directions: false });
    const c = await word("c", { both_directions: false });
    const old = await word("old", { both_directions: false });
    await setReview(old, "fr_ru", at(-DAY));

    const { queue, counts } = await loadSession({}, NOON);
    expect(keys(queue)).toEqual([`${old.id}:fr_ru`, `${a.id}:fr_ru`, `${b.id}:fr_ru`]);
    expect(queue[0].isNew).toBe(false);
    expect(queue[1].isNew).toBe(true);
    expect(queue[1].word.fr).toBe("a");
    expect(counts).toEqual({ due: 1, new: 2, done: 0, total: 3 });
    expect(c).toBeDefined();
  });

  it("orders due cards by due date and includes review cards due later today", async () => {
    const x = await word("x", { both_directions: false });
    const y = await word("y", { both_directions: false });
    const z = await word("z", { both_directions: false });
    const tomorrow = await word("t", { both_directions: false });
    await setReview(x, "fr_ru", at(-HOUR));
    await setReview(y, "fr_ru", at(-2 * DAY));
    await setReview(z, "fr_ru", at(8 * HOUR));
    await setReview(tomorrow, "fr_ru", at(17 * HOUR));
    const q = await buildQueue({}, NOON);
    expect(keys(q)).toEqual([`${y.id}:fr_ru`, `${x.id}:fr_ru`, `${z.id}:fr_ru`]);
  });

  it("counts today's new cards against the limit and moves learning cards behind new ones", async () => {
    await updateSettings({ new_per_day: 3 });
    const ws = [];
    for (const fr of ["a", "b", "c", "d"]) ws.push(await word(fr, { both_directions: false }));
    await gradeCard(ws[0].id, "fr_ru", 1, at(-5 * MIN));

    const { queue, counts } = await loadSession({}, NOON);
    // a was introduced today and is waiting for its 1-minute step (already passed → due now)
    expect(keys(queue)).toEqual([`${ws[0].id}:fr_ru`, `${ws[1].id}:fr_ru`, `${ws[2].id}:fr_ru`]);
    // a was already reviewed today, so its second showing does not grow the denominator
    expect(counts).toEqual({ due: 1, new: 2, done: 1, total: 3 });

    await gradeCard(ws[0].id, "fr_ru", 3, NOON);
    const after = await loadSession({}, NOON);
    // a's next step is 10 minutes away: it goes after the new cards
    expect(keys(after.queue)).toEqual([`${ws[1].id}:fr_ru`, `${ws[2].id}:fr_ru`, `${ws[0].id}:fr_ru`]);
    expect(after.counts).toEqual({ due: 1, new: 2, done: 2, total: 4 });
  });

  it("ends the day when nothing is due and the new limit is used up", async () => {
    await updateSettings({ new_per_day: 1 });
    const a = await word("a", { both_directions: false });
    await word("b", { both_directions: false });
    await gradeCard(a.id, "fr_ru", 4, NOON); // Easy → graduates for days
    const { queue, counts } = await loadSession({}, at(MIN));
    expect(queue).toEqual([]);
    expect(counts).toEqual({ due: 0, new: 0, done: 1, total: 1 });
  });

  it("undone reviews do not count as done or as introduced", async () => {
    await updateSettings({ new_per_day: 1 });
    const a = await word("a", { both_directions: false });
    await gradeCard(a.id, "fr_ru", 4, NOON);
    await undoLastReview({}, at(MIN));
    const { queue, counts } = await loadSession({}, at(MIN));
    expect(keys(queue)).toEqual([`${a.id}:fr_ru`]);
    expect(counts).toEqual({ due: 0, new: 1, done: 0, total: 1 });
  });

  it("holds new ru_fr cards until fr_ru was learned on an earlier day", async () => {
    const w = await word("meuf");
    let q = await buildQueue({}, NOON);
    expect(keys(q)).toEqual([`${w.id}:fr_ru`]);

    // reviewed today → sibling still held back
    await gradeCard(w.id, "fr_ru", 4, NOON);
    q = await buildQueue({}, at(MIN));
    expect(keys(q)).toEqual([]);

    // next day the ru_fr card becomes available
    q = await buildQueue({}, at(DAY));
    expect(keys(q)).toContain(`${w.id}:ru_fr`);
  });

  it("filtering to ru_fr shows new ru_fr cards directly", async () => {
    const w = await word("pote");
    const q = await buildQueue({ direction: "ru_fr" }, NOON);
    expect(keys(q)).toEqual([`${w.id}:ru_fr`]);
    expect(q[0].direction).toBe("ru_fr");
  });

  it("filters by folder (null = inbox) and direction", async () => {
    const f = await createFolder({ name: "Деньги" }, NOON);
    const inbox = await word("i", { both_directions: false });
    const money = await word("m", { folder_id: f.id });
    await setReview(money, "fr_ru", at(-DAY));
    await setReview(money, "ru_fr", at(-DAY));
    expect(keys(await buildQueue({ folderId: null }, NOON))).toEqual([`${inbox.id}:fr_ru`]);
    expect(keys(await buildQueue({ folderId: f.id }, NOON)).sort()).toEqual([`${money.id}:fr_ru`, `${money.id}:ru_fr`].sort());
    expect(keys(await buildQueue({ folderId: f.id, direction: "fr_ru" }, NOON))).toEqual([`${money.id}:fr_ru`]);
    expect((await getSessionCounts({ direction: "ru_fr" }, NOON)).due).toBe(1);
  });

  it("treats words of a missing folder as inbox", async () => {
    const orphan = await word("o", { folder_id: "gone", both_directions: false });
    expect(keys(await buildQueue({ folderId: null }, NOON))).toEqual([`${orphan.id}:fr_ru`]);
  });

  it("skips deleted words and cards", async () => {
    const a = await word("a", { both_directions: false });
    await setReview(a, "fr_ru", at(-DAY));
    await softDeleteWord(a.id, NOON);
    expect(await buildQueue({}, NOON)).toEqual([]);
  });

  it("counts reviews from late last night as today", async () => {
    const a = await word("a", { both_directions: false });
    const lateNight = new Date(2026, 9, 21, 1, 0); // before 04:00 → previous study day
    const evening = new Date(2026, 9, 20, 23, 0);
    await gradeCard(a.id, "fr_ru", 4, evening);
    expect((await getSessionCounts({}, lateNight)).done).toBe(1);
    expect((await getSessionCounts({}, NOON)).done).toBe(0);
  });
});

describe("getDaySummary", () => {
  it("summarizes today's reviews", async () => {
    const a = await word("a", { both_directions: false });
    const b = await word("b", { both_directions: false });
    const c = await word("c", { both_directions: false });
    await setReview(c, "fr_ru", at(-HOUR));
    await gradeCard(a.id, "fr_ru", 1, at(-3 * HOUR));
    await gradeCard(a.id, "fr_ru", 3, at(-2 * HOUR));
    await gradeCard(b.id, "fr_ru", 2, at(-90 * MIN));
    await gradeCard(c.id, "fr_ru", 3, at(-HOUR));
    const tomorrow = await word("t", { both_directions: false });
    await setReview(tomorrow, "fr_ru", at(20 * HOUR));

    const s = await getDaySummary({}, NOON);
    expect(s.reviewed).toBe(4);
    expect(s.newCount).toBe(2);
    expect(s.correctRate).toBeCloseTo(3 / 4);
    expect(s.hardWords.map((w) => w.fr)).toEqual(["b", "a"]);
    expect(s.mistakes).toBe(1);
    expect(s.dueTomorrow).toBe(1);
  });

  it("returns a null rate when nothing was reviewed", async () => {
    const s = await getDaySummary({}, NOON);
    expect(s).toMatchObject({ reviewed: 0, newCount: 0, correctRate: null, hardWords: [], mistakes: 0 });
  });
});

describe("practice", () => {
  it("'today' lists cards failed today, most recent first, without writing", async () => {
    const a = await word("a", { both_directions: false });
    const b = await word("b", { both_directions: false });
    const c = await word("c", { both_directions: false });
    await gradeCard(a.id, "fr_ru", 1, at(-2 * HOUR));
    await gradeCard(b.id, "fr_ru", 1, at(-HOUR));
    await gradeCard(c.id, "fr_ru", 2, at(-HOUR));
    const logsBefore = await db.review_log.count();
    const statesBefore = await db.review_state.toArray();
    const q = await buildPracticeQueue({ scope: "today" }, NOON);
    expect(keys(q)).toEqual([`${b.id}:fr_ru`, `${a.id}:fr_ru`]);
    expect(await db.review_log.count()).toBe(logsBefore);
    expect(await db.review_state.toArray()).toEqual(statesBefore);
  });

  it("'recent' takes failed/hard cards of the last days and tops up with the weakest", async () => {
    const a = await word("a", { both_directions: false });
    const b = await word("b", { both_directions: false });
    const weak = await word("weak", { both_directions: false });
    const strong = await word("strong", { both_directions: false });
    await word("fresh", { both_directions: false });
    await gradeCard(a.id, "fr_ru", 2, at(-3 * DAY));
    await gradeCard(b.id, "fr_ru", 3, at(-DAY));
    await setReview(weak, "fr_ru", at(5 * DAY), { stability: 2, lapses: 3 });
    await setReview(strong, "fr_ru", at(30 * DAY), { stability: 40, lapses: 0 });
    const q = await buildPracticeQueue({ scope: "recent", limit: 3 }, NOON);
    expect(keys(q)).toEqual([`${a.id}:fr_ru`, `${weak.id}:fr_ru`, `${b.id}:fr_ru`]);
    const all = await buildPracticeQueue({ scope: "recent" }, NOON);
    expect(all.map((i) => i.word.fr)).not.toContain("fresh");
  });

  it("advancePractice requeues by rating", () => {
    const q = ["a", "b", "c", "d", "e"];
    expect(advancePractice(q, 1)).toEqual(["b", "c", "d", "a", "e"]);
    expect(advancePractice(["a", "b"], 1)).toEqual(["b", "a"]);
    expect(advancePractice(q, 2)).toEqual(["b", "c", "d", "e", "a"]);
    expect(advancePractice(q, 3)).toEqual(["b", "c", "d", "e"]);
    expect(advancePractice([], 3)).toEqual([]);
  });
});
