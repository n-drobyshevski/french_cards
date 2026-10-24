import { describe, expect, it } from "vitest";
import { fromSnapshot, grade, newReviewState, retrievability, snapshot, type Rating } from "../scheduler";
import type { Direction, ReviewLog, ReviewState, Word } from "../types";
import { dayStartStates, fnv1a, intersperse, LEARN_AHEAD_MS, levelRank, planDay, spaceSiblings, themeLimit, type PlanInput, type PlanItem } from "./plan";
import { DEFAULT_STUDY_PLAN, LEGACY_STUDY_PLAN, type StudyPlan } from "./study-plan";
import { buildWord, type NewWordInput } from "./words";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** A study day [04:00Z, next 04:00Z); "now" is noon. */
const START = new Date("2026-10-21T04:00:00.000Z");
const END = new Date(START.getTime() + DAY);
const NOW = new Date("2026-10-21T12:00:00.000Z");
const OLD = new Date("2026-09-01T00:00:00.000Z");
const at = (ms: number) => new Date(NOW.getTime() + ms);

const plan = (over: Partial<StudyPlan> = {}): StudyPlan => ({ ...DEFAULT_STUDY_PLAN, new_order: "added", ...over });

/** A small library the tests grade by hand (states and logs as Dexie would hold them). */
class World {
  words = new Map<string, Word>();
  states = new Map<string, ReviewState>();
  logs: ReviewLog[] = [];
  private seq = 0;

  add(fr: string, extra: Partial<NewWordInput> = {}): Word {
    this.seq++;
    const id = `w${String(this.seq).padStart(4, "0")}`;
    const word = buildWord({ id, fr, ru: `ru-${fr}`, both_directions: false, created_at: new Date(OLD.getTime() + this.seq * 1000).toISOString(), ...extra }, OLD);
    this.words.set(id, word);
    for (const d of word.both_directions ? (["fr_ru", "ru_fr"] as const) : (["fr_ru"] as const)) this.states.set(`${id}:${d}`, newReviewState(id, d, OLD));
    return word;
  }

  /** A review card due at `due` (stability 5 unless given). */
  review(w: Word, direction: Direction, due: Date, extra: Partial<ReviewState> = {}): ReviewState {
    const id = `${w.id}:${direction}`;
    const s: ReviewState = {
      ...this.states.get(id)!,
      state: 2,
      stability: 5,
      difficulty: 5,
      reps: 3,
      scheduled_days: 5,
      last_review: new Date(due.getTime() - 5 * DAY).toISOString(),
      due: due.toISOString(),
      ...extra,
    };
    this.states.set(id, s);
    return s;
  }

  /** A learning card due at `due`. */
  learning(w: Word, direction: Direction, due: Date): ReviewState {
    return this.review(w, direction, due, { state: 1, stability: 0.5, reps: 1, scheduled_days: 0, last_review: new Date(due.getTime() - 10 * MIN).toISOString() });
  }

  grade(key: string, rating: Rating, when: Date): ReviewLog {
    const res = grade(this.states.get(key)!, rating, when);
    this.states.set(key, res.state);
    this.logs.push(res.log);
    return res.log;
  }

  undo(log: ReviewLog, when: Date) {
    log.deleted_at = when.toISOString();
    this.states.set(`${log.word_id}:${log.direction}`, fromSnapshot(log.prev!, when));
  }

  plan(over: Partial<PlanInput> = {}) {
    const dayStart = over.dayStart ?? START;
    const dayEnd = over.dayEnd ?? END;
    const from = dayStart.getTime() - 7 * DAY;
    const live = this.logs.filter((l) => l.deleted_at === null);
    return planDay({
      now: NOW,
      states: [...this.states.values()],
      words: this.words,
      todayLogs: live.filter((l) => Date.parse(l.review) >= dayStart.getTime() && Date.parse(l.review) < dayEnd.getTime()),
      logs7d: live.filter((l) => Date.parse(l.review) >= from && Date.parse(l.review) < dayStart.getTime()),
      plan: plan(),
      r: retrievability,
      ...over,
      dayStart,
      dayEnd,
    });
  }
}

const keys = (q: readonly PlanItem[]) => q.map((i) => i.key);
const fr = (w: Word) => `${w.id}:fr_ru`;
const ru = (w: Word) => `${w.id}:ru_fr`;

