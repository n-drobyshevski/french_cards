"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ContextRow } from "@/components/context/ContextLink";
import {
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { useAddSheetActions } from "@/components/providers/AddSheetContext";
import { setDraggedWords, spotlightTheme } from "@/components/shell/dnd";
import { blocksGlobalKeys, FOCUS_SEARCH_EVENT, OPEN_LAYER_SELECTOR } from "@/components/shell/keys";
import { useShortcutsEnabled } from "@/components/shell/ShellContext";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icons";
import { Kbd } from "@/components/ui/Kbd";
import { useSnackbar } from "@/components/ui/Snackbar";
import { countEnrichCandidates, enrichPreferences } from "@/lib/enrich";
import { getSettings } from "@/lib/settings";
import { deleteFolder, getFolder, getLibraryStats, restoreFolder } from "@/lib/folders";
import { useFormatKeys } from "@/lib/key-names";
import { getUndoableRun, undoReorgRun } from "@/lib/reorg";
import { getSessionCounts } from "@/lib/session";
import { matchesSearch } from "@/lib/text";
import type { Folder } from "@/lib/types";
import { useFinePointer, useLayoutClass, useMediaQuery } from "@/lib/use-media";
import { moveWords, restoreMoves, restoreWords, softDeleteWords } from "@/lib/words";
import { takeSkeletonHandoff } from "./DeskPlaceholder";
import { BulkBar, EmptyPane, FilterStrip, SelectionSummary, summaryTargets, TextLink, type StatusFilter } from "./DeskParts";
import { DisbandSheet, disbandMessage } from "./DisbandSheet";
import { EnrichPlanSheet } from "./EnrichPlanSheet";
import { cachedFolder, rememberLibrary, useSearchWait } from "./first-paint";
import { FolderFormSheet } from "./FolderFormSheet";
import { enrichCaption, nWords, plural, practiceHref, reviewHref } from "./format";
import { markLeaving, markReturning } from "./leaving";
import { Menu, MenuItem, MenuSeparator, type MenuAnchor } from "./Menu";
import { ThemeMenuItems } from "./ThemeActions";
import { INBOX_KEY, MoveMenu, ThemeSquare } from "./MoveMenu";
import { matchesSlang, type SlangKey } from "./SlangFilter";
import { SortPlanSheet } from "./SortPlanSheet";
import {
  cursorAfterRemoval,
  DEFAULT_SORT,
  guideRange,
  INITIAL_TABLE_INNER,
  listKeyAction,
  nextSort,
  rangeIds,
  sortWords,
  SORT_KEYS,
  tableColumns,
  type SortKey,
  type SortState,
} from "./table";
import { UndoProvider, useUndoLast, useUndoSnackbar } from "./undo";
import { useLibraryWords, type LibraryWord } from "./useLibraryWords";
import { WordDetailBody } from "./WordDetailBody";
import { WordTable, type RowHandlers } from "./WordTable";

// Desktop library and theme screens (≥ 768, DESKTOP-SPEC §5 #6–10, #22, #23): catalog header,
// search + text filters, the sortable word table with a cursor and multi-select, and the detail
// pane (docked from 1100, an overlay panel below). Phones keep LibraryScreen / FolderScreen.

export type LibraryScope = { kind: "all" } | { kind: "inbox" } | { kind: "folder"; id: string };

const SORT_STORE = "kartochki:library-sort";
const RESULTS_MAX = 200;
const HEAD_H = 32;
const EMPTY_ROWS: LibraryWord[] = [];
const EMPTY_SET: ReadonlySet<string> = new Set();

function readSort(): SortState {
  try {
    const raw = JSON.parse(localStorage.getItem(SORT_STORE) ?? "null") as SortState | null;
    if (raw && SORT_KEYS.includes(raw.key) && (raw.dir === 1 || raw.dir === -1)) return raw;
  } catch {
    // storage blocked or junk
  }
  return DEFAULT_SORT;
}

export function LibraryDesk({ scope }: { scope: LibraryScope }) {
  return (
    <UndoProvider>
      <Desk scope={scope} />
    </UndoProvider>
  );
}

/** Reads ?focus=search and ?word=<id> (needs Suspense: useSearchParams). */
function LibraryParams({ onParams }: { onParams: (focus: string | null, word: string | null) => void }) {
  const params = useSearchParams();
  const focus = params.get("focus");
  const word = params.get("word");
  const handler = useRef(onParams);
  useEffect(() => {
    handler.current = onParams;
  });
  useEffect(() => {
    handler.current(focus, word);
  }, [focus, word]);
  return null;
}

type FolderForm = { mode: "new"; moveIds?: string[] } | { mode: "edit" } | null;
type MoveTarget = { ids: string[]; anchor: MenuAnchor; returnFocus?: HTMLElement | null };

function Desk({ scope }: { scope: LibraryScope }) {
  const folderId = scope.kind === "all" ? undefined : scope.kind === "inbox" ? null : scope.id;
  const router = useRouter();
  const layout = useLayoutClass();
  const fine = useFinePointer();
  const coarse = !fine;
  const docked = useMediaQuery("(min-width: 1100px)");
  const shortcuts = useShortcutsEnabled();
  const keys = useFormatKeys();
  const showUndo = useUndoSnackbar();
  const undoLast = useUndoLast();
  const snackbar = useSnackbar();
  const addSheet = useAddSheetActions();

  const words = useLibraryWords(folderId);
  const stats = useLiveQuery(() => getLibraryStats(), []);
  const lastRun = useLiveQuery(() => getUndoableRun(), []);
  // Counted with Settings «ИИ» (what the plan may fill in), as on phones: otherwise the row could
  // offer a plan that turns out empty.
  const toEnrich = useLiveQuery(
    async () => (scope.kind === "all" ? countEnrichCandidates(enrichPreferences(await getSettings())) : null),
    [scope.kind],
  );
  const theme = useLiveQuery(async () => {
    if (folderId === undefined) return null;
    const [folder, counts] = await Promise.all([folderId === null ? Promise.resolve(null) : getFolder(folderId), getSessionCounts({ folderId })]);
    return { folder: folder === undefined ? ("missing" as const) : folder, cards: counts.due + counts.new };
  }, [folderId]);
  const folder: Folder | null = theme && theme.folder !== "missing" ? theme.folder : null;
  const folders = useMemo(() => words?.folders ?? [], [words]);
  useEffect(() => {
    if (stats) rememberLibrary(stats);
  }, [stats]);

  // ----- Filters and sorting
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [slang, setSlang] = useState<SlangKey[]>([]);
  const [sort, setSortState] = useState<SortState>(readSort);
  const setSort = (key: SortKey, fromMenu = false) => {
    // A column head flips its direction; «Порядок ▾» always picks the order as named.
    const next = fromMenu ? { key, dir: 1 as const } : nextSort(sort, key);
    setSortState(next);
    try {
      localStorage.setItem(SORT_STORE, JSON.stringify(next));
    } catch {
      // ignore
    }
  };
  const listMode = query.trim() !== "" || status !== "all" || slang.length > 0;

  const scopeRows = words?.words;
  const folderOrder = useMemo(() => new Map(folders.map((f) => [f.id, f.sort])), [folders]);
  // Sorted once per library change; the filters keep that order, so typing never re-sorts.
  const sortedRows = useMemo(() => scopeRows && sortWords(scopeRows, sort, folderOrder), [scopeRows, sort, folderOrder]);
  const filtered = useMemo(() => {
    if (!sortedRows) return undefined;
    const q = deferredQuery.trim();
    if (!q && status === "all" && slang.length === 0) return sortedRows;
    return sortedRows.filter(
      (item) =>
        (status !== "due" || item.schedule.due) &&
        (status !== "difficult" || item.schedule.status === "difficult") &&
        (status !== "new" || item.schedule.tone === "new") &&
        matchesSlang(item.word, slang) &&
        (!q || matchesSearch(item.word, q)),
    );
  }, [sortedRows, status, slang, deferredQuery]);
  const capped = useMemo(() => (filtered && deferredQuery.trim() ? filtered.slice(0, RESULTS_MAX) : filtered), [filtered, deferredQuery]);
  // L5: while the deferred query lags, the old rows stay (dimmed after 150 ms); «Ищем…» after 300 ms.
  const stale = query !== deferredQuery;
  const wait = useSearchWait(stale, listMode && (capped === undefined || stale));
  const rows = capped ?? EMPTY_ROWS;
  const ids = useMemo(() => rows.map((r) => r.word.id), [rows]);
  const byId = useMemo(() => new Map(rows.map((r) => [r.word.id, r])), [rows]);
  const counts = useMemo(() => {
    let due = 0;
    let difficult = 0;
    let fresh = 0;
    for (const r of scopeRows ?? []) {
      if (r.schedule.due) due++;
      if (r.schedule.status === "difficult") difficult++;
      if (r.schedule.tone === "new") fresh++;
    }
    return { due, difficult, fresh };
  }, [scopeRows]);

  // ----- Cursor (the current row) and selection
  const [cursor, setCursor] = useState<string | null>(null);
  const [prevIds, setPrevIds] = useState<string[]>(ids);
  if (capped && prevIds !== ids) {
    setPrevIds(ids);
    if (cursor && !byId.has(cursor) && prevIds.length > 0) setCursor(cursorAfterRemoval(prevIds, ids, cursor));
  }
  const [selectionRaw, setSelection] = useState<ReadonlySet<string>>(EMPTY_SET);
  const selection = useMemo(() => {
    if (selectionRaw.size === 0) return EMPTY_SET;
    const live = ids.filter((id) => selectionRaw.has(id));
    return live.length === selectionRaw.size ? selectionRaw : new Set(live);
  }, [selectionRaw, ids]);
  const anchor = useRef<{ id: string; base: ReadonlySet<string> } | null>(null);
  const cursorItem = cursor ? byId.get(cursor) : undefined;
  const cursorIndex = cursor ? ids.indexOf(cursor) : -1;

  const [overlay, setOverlay] = useState(false);
  const [editSignal, setEditSignal] = useState(0);
  const cardRef = useRef<HTMLElement | null>(null);

  // ----- Focus: keyboard actions keep focus on the cursor row, even when rows disappear.
  const gridRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const keepFocus = useRef(false);
  const rowEl = useCallback(
    (id: string | null) => (id ? gridRef.current?.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(id)}"]`) : null) ?? null,
    [],
  );
  const pendingFocus = useRef(false);
  useEffect(() => {
    const active = document.activeElement;
    const lost = !active || active === document.body;
    if (!pendingFocus.current && !(keepFocus.current && lost)) return;
    const el = rowEl(cursor);
    if (!el) return;
    pendingFocus.current = false;
    if (document.querySelector(OPEN_LAYER_SELECTOR)) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "nearest" });
  });
  const focusCursor = () => {
    pendingFocus.current = true;
    keepFocus.current = true;
  };

  // ----- Measurements: column rules by inner width, guide words by the visible rows
  const loaded = words !== undefined;
  const [inner, setInner] = useState(INITIAL_TABLE_INNER);
  // Right after DeskPlaceholder: its skeleton timer carries on (no blink at the hand-over).
  const [skeletonStyle] = useState(takeSkeletonHandoff);
  const rowH = coarse ? 48 : 40;
  // Guide words show only in the whole library sorted by «Слово». GuideWords follows the scroll
  // itself, so scrolling never re-renders the desk.
  const guideShown = scope.kind === "all" && sort.key === "fr";
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setInner(el.clientWidth - 48);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [theme?.folder, loaded]);
  const tableLayout = layout === "expanded" ? "expanded" : "medium";
  // Stable between renders, so the memoised rows hold.
  const columns = useMemo(() => tableColumns({ inner, layout: tableLayout, coarse, themeColumn: scope.kind === "all" }), [inner, tableLayout, coarse, scope.kind]);

  // ----- Actions with undo
  const moveIds = async (list: readonly string[], key: string) => {
    const to = key === INBOX_KEY ? null : key;
    // Rows that leave a filtered table close instead of vanishing (D8).
    markLeaving(list);
    try {
      const records = await moveWords(list, to);
      if (records.length === 0) return;
      const name = to === null ? "Входящие" : (folders.find((f) => f.id === to)?.name ?? "тему");
      // The target theme in the sidebar acknowledges the move (L10), as a drop does (D8).
      spotlightTheme(to);
      showUndo({
        message: `${to === null ? "Перемещено во" : "Перемещено в"} «${name}»`,
        undo: () => {
          markReturning(records.map((r) => r.word_id));
          void restoreMoves(records);
        },
      });
    } catch (e) {
      snackbar.show({ message: e instanceof Error ? e.message : "Не получилось переместить" });
    }
  };
  const deleteIds = async (list: readonly string[]) => {
    if (list.length === 0) return;
    const first = byId.get(list[0])?.word.fr;
    markLeaving(list);
    try {
      await softDeleteWords(list);
      const ids = [...list];
      showUndo({
        message:
          ids.length === 1 && first ? (
            <>
              Удалено · <span lang="fr">{first}</span>
            </>
          ) : (
            `Удалено ${nWords(ids.length)}`
          ),
        undo: () => {
          markReturning(ids);
          void restoreWords(ids);
        },
      });
    } catch (e) {
      snackbar.show({ message: e instanceof Error ? e.message : "Не получилось удалить" });
    }
  };
  /** Selection in table order, or the current word. */
  const targetIds = (): string[] => (selection.size > 0 ? ids.filter((id) => selection.has(id)) : cursor && byId.has(cursor) ? [cursor] : []);

  const [moveMenu, setMoveMenu] = useState<MoveTarget | null>(null);
  const [rowMenu, setRowMenu] = useState<{ id: string; anchor: MenuAnchor; el: HTMLElement | null } | null>(null);
  const [themeMenu, setThemeMenu] = useState<HTMLElement | null>(null);
  const [themeFilter, setThemeFilter] = useState<HTMLElement | null>(null);
  const [folderForm, setFolderForm] = useState<FolderForm>(null);
  const [disbandOpen, setDisbandOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [enrichOpen, setEnrichOpen] = useState(false);

  const openMove = (list: string[], anchorEl: HTMLElement | null) => {
    if (list.length === 0) return;
    const el = anchorEl ?? rowEl(cursor);
    if (!el) return;
    keepFocus.current = true;
    setMoveMenu({ ids: list, anchor: { element: el, align: "start" }, returnFocus: rowEl(cursor) ?? el });
  };

  const openCard = (id: string | null = cursor) => {
    if (!id) return;
    if (id !== cursor) setCursor(id);
    if (!docked) setOverlay(true);
    requestAnimationFrame(() => requestAnimationFrame(() => cardRef.current?.focus({ preventScroll: true })));
  };

  const moveCursor = (to: number) => {
    if (ids.length === 0) return;
    const i = Math.max(0, Math.min(ids.length - 1, to));
    setCursor(ids[i]);
    anchor.current = null;
    focusCursor();
  };

  const toggleOne = (id: string) => {
    const next = new Set(selection);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelection(next);
    anchor.current = { id, base: next };
  };

  const extend = (delta: number) => {
    if (ids.length === 0) return;
    const from = cursorIndex < 0 ? 0 : cursorIndex;
    if (!anchor.current || !byId.has(anchor.current.id)) anchor.current = { id: ids[from], base: selection };
    const to = Math.max(0, Math.min(ids.length - 1, cursorIndex < 0 ? 0 : from + delta));
    const a = ids.indexOf(anchor.current.id);
    const next = new Set(anchor.current.base);
    for (const id of rangeIds(ids, a, to)) next.add(id);
    setSelection(next);
    setCursor(ids[to]);
    focusCursor();
  };

  const clearSelection = () => {
    setSelection(EMPTY_SET);
    anchor.current = null;
  };

  const onListKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || blocksGlobalKeys(event.target) || document.querySelector(OPEN_LAYER_SELECTOR)) return;
    const action = listKeyAction(event, shortcuts);
    if (!action) return;
    const target = event.target as HTMLElement;
    const onControl = target !== event.currentTarget && target.getAttribute("role") !== "row" && !!target.closest("button, a, input");
    if (onControl && (action === "open" || action === "toggle")) return;
    switch (action) {
      case "next":
        moveCursor(cursorIndex + 1);
        break;
      case "prev":
        moveCursor(cursorIndex < 0 ? 0 : cursorIndex - 1);
        break;
      case "first":
        moveCursor(0);
        break;
      case "last":
        moveCursor(ids.length - 1);
        break;
      case "extend-next":
        extend(1);
        break;
      case "extend-prev":
        extend(-1);
        break;
      case "open":
        openCard();
        break;
      case "edit":
        if (!cursorItem) return;
        clearSelection();
        if (!docked) setOverlay(true);
        setEditSignal((n) => n + 1);
        break;
      case "toggle":
        if (!cursor) return;
        toggleOne(cursor);
        break;
      case "select-all":
        setSelection(new Set(ids));
        anchor.current = null;
        break;
      case "move":
        openMove(targetIds(), null);
        break;
      case "delete": {
        const list = targetIds();
        if (list.length === 0) return;
        focusCursor();
        clearSelection();
        void deleteIds(list);
        break;
      }
      case "undo":
        if (!undoLast()) return;
        focusCursor();
        break;
      case "clear":
        if (selection.size > 0) clearSelection();
        else if (overlay) setOverlay(false);
        else return;
        break;
    }
    event.preventDefault();
  };

  // Row events (stable through a ref so rows can be memoised).
  const handlers = useRef<RowHandlers>(null as unknown as RowHandlers);
  const rowHandlers: RowHandlers = {
    click: (id, event: MouseEvent<HTMLElement>) => {
      keepFocus.current = true;
      if (event.shiftKey) {
        const from = anchor.current && byId.has(anchor.current.id) ? anchor.current : { id: cursor ?? id, base: selection };
        anchor.current = from;
        const next = new Set(from.base);
        for (const x of rangeIds(ids, ids.indexOf(from.id), ids.indexOf(id))) next.add(x);
        setSelection(next);
      } else if (event.metaKey || event.ctrlKey) {
        toggleOne(id);
      } else {
        clearSelection();
        if (coarse && !docked) setOverlay(true);
      }
      setCursor(id);
    },
    toggle: (id, event) => {
      keepFocus.current = true;
      if (event.shiftKey) {
        rowHandlers.click(id, event);
        return;
      }
      toggleOne(id);
      setCursor(id);
      rowEl(id)?.focus({ preventScroll: true });
    },
    open: (id) => openCard(id),
    menu: (id, a) => {
      setCursor(id);
      if (!selection.has(id)) clearSelection();
      setRowMenu({ id, anchor: a, el: rowEl(id) });
    },
    move: (id, el) => {
      setCursor(id);
      openMove([id], el);
    },
    remove: (id) => void deleteIds([id]),
    dragIds: (id) => (selection.has(id) ? ids.filter((x) => selection.has(x)) : [id]),
    dragStart: (list, event) => setDraggedWords(event.dataTransfer, list),
  };
  useLayoutEffect(() => {
    handlers.current = rowHandlers;
  });

  // ----- Screen keys: R «Повторить тему», F2 rename; `/` claims the search field.
  const reviewable = scope.kind !== "all" && !!theme && theme.cards > 0;
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.defaultPrevented || blocksGlobalKeys(e.target) || document.querySelector(OPEN_LAYER_SELECTOR)) return;
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.repeat || e.isComposing || e.keyCode === 229) return;
      if (e.code === "KeyR" && shortcuts && reviewable) {
        e.preventDefault();
        router.push(reviewHref(folderId ?? null));
      } else if (e.code === "F2" && folder) {
        e.preventDefault();
        setFolderForm({ mode: "edit" });
      }
    };
    const onFocusSearch = (e: Event) => {
      e.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(FOCUS_SEARCH_EVENT, onFocusSearch);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(FOCUS_SEARCH_EVENT, onFocusSearch);
    };
  }, [shortcuts, reviewable, folder, folderId, router]);

  const onParams = (focus: string | null, word: string | null) => {
    if (focus === "search") requestAnimationFrame(() => searchRef.current?.focus());
    if (word) {
      setQuery("");
      setStatus("all");
      setSlang([]);
      setCursor(word);
      pendingFocus.current = true;
    }
  };

  const openWord = (id: string) => {
    if (byId.has(id)) {
      setCursor(id);
      focusCursor();
    } else if (scope.kind === "all" && scopeRows?.some((r) => r.word.id === id)) {
      setQuery("");
      setStatus("all");
      setSlang([]);
      setCursor(id);
      focusCursor();
    } else {
      router.push(`/library?word=${encodeURIComponent(id)}`);
    }
  };

  // ----- Theme actions
  const removeTheme = async (f: Folder) => {
    const moves = await deleteFolder(f.id);
    router.push("/library");
    showUndo({
      message: moves.length ? `Тема «${f.name}» удалена · ${nWords(moves.length)} во «Входящих»` : `Тема «${f.name}» удалена`,
      undo: () => void restoreFolder(f.id, moves),
    });
  };
  const undoLastRun = async () => {
    if (!lastRun) return;
    const { restored } = await undoReorgRun(lastRun.id);
    snackbar.show({ message: restored ? "Сортировка отменена" : "Отменять нечего: слова уже перемещены" });
  };

  // ----- Counts per place (summary pane, picker)
  const placeCounts = useMemo(() => {
    const m = new Map<string, number>();
    if (!stats) return m;
    m.set(INBOX_KEY, stats.inbox.total);
    for (const f of stats.folders) m.set(f.id, f.stats.total);
    return m;
  }, [stats]);
  const scopeStats = !stats ? undefined : scope.kind === "all" ? stats.totals : scope.kind === "inbox" ? stats.inbox : stats.folders.find((f) => f.id === scope.id)?.stats;

  if (theme?.folder === "missing") {
    return (
      <main data-wide="" className="flex flex-1 flex-col px-6 pt-5">
        <h1 className="m-0 font-serif text-[28px] leading-9 font-medium">Тема не найдена</h1>
        <p className="m-0 mt-2 text-[15px] leading-[22px] text-muted">Возможно, её удалили на другом устройстве.</p>
        <Link href="/library" className="mt-6 inline-flex h-9 w-fit items-center rounded-[6px] border border-ink px-4 text-[14px] font-medium text-ink no-underline">
          В библиотеку
        </Link>
      </main>
    );
  }

  const title = scope.kind === "all" ? "Библиотека" : scope.kind === "inbox" ? "Входящие" : (folder?.name ?? cachedFolder(scope.id)?.name ?? "");
  const hasWords = !!scopeRows && scopeRows.length > 0;
  const emptyScope = !!scopeRows && scopeRows.length === 0;
  const selectedRows = rows.filter((r) => selection.has(r.word.id));
  const targets = summaryTargets(folders, placeCounts, scope.kind === "inbox" ? INBOX_KEY : scope.kind === "folder" ? scope.id : null);
  const currentKey = scope.kind === "inbox" ? INBOX_KEY : scope.kind === "folder" ? scope.id : undefined;
  const deleteKey = keys("Mod+Backspace");
  // Expanded: up to 300px, down to 220 so the filter strip keeps the search's row while it fits.
  const searchWidth = layout === "expanded" ? "basis-[220px] grow max-w-[300px]" : coarse ? "w-[208px]" : "w-[240px]";
  const mastery = Math.round((scopeStats?.mastery ?? 0) * 100);

  // ----- Subline (replaced by the result count while searching or filtering)
  let subline: ReactNode;
  if (listMode) {
    subline = (
      <span role="status" className="font-medium text-ink">
        {wait.searching
          ? "Ищем…"
          : capped === undefined
            ? ""
            : filtered && filtered.length
              ? `Найдено ${nWords(filtered.length)}`
              : "Ничего не найдено"}
      </span>
    );
  } else if (scopeStats) {
    const sortLink = (
      <span className="inline-flex items-baseline gap-2">
        {stats && stats.inbox.total > 0 && <span>{nWords(stats.inbox.total)} без темы</span>}
        <TextLink aria-haspopup="dialog" onClick={() => setSortOpen(true)} className="items-center gap-1">
          <Icon name="spark" size={14} strokeWidth={1.5} className="shrink-0" />
          Разложить по темам
        </TextLink>
      </span>
    );
    subline =
      scope.kind === "inbox" ? (
        sortLink
      ) : (
        <span className="inline-flex flex-wrap items-center gap-x-6">
          <span>
            {nWords(scopeStats.total)}
            {scopeStats.due > 0 && (
              <>
                {" · "}
                <span className="font-medium text-ink">{scopeStats.due} к повторению</span>
              </>
            )}
          </span>
          {scope.kind === "all" && scopeStats.total > 0 && sortLink}
        </span>
      );
  }

  let line2: ReactNode = null;
  if (scope.kind === "folder") {
    if (scopeStats && scopeStats.total > 0)
      line2 = (
        <span className="flex items-center gap-3">
          <span role="progressbar" aria-label="Выучено" aria-valuemin={0} aria-valuemax={100} aria-valuenow={mastery} className="block h-0.5 w-[200px] bg-rule">
            <span className="block h-0.5" style={{ width: `${mastery}%`, background: folder?.color ?? "var(--ink)" }} />
          </span>
          <span className="font-mono text-[12px] text-muted tabular-nums">{mastery} % выучено</span>
        </span>
      );
  } else if (lastRun || (toEnrich && toEnrich.total > 0)) {
    line2 = (
      <span className="flex flex-wrap items-baseline gap-x-6 text-[12px] text-muted">
        {lastRun && (
          <span className="inline-flex items-baseline gap-2">
            <span className="tabular-nums">
              Последняя раскладка: {lastRun.moves.length} {plural(lastRun.moves.length, ["перемещение", "перемещения", "перемещений"])}
            </span>
            <TextLink onClick={() => void undoLastRun()}>Отменить</TextLink>
          </span>
        )}
        {toEnrich && toEnrich.total > 0 && (
          <span className="inline-flex items-baseline gap-2">
            <span className="tabular-nums">
              {enrichCaption(toEnrich)}
            </span>
            <TextLink aria-haspopup="dialog" onClick={() => setEnrichOpen(true)} className="items-center gap-1">
              <Icon name="spark" size={14} strokeWidth={1.5} className="shrink-0" />
              Дополнить карточки
            </TextLink>
          </span>
        )}
      </span>
    );
  }

  const emptyText =
    emptyScope && !listMode
      ? scope.kind === "inbox"
        ? "Здесь пусто — все слова разложены по темам."
        : scope.kind === "folder"
          ? "В этой теме пока нет слов."
          : "В библиотеке пока нет слов."
      : null;
  const noResults = hasWords && capped && capped.length === 0;

  // ----- Detail pane content
  const pane: ReactNode =
    selection.size > 0 ? (
      <SelectionSummary
        words={selectedRows.map((r) => r.word)}
        targets={targets}
        coarse={coarse}
        dragHint={layout === "expanded" && fine}
        onMove={(key) => {
          const list = targetIds();
          clearSelection();
          focusCursor();
          void moveIds(list, key);
        }}
        onNewTheme={() => setFolderForm({ mode: "new", moveIds: targetIds() })}
      />
    ) : cursorItem ? (
      // Not keyed by the word: the previous word stays until the next one is read, then swaps in
      // one frame (D3).
      <WordDetailBody
        wordId={cursorItem.word.id}
        variant="pane"
        onClose={noop}
        onPrev={cursorIndex > 0 ? () => moveCursor(cursorIndex - 1) : undefined}
        onNext={cursorIndex >= 0 && cursorIndex < ids.length - 1 ? () => moveCursor(cursorIndex + 1) : undefined}
        onOpenWord={openWord}
        onNewTheme={(list) => setFolderForm({ mode: "new", moveIds: list })}
        editSignal={editSignal}
        coarse={coarse}
        cardRef={cardRef}
      />
    ) : (
      <EmptyPane shortcuts={shortcuts} />
    );

  const rowMenuItem = rowMenu ? byId.get(rowMenu.id) : undefined;

  return (
    <main data-wide="" style={{ height: "calc(100dvh - var(--safe-top))" }} className="flex min-h-0 w-full flex-none overflow-hidden">
      <Suspense fallback={null}>
        <LibraryParams onParams={onParams} />
      </Suspense>

      {/* List pane */}
      <section aria-label={title} className="relative flex min-w-0 flex-1 flex-col min-[1600px]:max-w-[1148px] min-[1600px]:grow-0 min-[1600px]:basis-[1148px]">
        <header className="shrink-0 px-6 pt-5">
          <div className="flex h-9 items-center gap-3">
            <h1 className="m-0 min-w-0 truncate font-serif text-[28px] leading-9 font-medium tracking-[-0.015em]">{title}</h1>
            {folder?.locked && <span className="shrink-0 rounded-[4px] border border-rule px-1.5 font-mono text-[11px] leading-5 text-muted">закреплена</span>}
            <span className="flex-1" />
            {guideShown && <GuideWords rows={rows} rowH={rowH} scrollRef={scrollRef} loaded={loaded} />}
            {/* Nothing due: a practice round over the whole theme instead, as on phones. */}
            {scope.kind !== "all" && hasWords && theme && theme.cards === 0 && (
              <Link
                href={practiceHref(folderId ?? null)}
                className={cx(
                  "inline-flex shrink-0 items-center gap-2 rounded-[6px] border border-ink bg-surface px-4 text-[14px] font-medium text-ink no-underline hoverable:bg-hover-surface",
                  coarse ? "h-11" : "h-9",
                )}
              >
                Тренировка всей темы
                <span className="font-mono text-[13px] tabular-nums">{scopeRows?.length}</span>
              </Link>
            )}
            {scope.kind !== "all" && hasWords && theme && theme.cards > 0 && (
              <Link
                href={reviewHref(folderId ?? null)}
                aria-keyshortcuts={shortcuts ? "R" : undefined}
                className={cx(
                  "inline-flex shrink-0 items-center gap-2 rounded-[6px] border border-ink bg-ink px-4 text-[14px] font-medium text-on-ink no-underline",
                  coarse ? "h-11" : "h-9",
                )}
              >
                Повторить тему
                <span className="font-mono text-[13px] tabular-nums">{theme.cards}</span>
                {shortcuts && (
                  <Kbd tone="ink" aria-hidden="true">
                    R
                  </Kbd>
                )}
              </Link>
            )}
            {folder && (
              <button
                type="button"
                aria-label="Ещё действия с темой"
                aria-haspopup="menu"
                aria-expanded={!!themeMenu}
                title="Ещё действия с темой"
                onClick={(e) => setThemeMenu(themeMenu ? null : e.currentTarget)}
                className={cx(
                  "inline-flex shrink-0 items-center justify-center rounded-[4px] bg-transparent text-ink hoverable:bg-hover aria-expanded:bg-hover",
                  coarse ? "size-11" : "size-8",
                )}
              >
                <Icon name="more" size={20} />
              </button>
            )}
          </div>
          <p className="m-0 mt-1 flex min-h-5 items-center text-[13px] leading-5 text-muted tabular-nums">{subline}</p>
          <div className="mt-1 flex h-4 items-center text-[12px] leading-4">{line2}</div>

          {/* Toolbar: theme filter (medium), search, filter strip — there while the words load too,
              so nothing below it moves when they arrive (D4). A list too narrow for one row puts the
              strip on a second row (the placeholder wraps the same way). */}
          {(scopeRows === undefined || hasWords || listMode) && (
            <div className="mt-3 flex min-h-9 flex-wrap items-center gap-x-6 gap-y-1 pointer-coarse:gap-x-5">
              {layout !== "expanded" && (
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={!!themeFilter}
                  onClick={(e) => setThemeFilter(themeFilter ? null : e.currentTarget)}
                  className="inline-flex h-9 shrink-0 items-center gap-1 bg-transparent px-0 text-[14px] font-medium text-ink pointer-coarse:h-11"
                >
                  Тема: {scope.kind === "all" ? "все" : title}
                  <Icon name="chevron" size={14} />
                </button>
              )}
              <label
                className={cx(
                  "flex h-9 shrink-0 items-center gap-2 rounded-[4px] border border-boundary bg-surface pr-1.5 pl-2.5 text-muted focus-within:border-ink focus-within:outline-1 focus-within:outline-ink",
                  searchWidth,
                )}
              >
                <Icon name="search" size={16} />
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape" && query) {
                      e.preventDefault();
                      setQuery("");
                    } else if (e.key === "Escape" || (e.key === "ArrowDown" && ids.length)) {
                      e.preventDefault();
                      if (!cursor && ids.length) setCursor(ids[0]);
                      focusCursor();
                      rowEl(cursor ?? ids[0])?.focus();
                    } else if (e.key === "Enter" && ids.length) {
                      e.preventDefault();
                      setCursor(ids[0]);
                      focusCursor();
                    }
                  }}
                  placeholder="Поиск по FR и RU"
                  aria-label="Поиск по FR и RU"
                  aria-keyshortcuts={shortcuts ? "/" : undefined}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className="h-8 min-w-0 flex-1 border-0 bg-transparent p-0 text-[14px] text-ink outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
                />
                {query ? (
                  <button type="button" aria-label="Очистить поиск" title="Очистить поиск (Esc)" onClick={() => setQuery("")} className="inline-flex size-6 items-center justify-center rounded-[4px] bg-transparent text-muted hoverable:text-ink">
                    <Icon name="close" size={14} />
                  </button>
                ) : (
                  shortcuts && <Kbd aria-hidden="true">/</Kbd>
                )}
              </label>
              <FilterStrip
                status={status}
                onStatus={setStatus}
                slang={slang}
                onSlang={setSlang}
                dueCount={counts.due}
                difficultCount={counts.difficult}
                newCount={counts.fresh}
                sort={sort}
                onOrder={(key) => setSort(key, true)}
              />
            </div>
          )}
        </header>

        {emptyText ? (
          <div className="mx-6 mt-6 flex flex-col items-start gap-4 border-t border-rule pt-6">
            <p className="m-0 text-[15px] leading-[22px] text-muted">{emptyText}</p>
            <Button variant="secondary" size="sm" className="h-9 px-4 text-[14px]" icon="plus" onClick={() => addSheet.open()}>
              Добавить слово
            </Button>
          </div>
        ) : (
          <div
            className="mt-3 flex min-h-0 flex-1 flex-col"
            onBlur={(e) => {
              const next = e.relatedTarget as Node | null;
              if (next && !e.currentTarget.contains(next) && !next.parentElement?.closest("[role='menu']")) keepFocus.current = false;
            }}
            onKeyDown={(e) => {
              // Keys from the bulk bar (outside the grid) still belong to the list region.
              if (gridRef.current && !gridRef.current.contains(e.target as Node)) onListKey(e);
            }}
          >
            <WordTable
              rows={rows}
              columns={columns}
              sort={sort}
              onSort={setSort}
              cursor={cursor}
              selection={selection}
              coarse={coarse}
              fine={fine}
              label={`Слова: ${title}`}
              loading={capped === undefined}
              stale={wait.dim}
              skeletonStyle={skeletonStyle}
              handlers={handlers}
              onSelectAll={(all) => {
                setSelection(all ? new Set(ids) : EMPTY_SET);
                anchor.current = null;
              }}
              onKeyDown={onListKey}
              onScroll={noop}
              gridRef={gridRef}
              scrollRef={scrollRef}
              empty={
                noResults ? (
                  <div className="flex flex-col items-start gap-4 px-6 pt-5">
                    <p className="m-0 text-[15px] leading-[22px] text-muted">
                      {query.trim()
                        ? "Такого слова нет ни во французском, ни в переводе."
                        : status === "due"
                          ? "Сегодня повторять нечего."
                          : status === "difficult"
                            ? "Трудных слов нет."
                            : status === "new"
                              ? "Новых слов нет."
                            : "С таким уровнем сленга слов нет."}
                    </p>
                    {query.trim() && (
                      <>
                        <ContextRow q={query.trim()} variant="library" className="w-full max-w-[480px] border-t border-t-ink" />
                        <Button variant="secondary" size="sm" className="h-9 px-4 text-[14px]" icon="plus" onClick={() => addSheet.open({ fr: query.trim() })}>
                          Добавить «{query.trim()}»
                        </Button>
                      </>
                    )}
                  </div>
                ) : null
              }
              footer={
                filtered && capped && filtered.length > capped.length ? (
                  <p className="m-0 px-6 pt-3 pb-6 text-[13px] leading-5 text-muted">
                    Показаны первые {RESULTS_MAX}. Уточните поиск, чтобы увидеть остальные.
                  </p>
                ) : null
              }
            />
            {selection.size > 0 && (
              <BulkBar
                count={selection.size}
                shortcuts={shortcuts}
                deleteKey={deleteKey}
                onMove={(el) => openMove(targetIds(), el)}
                onDelete={() => {
                  const list = targetIds();
                  clearSelection();
                  focusCursor();
                  void deleteIds(list);
                }}
                onClear={() => {
                  clearSelection();
                  focusCursor();
                }}
              />
            )}
          </div>
        )}
      </section>

      {/* Detail pane: docked from 1100, an overlay panel below */}
      {docked ? (
        <aside
          aria-label="Карточка слова"
          className="flex w-[400px] shrink-0 flex-col overflow-y-auto overscroll-contain border-l border-rule px-6 pt-4 pb-8 min-[1200px]:max-[1439px]:w-[360px] min-[1600px]:min-w-[400px] min-[1600px]:flex-1"
        >
          <div className="w-full min-[1600px]:max-w-[560px]">{pane}</div>
        </aside>
      ) : (
        overlay &&
        (cursorItem || selection.size > 0) && (
          <aside
            aria-label="Карточка слова"
            onKeyDown={(e) => {
              if (e.key !== "Escape" || e.defaultPrevented || document.querySelector(OPEN_LAYER_SELECTOR)) return;
              e.preventDefault();
              setOverlay(false);
              focusCursor();
            }}
            className="fixed inset-y-0 right-0 z-30 flex w-[400px] flex-col overflow-y-auto overscroll-contain border-l border-ink bg-paper px-6 pt-4 pb-8 max-[899px]:w-[360px]"
          >
            <div className="mb-3 flex h-8 items-center justify-end">
              <button
                type="button"
                aria-label="Закрыть карточку"
                title="Закрыть карточку (Esc)"
                onClick={() => {
                  setOverlay(false);
                  focusCursor();
                }}
                className="-mr-2 inline-flex size-8 items-center justify-center rounded-[4px] bg-transparent text-ink hoverable:bg-hover"
              >
                <Icon name="close" size={18} />
              </button>
            </div>
            {pane}
          </aside>
        )
      )}

      {/* Menus */}
      <Menu
        open={!!rowMenu}
        anchor={rowMenu?.anchor ?? null}
        onClose={() => setRowMenu(null)}
        label="Действия со словом"
        width={240}
        returnFocus={rowMenu?.el}
      >
        <MenuItem onSelect={() => openCard(rowMenu?.id ?? null)} shortcut={coarse ? undefined : "↵"}>
          Открыть карточку
        </MenuItem>
        <MenuItem
          onSelect={() => {
            const id = rowMenu?.id;
            if (id) requestAnimationFrame(() => openMove([id], rowEl(id)));
          }}
          shortcut={coarse || !shortcuts ? undefined : "M"}
        >
          Переместить в тему…
        </MenuItem>
        <MenuSeparator />
        <MenuItem danger onSelect={() => rowMenuItem && void deleteIds([rowMenuItem.word.id])} shortcut={coarse ? undefined : deleteKey}>
          Удалить слово
        </MenuItem>
      </Menu>

      <MoveMenu
        open={!!moveMenu}
        anchor={moveMenu?.anchor ?? null}
        onClose={() => setMoveMenu(null)}
        folders={folders}
        counts={placeCounts}
        currentKey={currentKey}
        returnFocus={moveMenu?.returnFocus}
        label={moveMenu && moveMenu.ids.length > 1 ? `Переместить ${nWords(moveMenu.ids.length)}` : "Переместить в тему"}
        onPick={(key) => {
          const list = moveMenu?.ids ?? [];
          clearSelection();
          focusCursor();
          void moveIds(list, key);
        }}
        onNewTheme={() => setFolderForm({ mode: "new", moveIds: moveMenu?.ids })}
      />

      {folder && (
        <Menu open={!!themeMenu} anchor={themeMenu ? { element: themeMenu, align: "end" } : null} onClose={() => setThemeMenu(null)} label="Действия с темой" width={320} exactWidth>
          <ThemeMenuItems
            folder={folder}
            words={stats?.folders.find((f) => f.id === folder.id)?.stats.total ?? 0}
            onNavigate={(href) => router.push(href)}
            onEdit={() => setFolderForm({ mode: "edit" })}
            onDisband={() => setDisbandOpen(true)}
            onDelete={() => void removeTheme(folder)}
          />
        </Menu>
      )}

      {layout !== "expanded" && (
        <Menu open={!!themeFilter} anchor={themeFilter ? { element: themeFilter } : null} onClose={() => setThemeFilter(null)} label="Тема" width={240}>
          <MenuItem checked={scope.kind === "all"} onSelect={() => router.push("/library")}>
            Все слова
          </MenuItem>
          <MenuItem checked={scope.kind === "inbox"} lead={<ThemeSquare color={null} />} onSelect={() => router.push("/library/inbox")} className="font-serif text-[16px]">
            Входящие
          </MenuItem>
          {folders.map((f) => (
            <MenuItem
              key={f.id}
              checked={scope.kind === "folder" && scope.id === f.id}
              lead={<ThemeSquare color={f.color} />}
              onSelect={() => router.push(`/library/${encodeURIComponent(f.id)}`)}
              className="font-serif text-[16px]"
            >
              {f.name}
            </MenuItem>
          ))}
          {/* No sidebar at this width: «Новая тема» lives here (the sidebar has «+» next to «Темы»). */}
          <MenuSeparator />
          <MenuItem icon="plus" onSelect={() => setFolderForm({ mode: "new" })}>
            Новая тема…
          </MenuItem>
        </Menu>
      )}

      {/* Dialogs */}
      <FolderFormSheet
        open={folderForm !== null}
        onOpenChange={(open) => {
          if (!open) setFolderForm(null);
        }}
        folder={folderForm?.mode === "edit" ? folder : null}
        usedColors={folders.map((f) => f.color).filter((c) => folderForm?.mode !== "edit" || c !== folder?.color)}
        onSaved={(saved, created) => {
          const list = folderForm?.mode === "new" ? folderForm.moveIds : undefined;
          if (list && list.length) {
            clearSelection();
            void moveIds(list, saved.id);
          } else if (created) {
            snackbar.show({ message: `Тема «${saved.name}» создана` });
          }
        }}
      />
      {folder && (
        <DisbandSheet
          open={disbandOpen}
          onOpenChange={setDisbandOpen}
          folder={folder}
          onDisbanded={(moves) => {
            router.push("/library");
            showUndo({ message: disbandMessage(folder.name, moves), undo: () => void restoreFolder(folder.id, moves) });
          }}
        />
      )}
      <SortPlanSheet open={sortOpen} onOpenChange={setSortOpen} />
      {scope.kind === "all" && <EnrichPlanSheet open={enrichOpen} onOpenChange={setEnrichOpen} />}
    </main>
  );
}

