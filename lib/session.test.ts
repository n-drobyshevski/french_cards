import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { createFolder, updateFolder } from "./folders";
import {
  advancePractice,
  buildPracticeQueue,
  buildQueue,
  endOfStudyDay,
  getDaySummary,
  getSessionCounts,
  liveWords,
  loadSession,
  loadSessionData,
  matchWords,
  startOfStudyDay,
  type SessionFilter,
} from "./session";
import { createFakeRepo } from "./mcp/fake-repo";
import { callTool, studySummary } from "./mcp/tools";
import { updateSettings } from "./settings";
import type { Direction, ReviewState, Word } from "./types";
import { DEFAULT_STUDY_PLAN, LEGACY_STUDY_PLAN, setNewOverride, setStudyPlan, STUDY_PLAN_PREF, type StudyPlan } from "./user-prefs";
import { addWord, gradeCard, softDeleteWord, undoLastReview, updateWord } from "./words";
import { createCefrData } from "./core/level";
import { createLexique, setCefrDataForTesting, setLexiqueForTesting, type LexiqueEntry } from "./lexique";
import cefrFile from "@/public/lexique/fr-cefr.json";
import lemmas from "@/public/lexique/fr-lemmas.json";

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

/** The plan as the queue was before «План дня» (new cards oldest first, after the reviews, «Назавтра»). */
const legacyPlan = (newPerDay: number) => setStudyPlan({ ...LEGACY_STUDY_PLAN, new_words: newPerDay }, NOON);
/** Counts with nothing deferred by the cap and nothing waiting. */
const plain = (c: { due: number; new: number; done: number; total: number }) => ({ ...c, deferred: 0, waiting: 0 });