/** A log row of a review graded in the last 7 days (pre-state Review, pre-stability `s`). */
function pastLog(i: number, rating: Rating, s = 5): ReviewLog {
  const review = new Date(START.getTime() - 2 * DAY + i * MIN).toISOString();
  const prev = snapshot({ ...newReviewState(`past${i}`, "fr_ru", OLD), state: 2, stability: s });
  return { id: `log-past-${i}`, word_id: `past${i}`, direction: "fr_ru", rating, state: 2, due: review, stability: s, difficulty: 5, elapsed_days: 5, scheduled_days: 5, review, prev, updated_at: review, deleted_at: null };
}

describe("helpers", () => {
  it("fnv1a is a stable 32-bit hash", () => {
    expect(fnv1a("")).toBe(0x811c9dc5);
    expect(fnv1a("a")).toBe(0xe40c292c);
    expect(fnv1a("2026-10-21T04:00:00.000Zw1:fr_ru")).toBe(fnv1a("2026-10-21T04:00:00.000Zw1:fr_ru"));
  });

  it("intersperse spreads 3 new cards among 10 reviews at fixed positions", () => {
    const r = Array.from({ length: 10 }, (_, i) => `r${i}`);
    const n = ["n0", "n1", "n2"];
    const out = intersperse(r, n);
    expect(out.map((x, i) => (x.startsWith("n") ? i : -1)).filter((i) => i >= 0)).toEqual([2, 6, 10]);
    expect(out.filter((x) => x.startsWith("r"))).toEqual(r);
    expect(intersperse([], n)).toEqual(n);
    expect(intersperse(r, [])).toEqual(r);
    expect(intersperse(["r0"], ["n0"])).toEqual(["r0", "n0"]);
  });

  it("the theme limit is max(2, ⌈budget/3⌉)", () => {
    expect([0, 3, 6, 7, 10, 30].map(themeLimit)).toEqual([2, 2, 2, 3, 4, 10]);
  });

  it("level rank: band (≤ B2 by index, above it 10+, none 5) plus register", () => {
    const neutral = { slang_level: 0 as const, verlan: false };
    expect(["A1", "A2", "B1", "B2", "C1", "C2", null].map((l) => levelRank(neutral, l))).toEqual([0, 1, 2, 3, 14, 15, 5]);
    expect(levelRank({ slang_level: 1, verlan: false }, "A1")).toBe(0.5);
    expect(levelRank({ slang_level: 2, verlan: true }, null)).toBe(8);
    expect(levelRank({ slang_level: 3, verlan: false }, "B1")).toBe(5);
  });

  it("the start-of-day snapshot is the first live log's prev, else the card", () => {
    const w = new World();
    const a = w.add("a");
    const b = w.add("b");
    const before = w.states.get(fr(a))!;
    const first = w.grade(fr(a), 1, at(-2 * HOUR));
    w.grade(fr(a), 3, at(-HOUR));
    const s0 = dayStartStates([...w.states.values()], w.logs);
    expect(s0.get(fr(a))).toMatchObject({ state: before.state, due: before.due, stability: before.stability });
    expect(s0.get(fr(b))).toBe(w.states.get(fr(b)));
    // An undone first log: the snapshot is the next one's prev.
    first.deleted_at = NOW.toISOString();
    expect(dayStartStates([...w.states.values()], w.logs).get(fr(a))?.state).toBe(1);
  });

  it("spaceSiblings keeps the two directions of a word 6+ positions apart, else keeps the order", () => {
    const w = new World();
    const p = w.add("p", { both_directions: true });
    const qs = Array.from({ length: 6 }, (_, i) => w.add(`q${i}`));
    const item = (key: string): PlanItem => {
      const s = w.states.get(key)!;
      return { key, word: w.words.get(s.word_id)!, state: s, direction: s.direction, isNew: false };
    };
    const out = spaceSiblings([], [item(fr(p)), item(ru(p)), ...qs.map((q) => item(fr(q)))]);
    expect(keys(out)).toEqual([fr(p), ...qs.slice(0, 5).map(fr), ru(p), fr(qs[5])]);
    expect(keys(spaceSiblings([], [item(fr(p)), item(ru(p))]))).toEqual([fr(p), ru(p)]);
    // Cards placed before count: the sibling waits behind them too.
    expect(keys(spaceSiblings([item(fr(p))], [item(ru(p)), item(fr(qs[0]))]))).toEqual([fr(qs[0]), ru(p)]);
  });
});