function noop() {}

/**
 * «arrête — vas-y»: the first and last word on screen, kept by its own scroll listener so that only
 * this span re-renders as the table scrolls (and only when the first or last visible row changes).
 */
function GuideWords({
  rows,
  rowH,
  scrollRef,
  loaded,
}: {
  rows: readonly LibraryWord[];
  rowH: number;
  scrollRef: RefObject<HTMLDivElement | null>;
  /** The table (and so the scroll element) is mounted. */
  loaded: boolean;
}) {
  const [visible, setVisible] = useState(() => visibleRows(0, 600, rowH));
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let frame = 0;
    const measure = () => {
      const next = visibleRows(el.scrollTop, el.clientHeight, rowH);
      setVisible((v) => (v.first === next.first && v.last === next.last ? v : next));
    };
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, [scrollRef, loaded, rowH]);
  if (rows.length === 0) return null;
  const first = Math.min(rows.length - 1, visible.first);
  const last = Math.min(rows.length - 1, Math.max(first, visible.last));
  return (
    <span lang="fr" aria-hidden="true" className="shrink-0 truncate font-serif text-[16px] text-muted italic">
      {guideRange(rows[first].word.fr, rows[last].word.fr)}
    </span>
  );
}

/** First and last row under the table head (unclamped) at this scroll offset. */
function visibleRows(top: number, height: number, rowH: number): { first: number; last: number } {
  const first = Math.max(0, Math.floor(top / rowH));
  return { first, last: Math.max(first, Math.floor((top + height - HEAD_H - 1) / rowH)) };
}
