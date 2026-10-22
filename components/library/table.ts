// Desktop library table (mockups/DESKTOP-SPEC.md §2 «Library table columns», §4 «Library / Theme»):
// sorting, fluid column rules, selection ranges, the cursor after a removal, alphabetical
// neighbours and the list-region key map. Pure, unit-tested; the components wire them up.
import { compareFr } from "@/lib/text";
import type { LibraryWord } from "./useLibraryWords";

export type SortKey = "fr" | "ru" | "level" | "theme" | "due";
export type SortDir = 1 | -1;
export interface SortState {
  key: SortKey;
  dir: SortDir;
}

export const DEFAULT_SORT: SortState = { key: "fr", dir: 1 };

const ruCollator = new Intl.Collator("ru", { sensitivity: "base", numeric: true });

/** «к повт.» first, then «новое», then by the next review. */
function dueRank(item: LibraryWord): [number, number] {
  const { tone, nextDue } = item.schedule;
  if (tone === "due") return [0, nextDue ?? 0];
  if (tone === "new") return [1, 0];
  return [2, nextDue ?? 0];
}

/** Rows in the order of `sort`; ties fall back to the French word. `folderOrder`: folder id → sort. */
export function sortWords(items: readonly LibraryWord[], sort: SortState, folderOrder?: ReadonlyMap<string, number>): LibraryWord[] {
  const theme = (item: LibraryWord) => (item.folder ? (folderOrder?.get(item.folder.id) ?? item.folder.sort) : -Infinity);
  const compare = (a: LibraryWord, b: LibraryWord): number => {
    switch (sort.key) {
      case "ru":
        return ruCollator.compare(a.word.ru, b.word.ru);
      case "level":
        return a.word.slang_level - b.word.slang_level || Number(a.word.verlan) - Number(b.word.verlan);
      case "theme": {
        const ta = theme(a);
        const tb = theme(b);
        return ta === tb ? 0 : ta < tb ? -1 : 1;
      }
      case "due": {
        const [ra, da] = dueRank(a);
        const [rb, db] = dueRank(b);
        return ra - rb || da - db;
      }
      default:
        return 0;
    }
  };
  return [...items].sort((a, b) => sort.dir * (compare(a, b) || compareFr(a.word.fr, b.word.fr)) || a.word.id.localeCompare(b.word.id));
}

/** Clicking a column head: the same column flips the direction, another starts ascending. */
export function nextSort(current: SortState, key: SortKey): SortState {
  return current.key === key ? { key, dir: current.dir === 1 ? -1 : 1 } : { key, dir: 1 };
}

export interface ColumnInput {
  /** Inner width of the list (pane minus its 24px paddings). */
  inner: number;
  layout: "medium" | "expanded";
  /** Coarse pointer variant: 40px gutter, persistent ⋯ in «Показ». */
  coarse: boolean;
  /** False for a single theme or «Входящие». */
  themeColumn: boolean;
}

export interface Columns {
  select: number;
  theme: boolean;
  /** meter: segments + italic abbreviation; abbr: the abbreviation only. */
  level: "meter" | "abbr";
  levelWidth: number;
  dueWidth: number;
  /** «Показ» shows the interval only; «трудн.» moves to the tooltip. */
  dueCompact: boolean;
  /** CSS grid-template-columns. */
  template: string;
}

/** Inner width assumed until the list is measured (the desk's first frame and DeskPlaceholder). */
export const INITIAL_TABLE_INNER = 744;

/** Fluid column rules by the list's inner width (DESKTOP-SPEC §2). */
export function tableColumns({ inner, layout, coarse, themeColumn }: ColumnInput): Columns {
  const medium = layout === "medium";
  const select = coarse ? 40 : 32;
  const theme = themeColumn && inner >= (medium ? 960 : 720);
  const abbr = inner < 680;
  const level = abbr ? "abbr" : "meter";
  const levelWidth = abbr ? (coarse ? 64 : 56) : 104;
  const dueCompact = !coarse && medium && inner < 760;
  const dueWidth = coarse ? 152 : dueCompact ? 72 : 120;
  const text = medium ? "minmax(150px,1fr)" : "minmax(160px,1fr)";
  const template = [`${select}px`, text, text, `${levelWidth}px`, theme ? "112px" : null, `${dueWidth}px`].filter(Boolean).join(" ");
  return { select, theme, level, levelWidth, dueWidth, dueCompact, template };
}

