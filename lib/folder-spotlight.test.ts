import { afterEach, describe, expect, it } from "vitest";
import { FOLDER_MARK_TTL, markFoldersChanged, pendingFolderDelay, resetFolderMarks, takeChangedFolders } from "./folder-spotlight";

describe("folder marks", () => {
  afterEach(() => resetFolderMarks());

  it("ignores empty ids and waits out the delay", () => {
    markFoldersChanged([null, undefined], 0, 1000);
    expect(pendingFolderDelay(1000)).toBeNull();

    markFoldersChanged(["a", null, "b"], 240, 1000);
    expect(pendingFolderDelay(1000)).toBe(240);
    expect(takeChangedFolders((id) => id, 1100)).toEqual([]);
    expect(pendingFolderDelay(1240)).toBe(0);
  });

  it("hands out the tiles on screen and keeps the others until they appear", () => {
    markFoldersChanged(["a", "b"], 0, 1000);
    expect(takeChangedFolders((id) => (id === "a" ? "tile-a" : null), 1000)).toEqual(["tile-a"]);
    expect(takeChangedFolders((id) => `tile-${id}`, 1050)).toEqual(["tile-b"]);
    expect(pendingFolderDelay(1050)).toBeNull();
  });

  it("forgets a mark nobody showed", () => {
    markFoldersChanged(["a"], 0, 1000);
    expect(pendingFolderDelay(1000 + FOLDER_MARK_TTL + 1)).toBeNull();
    expect(takeChangedFolders((id) => id, 1000 + FOLDER_MARK_TTL + 2)).toEqual([]);
  });

  it("a new mark replaces the old one", () => {
    markFoldersChanged(["a"], 0, 1000);
    markFoldersChanged(["b"], 0, 1001);
    expect(takeChangedFolders((id) => id, 1002)).toEqual(["b"]);
  });
});