describe("planDay: buckets and order", () => {
  it("is deterministic across re-reads", () => {
    const w = new World();
    for (let i = 0; i < 12; i++) w.add(`n${i}`, { both_directions: i % 2 === 0, folder_id: `f${i % 3}` });
    for (let i = 0; i < 8; i++) w.review(w.add(`r${i}`, { both_directions: true }), "fr_ru", at(-i * HOUR));
    const p = plan({ new_order: "level", mix: "mixed" });
    const first = w.plan({ plan: p });
    for (const ms of [MIN, 2 * MIN, 3 * MIN]) {
      const again = w.plan({ plan: p, now: at(ms) });
      expect(keys(again.queue)).toEqual(keys(first.queue));
      expect(again.counts).toEqual(first.counts);
      expect(again.day).toEqual(first.day);
    }
  });

  it("puts learning cards due now first, shows those due within 20 min last, and makes the rest wait", () => {
    const w = new World();
    const a = w.add("a");
    const b = w.add("b");
    const c = w.add("c");
    const d = w.add("d");
    const e = w.add("e");
    w.learning(a, "fr_ru", at(-5 * MIN));
    w.review(b, "fr_ru", at(-HOUR));
    w.learning(c, "fr_ru", at(LEARN_AHEAD_MS));
    w.learning(d, "fr_ru", at(25 * MIN));
    for (const mix of ["after", "mixed"] as const) {
      const out = w.plan({ plan: plan({ mix }) });
      expect(keys(out.queue)).toEqual([fr(a), fr(b), fr(e), fr(c)]);
      expect(out.counts).toEqual({ due: 4, new: 1, done: 0, total: 5, deferred: 0, waiting: 1 });
      expect(keys(out.waiting)).toEqual([fr(d)]);
      expect(out.nextDue).toBe(at(25 * MIN).toISOString());
    }
    // A learning card due after the study day is tomorrow's.
    w.learning(d, "fr_ru", new Date(END.getTime() + MIN));
    expect(w.plan().counts).toMatchObject({ due: 3, waiting: 0 });
  });

  it("orders reviews by due date, FR→RU first on a tie, and includes those due later today", () => {
    const w = new World();
    const x = w.add("x");
    const y = w.add("y", { both_directions: true });
    const z = w.add("z");
    const t = w.add("t");
    w.review(x, "fr_ru", at(-HOUR));
    w.review(y, "ru_fr", at(-2 * DAY));
    w.review(y, "fr_ru", at(-2 * DAY));
    w.review(z, "fr_ru", at(8 * HOUR));
    w.review(t, "fr_ru", new Date(END.getTime() + HOUR));
    const out = w.plan({ direction: "fr_ru" });
    expect(keys(out.queue)).toEqual([fr(y), fr(x), fr(z)]);
    expect(keys(w.plan({ direction: "ru_fr" }).queue)).toEqual([ru(y)]);
  });

  it("buries RU→FR when both sides are due today and neither is overdue; never learning or overdue cards", () => {
    const w = new World();
    const x = w.add("x", { both_directions: true });
    const y = w.add("y", { both_directions: true });
    const z = w.add("z", { both_directions: true });
    const l = w.add("l", { both_directions: true });
    w.review(x, "fr_ru", at(2 * HOUR));
    w.review(x, "ru_fr", at(3 * HOUR));
    w.review(y, "fr_ru", at(-2 * DAY));
    w.review(y, "ru_fr", at(-2 * DAY));
    w.review(z, "fr_ru", at(HOUR));
    w.review(z, "ru_fr", at(-DAY));
    w.learning(l, "fr_ru", at(-MIN));
    w.learning(l, "ru_fr", at(-MIN));
    const p = plan({ ru_fr: "recognition" });
    const out = w.plan({ plan: p });
    expect(keys(out.queue)).not.toContain(ru(x));
    expect(keys(out.queue)).toEqual(expect.arrayContaining([fr(x), fr(y), ru(y), fr(z), ru(z), fr(l), ru(l)]));
    expect(out.day).toMatchObject({ buried: 1, dueReviews: 5 });
    expect(out.counts.due).toBe(7);
    // A direction filter shows the buried side.
    expect(keys(w.plan({ plan: p, direction: "ru_fr" }).queue)).toContain(ru(x));
    // Buried from the snapshot: grading FR→RU today keeps RU→FR for tomorrow.
    w.grade(fr(x), 3, at(-MIN));
    expect(keys(w.plan({ plan: p }).queue)).not.toContain(ru(x));
  });

  it("never puts the two sides of a word within 5 positions", () => {
    const w = new World();
    const p = w.add("p", { both_directions: true });
    w.review(p, "fr_ru", at(-3 * DAY));
    w.review(p, "ru_fr", at(-3 * DAY));
    const qs = Array.from({ length: 6 }, (_, i) => w.review(w.add(`q${i}`), "fr_ru", at(-2 * DAY + i * HOUR)));
    const out = w.plan();
    expect(keys(out.queue)).toEqual([fr(p), ...qs.slice(0, 5).map((s) => s.id), ru(p), qs[5].id]);
  });
});

