"use client";

// What the library screens need to draw their first frame at the final size before Dexie answers
// (MOTION-SPEC §3.1, L1, L3, L6): the last known shape of the phone library (cached per device in
// localStorage) and the themes seen this session (so a theme page opens with its name and numbers).
import { useState, useSyncExternalStore } from "react";
import type { FolderWithStats, LibraryStats } from "@/lib/folders";
import { useDelayedFlag } from "@/lib/use-delayed-flag";

// ----- Reveal

/** Local content replacing a reserved blank: fades in `--dur-quick` (§3.2). */
export const REVEAL = "animate-[fade-in_var(--dur-quick)_var(--ease-enter)]";

/**
 * Class for a region that was reserved blank while `loaded` was false: REVEAL when the content
 * replaces the blank, nothing when it replaces a skeleton that had time to show (same-shape swap,
 * at once) or was there from the start.
 */
export function useRevealClass(loaded: boolean): string | undefined {
  const skeleton = useDelayedFlag(!loaded, { delay: 300, min: 0 });
  const [mode, setMode] = useState<"pending" | "fade" | "swap">(loaded ? "swap" : "pending");
  if (loaded && mode === "pending") setMode(skeleton ? "swap" : "fade");
  return mode === "fade" ? REVEAL : undefined;
}

// ----- Search wait

/** Stale search results dim to .5 over --dur-quick (L5). */
export const STALE_DIM = "transition-opacity duration-(--dur-quick) ease-standard";

/**
 * The library search while the deferred query lags behind the typed one (L5): the old results stay
 * where they are and `dim` turns on after 150 ms; `searching` («Ищем…») only after a 300 ms wait
 * (`waiting`: lagging, or the words not read yet). New results replace the old ones in place.
 */
export function useSearchWait(stale: boolean, waiting: boolean): { dim: boolean; searching: boolean } {
  const dim = useDelayedFlag(stale, { delay: 150, min: 0 });
  const searching = useDelayedFlag(waiting, { delay: 300, min: 0 });
  return { dim: dim && stale, searching: searching && waiting };
}

// ----- Phone library shape

export interface LibraryShape {
  /** Theme tiles (without «Все слова» and «Новая тема»). */
  tiles: number;
  /** The «Входящие» row above the tiles. */
  inbox: boolean;
  /** Upkeep rows under the tiles («Разложить по темам», «Дополнить карточки», «Последняя раскладка»). */
  upkeep: number;
}

/** First visit: the six default themes, nothing unsorted, one upkeep row. */
export const DEFAULT_LIBRARY_SHAPE: LibraryShape = { tiles: 6, inbox: false, upkeep: 1 };

const SHAPE_KEY = "kartochki:library-shape";

const clampInt = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : null);

export function parseLibraryShape(raw: string | null): LibraryShape {
  if (!raw) return DEFAULT_LIBRARY_SHAPE;
  try {
    const v = JSON.parse(raw) as Partial<Record<keyof LibraryShape, unknown>> | null;
    const tiles = clampInt(v?.tiles, 60);
    const upkeep = clampInt(v?.upkeep, 3);
    if (tiles === null || upkeep === null || typeof v?.inbox !== "boolean") return DEFAULT_LIBRARY_SHAPE;
    return { tiles, inbox: v.inbox, upkeep };
  } catch {
    return DEFAULT_LIBRARY_SHAPE;
  }
}

let shapeMemory: string | null | undefined;

function shapeSnapshot(): string | null {
  if (shapeMemory === undefined) {
    try {
      shapeMemory = localStorage.getItem(SHAPE_KEY);
    } catch {
      shapeMemory = null;
    }
  }
  return shapeMemory;
}

const noSubscribe = () => () => {};
const serverShape = () => null;

/** The last known shape; the default on the server and during hydration. */
export function useLibraryShape(): LibraryShape {
  const raw = useSyncExternalStore(noSubscribe, shapeSnapshot, serverShape);
  return parseLibraryShape(raw);
}

/** Remembers the shape for the next visit (no re-render: the screen already shows the real one). */
export function rememberLibraryShape(shape: LibraryShape): void {
  const raw = JSON.stringify(shape);
  if (raw === shapeSnapshot()) return;
  shapeMemory = raw;
  try {
    localStorage.setItem(SHAPE_KEY, raw);
  } catch {
    // Private mode: the memory copy lasts until reload.
  }
}

// ----- Themes seen this session

export type CachedFolder = Pick<FolderWithStats, "id" | "name" | "color" | "locked" | "muted" | "stats">;

const folders = new Map<string, CachedFolder>();

/** The key «Входящие» is cached under (its route segment). */
const INBOX_ID = "inbox";

/** Remembers the themes (and «Входящие») as the library shows them, so a theme page can open with them. */
export function rememberLibrary(stats: Pick<LibraryStats, "folders" | "inbox">): void {
  for (const f of stats.folders) folders.set(f.id, f);
  folders.set(INBOX_ID, { id: INBOX_ID, name: "Входящие", color: "var(--ink)", locked: false, stats: stats.inbox });
}

/** A theme by route id («inbox» for «Входящие»), as last seen this session. */
export function cachedFolder(id: string): CachedFolder | undefined {
  return folders.get(id);
}
