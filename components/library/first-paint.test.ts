import { describe, expect, it } from "vitest";
import { cachedFolder, DEFAULT_LIBRARY_SHAPE, parseLibraryShape, rememberLibrary } from "./first-paint";

describe("library shape cache", () => {
  it("reads a stored shape", () => {
    expect(parseLibraryShape(JSON.stringify({ tiles: 9, inbox: true, upkeep: 2 }))).toEqual({ tiles: 9, inbox: true, upkeep: 2 });
  });

  it("clamps out-of-range numbers", () => {
    expect(parseLibraryShape(JSON.stringify({ tiles: 500, inbox: false, upkeep: 7.4 }))).toEqual({ tiles: 60, inbox: false, upkeep: 3 });
  });

  it("falls back to the default for nothing or junk", () => {
    expect(parseLibraryShape(null)).toEqual(DEFAULT_LIBRARY_SHAPE);
    expect(parseLibraryShape("{")).toEqual(DEFAULT_LIBRARY_SHAPE);
    expect(parseLibraryShape(JSON.stringify({ tiles: "6", inbox: false, upkeep: 1 }))).toEqual(DEFAULT_LIBRARY_SHAPE);
    expect(parseLibraryShape("null")).toEqual(DEFAULT_LIBRARY_SHAPE);
  });
});

describe("theme cache", () => {
  it("remembers themes and «Входящие» by route id", () => {
    const stats = { total: 3, due: 1, difficult: 0, fresh: 1, reviewedToday: 0, mastery: 0.5, samples: [] };
    rememberLibrary({
      folders: [{ id: "f1", name: "Деньги", color: "#123456", locked: true, stats, description: null, sort: 0 } as never],
      inbox: { ...stats, total: 2 },
    });
    expect(cachedFolder("f1")?.name).toBe("Деньги");
    expect(cachedFolder("inbox")?.name).toBe("Входящие");
    expect(cachedFolder("inbox")?.stats.total).toBe(2);
    expect(cachedFolder("nope")).toBeUndefined();
  });
});
