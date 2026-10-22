// Client-side screenshot preparation for /api/ai/extract: decode, fit to the model's image
// budget, cut very tall screenshots into overlapping tiles and re-encode each one small enough
// to upload. The sizing/tiling functions are pure (unit-tested); `prepareImages` does the
// canvas work in the browser.

/** The model reads images in 28×28 px patches. */
export const PATCH_PX = 28;
/** Longest edge the model accepts without downscaling. */
export const MAX_LONG_EDGE = 2576;
/** Patch budget per image: ceil(w/28) × ceil(h/28). */
export const MAX_PATCHES = 4784;
/** Tiles per request (matches the server's MAX_IMAGES). */
export const MAX_TILES = 4;
/** Height/width above which a screenshot is cut into tiles. */
export const TALL_RATIO = 2.2;
/** Server limit per uploaded file (lib/ai/images.ts MAX_IMAGE_BYTES). */
export const MAX_TILE_BYTES = 1.5 * 1024 * 1024;
/** Whole-request budget: hosting rejects bodies over 4.5 MB, multipart overhead included. */
export const MAX_TOTAL_BYTES = 4 * 1024 * 1024;
/** Tiles are not shrunk below this scale to fit several screenshots into one request. */
export const MIN_BATCH_SCALE = 0.5;
/** WebP/JPEG qualities tried in order until a tile fits its byte budget. */
export const QUALITY_STEPS = [0.9, 0.82, 0.74, 0.66, 0.58, 0.5] as const;
/** Dimension steps tried when the lowest quality is still too large. */
const SHRINK_STEPS = [1, 0.85, 0.72, 0.6, 0.5] as const;

export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
/** For `<input type="file" accept>`; HEIC is deliberately not offered. */
export const IMAGE_ACCEPT = ACCEPTED_IMAGE_TYPES.join(",");

/**
 * Compression levels. Level 0 is the normal upload; the next levels are used after the
 * server answered 413 (smaller pixels, tighter byte budget).
 */
export interface PrepLevel {
  maxLongEdge: number;
  maxPatches: number;
  totalBytes: number;
  /** Index into QUALITY_STEPS to start from. */
  firstQuality: number;
}

export const PREP_LEVELS: readonly PrepLevel[] = [
  { maxLongEdge: MAX_LONG_EDGE, maxPatches: MAX_PATCHES, totalBytes: MAX_TOTAL_BYTES, firstQuality: 0 },
  { maxLongEdge: 2048, maxPatches: 3600, totalBytes: 2.5 * 1024 * 1024, firstQuality: 1 },
  { maxLongEdge: 1600, maxPatches: 2400, totalBytes: 1.5 * 1024 * 1024, firstQuality: 2 },
];

export type ImagePrepErrorCode = "empty" | "unsupported" | "decode" | "too_many" | "too_large" | "aborted";

const PREP_MESSAGES: Record<ImagePrepErrorCode, string> = {
  empty: "Выберите хотя бы один скриншот.",
  unsupported: "Подходят только PNG, JPEG и WebP.",
  decode: "Не удалось открыть изображение.",
  too_many: "Слишком много за раз: не больше 4 фрагментов. Выберите меньше скриншотов.",
  too_large: "Скриншот слишком большой даже после сжатия.",
  aborted: "Остановлено.",
};

