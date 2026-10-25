import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import { createFolder, updateFolder } from "./folders";
import { ensureProgressDays, holdingProgressDays, loadProgress, loadProgressDay, retentionSummary, saveProgressDays, STUDY_DAY_START_HOUR } from "./progress";
import { seedPrototypeWords } from "./seed";
import { DAY_START_HOUR } from "./session";
import type { ExerciseRun } from "./types";
import { DEFAULT_STUDY_PLAN, getPlanDay, recordPlanDay, setStudyPlan } from "./user-prefs";
import { addWord, gradeCard, softDeleteWord, undoLastReview } from "./words";

/** Local wall-clock time. */
const at = (m: number, d: number, h = 12, min = 0) => new Date(2026, m - 1, d, h, min);
const NOW = at(10, 25, 12); // today = 2026-10-25

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

/** Words from the 21st; reviews on the 21st, 22nd (one undone) and 24th (yesterday, one after midnight). */
async function history() {
  const a = await addWord({ fr: "la thune", ru: "бабки", both_directions: false }, at(10, 21, 9));
  const b = await addWord({ fr: "bouffer", ru: "жрать", both_directions: false }, at(10, 21, 9, 1));
  await gradeCard(a.id, "fr_ru", 3, at(10, 21, 10));
  await gradeCard(b.id, "fr_ru", 1, at(10, 21, 10, 1));
  await gradeCard(b.id, "fr_ru", 3, at(10, 21, 10, 15));
  await gradeCard(a.id, "fr_ru", 3, at(10, 22, 10));
  await undoLastReview({}, at(10, 22, 10, 1));
  await gradeCard(b.id, "fr_ru", 1, at(10, 24, 22));
  await gradeCard(a.id, "fr_ru", 4, at(10, 25, 1)); // 01:00 on the 25th: still the 24th
  return { a, b };
}

const row = (id: string) => db.progress_days.get(id);

