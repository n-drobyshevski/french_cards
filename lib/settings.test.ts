import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { getSettings, updateSettings } from "./settings";
import { DEFAULT_SETTINGS, type Settings } from "./types";

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("settings", () => {
  it("fills fields added later (shortcuts) from the defaults", async () => {
    const stored: Partial<Settings> = { ...DEFAULT_SETTINGS, new_per_day: 9 };
    delete stored.shortcuts;
    delete stored.key_hints;
    await db.settings.put(stored as Settings);
    const s = await getSettings();
    expect(s.shortcuts).toBe(true);
    expect(s.key_hints).toBe(true);
    expect(s.new_per_day).toBe(9);
  });

  it("stores the shortcuts switch", async () => {
    await updateSettings({ shortcuts: false });
    expect((await getSettings()).shortcuts).toBe(false);
    expect((await db.settings.get("settings"))?.shortcuts).toBe(false);
  });
});
