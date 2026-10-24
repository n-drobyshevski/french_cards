import "fake-indexeddb/auto";
import { liveQuery } from "dexie";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { updateSettings } from "./settings";
import {
  DEFAULT_EXERCISE_FOCUS,
  DEFAULT_STUDY_PLAN,
  EXERCISE_FOCUS_PREF,
  getExerciseFocus,
  getNewOverrideDay,
  getStudyPlan,
  isNewOverrideOn,
  saveMigratedStudyPlan,
  setExerciseFocus,
  setNewOverride,
  setStudyPlan,
  STUDY_PLAN_PREF,
} from "./user-prefs";

const NOW = new Date("2026-10-23T10:00:00.000Z");

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("«Чаще в упражнениях» (user_prefs)", () => {
  it("reads the default without a row, and after a delete", async () => {
    expect(await getExerciseFocus()).toEqual(DEFAULT_EXERCISE_FOCUS);
    await db.user_prefs.put({ id: EXERCISE_FOCUS_PREF, value: { target: "due", share: "most" }, updated_at: NOW.toISOString(), deleted_at: NOW.toISOString() });
    expect(await getExerciseFocus()).toEqual(DEFAULT_EXERCISE_FOCUS);
  });

  it("saves one row the outbox pushes, and reads it back", async () => {
    await setExerciseFocus({ target: "difficult", share: "most" }, NOW);
    expect(await db.user_prefs.toArray()).toEqual([
      { id: EXERCISE_FOCUS_PREF, value: { target: "difficult", share: "most" }, updated_at: NOW.toISOString(), deleted_at: null },
    ]);
    expect((await db.outbox.toArray()).map((o) => o.key)).toEqual([`user_prefs:${EXERCISE_FOCUS_PREF}`]);
    expect(await getExerciseFocus()).toEqual({ target: "difficult", share: "most" });
  });

  it("stamps past a stored updated_at that runs ahead, and revives a deleted row", async () => {
    const ahead = new Date(NOW.getTime() + 60_000).toISOString();
    await db.user_prefs.put({ id: EXERCISE_FOCUS_PREF, value: { target: "due", share: "some" }, updated_at: ahead, deleted_at: ahead });
    await setExerciseFocus({ target: "both", share: "half" }, NOW);
    const row = await db.user_prefs.get(EXERCISE_FOCUS_PREF);
    expect(row?.deleted_at).toBeNull();
    expect(Date.parse(row!.updated_at)).toBe(Date.parse(ahead) + 1);
    expect(await getExerciseFocus()).toEqual({ target: "both", share: "half" });
  });

  it("writes nothing when the value is unchanged; unknown values fall back to the default", async () => {
    await setExerciseFocus({ target: "due", share: "half" }, NOW);
    await db.outbox.clear();
    await setExerciseFocus({ target: "due", share: "half" }, new Date(NOW.getTime() + 1000));
    expect(await db.outbox.count()).toBe(0);
    expect((await db.user_prefs.get(EXERCISE_FOCUS_PREF))?.updated_at).toBe(NOW.toISOString());

    await db.user_prefs.put({ id: EXERCISE_FOCUS_PREF, value: { target: "weird", share: 3 }, updated_at: NOW.toISOString(), deleted_at: null });
    expect(await getExerciseFocus()).toEqual(DEFAULT_EXERCISE_FOCUS);
  });

  it("is live: a write reaches subscribers (as useExerciseFocus)", async () => {
    const seen: unknown[] = [];
    const sub = liveQuery(() => getExerciseFocus()).subscribe((v) => seen.push(v));
    await new Promise((r) => setTimeout(r, 20));
    await setExerciseFocus({ target: "difficult", share: "some" }, NOW);
    await new Promise((r) => setTimeout(r, 50));
    sub.unsubscribe();
    expect(seen[0]).toEqual(DEFAULT_EXERCISE_FOCUS);
    expect(seen.at(-1)).toEqual({ target: "difficult", share: "some" });
  });
});

