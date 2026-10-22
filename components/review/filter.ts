// The review screen's direction + theme filter, remembered per device (localStorage).
import type { SessionFilter } from "@/lib/session";
import type { Direction } from "@/lib/types";

export type DirectionChoice = Direction | "both";

/** "all" = every theme, "inbox" = «Входящие», otherwise a folder id. */
export type FolderChoice = "all" | "inbox" | (string & {});

export interface ReviewFilter {
  /** null = follow settings.default_direction. */
  direction: DirectionChoice | null;
  folder: FolderChoice;
}

export const DEFAULT_REVIEW_FILTER: ReviewFilter = { direction: null, folder: "all" };
export const REVIEW_FILTER_KEY = "kartochki:review-filter";

const DIRECTIONS: readonly DirectionChoice[] = ["fr_ru", "ru_fr", "both"];

/** Cycle order of the «FR → RU» chip. */
export function nextDirection(current: DirectionChoice): DirectionChoice {
  return DIRECTIONS[(DIRECTIONS.indexOf(current) + 1) % DIRECTIONS.length];
}

export function effectiveDirection(filter: ReviewFilter, defaultDirection: Direction): DirectionChoice {
  return filter.direction ?? defaultDirection;
}

export function toSessionFilter(direction: DirectionChoice, folder: FolderChoice): SessionFilter {
  return {
    direction: direction === "both" ? undefined : direction,
    folderId: folder === "all" ? undefined : folder === "inbox" ? null : folder,
  };
}

export function parseReviewFilter(raw: string | null | undefined): ReviewFilter {
  if (!raw) return DEFAULT_REVIEW_FILTER;
  try {
    const value = JSON.parse(raw) as Partial<ReviewFilter> | null;
    const direction =
      value && DIRECTIONS.includes(value.direction as DirectionChoice) ? (value.direction as DirectionChoice) : null;
    const folder = value && typeof value.folder === "string" && value.folder.length > 0 ? value.folder : "all";
    return { direction, folder };
  } catch {
    return DEFAULT_REVIEW_FILTER;
  }
}

// A tiny external store over localStorage (with an in-memory copy for private mode), read with
// useSyncExternalStore so the server render and hydration see the default filter.
let memory: string | null | undefined;
const listeners = new Set<() => void>();

export function getReviewFilterSnapshot(): string {
  if (memory === undefined) {
    try {
      memory = localStorage.getItem(REVIEW_FILTER_KEY);
    } catch {
      memory = null;
    }
  }
  return memory ?? "";
}

export function subscribeReviewFilter(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== REVIEW_FILTER_KEY) return;
    memory = event.newValue;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function readReviewFilter(): ReviewFilter {
  return parseReviewFilter(getReviewFilterSnapshot());
}

export function writeReviewFilter(filter: ReviewFilter): void {
  memory = JSON.stringify(filter);
  try {
    localStorage.setItem(REVIEW_FILTER_KEY, memory);
  } catch {
    // Private mode: the filter lives in memory only.
  }
  for (const listener of listeners) listener();
}

/** Settings changed the default direction: the review screen follows it again. */
export function clearReviewDirection(): void {
  const current = readReviewFilter();
  if (current.direction !== null) writeReviewFilter({ ...current, direction: null });
}