export class ImagePrepError extends Error {
  readonly code: ImagePrepErrorCode;
  constructor(code: ImagePrepErrorCode, message = PREP_MESSAGES[code]) {
    super(message);
    this.name = "ImagePrepError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------------------
// Pure sizing and tiling

export function patchCount(width: number, height: number): number {
  return Math.ceil(width / PATCH_PX) * Math.ceil(height / PATCH_PX);
}

export interface FitResult {
  width: number;
  height: number;
  /** Output / source; ≤ 1 (images are never upscaled). */
  scale: number;
}

/** Largest size ≤ the source that fits the long-edge cap and the patch budget. */
export function fitSize(
  width: number,
  height: number,
  { maxLongEdge = MAX_LONG_EDGE, maxPatches = MAX_PATCHES }: { maxLongEdge?: number; maxPatches?: number } = {},
): FitResult {
  if (!(width > 0 && height > 0)) throw new RangeError("Image size must be positive");
  let scale = Math.min(1, maxLongEdge / Math.max(width, height));
  const area = Math.sqrt((maxPatches * PATCH_PX * PATCH_PX) / (width * height));
  scale = Math.min(scale, area);
  const sized = (s: number) => ({
    width: Math.max(1, Math.min(width, Math.floor(width * s))),
    height: Math.max(1, Math.min(height, Math.floor(height * s))),
  });
  let out = sized(scale);
  // Rounding each side up to whole patches can overshoot by a row or column; step down until it fits.
  while (patchCount(out.width, out.height) > maxPatches && (out.width > 1 || out.height > 1)) {
    scale *= 0.99;
    out = sized(scale);
  }
  return { ...out, scale: out.width / width };
}

/** Rows repeated between neighbouring tiles so a line of text cut by one edge is whole in the other. */
export function tileOverlap(width: number, height: number): number {
  return Math.max(1, Math.round(Math.min(width * 0.1, height * 0.05)));
}

/** How many tiles keep each one near TALL_RATIO; 1 when the image is not tall. Not capped. */
export function naturalTileCount(width: number, height: number, ratio = TALL_RATIO): number {
  if (height / width <= ratio) return 1;
  const overlap = tileOverlap(width, height);
  const maxTileHeight = Math.floor(width * ratio);
  return Math.max(2, Math.ceil((height - overlap) / (maxTileHeight - overlap)));
}

export interface TileRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Splits a tall image into `count` equal, overlapping, full-width horizontal bands (source px). */
export function planTiles(width: number, height: number, count = Math.min(MAX_TILES, naturalTileCount(width, height))): TileRect[] {
  const n = Math.max(1, Math.floor(count));
  if (n === 1) return [{ x: 0, y: 0, width, height }];
  const overlap = tileOverlap(width, height);
  const tileHeight = Math.min(height, Math.ceil((height + (n - 1) * overlap) / n));
  const step = (height - tileHeight) / (n - 1);
  return Array.from({ length: n }, (_, i) => {
    const y = i === n - 1 ? height - tileHeight : Math.round(i * step);
    return { x: 0, y, width, height: tileHeight };
  });
}

/** Output scale of the tiles when an image is cut into `count` tiles. */
export function tileScale(width: number, height: number, count: number, level: PrepLevel = PREP_LEVELS[0]): number {
  const [tile] = planTiles(width, height, count);
  return fitSize(tile.width, tile.height, level).scale;
}

/**
 * Tile counts for a batch of screenshots sharing one request of at most `maxTiles` tiles.
 * Each image gets its natural count (≤ maxTiles); when the sum is over budget, the images
 * with the most tiles give some up, as long as their text stays at ≥ MIN_BATCH_SCALE.
 * Throws ImagePrepError("too_many") when the batch cannot fit.
 */
export function planBatch(
  sizes: readonly { width: number; height: number }[],
  { maxTiles = MAX_TILES, level = PREP_LEVELS[0] }: { maxTiles?: number; level?: PrepLevel } = {},
): number[] {
  if (sizes.length === 0) throw new ImagePrepError("empty");
  if (sizes.length > maxTiles) throw new ImagePrepError("too_many");
  const counts = sizes.map((s) => Math.min(maxTiles, naturalTileCount(s.width, s.height)));
  let total = counts.reduce((a, b) => a + b, 0);
  while (total > maxTiles) {
    let pick = -1;
    let best = -Infinity;
    counts.forEach((c, i) => {
      if (c <= 1) return;
      const scale = tileScale(sizes[i].width, sizes[i].height, c - 1, level);
      if (scale < MIN_BATCH_SCALE) return;
      // Prefer the image that loses the least legibility.
      if (scale > best) {
        best = scale;
        pick = i;
      }
    });
    if (pick < 0) throw new ImagePrepError("too_many");
    counts[pick]--;
    total--;
  }
  return counts;
}

/** Byte budget for each tile of a request with `tileCount` tiles. */
export function tileByteBudget(tileCount: number, level: PrepLevel = PREP_LEVELS[0]): number {
  return Math.min(MAX_TILE_BYTES, Math.floor(level.totalBytes / Math.max(1, tileCount)));
}

export function isAcceptedImage(file: Pick<File, "type" | "name">): boolean {
  const type = file.type.toLowerCase();
  if (type) return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(type);
  // Some drag sources leave the type empty.
  return /\.(png|jpe?g|webp)$/i.test(file.name);
}

/** Splits picked/pasted files into accepted images and the rest. */
export function partitionImages<T extends Pick<File, "type" | "name">>(files: readonly T[]): { accepted: T[]; rejected: T[] } {
  const accepted: T[] = [];
  const rejected: T[] = [];
  for (const f of files) (isAcceptedImage(f) ? accepted : rejected).push(f);
  return { accepted, rejected };
}

// ---------------------------------------------------------------------------------------
// Browser: decode, crop, scale, encode

export type TileType = "image/webp" | "image/jpeg";

export interface PreparedTile {
  blob: Blob;
  type: TileType;
  width: number;
  height: number;
  /** Which picked file it came from, and its place among that file's tiles. */
  source: number;
  index: number;
  count: number;
  /** Upload file name, e.g. "screenshot-1-2.webp". */
  name: string;
}

export interface PreparedBatch {
  tiles: PreparedTile[];
  images: number;
  level: number;
}

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;
type Ctx2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

function makeCanvas(width: number, height: number): AnyCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function context(canvas: AnyCanvas): Ctx2D {
  const ctx = canvas.getContext("2d", { alpha: false }) as Ctx2D | null;
  if (!ctx) throw new ImagePrepError("decode");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return ctx;
}

async function encode(canvas: AnyCanvas, type: TileType, quality: number): Promise<Blob | null> {
  if ("convertToBlob" in canvas) {
    try {
      return await canvas.convertToBlob({ type, quality });
    } catch {
      return null;
    }
  }
  return new Promise((resolve) => (canvas as HTMLCanvasElement).toBlob(resolve, type, quality));
}

/**
 * Draws a source region into a new canvas of the target size. Large reductions go through
 * halving steps, which keeps small text sharper than a single drawImage.
 */
function drawRegion(source: CanvasImageSource, rect: TileRect, width: number, height: number): AnyCanvas {
  let src: CanvasImageSource = source;
  let sx = rect.x;
  let sy = rect.y;
  let sw = rect.width;
  let sh = rect.height;
  while (sw / 2 >= width && sh / 2 >= height) {
    const w = Math.ceil(sw / 2);
    const h = Math.ceil(sh / 2);
    const step = makeCanvas(w, h);
    context(step).drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
    src = step;
    sx = 0;
    sy = 0;
    sw = w;
    sh = h;
  }
  const out = makeCanvas(width, height);
  const ctx = context(out);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, width, height);
  return out;
}

let webpEncodes: boolean | null = null;

/** Encodes one tile under `budget` bytes: WebP (JPEG where WebP encoding is missing), stepping quality, then size, down. */
async function encodeTile(
  bitmap: ImageBitmap,
  rect: TileRect,
  level: PrepLevel,
  budget: number,
  signal?: AbortSignal,
): Promise<{ blob: Blob; type: TileType; width: number; height: number }> {
  const fit = fitSize(rect.width, rect.height, level);
  for (const shrink of SHRINK_STEPS) {
    const width = Math.max(1, Math.round(fit.width * shrink));
    const height = Math.max(1, Math.round(fit.height * shrink));
    const canvas = drawRegion(bitmap, rect, width, height);
    for (const quality of QUALITY_STEPS.slice(level.firstQuality)) {
      if (signal?.aborted) throw new ImagePrepError("aborted");
      let type: TileType = webpEncodes === false ? "image/jpeg" : "image/webp";
      let blob = await encode(canvas, type, quality);
      if (type === "image/webp" && (!blob || blob.type !== "image/webp")) {
        // Safari before 17 silently returns PNG for WebP; remember and use JPEG.
        webpEncodes = false;
        type = "image/jpeg";
        blob = await encode(canvas, type, quality);
      } else if (type === "image/webp") {
        webpEncodes = true;
      }
      if (blob && blob.size <= budget) return { blob, type, width, height };
    }
  }
  throw new ImagePrepError("too_large");
}

async function decode(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file);
  } catch {
    throw new ImagePrepError("decode");
  }
}