describe("planDay: new words", () => {
  it("counts the budget in words, globally, and a filter only narrows the pick", () => {
    const w = new World();
    const a = Array.from({ length: 5 }, (_, i) => w.add(`a${i}`, { folder_id: "A", both_directions: true }));
    const b = Array.from({ length: 5 }, (_, i) => w.add(`b${i}`, { folder_id: "B", both_directions: true }));
    const p = plan({ new_words: 5 });
    let out = w.plan({ plan: p });
    expect(keys(out.queue)).toEqual(a.map(fr));
    expect(out.day).toMatchObject({ ceiling: 5, budget: 5, newToday: 0, newLeft: 5, reason: "limit", available: { fr: 10, ru: 0 } });
    // Three words of theme A introduced today: theme B gets the 2 left.
    for (const x of a.slice(0, 3)) w.grade(fr(x), 3, at(-HOUR));
    out = w.plan({ plan: p, match: (x) => x.folder_id === "B" });
    expect(keys(out.queue)).toEqual(b.slice(0, 2).map(fr));
    expect(out.day).toMatchObject({ budget: 5, newToday: 3, newLeft: 2 });
  });

  it("words left out of `words` (paused) take no budget and never show", () => {
    const w = new World();
    const a = w.add("a");
    const paused = w.add("paused");
    const words = new Map([[a.id, a]]);
    const out = w.plan({ words });
    expect(keys(out.queue)).toEqual([fr(a)]);
    expect(out.day.available.fr).toBe(1);
    expect(paused).toBeDefined();
  });

  it("reason: «empty» when fewer new words are left than the budget, «limit» when the budget is used", () => {
    const w = new World();
    const ws = Array.from({ length: 3 }, (_, i) => w.add(`w${i}`));
    expect(w.plan().day).toMatchObject({ budget: 10, reason: "empty", available: { fr: 3 } });
    const few = plan({ new_words: 2 });
    expect(w.plan({ plan: few }).day.reason).toBe("limit");
    for (const x of ws.slice(0, 2)) w.grade(fr(x), 3, at(-HOUR));
    expect(w.plan({ plan: few }).day).toMatchObject({ newLeft: 0, reason: "limit" });
    expect(w.plan({ plan: few }).counts.new).toBe(0);
  });

  it("a mid-day grade keeps the budget and the total; undo restores the plan", () => {
    const w = new World();
    for (let i = 0; i < 20; i++) w.add(`n${i}`, { both_directions: true });
    for (let i = 0; i < 5; i++) w.review(w.add(`r${i}`), "fr_ru", at(-i * HOUR));
    const p = plan({ new_words: 5, mix: "mixed" });
    const before = w.plan({ plan: p });
    expect(before.counts).toMatchObject({ new: 5, done: 0, total: 10 });

    const newKey = before.queue.find((i) => i.isNew)!.key;
    w.grade(newKey, 3, NOW);
    const mid = w.plan({ plan: p, now: at(MIN) });
    expect(mid.day.budget).toBe(5);
    expect(mid.counts).toMatchObject({ done: 1, total: 10, new: 4 });

    const reviewKey = mid.queue.find((i) => !i.isNew && i.state.state === 2)!.key;
    const beforeReview = w.plan({ plan: p, now: at(2 * MIN) });
    const log = w.grade(reviewKey, 3, at(2 * MIN));
    const after = w.plan({ plan: p, now: at(2 * MIN) });
    expect(after.counts).toMatchObject({ done: 2, total: 10 });
    expect(after.day).toEqual({ ...beforeReview.day, capDone: 1 });

    w.undo(log, at(3 * MIN));
    const undone = w.plan({ plan: p, now: at(2 * MIN) });
    expect(keys(undone.queue)).toEqual(keys(beforeReview.queue));
    expect(undone.counts).toEqual(beforeReview.counts);
    expect(undone.day).toEqual(beforeReview.day);
  });

  it("mixes new cards in among the reviews (mixed), or puts them after (after)", () => {
    const w = new World();
    const rs = Array.from({ length: 10 }, (_, i) => w.review(w.add(`r${i}`), "fr_ru", at(-(10 - i) * HOUR)));
    const ns = Array.from({ length: 3 }, (_, i) => w.add(`n${i}`));
    const mixed = w.plan({ plan: plan({ new_words: 3, mix: "mixed" }) });
    expect(mixed.queue.map((it, i) => (it.isNew ? i : -1)).filter((i) => i >= 0)).toEqual([2, 6, 10]);
    const after = w.plan({ plan: plan({ new_words: 3, mix: "after" }) });
    expect(keys(after.queue)).toEqual([...rs.map((s) => s.id), ...ns.map(fr)]);
  });

  it("spreads new words over themes in turn, at most ⌈budget/3⌉ (min 2) each, never two of one meaning", () => {
    const w = new World();
    const folderOrder = new Map<string | null, number>([["A", 0], ["B", 1], ["C", 2], [null, 3]]);
    const byTheme: Record<string, Word[]> = { A: [], B: [], C: [] };
    for (let i = 0; i < 4; i++) for (const t of ["A", "B", "C"]) byTheme[t].push(w.add(`${t}${i}`, { folder_id: t }));
    const theme = (k: string) => w.states.get(k)!.word_id && w.words.get(w.states.get(k)!.word_id)!.folder_id;

    const level = w.plan({ plan: plan({ new_words: 6, new_order: "level" }), folderOrder });
    expect(keys(level.queue)).toEqual([byTheme.A[0], byTheme.B[0], byTheme.C[0], byTheme.A[1], byTheme.B[1], byTheme.C[1]].map(fr));

    const themes = w.plan({ plan: plan({ new_words: 5, new_order: "themes" }), folderOrder });
    expect(keys(themes.queue).map(theme)).toEqual(["A", "A", "B", "B", "C"]);

    // Same meaning (searchKey of ru): only the first of the day. Words introduced today count.
    w.words.set(byTheme.B[0].id, { ...byTheme.B[0], ru: " RU-a0 " });
    w.grade(fr(byTheme.A[0]), 3, at(-HOUR));
    w.grade(fr(byTheme.A[1]), 3, at(-HOUR));
    const later = w.plan({ plan: plan({ new_words: 6, new_order: "level" }), folderOrder });
    expect(keys(later.queue.filter((i) => i.isNew))).toEqual([byTheme.B[1], byTheme.C[0], byTheme.B[2], byTheme.C[1]].map(fr));
    expect(later.day.newLeft).toBe(4);

    // Too few themes for the budget: past the limit, in order.
    const two = w.plan({ plan: plan({ new_words: 6, new_order: "level" }), folderOrder, match: (x) => x.folder_id === "C" });
    expect(keys(two.queue.filter((i) => i.isNew))).toEqual(byTheme.C.map(fr));
    // One theme on its own: no per-theme limit.
    const one = w.plan({ plan: plan({ new_words: 6, new_order: "level" }), folderOrder, match: (x) => x.folder_id === "C", spreadThemes: false });
    expect(keys(one.queue)).toEqual(byTheme.C.map(fr));
  });

  it("orders by level band and register, then frequency, then age (level)", () => {
    const w = new World();
    const c1 = w.add("c1");
    const none = w.add("none");
    const b1 = w.add("b1");
    const a1slang = w.add("a1slang", { slang_level: 2 });
    const a1rare = w.add("a1rare");
    const a1common = w.add("a1common");
    const levels: Record<string, string | null> = { c1: "C1", none: null, b1: "B1", a1slang: "A1", a1rare: "A1", a1common: "A1" };
    const freqs: Record<string, number> = { a1rare: 1, a1common: 900 };
    const out = w.plan({
      plan: plan({ new_words: 10, new_order: "level" }),
      spreadThemes: false,
      level: (x) => levels[x.fr],
      freq: (x) => freqs[x.fr] ?? null,
    });
    expect(keys(out.queue)).toEqual([a1common, a1rare, b1, a1slang, none, c1].map(fr));
  });

  it("«together» (the rule before the plan): one allowance of cards, RU→FR the day after FR→RU was learned", () => {
    const w = new World();
    const old = w.add("old", { both_directions: true });
    const a = w.add("a", { both_directions: true });
    const b = w.add("b", { both_directions: true });
    w.review(old, "fr_ru", at(3 * DAY), { stability: 1 });
    const p = plan({ ...LEGACY_STUDY_PLAN, new_words: 3 });
    let out = w.plan({ plan: p });
    expect(keys(out.queue)).toEqual([ru(old), fr(a), fr(b)]);
    expect(out.day).toMatchObject({ budget: 3, newLeft: 3, available: { fr: 2, ru: 1 } });
    // Introducing a card of either side uses the allowance.
    w.grade(ru(old), 3, at(-HOUR));
    out = w.plan({ plan: p });
    expect(keys(out.queue)).toEqual([ru(old), fr(a), fr(b)]); // its learning step first
    expect(out.day.newLeft).toBe(2);
    // FR→RU reviewed today holds RU→FR back.
    const c = w.add("c", { both_directions: true });
    w.review(c, "fr_ru", at(3 * DAY));
    w.grade(fr(c), 3, at(-30 * MIN));
    expect(keys(w.plan({ plan: p }).queue)).not.toContain(ru(c));
  });

  it("«after»: RU→FR unlocks once FR→RU holds S ≥ 3 d, is not due and was not reviewed today", () => {
    const w = new World();
    const ok = w.add("ok", { both_directions: true });
    const weak = w.add("weak", { both_directions: true });
    const dueToday = w.add("due", { both_directions: true });
    const seen = w.add("seen", { both_directions: true });
    const fresh = w.add("fresh", { both_directions: true });
    w.review(ok, "fr_ru", at(3 * DAY), { stability: 3 });
    w.review(weak, "fr_ru", at(3 * DAY), { stability: 2.9 });
    w.review(dueToday, "fr_ru", at(2 * HOUR), { stability: 8 });
    w.review(seen, "fr_ru", at(-2 * HOUR), { stability: 8 });
    w.grade(fr(seen), 3, at(-HOUR));
    const p = plan({ new_words: 1 });
    const out = w.plan({ plan: p });
    const fresh2 = keys(out.queue).filter((k) => out.queue.find((i) => i.key === k)!.isNew);
    expect(fresh2).toEqual([ru(ok), fr(fresh)]); // "added": oldest word first
    expect(out.day).toMatchObject({ budget: 1, ruLeft: 1, available: { fr: 1, ru: 1 } });
    // The allowance of reverse sides is its own: introducing one uses it up.
    w.grade(ru(ok), 3, at(-MIN));
    expect(w.plan({ plan: p }).day).toMatchObject({ ruLeft: 0, ruToday: 1, newLeft: 1 });
    // «recognition»: never; a RU→FR filter shows new reverse sides directly.
    expect(w.plan({ plan: plan({ new_words: 1, ru_fr: "recognition" }) }).queue.some((i) => i.isNew && i.direction === "ru_fr")).toBe(false);
    const ruOnly = w.plan({ plan: plan({ new_words: 5 }), direction: "ru_fr" });
    expect(keys(ruOnly.queue)).toContain(ru(fresh));
    expect(ruOnly.queue.every((i) => i.direction === "ru_fr")).toBe(true);
  });

  it("a RU→FR-only session counts its new reverse sides against the day's budget", () => {
    for (const ruFr of ["after", "recognition"] as const) {
      const w = new World();
      for (let i = 0; i < 20; i++) w.add(`w${i}`, { both_directions: true });
      const p = plan({ new_words: 3, ru_fr: ruFr });
      const seen: number[] = [];
      for (let step = 0; step < 6; step++) {
        const out = w.plan({ plan: p, direction: "ru_fr" });
        seen.push(out.counts.new);
        const next = out.queue.find((i) => i.isNew);
        if (!next) break;
        w.grade(next.key, 3, at(-HOUR + step * MIN));
      }
      expect(seen).toEqual([3, 2, 1, 0]);
      // FR→RU words introduced elsewhere today count too.
      const v = new World();
      const a = v.add("a", { both_directions: true });
      for (let i = 0; i < 5; i++) v.add(`v${i}`, { both_directions: true });
      v.grade(fr(a), 3, at(-HOUR));
      expect(v.plan({ plan: p, direction: "ru_fr" }).counts.new).toBe(2);
    }
  });

  it("the day's numbers bury RU→FR whatever the direction filter", () => {
    const w = new World();
    for (let i = 0; i < 40; i++) w.review(w.add(`f${i}`), "fr_ru", at(HOUR));
    for (let i = 0; i < 20; i++) {
      const b = w.add(`b${i}`, { both_directions: true });
      w.review(b, "fr_ru", at(HOUR));
      w.review(b, "ru_fr", at(2 * HOUR));
    }
    const day = (over: Partial<PlanInput>) => {
      const d = w.plan(over).day;
      return { dueReviews: d.dueReviews, deferred: d.deferred, backlog: d.backlog, budget: d.budget, reason: d.reason, buried: d.buried };
    };
    const p50 = plan({ review_cap: 50, new_words: 10 });
    const both = day({ plan: p50 });
    expect(both).toMatchObject({ dueReviews: 60, deferred: 10, buried: 20 });
    expect(day({ plan: p50, direction: "fr_ru" })).toEqual(both);
    expect(day({ plan: p50, direction: "ru_fr" })).toEqual(both);
    const p70 = plan({ review_cap: 70, new_words: 10 });
    expect(day({ plan: p70, direction: "fr_ru" })).toMatchObject({ backlog: false, budget: 10 });
    // The RU→FR session still shows its buried sides.
    expect(w.plan({ plan: p70, direction: "ru_fr" }).counts.due).toBe(20);
  });

  it("a 10-day run brings B new words and up to B reverse sides every day (no alternating days)", () => {
    const run = (p: StudyPlan) => {
      const w = new World();
      for (let i = 0; i < 80; i++) w.add(`w${i}`, { both_directions: true });
      const perDay: { fr: number; ru: number }[] = [];
      for (let day = 0; day < 10; day++) {
        const dayStart = new Date(START.getTime() + day * DAY);
        const dayEnd = new Date(dayStart.getTime() + DAY);
        let now = new Date(dayStart.getTime() + 4 * HOUR);
        for (let step = 0; step < 400; step++) {
          const out = w.plan({ plan: p, dayStart, dayEnd, now });
          if (out.queue.length === 0) break;
          w.grade(out.queue[0].key, 3, now);
          now = new Date(now.getTime() + 2 * MIN);
        }
        const intro = w.logs.filter((l) => l.state === 0 && Date.parse(l.review) >= dayStart.getTime() && Date.parse(l.review) < dayEnd.getTime());
        perDay.push({ fr: intro.filter((l) => l.direction === "fr_ru").length, ru: intro.filter((l) => l.direction === "ru_fr").length });
      }
      return perDay;
    };
    const days = run(plan({ new_words: 5, new_order: "level", mix: "mixed", ru_fr: "after" }));
    expect(days.map((d) => d.fr)).toEqual(Array(10).fill(5));
    expect(days.every((d) => d.ru <= 5)).toBe(true);
    expect(days.reduce((n, d) => n + d.ru, 0)).toBeGreaterThan(0);

    // The rule before the plan alternates: a day of FR→RU, then a day of their reverse sides.
    const legacy = run(plan({ ...LEGACY_STUDY_PLAN, new_words: 5 }));
    expect(legacy.slice(0, 4)).toEqual([
      { fr: 5, ru: 0 },
      { fr: 0, ru: 5 },
      { fr: 5, ru: 0 },
      { fr: 0, ru: 5 },
    ]);
  });
});

