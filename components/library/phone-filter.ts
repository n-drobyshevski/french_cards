// Phone library filters (mockups: Library «C · Под пальцем»): the ledger strip sets the status,
// the «Фильтр и порядок» sheet sets status, slang, theme and order. Pure, unit-tested.
import { matchesSearch } from "@/lib/text";
import { matchesSlang, type SlangKey } from "./SlangFilter";
import { DEFAULT_SORT, sortWords } from "./table";
import type { LibraryWord } from "./useLibraryWords";

export type StatusFilter = "all" | "due" | "difficult" | "new" | "paused";

/** "all", "inbox" («Входящие») or a folder id. */
export type ThemeFilter = string;
export const ALL_THEMES: ThemeFilter = "all";
export const INBOX_THEME: ThemeFilter = "inbox";

export type PhoneOrder = "added" | "due" | "fr" | "difficult";

export const ORDER_OPTIONS: readonly { value: PhoneOrder; label: string }[] = [
  { value: "added", label: "Сначала новые" },
  { value: "due", label: "По следующему показу" },
  { value: "fr", label: "По алфавиту" },
  { value: "difficult", label: "Сначала трудные" },
];

export interface PhoneFilter {
  status: StatusFilter;
  slang: SlangKey[];
  theme: ThemeFilter;
  order: PhoneOrder;
}

export const DEFAULT_PHONE_FILTER: PhoneFilter = { status: "all", slang: [], theme: ALL_THEMES, order: "added" };

/** True when the filter narrows the words (the order alone does not). */
export function narrows(filter: PhoneFilter): boolean {
  return filter.status !== "all" || filter.slang.length > 0 || filter.theme !== ALL_THEMES;
}

/** Badge on the filter button: what the sheet changed that the ledger strip does not show. */
export function sheetFilterCount(filter: PhoneFilter): number {
  return (
    Number(filter.status === "new" || filter.status === "paused") +
    Number(filter.slang.length > 0) +
    Number(filter.theme !== ALL_THEMES) +
    Number(filter.order !== DEFAULT_PHONE_FILTER.order)
  );
}

function matchesStatus(item: LibraryWord, status: StatusFilter): boolean {
  switch (status) {
    case "due":
      return item.schedule.due;
    case "difficult":
      return item.schedule.status === "difficult" && item.schedule.tone !== "paused";
    case "new":
      return item.schedule.tone === "new";
    case "paused":
      return item.schedule.tone === "paused";
    default:
      return true;
  }
}

function matchesTheme(item: LibraryWord, theme: ThemeFilter): boolean {
  if (theme === ALL_THEMES) return true;
  if (theme === INBOX_THEME) return !item.folder;
  return item.folder?.id === theme;
}

/**
 * Words matching the filter and the search, in the chosen order. `items` come newest first
 * (useLibraryWords), which is the «Сначала новые» order.
 */
export function filterPhoneWords(items: readonly LibraryWord[], filter: PhoneFilter, query: string): LibraryWord[] {
  const rows = items.filter(
    (item) =>
      matchesStatus(item, filter.status) &&
      matchesSlang(item.word, filter.slang) &&
      matchesTheme(item, filter.theme) &&
      matchesSearch(item.word, query),
  );
  switch (filter.order) {
    case "due":
      return sortWords(rows, { key: "due", dir: 1 });
    case "fr":
      return sortWords(rows, DEFAULT_SORT);
    case "difficult":
      // Stable sort keeps «newest first» inside each group.
      return [...rows].sort((a, b) => Number(b.schedule.status === "difficult") - Number(a.schedule.status === "difficult"));
    default:
      return rows;
  }
}
