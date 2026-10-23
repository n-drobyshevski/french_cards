import "fake-indexeddb/auto";
import { liveQuery } from "dexie";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { DEFAULT_EXERCISE_FOCUS, EXERCISE_FOCUS_PREF, getExerciseFocus, setExerciseFocus } from "./user-prefs";

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