describe("planDay: cap, backlog and throttles", () => {
  /** `n` review cards due today (overdue), stability i+1, plus a few new words. */
  function backlogWorld(n: number) {
    const w = new World();
    const cards = Array.from({ length: n }, (_, i) => w.review(w.add(`r${i}`), "fr_ru", at(-DAY - i * MIN), { stability: i + 1, difficulty: 5 }));
    const fresh = Array.from({ length: 3 }, (_, i) => w.add(`n${i}`));
    return { w, cards, fresh };
  }
  /** Recall rises with stability (a stand-in for the scheduler). */
  const r = (s: ReviewState) => s.stability / 1000;

  it("over the cap: shows cap − done by retrievability (desc), then difficulty (asc); defers the rest; no new words", () => {
    const { w, cards } = backlogWorld(60);
    w.states.set(cards[0].id, { ...cards[0], stability: 60, difficulty: 3 }); // ties r60 on R, easier
    const p = plan({ review_cap: 50 });
    const out = w.plan({ plan: p, r });
    expect(out.day).toMatchObject({ backlog: true, dueReviews: 60, deferred: 10, budget: 0, ruLeft: 0, reason: "backlog", canOverride: true });
    expect(out.counts).toMatchObject({ due: 50, new: 0, deferred: 10 });
    expect(keys(out.queue).slice(0, 3)).toEqual([cards[0].id, cards[59].id, cards[58].id]);

    // 10 interday reviews done today: 40 more; a new word's learning steps do not count.
    const done = keys(out.queue).slice(0, 10);
    for (const k of done) w.grade(k, 3, at(-HOUR));
    const freshKey = [...w.states.values()].find((s) => s.state === 0)!.id;
    w.grade(freshKey, 1, at(-HOUR));
    w.grade(freshKey, 3, at(-50 * MIN));
    const later = w.plan({ plan: p, r });
    expect(later.day).toMatchObject({ capDone: 10, dueReviews: 60, deferred: 10, backlog: true });
    expect(later.counts.due - later.counts.waiting - later.queue.filter((i) => i.state.state !== 2).length).toBe(40);
  });

  it("«Всё равно добавить новые» lifts the backlog up to the ceiling", () => {
    const { w, fresh } = backlogWorld(60);
    const out = w.plan({ plan: plan({ review_cap: 50, new_words: 2 }), r, overrideNewToday: true });
    expect(out.day).toMatchObject({ backlog: true, override: true, canOverride: false, budget: 2, reason: "limit" });
    expect(out.queue.filter((i) => i.isNew).map((i) => i.key)).toEqual(fresh.slice(0, 2).map(fr));
  });

  it("no cap (null): never a backlog", () => {
    const { w } = backlogWorld(60);
    const out = w.plan({ plan: plan({ review_cap: null }), r });
    expect(out.day).toMatchObject({ backlog: false, deferred: 0, cap: null });
    expect(out.counts.due).toBe(60);
  });

  /** `perDay` review cards due on each of the next 7 days. */
  function loadWorld(perDay: number) {
    const w = new World();
    for (let d = 0; d < 7; d++) for (let i = 0; i < perDay; i++) w.review(w.add(`f${d}-${i}`), "fr_ru", new Date(END.getTime() + d * DAY + HOUR));
    for (let i = 0; i < 12; i++) w.add(`n${i}`);
    return w;
  }

  it("load: the budget is full up to 100 reviews a day ahead and none at 160 (cap 200)", () => {
    expect(loadWorld(100).plan().day).toMatchObject({ forecast7: 100, load: 1, budget: 10, reason: "limit" });
    expect(loadWorld(160).plan().day).toMatchObject({ forecast7: 160, load: 0, budget: 0, reason: "load", canOverride: true });
    const half = loadWorld(130).plan().day;
    expect(half).toMatchObject({ load: 0.5, budget: 5, ruLeft: 5, reason: "load" });
    expect(loadWorld(130).plan({ overrideNewToday: true }).day).toMatchObject({ budget: 10, reason: "limit" });
  });

  it("accuracy: under 80% success of 30+ young reviews halves the budget; fewer logs or old cards don't count", () => {
    const w = new World();
    for (let i = 0; i < 12; i++) w.add(`n${i}`);
    w.logs.push(...Array.from({ length: 29 }, (_, i) => pastLog(i, 1)));
    expect(w.plan().day).toMatchObject({ budget: 10, accuracyLogs: 29, accuracy7: 0, reason: "limit" });

    const v = new World();
    for (let i = 0; i < 12; i++) v.add(`n${i}`);
    v.logs.push(...Array.from({ length: 30 }, (_, i) => pastLog(i, i < 20 ? 3 : 1)));
    v.logs.push(...Array.from({ length: 30 }, (_, i) => pastLog(100 + i, 1, 30))); // mature: ignored
    expect(v.plan().day).toMatchObject({ budget: 5, accuracyLogs: 30, reason: "accuracy" });
    expect(v.plan().day.accuracy7).toBeCloseTo(2 / 3);
    // The RU→FR allowance follows the load only.
    expect(v.plan().day.ruLeft).toBe(10);
  });
});