/**
 * Turns picked screenshots into upload-ready tiles (≤ MAX_TILES in total, each ≤ its byte
 * budget). `level` > 0 compresses harder; use it after a 413 response.
 */
export async function prepareImages(
  files: readonly File[],
  { level = 0, signal }: { level?: number; signal?: AbortSignal } = {},
): Promise<PreparedBatch> {
  if (files.length === 0) throw new ImagePrepError("empty");
  if (files.some((f) => !isAcceptedImage(f))) throw new ImagePrepError("unsupported");
  if (files.length > MAX_TILES) throw new ImagePrepError("too_many");
  const lvl = PREP_LEVELS[Math.min(Math.max(0, level), PREP_LEVELS.length - 1)];

  const bitmaps: ImageBitmap[] = [];
  try {
    for (const file of files) {
      if (signal?.aborted) throw new ImagePrepError("aborted");
      bitmaps.push(await decode(file));
    }
    const counts = planBatch(
      bitmaps.map((b) => ({ width: b.width, height: b.height })),
      { level: lvl },
    );
    const total = counts.reduce((a, b) => a + b, 0);
    const budget = tileByteBudget(total, lvl);

    const tiles: PreparedTile[] = [];
    for (const [source, bitmap] of bitmaps.entries()) {
      const rects = planTiles(bitmap.width, bitmap.height, counts[source]);
      for (const [index, rect] of rects.entries()) {
        const out = await encodeTile(bitmap, rect, lvl, budget, signal);
        const ext = out.type === "image/webp" ? "webp" : "jpg";
        tiles.push({
          ...out,
          source,
          index,
          count: rects.length,
          name: `screenshot-${source + 1}-${index + 1}.${ext}`,
        });
      }
    }
    return { tiles, images: files.length, level: PREP_LEVELS.indexOf(lvl) };
  } finally {
    for (const b of bitmaps) b.close();
  }
}