/** Ids from index a to b inclusive (either order). */
export function rangeIds(ids: readonly string[], a: number, b: number): string[] {
  const [from, to] = a <= b ? [a, b] : [b, a];
  return ids.slice(Math.max(0, from), to + 1);
}

/**
 * Where the cursor goes when its row left the list (deleted, moved out of the theme, filtered
 * away): the row that took its place, or the new last row at the end. Null for an empty list.
 */
export function cursorAfterRemoval(prevIds: readonly string[], ids: readonly string[], cursor: string): string | null {
  if (ids.length === 0) return null;
  const present = new Set(ids);
  const at = prevIds.indexOf(cursor);
  if (at < 0) return ids[0];
  for (let i = at + 1; i < prevIds.length; i++) if (present.has(prevIds[i])) return prevIds[i];
  for (let i = at - 1; i >= 0; i--) if (present.has(prevIds[i])) return prevIds[i];
  return ids[0];
}

export interface Neighbour {
  id: string;
  fr: string;
  current: boolean;
}

/** «Рядом в алфавите»: one word before and two after (more on the other side at an end), current included. */
export function alphaNeighbours(words: readonly { id: string; fr: string }[], id: string): Neighbour[] {
  const sorted = [...words].sort((a, b) => compareFr(a.fr, b.fr) || a.id.localeCompare(b.id));
  const at = sorted.findIndex((w) => w.id === id);
  if (at < 0) return [];
  let from = Math.max(0, at - 1);
  const to = Math.min(sorted.length, from + 4);
  from = Math.max(0, to - 4);
  return sorted.slice(from, to).map((w) => ({ id: w.id, fr: w.fr, current: w.id === id }));
}

/** «chelou — vas-y»: first and last visible headword, or the word alone. */
export function guideRange(first: string | undefined, last: string | undefined): string | null {
  if (!first || !last) return null;
  return first === last ? first : `${first} — ${last}`;
}

export type ListKeyAction =
  | "next"
  | "prev"
  | "first"
  | "last"
  | "extend-next"
  | "extend-prev"
  | "open"
  | "edit"
  | "toggle"
  | "select-all"
  | "move"
  | "delete"
  | "undo"
  | "clear";

export interface ListKeyLike {
  key: string;
  code: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
  isComposing?: boolean;
  keyCode?: number;
}

/**
 * Keys of the list region. Letters bind by `code` (ЙЦУКЕН-safe) and only with `letters` on
 * (settings.shortcuts); arrows, ↵, Пробел, Delete, ⌘⌫, ⌘A, ⌘Z and Esc always work. Bare ⌫ does nothing.
 */
export function listKeyAction(ev: ListKeyLike, letters: boolean): ListKeyAction | null {
  if (ev.isComposing || ev.keyCode === 229 || ev.altKey) return null;
  const mod = !!(ev.metaKey || ev.ctrlKey);
  const move = ev.code === "ArrowDown" || ev.code === "ArrowUp" || ev.code === "KeyJ" || ev.code === "KeyK";
  if (ev.repeat && !move) return null;
  if (mod) {
    if (ev.shiftKey) return null;
    if (ev.code === "KeyA") return "select-all";
    if (ev.code === "Backspace") return "delete";
    if (ev.code === "KeyZ") return "undo";
    return null;
  }
  switch (ev.code) {
    case "ArrowDown":
      return ev.shiftKey ? "extend-next" : "next";
    case "ArrowUp":
      return ev.shiftKey ? "extend-prev" : "prev";
    case "Home":
      return ev.shiftKey ? null : "first";
    case "End":
      return ev.shiftKey ? null : "last";
    case "Enter":
    case "NumpadEnter":
      return ev.shiftKey ? null : "open";
    case "Space":
      return ev.shiftKey ? null : "toggle";
    case "Delete":
      return ev.shiftKey ? null : "delete";
    case "Escape":
      return "clear";
  }
  if (!letters || ev.shiftKey) return null;
  switch (ev.code) {
    case "KeyJ":
      return "next";
    case "KeyK":
      return "prev";
    case "KeyX":
      return "toggle";
    case "KeyE":
      return "edit";
    case "KeyM":
      return "move";
    case "KeyZ":
      return "undo";
  }
  return null;
}
