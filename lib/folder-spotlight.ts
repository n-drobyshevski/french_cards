"use client";

// «Light the themes that changed» (MOTION-SPEC S5, §5.10 bulk changes): a bulk write (sort plan
// applied, import added) marks the target themes here; the library lights their tiles once with
// the spotlight when they are on screen. Module state, so the mark survives the route change from
// /import to /library.
import { useEffect, useSyncExternalStore, type RefObject } from "react";
import { spotlight } from "./motion";

interface Mark {
  ids: Set<string>;
  /** Not before this time (ms, Date.now): lets a closing sheet clear first. */
  from: number;
  /** Forgotten after this time: a mark nobody showed is stale. */
  until: number;
}

/** A mark is kept this long for a screen to show it (a route change, a cold liveQuery). */
export const FOLDER_MARK_TTL = 5000;

let mark: Mark | null = null;
let version = 0;
const listeners = new Set<() => void>();

/** Remembers the themes a bulk change put words into; `delay` lets a closing sheet clear first. */
export function markFoldersChanged(ids: Iterable<string | null | undefined>, delay = 0, now = Date.now()): void {
  const set = new Set<string>();
  for (const id of ids) if (id) set.add(id);
  if (set.size === 0) return;
  mark = { ids: set, from: now + delay, until: now + delay + FOLDER_MARK_TTL };
  version++;
  for (const listener of listeners) listener();
}

/** Ms until the pending mark may be shown (0 = now), or null when there is none (or it expired). */
export function pendingFolderDelay(now = Date.now()): number | null {
  if (!mark) return null;
  if (now > mark.until) {
    mark = null;
    return null;
  }
  return Math.max(0, mark.from - now);
}

/**
 * Takes the marked ids `find` can show now (it returns the element for an id, or null when the
 * theme is not on screen yet); the others stay marked until they appear or the mark expires.
 */
export function takeChangedFolders<T>(find: (id: string) => T | null, now = Date.now()): T[] {
  if (pendingFolderDelay(now) !== 0 || !mark) return [];
  const found: T[] = [];
  for (const id of [...mark.ids]) {
    const el = find(id);
    if (el === null) continue;
    found.push(el);
    mark.ids.delete(id);
  }
  if (mark.ids.size === 0) mark = null;
  return found;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Lights the marked theme tiles inside `container` (found by `selector(id)`, e.g. their link)
 * once they are on screen. `deps` is whatever re-renders the tiles (the stats), so a new theme's
 * tile is lit when it appears.
 */
export function useFolderSpotlight(container: RefObject<HTMLElement | null>, selector: (id: string) => string, deps: unknown): void {
  const marked = useSyncExternalStore(subscribe, () => version, () => 0);
  useEffect(() => {
    const delay = pendingFolderDelay();
    if (delay === null || !container.current) return;
    const timer = window.setTimeout(() => {
      const root = container.current;
      if (!root) return;
      for (const el of takeChangedFolders((id) => root.querySelector(selector(id)))) spotlight(el);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [container, selector, deps, marked]);
}

/** For tests. */
export function resetFolderMarks(): void {
  mark = null;
}