describe("«План повторения» (user_prefs study_plan)", () => {
  it("without a row: migrated from the device's «Новых карточек в день» (cards → words)", async () => {
    expect(await getStudyPlan()).toEqual({ ...DEFAULT_STUDY_PLAN, new_words: 8 });
    await updateSettings({ new_per_day: 20 });
    expect((await getStudyPlan()).new_words).toBe(10);
    await db.user_prefs.put({ id: STUDY_PLAN_PREF, value: DEFAULT_STUDY_PLAN, updated_at: NOW.toISOString(), deleted_at: NOW.toISOString() });
    expect((await getStudyPlan()).new_words).toBe(10);
  });

  it("saves one synced row, reads it back, and writes nothing when unchanged", async () => {
    const plan = { new_words: 12, review_cap: null, new_order: "themes", mix: "after", ru_fr: "together" } as const;
    await setStudyPlan(plan, NOW);
    expect(await db.user_prefs.get(STUDY_PLAN_PREF)).toEqual({ id: STUDY_PLAN_PREF, value: plan, updated_at: NOW.toISOString(), deleted_at: null });
    expect((await db.outbox.toArray()).map((o) => o.key)).toEqual([`user_prefs:${STUDY_PLAN_PREF}`]);
    expect(await getStudyPlan()).toEqual(plan);
    await db.outbox.clear();
    await setStudyPlan({ ...plan }, new Date(NOW.getTime() + 1000));
    expect(await db.outbox.count()).toBe(0);
    // A partial row (an older app) is read with the device's fallback and rewritten in full.
    await db.user_prefs.put({ id: STUDY_PLAN_PREF, value: { new_words: 4 }, updated_at: NOW.toISOString(), deleted_at: null });
    expect(await getStudyPlan()).toEqual({ ...DEFAULT_STUDY_PLAN, new_words: 4 });
    await setStudyPlan({ ...DEFAULT_STUDY_PLAN, new_words: 4 }, new Date(NOW.getTime() + 2000));
    expect((await db.user_prefs.get(STUDY_PLAN_PREF))?.value).toEqual({ ...DEFAULT_STUDY_PLAN, new_words: 4 });
  });

  it("saves the migrated plan for Claude only without a live row and with a non-default number", async () => {
    await saveMigratedStudyPlan(NOW);
    expect(await db.user_prefs.get(STUDY_PLAN_PREF)).toBeUndefined();
    await updateSettings({ new_per_day: 30 });
    await saveMigratedStudyPlan(NOW);
    expect(await db.user_prefs.get(STUDY_PLAN_PREF)).toEqual({ id: STUDY_PLAN_PREF, value: { ...DEFAULT_STUDY_PLAN, new_words: 15 }, updated_at: NOW.toISOString(), deleted_at: null });
    expect((await db.outbox.toArray()).map((o) => o.key)).toEqual([`user_prefs:${STUDY_PLAN_PREF}`]);
    // A saved plan is never touched.
    const saved = { ...DEFAULT_STUDY_PLAN, new_words: 4 };
    await setStudyPlan(saved, new Date(NOW.getTime() + 1000));
    await saveMigratedStudyPlan(new Date(NOW.getTime() + 2000));
    expect(await getStudyPlan()).toEqual(saved);
  });

  it("stamps past a stored updated_at that runs ahead", async () => {
    const ahead = new Date(NOW.getTime() + 60_000).toISOString();
    await db.user_prefs.put({ id: STUDY_PLAN_PREF, value: DEFAULT_STUDY_PLAN, updated_at: ahead, deleted_at: null });
    await setStudyPlan({ ...DEFAULT_STUDY_PLAN, new_words: 5 }, NOW);
    expect(Date.parse((await db.user_prefs.get(STUDY_PLAN_PREF))!.updated_at)).toBe(Date.parse(ahead) + 1);
  });
});

describe("«Всё равно добавить новые» (device-local, one study day)", () => {
  const DAY_START = new Date("2026-10-23T02:00:00.000Z");

  it("is on for the day it was picked for only, and never reaches the outbox or the settings row", async () => {
    expect(await getNewOverrideDay()).toBeNull();
    expect(await isNewOverrideOn(DAY_START)).toBe(false);
    await setNewOverride(DAY_START);
    expect(await isNewOverrideOn(DAY_START)).toBe(true);
    expect(await isNewOverrideOn(new Date(DAY_START.getTime() + 86_400_000))).toBe(false);
    expect(await db.outbox.count()).toBe(0);
    expect(await db.settings.get("settings")).toBeUndefined();
    await setNewOverride(null);
    expect(await isNewOverrideOn(DAY_START)).toBe(false);
  });
});
