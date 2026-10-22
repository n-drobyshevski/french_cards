import { describe, expect, it } from "vitest";
import {
  ImagePrepError,
  MAX_LONG_EDGE,
  MAX_PATCHES,
  MAX_TILE_BYTES,
  MAX_TILES,
  MIN_BATCH_SCALE,
  PREP_LEVELS,
  fitSize,
  isAcceptedImage,
  naturalTileCount,
  partitionImages,
  patchCount,
  planBatch,
  planTiles,
  tileByteBudget,
  tileOverlap,
  tileScale,
} from "./image-prep";

describe("patchCount", () => {
  it("rounds each side up to whole 28px patches", () => {
    expect(patchCount(28, 28)).toBe(1);
    expect(patchCount(29, 28)).toBe(2);
    expect(patchCount(1170, 2532)).toBe(42 * 91);
  });
});

describe("fitSize", () => {
  it("keeps a typical phone screenshot unchanged", () => {
    expect(fitSize(1170, 2532)).toEqual({ width: 1170, height: 2532, scale: 1 });
  });

  it("never upscales", () => {
    expect(fitSize(300, 400)).toEqual({ width: 300, height: 400, scale: 1 });
  });

  it("caps the long edge", () => {
    const r = fitSize(1000, 5000);
    expect(Math.max(r.width, r.height)).toBeLessThanOrEqual(MAX_LONG_EDGE);
    expect(patchCount(r.width, r.height)).toBeLessThanOrEqual(MAX_PATCHES);
  });

  it("fits the patch budget for big square-ish images", () => {
    const r = fitSize(2500, 2500);
    expect(patchCount(r.width, r.height)).toBeLessThanOrEqual(MAX_PATCHES);
    // Close to the budget, not needlessly small.
    expect(patchCount(r.width, r.height)).toBeGreaterThan(MAX_PATCHES * 0.95);
    expect(r.width).toBe(r.height);
  });

  it("respects custom limits and keeps the aspect ratio", () => {
    const r = fitSize(3000, 2000, { maxLongEdge: 1600, maxPatches: 2400 });
    expect(r.width).toBeLessThanOrEqual(1600);
    expect(patchCount(r.width, r.height)).toBeLessThanOrEqual(2400);
    expect(r.width / r.height).toBeCloseTo(1.5, 1);
  });

  it("rejects empty sizes", () => {
    expect(() => fitSize(0, 10)).toThrow(RangeError);
  });

  it("always satisfies both limits across many shapes", () => {
    for (const [w, h] of [
      [4000, 3000],
      [828, 1792],
      [1290, 2796],
      [3024, 4032],
      [5000, 400],
      [640, 9000],
      [2577, 2577],
    ]) {
      const r = fitSize(w, h);
      expect(Math.max(r.width, r.height)).toBeLessThanOrEqual(MAX_LONG_EDGE);
      expect(patchCount(r.width, r.height)).toBeLessThanOrEqual(MAX_PATCHES);
      expect(r.width).toBeLessThanOrEqual(w);
      expect(r.height).toBeLessThanOrEqual(h);
    }
  });
});

describe("tiling", () => {
  it("does not tile images up to the tall ratio", () => {
    expect(naturalTileCount(1170, 2532)).toBe(1);
    expect(naturalTileCount(1000, 2200)).toBe(1);
    expect(planTiles(1170, 2532)).toEqual([{ x: 0, y: 0, width: 1170, height: 2532 }]);
  });

  it("tiles tall screenshots into overlapping full-width bands", () => {
    const w = 1170;
    const h = 6000;
    expect(naturalTileCount(w, h)).toBe(3);
    const tiles = planTiles(w, h);
    expect(tiles).toHaveLength(3);
    expect(tiles[0].y).toBe(0);
    expect(tiles.at(-1)!.y + tiles.at(-1)!.height).toBe(h);
    const overlap = tileOverlap(w, h);
    for (let i = 1; i < tiles.length; i++) {
      const prevEnd = tiles[i - 1].y + tiles[i - 1].height;
      expect(prevEnd - tiles[i].y).toBeGreaterThanOrEqual(overlap);
      expect(tiles[i].width).toBe(w);
      expect(tiles[i].height).toBe(tiles[0].height);
    }
    for (const t of tiles) expect(t.height / t.width).toBeLessThanOrEqual(2.2 + 0.01);
  });

  it("caps a very tall screenshot at four tiles", () => {
    expect(naturalTileCount(1080, 30000)).toBeGreaterThan(MAX_TILES);
    const tiles = planTiles(1080, 30000);
    expect(tiles).toHaveLength(MAX_TILES);
    expect(tiles.at(-1)!.y + tiles.at(-1)!.height).toBe(30000);
  });

  it("covers every row with no gaps for any count", () => {
    for (const n of [2, 3, 4]) {
      const tiles = planTiles(900, 5000, n);
      let covered = 0;
      for (const t of tiles) {
        expect(t.y).toBeLessThanOrEqual(covered);
        covered = Math.max(covered, t.y + t.height);
      }
      expect(covered).toBe(5000);
    }
  });
});

