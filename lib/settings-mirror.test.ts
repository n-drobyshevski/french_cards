import { describe, expect, it } from "vitest";
import { parseSettingsMirror, serializeSettingsMirror } from "./settings-mirror";
import { DEFAULT_SETTINGS } from "./types";

describe("settings mirror", () => {
  it("round-trips the displayed settings and leaves out the sync bookkeeping", () => {
    const raw = serializeSettingsMirror({
      ...DEFAULT_SETTINGS,
      library_view: "words",
      new_per_day: 30,
      last_sync_at: "2026-10-22T10:00:00Z",
      sync_cursors: { words: "2026-10-22T10:00:00Z" },
    });
    expect(raw).not.toContain("last_sync_at");
    expect(raw).not.toContain("sync_cursors");
    const back = parseSettingsMirror(raw);
    expect(back?.library_view).toBe("words");
    expect(back?.new_per_day).toBe(30);
    expect(back?.id).toBe("settings");
  });

  it("fills fields added later from the defaults", () => {
    expect(parseSettingsMirror(JSON.stringify({ new_per_day: 5 }))).toEqual({
      ...DEFAULT_SETTINGS,
      new_per_day: 5,
      last_sync_at: null,
    });
  });

  it("ignores a missing or broken mirror", () => {
    expect(parseSettingsMirror(null)).toBeNull();
    expect(parseSettingsMirror("")).toBeNull();
    expect(parseSettingsMirror("{oops")).toBeNull();
    expect(parseSettingsMirror("[1,2]")).toBeNull();
    expect(parseSettingsMirror("null")).toBeNull();
  });
});