beforeEach(async () => {
  seq = 0;
  await Promise.all(db.tables.map((t) => t.clear()));
  await legacyPlan(15);
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
    await legacyPlan(2);
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
    expect(counts).toEqual(plain({ due: 1, new: 2, done: 0, total: 3 }));
    expect(c).toBeDefined();
  });

  it("leaves words «на паузе» out of the session, its counts and practice rounds", async () => {
    await legacyPlan(5);
    const a = await word("a", { both_directions: false });
    const muted = await word("muted", { both_directions: false, muted: true });
    const mutedDue = await word("muted-due", { both_directions: false, muted: true });
    await setReview(mutedDue, "fr_ru", at(-DAY));

    const { queue, counts } = await loadSession({}, NOON);
    expect(keys(queue)).toEqual([`${a.id}:fr_ru`]);
    expect(counts).toEqual(plain({ due: 0, new: 1, done: 0, total: 1 }));
    expect(keys(await buildPracticeQueue({ scope: "all" }, NOON))).toEqual([`${a.id}:fr_ru`]);
    expect(muted.muted).toBe(true);
  });

  it("leaves the words of a theme «на паузе» out of every session, even the theme's own", async () => {
    await legacyPlan(5);
    const later = await createFolder({ name: "Потом" }, NOON);
    const a = await word("a", { both_directions: false });
    const b = await word("b", { both_directions: false, folder_id: later.id });
    await setReview(b, "fr_ru", at(-DAY));
    expect((await loadSession({}, NOON)).counts).toEqual(plain({ due: 1, new: 1, done: 0, total: 2 }));

    await updateFolder(later.id, { muted: true }, NOON);
    const { queue, counts } = await loadSession({}, NOON);
    expect(keys(queue)).toEqual([`${a.id}:fr_ru`]);
    expect(counts).toEqual(plain({ due: 0, new: 1, done: 0, total: 1 }));
    expect((await loadSession({ folderId: later.id }, NOON)).queue).toEqual([]);
    expect(keys(await buildPracticeQueue({ scope: "all", folderId: later.id }, NOON))).toEqual([]);
    const pre = await loadSessionData();
    expect([...matchWords(pre.words, pre.states, pre.liveFolderIds, {}, pre.pausedFolderIds).keys()]).toEqual([a.id]);
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
    await legacyPlan(3);
    const ws = [];
    for (const fr of ["a", "b", "c", "d"]) ws.push(await word(fr, { both_directions: false }));
    await gradeCard(ws[0].id, "fr_ru", 1, at(-5 * MIN));

    const { queue, counts } = await loadSession({}, NOON);
    // a was introduced today and is waiting for its 1-minute step (already passed → due now)
    expect(keys(queue)).toEqual([`${ws[0].id}:fr_ru`, `${ws[1].id}:fr_ru`, `${ws[2].id}:fr_ru`]);
    // a was already reviewed today, so its second showing does not grow the denominator
    expect(counts).toEqual(plain({ due: 1, new: 2, done: 1, total: 3 }));

    await gradeCard(ws[0].id, "fr_ru", 3, NOON);
    const after = await loadSession({}, NOON);
    // a's next step is 10 minutes away: it goes after the new cards
    expect(keys(after.queue)).toEqual([`${ws[1].id}:fr_ru`, `${ws[2].id}:fr_ru`, `${ws[0].id}:fr_ru`]);
    expect(after.counts).toEqual(plain({ due: 1, new: 2, done: 2, total: 4 }));
  });

  it("ends the day when nothing is due and the new limit is used up", async () => {
    await legacyPlan(1);
    const a = await word("a", { both_directions: false });
    await word("b", { both_directions: false });
    await gradeCard(a.id, "fr_ru", 4, NOON); // Easy → graduates for days
    const { queue, counts } = await loadSession({}, at(MIN));
    expect(queue).toEqual([]);
    expect(counts).toEqual(plain({ due: 0, new: 0, done: 1, total: 1 }));
  });

  it("undone reviews do not count as done or as introduced", async () => {
    await legacyPlan(1);
    const a = await word("a", { both_directions: false });
    await gradeCard(a.id, "fr_ru", 4, NOON);
    await undoLastReview({}, at(MIN));
    const { queue, counts } = await loadSession({}, at(MIN));
    expect(keys(queue)).toEqual([`${a.id}:fr_ru`]);
    expect(counts).toEqual(plain({ due: 0, new: 1, done: 0, total: 1 }));
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

describe("loadSession: «План дня»", () => {
  const planWith = (over: Partial<StudyPlan>) => setStudyPlan({ ...DEFAULT_STUDY_PLAN, new_order: "added", ...over }, at(MIN));

  it("without a saved plan: the defaults, with the device's cards a day halved into words", async () => {
    await db.user_prefs.delete(STUDY_PLAN_PREF);
    await updateSettings({ new_per_day: 6 });
    for (let i = 0; i < 5; i++) await word(`w${i}`);
    const s = await loadSession({}, NOON);
    expect(s.plan).toEqual({ ...DEFAULT_STUDY_PLAN, new_words: 3 });
    expect(s.counts.new).toBe(3);
    expect(s.queue.every((i) => i.direction === "fr_ru")).toBe(true);
    expect(s.day).toMatchObject({ ceiling: 3, budget: 3, reason: "limit", backlog: false });
  });

  it("over the cap: defers reviews and adds no new words, unless «Всё равно добавить новые» is on today", async () => {
    await planWith({ review_cap: 50, new_words: 3 });
    for (let i = 0; i < 52; i++) await setReview(await word(`r${i}`, { both_directions: false }), "fr_ru", at(-DAY - i * MIN));
    for (let i = 0; i < 4; i++) await word(`n${i}`, { both_directions: false });
    let s = await loadSession({}, NOON);
    expect(s.day).toMatchObject({ backlog: true, budget: 0, reason: "backlog", canOverride: true, deferred: 2 });
    expect(s.counts).toMatchObject({ due: 50, new: 0, deferred: 2, total: 50 });

    await setNewOverride(startOfStudyDay(NOON));
    s = await loadSession({}, NOON);
    expect(s.day).toMatchObject({ override: true, budget: 3, canOverride: false });
    expect(s.counts.new).toBe(3);
    // The next study day it is off again.
    expect((await loadSession({}, at(DAY))).day.override).toBe(false);
  });

  it("learning cards due more than 20 min out wait: counted, not queued", async () => {
    await planWith({ new_words: 0 });
    const a = await word("a", { both_directions: false });
    await setReview(a, "fr_ru", at(30 * MIN), { state: 1, stability: 0.5, scheduled_days: 0 });
    const s = await loadSession({}, NOON);
    expect(s.queue).toEqual([]);
    expect(s.counts).toEqual({ due: 1, new: 0, done: 0, total: 1, deferred: 0, waiting: 1 });
    expect(keys(s.waiting)).toEqual([`${a.id}:fr_ru`]);
    expect(s.nextDue).toBe(at(30 * MIN).toISOString());
    expect(keys((await loadSession({}, at(11 * MIN))).queue)).toEqual([`${a.id}:fr_ru`]);
  });

  it("the new-word budget is global: a theme session only narrows the pick", async () => {
    await planWith({ new_words: 3, ru_fr: "after" });
    const a = await createFolder({ name: "А" }, NOON);
    const b = await createFolder({ name: "Б" }, NOON);
    const inA = [await word("a1", { folder_id: a.id }), await word("a2", { folder_id: a.id })];
    const inB = [await word("b1", { folder_id: b.id }), await word("b2", { folder_id: b.id })];
    for (const w of inA) await gradeCard(w.id, "fr_ru", 4, at(-HOUR));
    const s = await loadSession({ folderId: b.id }, NOON);
    expect(keys(s.queue)).toEqual([`${inB[0].id}:fr_ru`]);
    expect(s.day).toMatchObject({ budget: 3, newToday: 2, newLeft: 1 });
  });

  it("«По уровню языка» orders new words by the FLELex / Lexique level; a stored level wins", async () => {
    setCefrDataForTesting(createCefrData(cefrFile));
    setLexiqueForTesting(createLexique(lemmas as unknown as LexiqueEntry[], { prefolded: true }));
    try {
      await planWith({ new_words: 4, new_order: "level", mix: "after", ru_fr: "after", review_cap: null });
      const relou = await word("relou", { slang_level: 2, verlan: true, both_directions: false });
      const demarche = await word("la démarche", { pos: "noun", both_directions: false });
      const loyer = await word("le loyer", { pos: "noun", both_directions: false });
      const maison = await word("la maison", { pos: "noun", both_directions: false });
      const s = await loadSession({}, NOON);
      expect(s.queue.map((i) => i.word.fr)).toEqual([maison.fr, loyer.fr, demarche.fr, relou.fr]);
      // A stored level wins over the estimate.
      await updateWord(maison.id, { cefr: "C1" }, NOON);
      expect((await loadSession({}, NOON)).queue.map((i) => i.word.fr)).toEqual([loyer.fr, demarche.fr, relou.fr, maison.fr]);
    } finally {
      setCefrDataForTesting(null);
      setLexiqueForTesting(null);
    }
  });

  it("gives the same day as the connector's study_summary", async () => {
    await planWith({ new_words: 4, new_order: "level", mix: "mixed", ru_fr: "after", review_cap: null });
    const f = await createFolder({ name: "Тема" }, NOON);
    for (let i = 0; i < 6; i++) await word(`n${i}`, { folder_id: i % 2 ? f.id : null });
    for (let i = 0; i < 5; i++) await setReview(await word(`r${i}`, { folder_id: f.id }), "fr_ru", at(-i * HOUR));
    const [first] = (await loadSession({}, NOON)).queue;
    await gradeCard(first.word.id, first.direction, 3, at(-MIN));

    const session = await loadSession({}, NOON);
    const fake = createFakeRepo({
      folders: await db.folders.toArray(),
      words: await db.words.toArray(),
      review_state: await db.review_state.toArray(),
      review_log: await db.review_log.toArray(),
      user_prefs: await db.user_prefs.toArray(),
    });
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const res = await callTool(studySummary, { repo: fake.repo, userId: "u", timeZone, now: () => NOON }, {});
    const out = res.structuredContent as { due_cards: number; new_cards_available: number; plan: Record<string, unknown> };
    expect(out.due_cards).toBe(session.counts.due);
    expect(out.new_cards_available).toBe(session.counts.new);
    expect(out.plan).toMatchObject({ new_words_today: session.day.budget, new_words_left: session.day.newLeft, ceiling: 4, reason: session.day.reason });
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
    const tomorrow = await word("t");
    await setReview(tomorrow, "fr_ru", at(20 * HOUR));
    await setReview(tomorrow, "ru_fr", at(21 * HOUR));

    const s = await getDaySummary({}, NOON);
    expect(s.reviewed).toBe(4);
    expect(s.newCount).toBe(2);
    expect(s.correctRate).toBeCloseTo(3 / 4);
    expect(s.hardWords.map((w) => w.fr)).toEqual(["b", "a"]);
    expect(s.mistakes).toBe(1);
    expect(s.dueTomorrow).toBe(1); // words, not cards
  });

  it("counts review cards held for tomorrow (buried, deferred by the cap) as due tomorrow", async () => {
    const b = await word("b");
    await setReview(b, "fr_ru", at(HOUR));
    await setReview(b, "ru_fr", at(2 * HOUR));
    await gradeCard(b.id, "fr_ru", 3, at(HOUR));
    const later = at(2 * HOUR);
    // Its RU→FR side is buried until tomorrow: the session is done.
    expect((await loadSession({}, later)).queue).toEqual([]);
    expect((await getDaySummary({}, later)).dueTomorrow).toBe(1);
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

  it("'all' takes every card of the theme, new and learned, shuffled, in one direction", async () => {
    const f = await createFolder({ name: "Тема" }, NOON);
    const a = await word("a", { folder_id: f.id });
    const b = await word("b", { folder_id: f.id });
    await word("elsewhere");
    await setReview(b, "fr_ru", at(30 * DAY));
    const statesBefore = await db.review_state.toArray();

    const q = await buildPracticeQueue({ scope: "all", folderId: f.id, direction: "fr_ru", random: () => 0 }, NOON);
    expect(q.map((i) => i.word.fr).sort()).toEqual(["a", "b"]);
    expect(q.every((i) => i.direction === "fr_ru")).toBe(true);
    expect(await db.review_state.toArray()).toEqual(statesBefore);

    // Both directions, and the cap.
    expect(await buildPracticeQueue({ scope: "all", folderId: f.id }, NOON)).toHaveLength(4);
    expect(await buildPracticeQueue({ scope: "all", folderId: f.id, limit: 3 }, NOON)).toHaveLength(3);
    // The order depends on the random source.
    const one = keys(await buildPracticeQueue({ scope: "all", folderId: f.id, random: () => 0 }, NOON));
    const other = keys(await buildPracticeQueue({ scope: "all", folderId: f.id, random: () => 0.99 }, NOON));
    expect(one).not.toEqual(other);
    expect([...one].sort()).toEqual([...other].sort());
    expect(one).toContain(`${a.id}:ru_fr`);
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

describe("preloaded library (SessionData)", () => {
  async function library() {
    const f = await createFolder({ name: "Деньги" }, NOON);
    const money = await word("la thune", { folder_id: f.id, slang_level: 1 });
    const inbox = await word("bouffer");
    const orphan = await word("chelou", { folder_id: "gone", both_directions: false });
    const verlan = await word("relou", { folder_id: f.id, slang_level: 2, verlan: true });
    const gone = await word("deleted", { folder_id: f.id });
    await setReview(money, "fr_ru", at(-DAY));
    await setReview(verlan, "fr_ru", at(-HOUR), { lapses: 3, difficulty: 9, stability: 1 });
    await gradeCard(inbox.id, "fr_ru", 1, at(-HOUR));
    await softDeleteWord(gone.id, NOON);
    return { f, money, inbox, orphan, verlan };
  }

  it("gives the same sessions, summaries and practice rounds as reading the tables", async () => {
    const { f } = await library();
    const pre = await loadSessionData();
    const filters: SessionFilter[] = [
      {},
      { folderId: null },
      { folderId: f.id },
      { folderId: f.id, direction: "fr_ru" },
      { folderIds: [f.id, null] },
      { folderIds: [null], slang: [2, "verl"] },
      { statuses: ["new"] },
      { statuses: ["difficult", "learning"], folderIds: [f.id] },
      { addedSince: new Date(NOON.getTime() - 30 * DAY + 2500).toISOString() },
    ];
    for (const filter of filters) {
      expect(await loadSession(filter, NOON, pre)).toEqual(await loadSession(filter, NOON));
      expect(await liveWords(filter, pre)).toEqual(await liveWords(filter));
      expect(await getDaySummary(filter, NOON, pre)).toEqual(await getDaySummary(filter, NOON));
      for (const scope of ["today", "recent", "all"] as const) {
        const opts = { ...filter, scope, random: () => 0 };
        expect(await buildPracticeQueue(opts, NOON, pre)).toEqual(await buildPracticeQueue(opts, NOON));
      }
    }
  });

  it("matchWords filters in memory: folders, «Входящие» with orphans, slang and statuses", async () => {
    const { f, money, inbox, orphan, verlan } = await library();
    const { words, states, liveFolderIds } = await loadSessionData();
    const ids = (filter: SessionFilter) => [...matchWords(words, states, liveFolderIds, filter).keys()].sort();
    expect(ids({})).toEqual([money.id, inbox.id, orphan.id, verlan.id].sort());
    expect(ids({ folderId: null })).toEqual([inbox.id, orphan.id].sort());
    expect(ids({ folderId: f.id })).toEqual([money.id, verlan.id].sort());
    expect(ids({ slang: ["verl"] })).toEqual([verlan.id]);
    expect(ids({ statuses: ["new"] })).toEqual([orphan.id]);
  });
});