describe("planBatch", () => {
  it("gives each image its natural tile count when it fits", () => {
    expect(planBatch([{ width: 1170, height: 2532 }])).toEqual([1]);
    expect(planBatch([{ width: 1170, height: 6000 }])).toEqual([3]);
    expect(
      planBatch([
        { width: 1170, height: 2532 },
        { width: 1170, height: 2532 },
      ]),
    ).toEqual([1, 1]);
  });

  it("takes tiles from the tall images when the total is over four", () => {
    const counts = planBatch([
      { width: 1170, height: 6000 },
      { width: 1170, height: 4800 },
    ]);
    expect(counts.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(MAX_TILES);
    counts.forEach((c, i) => {
      const s = [6000, 4800][i];
      expect(tileScale(1170, s, c)).toBeGreaterThanOrEqual(MIN_BATCH_SCALE);
    });
  });

  it("rejects more than four tiles in total", () => {
    const five = Array.from({ length: 5 }, () => ({ width: 1170, height: 2532 }));
    expect(() => planBatch(five)).toThrow(ImagePrepError);
    try {
      planBatch(five);
    } catch (e) {
      expect((e as ImagePrepError).code).toBe("too_many");
    }
    // Four very tall screenshots cannot each shrink to one legible tile.
    const tall = Array.from({ length: 4 }, () => ({ width: 1080, height: 12000 }));
    expect(() => planBatch(tall)).toThrow(/не больше 4/);
  });

  it("rejects an empty batch", () => {
    expect(() => planBatch([])).toThrow(ImagePrepError);
  });
});

describe("byte budget", () => {
  it("keeps each tile ≤ 1.5 MB and the request under the total", () => {
    expect(tileByteBudget(1)).toBe(MAX_TILE_BYTES);
    expect(tileByteBudget(4) * 4).toBeLessThanOrEqual(PREP_LEVELS[0].totalBytes);
    expect(tileByteBudget(3, PREP_LEVELS[2])).toBe(Math.floor(PREP_LEVELS[2].totalBytes / 3));
  });

  it("compresses harder at each level", () => {
    for (let i = 1; i < PREP_LEVELS.length; i++) {
      expect(PREP_LEVELS[i].maxLongEdge).toBeLessThan(PREP_LEVELS[i - 1].maxLongEdge);
      expect(PREP_LEVELS[i].maxPatches).toBeLessThan(PREP_LEVELS[i - 1].maxPatches);
      expect(PREP_LEVELS[i].totalBytes).toBeLessThan(PREP_LEVELS[i - 1].totalBytes);
    }
  });
});

describe("accepted types", () => {
  it("accepts PNG, JPEG and WebP only", () => {
    expect(isAcceptedImage({ type: "image/png", name: "a.png" })).toBe(true);
    expect(isAcceptedImage({ type: "image/jpeg", name: "a.jpg" })).toBe(true);
    expect(isAcceptedImage({ type: "image/webp", name: "a" })).toBe(true);
    expect(isAcceptedImage({ type: "image/heic", name: "a.heic" })).toBe(false);
    expect(isAcceptedImage({ type: "application/pdf", name: "a.png" })).toBe(false);
    expect(isAcceptedImage({ type: "", name: "Screen Shot.PNG" })).toBe(true);
    expect(isAcceptedImage({ type: "", name: "notes.txt" })).toBe(false);
  });

  it("partitions a mixed selection", () => {
    const files = [
      { type: "image/png", name: "1.png" },
      { type: "image/heic", name: "2.heic" },
      { type: "image/webp", name: "3.webp" },
    ];
    const { accepted, rejected } = partitionImages(files);
    expect(accepted.map((f) => f.name)).toEqual(["1.png", "3.webp"]);
    expect(rejected.map((f) => f.name)).toEqual(["2.heic"]);
  });
});
