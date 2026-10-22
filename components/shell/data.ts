// Data for the desktop sidebar and rail: counts, themes with guide words, the active item and the
// sync line. Pure builders are unit-tested; loadShellData runs inside useLiveQuery.
import type { SyncLineInput } from "@/components/settings/format";
import { syncLine } from "@/components/settings/format";
import { db } from "@/lib/db";
import { getLibraryStats, type LibraryStats } from "@/lib/folders";
import { compareFr } from "@/lib/text";
import type { Word } from "@/lib/types";

export interface ShellTheme {
  /** Folder id; null for «Входящие». */
  id: string | null;
  name: string;
  /** Theme colour; null for «Входящие» (dashed square). */
  color: string | null;
  count: number;
  /** «le blé – la thune»: first and last word alphabetically (catalog-drawer label); null when empty. */
  guide: string | null;
  href: string;
}

export interface ShellData {
  /** Words with a card due today («Повторение 23»). */
  due: number;
  /** Live words («Библиотека 158»). */
  total: number;
  inbox: ShellTheme;
  /** Folders in `sort` order. */
  themes: ShellTheme[];
}

export const INBOX_NAME = "Входящие";

export const themeHref = (id: string | null) => `/library/${encodeURIComponent(id ?? "inbox")}`;

/** «first – last» alphabetically (ignoring articles and «se»), the word alone, or null. */
export function guideWords(frs: readonly string[]): string | null {
  if (frs.length === 0) return null;
  let first = frs[0];
  let last = frs[0];
  for (const fr of frs) {
    if (compareFr(fr, first) < 0) first = fr;
    if (compareFr(fr, last) > 0) last = fr;
  }
  return first === last ? first : `${first} – ${last}`;
}

/** Combines library stats with the live words' FR forms (words in a deleted theme count as «Входящие»). */
export function buildShellData(stats: LibraryStats, words: readonly Pick<Word, "fr" | "folder_id">[]): ShellData {
  const live = new Set(stats.folders.map((f) => f.id));
  const frsByFolder = new Map<string | null, string[]>();
  for (const w of words) {
    const key = w.folder_id !== null && live.has(w.folder_id) ? w.folder_id : null;
    const list = frsByFolder.get(key);
    if (list) list.push(w.fr);
    else frsByFolder.set(key, [w.fr]);
  }
  return {
    due: stats.totals.due,
    total: stats.totals.total,
    inbox: {
      id: null,
      name: INBOX_NAME,
      color: null,
      count: stats.inbox.total,
      guide: guideWords(frsByFolder.get(null) ?? []),
      href: themeHref(null),
    },
    themes: stats.folders.map((f) => ({
      id: f.id,
      name: f.name,
      color: f.color,
      count: f.stats.total,
      guide: guideWords(frsByFolder.get(f.id) ?? []),
      href: themeHref(f.id),
    })),
  };
}

export async function loadShellData(now: Date = new Date()): Promise<ShellData> {
  const [stats, words] = await Promise.all([getLibraryStats(now), db.words.filter((w) => w.deleted_at === null).toArray()]);
  return buildShellData(stats, words);
}

/** Nav item for a path: a section, «inbox», or `theme:<id>`. */
export type NavKey = "review" | "library" | "import" | "settings" | "inbox" | `theme:${string}`;

/** Which nav item a path activates (exactly one; a shown theme instead of «Библиотека»). */
export function navKeyForPath(pathname: string | null): NavKey | null {
  if (!pathname) return null;
  if (pathname === "/" || pathname.startsWith("/done")) return "review";
  if (pathname.startsWith("/import")) return "import";
  if (pathname.startsWith("/settings")) return "settings";
  const theme = /^\/library\/([^/]+)/.exec(pathname);
  if (theme) {
    const id = decodeURIComponent(theme[1]);
    return id === "inbox" ? "inbox" : `theme:${id}`;
  }
  if (pathname.startsWith("/library")) return "library";
  return null;
}

/** A theme key whose folder is not in the list (deleted, not synced yet) falls back to «Библиотека». */
export function resolveNavKey(key: NavKey | null, themes: readonly Pick<ShellTheme, "id">[] | undefined): NavKey | null {
  if (!key?.startsWith("theme:") || !themes) return key;
  const id = key.slice("theme:".length);
  return themes.some((t) => t.id === id) ? key : "library";
}

export interface SidebarSyncLine {
  /** «Синхронизация · только что» */
  text: string;
  /** A 6px dot before the text, only for «нет сети» (muted) and «ошибка» (again). */
  dot: "muted" | "again" | null;
  canSync: boolean;
}

/** Sidebar sync status (Settings › Синхронизация without the account); null when sync is off. */
export function sidebarSyncLine(input: SyncLineInput): SidebarSyncLine | null {
  const { auth, sync } = input;
  if (auth.status === "local" || auth.status === "loading" || auth.status === "signed_out") return null;
  if (sync.state === "syncing") return { text: "Синхронизация…", dot: null, canSync: false };
  const line = syncLine({ ...input, auth: { ...auth, email: null } });
  const dot = line.text === "нет сети" ? "muted" : line.tone === "again" ? "again" : null;
  return { text: `Синхронизация · ${line.text}`, dot, canSync: line.canSync };
}