describe("ensureProgressDays", () => {
  it("shares its 04:00 with the review session", () => {
    expect(STUDY_DAY_START_HOUR).toBe(DAY_START_HOUR);
  });

  it("stores yesterday as live and older days as replay, never today", async () => {
    await history();
    expect(await ensureProgressDays(db, NOW)).toBe(4);
    expect((await db.progress_days.toArray()).map((r) => r.id)).toEqual(["2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24"]);
    expect(await row("2026-10-25")).toBeUndefined();
    expect(await row("2026-10-24")).toMatchObject({ source: "live", reviews: 2, again: 1, total: 2, deleted_at: null });
    expect(await row("2026-10-21")).toMatchObject({ source: "replay", reviews: 3, again: 1, new_introduced: 2, added: 2, total: 2, fresh: 0 });
    expect(await row("2026-10-22")).toMatchObject({ source: "replay", reviews: 0 }); // the undone review is gone
    expect((await row("2026-10-23"))!.algo).toMatch(/FSRS/);
    // Synced like any other table.
    expect((await db.outbox.toArray()).map((o) => o.key)).toEqual(expect.arrayContaining(["progress_days:2026-10-24", "progress_days:2026-10-21"]));
  });

  it("is idempotent and never overwrites a stored row", async () => {
    await history();
    expect(await ensureProgressDays(db, at(10, 24, 12))).toBe(3); // the 21st to the 23rd
    await db.progress_days.put({ ...(await row("2026-10-23"))!, known: 99 });
    const kept = (await row("2026-10-23"))!;
    expect(kept).toMatchObject({ source: "live", known: 99 });
    // The next day: only the 24th is new; the 23rd (live) stays as it was.
    expect(await ensureProgressDays(db, NOW)).toBe(1);
    expect(await row("2026-10-23")).toEqual(kept);
    expect(await row("2026-10-24")).toMatchObject({ source: "live" });
    expect(await ensureProgressDays(db, NOW)).toBe(0);
    expect(await db.progress_days.count()).toBe(4);
  });

  it("backfills a gap left by days the app was not opened", async () => {
    await history();
    await ensureProgressDays(db, at(10, 22, 12)); // stores the 21st only
    await db.progress_days.delete("2026-10-22");
    expect(await ensureProgressDays(db, NOW)).toBe(3);
    expect(await row("2026-10-22")).toMatchObject({ source: "replay" });
    expect(await row("2026-10-21")).toMatchObject({ source: "live" });
  });

  it("does nothing on an empty library or on the first day", async () => {
    expect(await ensureProgressDays(db, NOW)).toBe(0);
    await addWord({ fr: "relou", ru: "напряжный" }, at(10, 25, 9));
    expect(await saveProgressDays(db, NOW)).toBe(0);
    expect(await db.progress_days.count()).toBe(0);
  });

  it("starts after the prototype seed's 2000-01-01 stamp, not on it", async () => {
    await seedPrototypeWords();
    expect(await ensureProgressDays(db, NOW)).toBe(0);
    await history();
    expect(await ensureProgressDays(db, NOW)).toBe(4);
    expect((await db.progress_days.orderBy("id").first())!.id).toBe("2026-10-21");
  });

  it("writes a tombstoned day again (an undone backup import)", async () => {
    await history();
    await ensureProgressDays(db, NOW);
    const gone = { ...(await row("2026-10-22"))!, known: 99, deleted_at: NOW.toISOString(), updated_at: NOW.toISOString() };
    await db.progress_days.put(gone);
    expect(await ensureProgressDays(db, at(10, 25, 13))).toBe(1);
    expect(await row("2026-10-22")).toMatchObject({ deleted_at: null, known: 0, source: "replay", updated_at: at(10, 25, 13).toISOString() });
  });

  it("stores nothing while a sync cycle runs, and with sync on not before the first full pull", async () => {
    await history();
    expect(await holdingProgressDays(() => saveProgressDays(db, NOW))).toBe(0);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "key");
    try {
      expect(await saveProgressDays(db, NOW)).toBe(0);
      await db.table("settings").put({ id: "sync", last_sync_at: NOW.toISOString(), sync_cursors: {} });
      expect(await saveProgressDays(db, NOW)).toBe(4);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("copies the kept day plan into yesterday's row; replayed days get none", async () => {
    await history();
    const plan = { ceiling: 10, budget: 6, reason: "load" as const, cap: 200, due: 80, deferred: 0, forecast7: 105.4, override: false };
    expect(await recordPlanDay("2026-10-23", { ...plan, budget: 10, reason: "limit" }, at(10, 23, 9))).toBe(true);
    expect(await recordPlanDay("2026-10-24", plan, at(10, 24, 9))).toBe(true);
    expect(await recordPlanDay("2026-10-24", plan, at(10, 24, 10))).toBe(false); // the same plan again: nothing written
    // Today's first plan moves yesterday's to `prev`, so it is still there when the row is written.
    await recordPlanDay("2026-10-25", { ...plan, budget: 10, reason: "limit" }, at(10, 25, 9));
    expect(await getPlanDay()).toMatchObject({ day: "2026-10-25", budget: 10, prev: { day: "2026-10-24", ...plan } });
    await ensureProgressDays(db, NOW);
    expect((await row("2026-10-24"))!.plan).toEqual(plan);
    expect((await row("2026-10-23"))!.plan).toBeNull(); // replay
    expect((await row("2026-10-21"))!.plan).toBeNull();
  });

  it("leaves the plan out when the kept one is for another day", async () => {
    await history();
    await recordPlanDay("2026-10-22", { ceiling: 10, budget: 10, reason: "limit", cap: 200, due: 5, deferred: 0, forecast7: 3, override: false }, at(10, 22, 9));
    await ensureProgressDays(db, NOW);
    expect((await row("2026-10-24"))!.plan).toBeNull();
  });

  it("keeps the plan of an older missing day when plan_day still holds it (the app wasn't opened the day after)", async () => {
    await history();
    const kept = { ceiling: 10, budget: 4, reason: "load" as const, cap: 200, due: 90, deferred: 0, forecast7: 130, override: false };
    await recordPlanDay("2026-10-23", kept, at(10, 23, 9));
    await recordPlanDay("2026-10-25", { ...kept, budget: 10, reason: "limit" }, at(10, 25, 9)); // 10-23 moves to `prev`
    await ensureProgressDays(db, NOW);
    expect(await row("2026-10-23")).toMatchObject({ source: "replay", plan: kept });
    expect((await row("2026-10-24"))!.plan).toBeNull();
  });

  it("keeps a deleted word on the days it existed", async () => {
    const { b } = await history();
    await softDeleteWord(b.id, at(10, 23, 12));
    await ensureProgressDays(db, NOW);
    expect(await row("2026-10-22")).toMatchObject({ total: 2 });
    expect(await row("2026-10-23")).toMatchObject({ total: 1 });
  });
});

describe("loadProgress", () => {
  it("is empty before anything was studied", async () => {
    await addWord({ fr: "relou", ru: "напряжный" }, at(10, 25, 9));
    const p = await loadProgress("month", NOW);
    expect(p).toMatchObject({ empty: true, since: null, activeDays: 0, streak: { current: 0, best: 0 }, weekCount: 0 });
    expect(p.today).toMatchObject({ day: "2026-10-25", total: 1, fresh: 1, source: "today", active: false });
    expect(p.series.map((s) => s.day)).toEqual(["2026-10-25"]);
  });

  it("builds the series, streak, retention and week from stored days and today", async () => {
    const { a } = await history();
    await ensureProgressDays(db, NOW);
    // An exercise run finished on the 23rd makes that day active too.
    await db.exercise_runs.put({
      id: "r1", set_id: "s1", kind: "set", item_ids: [], started_at: at(10, 23, 18).toISOString(), finished_at: at(10, 23, 18, 10).toISOString(),
      answers: [], total: 6, first_try: 5, updated_at: at(10, 23, 18, 10).toISOString(), deleted_at: null,
    } satisfies ExerciseRun);
    await gradeCard(a.id, "fr_ru", 3, at(10, 25, 11));

    const p = await loadProgress("month", NOW);
    expect(p.empty).toBe(false);
    expect(p.since).toBe("2026-10-21");
    expect(p.activeDayKeys).toEqual(["2026-10-21", "2026-10-23", "2026-10-24", "2026-10-25"]);
    expect(p.streak).toMatchObject({ current: 3, currentFrom: "2026-10-23", best: 3 });
    expect(p.weekCount).toBe(4); // Mon 19th – Sun 25th
    expect(p.rangeFrom).toBe("2026-10-01");
    expect(p.series.map((s) => [s.day, s.source])).toEqual([
      ["2026-10-21", "replay"],
      ["2026-10-22", "replay"],
      ["2026-10-23", "replay"],
      ["2026-10-24", "live"],
      ["2026-10-25", "today"],
    ]);
    expect(p.series[2]).toMatchObject({ exercises: 1, active: true, reviews: 0 });
    expect(p.today).toMatchObject({ reviews: 1, again: 0, total: 2, active: true, correct: 1 });
    expect(p.today.memorized).toBeGreaterThan(0);
    expect(p.retention.target).toBe(0.9);
    const logs = (await db.review_log.toArray()).filter((l) => l.deleted_at === null);
    expect(p.retention.last7).toEqual(retentionSummary(logs, "2026-10-25", 0.9).last7);
    expect(p.retention.last7.total).toBeGreaterThan(0);
    expect(p.weekAgo).toBeNull();
  });

  it("counts a day as active from its log even when its row was stored before the log synced in", async () => {
    const { a } = await history();
    await ensureProgressDays(db, NOW);
    expect(await row("2026-10-23")).toMatchObject({ reviews: 0 });
    // Another device's review of the 23rd arrives later; the stored row stays as it was.
    await gradeCard(a.id, "fr_ru", 3, at(10, 23, 20));
    const p = await loadProgress("month", NOW);
    expect(p.activeDayKeys).toEqual(["2026-10-21", "2026-10-23", "2026-10-24"]);
    expect(p.streak).toMatchObject({ current: 2, best: 2 });
    expect((await loadProgressDay("2026-10-24", NOW))?.ordinal).toBe(3);
    // The chart re-reads the day's activity from the log, not the stale row.
    expect(p.series.find((d) => d.day === "2026-10-23")).toMatchObject({ reviews: 1, active: true });
  });
});

describe("loadProgressDay", () => {
  it("opens a past day with its counts and mistakes", async () => {
    const { b } = await history();
    await ensureProgressDays(db, NOW);
    const day = await loadProgressDay("2026-10-21", NOW);
    expect(day?.point).toMatchObject({ day: "2026-10-21", reviews: 3, again: 1, new_introduced: 2, source: "replay", correct: 2 / 3 });
    expect(day?.mistakes).toEqual([{ word_id: b.id, fr: "bouffer", ru: "жрать", slang_level: 0, verlan: false }]);
    expect(day?.ordinal).toBe(1);
    expect((await loadProgressDay("2026-10-24", NOW))?.ordinal).toBe(2);
    expect((await loadProgressDay("2026-10-22", NOW))?.ordinal).toBeNull();
    expect(await loadProgressDay("2026-10-26", NOW)).toBeNull();
    expect(await loadProgressDay("2026-10-01", NOW)).toBeNull();
  });

  it("counts the day's new words in plan units: FR→RU words, or both cards in «together» mode", async () => {
    const w = await addWord({ fr: "kiffer", ru: "тащиться", both_directions: true }, at(10, 21, 9));
    await gradeCard(w.id, "fr_ru", 3, at(10, 21, 10));
    await gradeCard(w.id, "ru_fr", 3, at(10, 21, 10, 5));
    expect((await loadProgressDay("2026-10-21", NOW))?.point).toMatchObject({ new_introduced: 2, new_words: 1 });
    await setStudyPlan({ ...DEFAULT_STUDY_PLAN, ru_fr: "together" }, at(10, 21, 8));
    expect((await loadProgressDay("2026-10-21", NOW))?.point).toMatchObject({ new_introduced: 2, new_words: 2 });
    const progress = await loadProgress("month", NOW);
    expect(progress.series.find((p) => p.day === "2026-10-21")).toBeUndefined(); // no row stored yet
    await ensureProgressDays(db, NOW);
    expect((await loadProgress("month", NOW)).series.find((p) => p.day === "2026-10-21")).toMatchObject({ new_introduced: 2, new_words: 2 });
  });

  it("opens today live and a day without a row by replaying it", async () => {
    await history();
    const today = await loadProgressDay("2026-10-25", NOW);
    expect(today?.point).toMatchObject({ source: "today", reviews: 0, total: 2 });
    const replayed = await loadProgressDay("2026-10-24", NOW);
    expect(replayed?.point).toMatchObject({ source: "replay", reviews: 2, total: 2 });
  });

  it("counts paused words apart with the current flags", async () => {
    const f = await createFolder({ name: "Еда" }, at(10, 21, 8));
    await addWord({ fr: "la bouffe", ru: "жратва", folder_id: f.id }, at(10, 21, 9));
    await addWord({ fr: "relou", ru: "напряжный" }, at(10, 21, 9));
    await updateFolder(f.id, { muted: true }, at(10, 25, 9));
    await ensureProgressDays(db, NOW);
    expect(await row("2026-10-22")).toMatchObject({ total: 2, paused: 1, fresh: 1 });
  });
});
