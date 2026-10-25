"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { ContextRow } from "@/components/context/ContextLink";
import { useCopyScopeRequest } from "@/components/exercises/scope-request";
import { createElement, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAddSheetActions } from "@/components/providers/AddSheetContext";
import { useAppReady, useBootFailure } from "@/components/providers/AppProviders";
import { Button, IconButton } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { FoldRow, foldSummary } from "@/components/ui/FoldRow";
import { Icon } from "@/components/ui/Icons";
import { KEYBOARD_MIN, useVisualViewport } from "@/components/ui/Sheet";
import { SkeletonRow } from "@/components/ui/Skeleton";
import { useSnackbar } from "@/components/ui/Snackbar";
import { countEnrichCandidates, countLevelCandidates, enrichPreferences } from "@/lib/enrich";
import { useFolderSpotlight } from "@/lib/folder-spotlight";
import { deleteFolder, getLibraryStats, restoreFolder, type FolderWithStats } from "@/lib/folders";
import { getSettings, updateSettings } from "@/lib/settings";
import type { Settings } from "@/lib/types";
import { getUndoableRun, undoReorgRun } from "@/lib/reorg";
import { useLayoutClass } from "@/lib/use-media";
import { useOnline } from "@/lib/use-online";
import { useSettings } from "@/lib/use-settings";
import { BootNotice } from "./BootNotice";
import { DeskPlaceholder } from "./DeskPlaceholder";
import { DisbandSheet, disbandMessage } from "./DisbandSheet";
import { DrawerRow, DrawerSkeleton, NewDrawerRow, PlainRow } from "./DrawerRow";
import { EnrichPlanSheet } from "./EnrichPlanSheet";
import { LevelFillSheet } from "./LevelFillSheet";
import { useLevelData } from "@/lib/use-level-data";
import { rememberLibrary, rememberLibraryShape, STALE_DIM, useLibraryShape, useRevealClass, useSearchWait, type LibraryShape } from "./first-paint";
import { FolderFormSheet } from "./FolderFormSheet";
import { FolderMenuSheet } from "./FolderMenuSheet";
import { LedgerMenuSheet, type LedgerKind } from "./LedgerMenuSheet";
import { enrichCaption, folderHref, nWords, plural } from "./format";
import { useLibraryDesk } from "./lazy-desk";
import { LibraryFilterSheet } from "./LibraryFilterSheet";
import { levelCounts } from "./level";
import { NAV_FORWARD } from "./NavSlide";
import {
  ALL_THEMES,
  DEFAULT_PHONE_FILTER,
  filterPhoneWords,
  INBOX_THEME,
  narrows,
  sheetFilterCount,
  type PhoneFilter,
  type StatusFilter,
} from "./phone-filter";
import { SortPlanSheet } from "./SortPlanSheet";
import { SyncMark } from "./SyncMark";
import { useLibraryWords } from "./useLibraryWords";
import { useLongPress } from "./use-long-press";
import { WordList } from "./WordList";

/** Rows rendered at first and added per «Показать ещё», so a big library does not render thousands at once. */
const PAGE_SIZE = 200;

/** The drawers' mastery lines have drawn in this visit (they draw once, not on every return). */
let linesDrawn = false;

type LibraryView = Settings["library_view"];

/**
 * Библиотека. Phones (< 768, mockups/L-Library-B «Ящики каталога»): one subline of counts that
 * doubles as quick filters, then a card-catalogue table of contents — «Все слова», «Входящие» while
 * something is unsorted, the themes as ruled drawers, «Новая тема» and the upkeep folded into one
 * row — or every word in one list (remembered on the device), and the search with «Фильтр и
 * порядок» at the bottom, above the tab bar. From 768 up: the desktop table with the detail pane
 * (LibraryDesk). The layout class is «compact» on the server and during hydration, so CSS keeps the
 * phone UI off wide screens until then.
 */
export function LibraryScreen() {
  const layout = useLayoutClass();
  const wide = layout !== "compact";
  // The module's own component (stable identity), not one made in render.
  const desk = useLibraryDesk(wide);
  if (desk) return createElement(desk, { scope: { kind: "all" } });
  // Until the desk's chunk is in, the placeholder stays where it is (same element, no restart).
  return (
    <>
      {/* A real box, not `contents`: the library ⇄ theme slide (NavSlide, L6) snapshots it. */}
      <div className="flex min-w-0 flex-1 flex-col md:hidden">{!wide && <PhoneLibrary />}</div>
      <DeskPlaceholder title="Библиотека" />
    </>
  );
}

/**
 * Everything the themes view shows, in one query, so the drawers, «Входящие» and the upkeep fold
 * arrive in the same frame instead of popping in one by one (MOTION-SPEC L1).
 */
async function getLibraryOverview() {
  const [stats, lastRun, settings] = await Promise.all([getLibraryStats(), getUndoableRun(), getSettings()]);
  const toEnrich = await countEnrichCandidates(enrichPreferences(settings));
  return { stats, lastRun, toEnrich };
}

function PhoneLibrary() {
  const ready = useAppReady();
  const bootFailed = useBootFailure().failed;
  const snackbar = useSnackbar();
  const addSheet = useAddSheetActions();
  const overview = useLiveQuery(getLibraryOverview, []);
  // Counts wait for the first-run seed, so a new device never flashes «0 слов» (L3).
  const loaded = ready && overview !== undefined ? overview : undefined;
  const stats = loaded?.stats;
  const lastRun = loaded?.lastRun;
  const toEnrich = loaded?.toEnrich;
  // The stored view, or its localStorage mirror on the first frame (L2); undefined only during
  // the server render and hydration, where neither view is drawn.
  const view: LibraryView | undefined = useSettings().settings?.library_view;
  const shape = useLibraryShape();

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [filter, setFilter] = useState<PhoneFilter>(DEFAULT_PHONE_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [enrichOpen, setEnrichOpen] = useState(false);
  const [levelOpen, setLevelOpen] = useState(false);
  const [upkeepOpen, setUpkeepOpen] = useState(false);
  // «Определить уровень языка»: counted once the dictionaries are in (before, every word looks unlevelled).
  const levels = useLevelData();
  const toLevel = useLiveQuery(async () => (levels.ready ? countLevelCandidates(levels) : null), [levels]);
  // Long press on a theme drawer: its actions, then maybe the edit form.
  const [menuFolderId, setMenuFolderId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [disbandOpen, setDisbandOpen] = useState(false);
  // Long press on «к повт.» / «трудных»: show them, or copy a request for an exercise made of them.
  const [ledgerKind, setLedgerKind] = useState<LedgerKind | null>(null);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const copyScope = useCopyScopeRequest((notice) => snackbar.show(notice));

  const searching = query.trim() !== "";
  const filtered = searching || narrows(filter);
  const listMode = filtered || view === "words";
  // The filter sheet counts what it would show, so it needs the words too.
  const words = useLibraryWords(undefined, listMode || filterOpen);
  // «Показать ещё» starts over whenever the list changes.
  const listKey = `${view}\u0001${deferredQuery}\u0001${JSON.stringify(filter)}`;
  const [page, setPage] = useState({ key: listKey, size: PAGE_SIZE });
  const shown = page.key === listKey ? page.size : PAGE_SIZE;

  const results = useMemo(() => (words ? filterPhoneWords(words.words, filter, deferredQuery) : null), [words, filter, deferredQuery]);
  // «Уровень языка» chips count every live word (D7 C: no other level statistics).
  const cefrCounts = useMemo(() => (words ? levelCounts(words.words.map((w) => w.level)) : undefined), [words]);
  const pageItems = useMemo(() => results?.slice(0, shown), [results, shown]);
  const showMore = useCallback(() => setPage({ key: listKey, size: shown + PAGE_SIZE }), [listKey, shown]);
  // «Все слова»: the rows fade in over the reserved blank, or replace the skeleton at once (L4).
  const listReveal = useRevealClass(!!results);
  // L5: while the deferred query lags, the old results stay (dimmed after 150 ms); «Ищем…» after 300 ms.
  const stale = query !== deferredQuery;
  const wait = useSearchWait(stale, filtered && (!results || stale));

  const totals = stats?.totals;
  const inbox = stats?.inbox;
  const drawersReveal = useRevealClass(!!stats);
  // The mastery lines draw in on the first view of this visit only.
  const [drawLines] = useState(() => !linesDrawn);
  useEffect(() => {
    if (stats) linesDrawn = true;
  }, [stats]);
  // Themes that just received words (sort plan applied, import added) are lit once (S5).
  const drawersRef = useRef<HTMLDivElement>(null);
  useFolderSpotlight(drawersRef, drawerSelector, stats);
  // «Разложить по темам» needs the network: offline it is disabled with the reason (B4).
  const online = useOnline();

  const undoLastRun = async () => {
    if (!lastRun) return;
    const { restored } = await undoReorgRun(lastRun.id);
    snackbar.show({ message: restored ? "Сортировка отменена" : "Отменять нечего: слова уже перемещены" });
  };

  const upkeep: ReactNode[] = [];
  if (totals && totals.total > 0) {
    if (inbox && inbox.total === 0) {
      upkeep.push(
        <UpkeepRow
          key="sort"
          ai
          caption={online ? "Все слова разложены" : "Нужна сеть: раскладка работает онлайн"}
          action="Разложить по темам"
          disabled={!online}
          onClick={() => setSortOpen(true)}
        />,
      );
    }
    if (toLevel) {
      upkeep.push(
        <UpkeepRow
          key="level"
          ai
          caption={`${toLevel} без уровня`}
          action="Определить уровень языка"
          disabled={!online}
          onClick={() => setLevelOpen(true)}
        />,
      );
    }
    if (toEnrich && toEnrich.total > 0) {
      upkeep.push(
        <UpkeepRow
          key="enrich"
          caption={enrichCaption(toEnrich)}
          ai
          action="Дополнить карточки"
          onClick={() => setEnrichOpen(true)}
        />,
      );
    }
    if (lastRun) {
      upkeep.push(
        <UpkeepRow
          key="run"
          caption={`Последняя раскладка: ${lastRun.moves.length} ${plural(lastRun.moves.length, ["перемещение", "перемещения", "перемещений"])}`}
          action="Отменить"
          onClick={() => void undoLastRun()}
        />,
      );
    }
  }
  // «Уход за карточками · уровень языка, дополнить»: only what there is to do.
  const upkeepSummary = foldSummary([
    inbox && inbox.total === 0 && "раскладка",
    !!toLevel && "уровень языка",
    !!toEnrich?.total && "дополнить",
    !!lastRun && "отмена раскладки",
  ]);

  // Remember the shape for the next visit's reserved blanks, and the themes for their pages (L6).
  const shapeNow: LibraryShape | null = stats ? { tiles: stats.folders.length, inbox: stats.inbox.total > 0, upkeep: upkeep.length } : null;
  useEffect(() => {
    if (shapeNow) rememberLibraryShape(shapeNow);
  });
  useEffect(() => {
    if (stats) rememberLibrary(stats);
  }, [stats]);

  const setView = (next: LibraryView) => void updateSettings({ library_view: next });
  const toggleStatus = (status: StatusFilter) => setFilter((f) => ({ ...f, status: f.status === status ? "all" : status }));
  const openLedgerMenu = (kind: LedgerKind) => {
    setLedgerKind(kind);
    setLedgerOpen(true);
  };
  // The subline filter in effect, while it has words: its menu is also behind the list's «⋯».
  const statusMenu: LedgerKind | null =
    filter.status === "due" && totals?.due ? "due" : filter.status === "difficult" && totals?.difficult ? "difficult" : null;

  // The live theme, so the menu follows «Закрепить» and renames.
  const menuFolder: FolderWithStats | undefined = stats?.folders.find((f) => f.id === menuFolderId);
  const openMenu = (folder: FolderWithStats) => {
    setMenuFolderId(folder.id);
    setMenuOpen(true);
  };
  const removeFolder = async (folder: FolderWithStats) => {
    setMenuOpen(false);
    try {
      const moves = await deleteFolder(folder.id);
      snackbar.show({
        message: moves.length ? `Тема «${folder.name}» удалена · ${nWords(moves.length)} во «Входящих»` : `Тема «${folder.name}» удалена`,
        actionLabel: "Отменить",
        onAction: () => void restoreFolder(folder.id, moves),
      });
    } catch (e) {
      snackbar.show({ message: e instanceof Error ? e.message : "Не получилось удалить тему" });
    }
  };

  const themeName =
    filter.theme === ALL_THEMES
      ? null
      : filter.theme === INBOX_THEME
        ? "Входящие"
        : (stats?.folders.find((f) => f.id === filter.theme)?.name ?? null);
  const emptyMessage = searching
    ? "Такого слова нет ни во французском, ни в переводе."
    : filter.status === "due"
      ? "Сегодня повторять нечего."
      : filter.status === "difficult"
        ? "Трудных слов нет."
        : filter.status === "new"
          ? "Новых слов нет."
          : filter.status === "paused"
            ? "Слов на паузе нет."
          : filter.slang.length > 0
            ? "С таким уровнем сленга слов нет."
            : "В этой теме таких слов нет.";

  return (
    <main className="flex flex-1 flex-col px-4">
      <header className="mt-4 flex h-11 shrink-0 items-center justify-between">
        <div className="flex min-w-0 items-baseline gap-2">
          <h1 className="m-0 shrink-0 font-serif text-[28px] leading-9 font-medium tracking-[-0.015em]">Библиотека</h1>
          <SyncMark />
        </div>
        {/* «Контекст» lives here on phones since 2026-10-23 (no tab of its own); ❝, since the
            magnifier is the search at the bottom. */}
        <div className="-mr-3 flex shrink-0 items-center">
          <Link
            href="/context"
            aria-label="Контекст"
            className="inline-flex size-11 items-center justify-center rounded-chip text-ink active:bg-surface-2"
          >
            <Icon name="quote" size={20} strokeWidth={1.5} />
          </Link>
          <Link
            href="/settings"
            aria-label="Настройки"
            className="inline-flex size-11 items-center justify-center rounded-chip text-ink active:bg-surface-2"
          >
            <Icon name="gear" size={20} strokeWidth={1.5} />
          </Link>
        </div>
      </header>

      {/* One subline (D2 B): the counts that need her are also the quickest filters. A count of 0 is
          left out (the filter sheet still offers it), and with nothing due or difficult so is the
          line (reserved until the counts are read); the total lives on «Все слова». */}
      {(!totals || totals.due > 0 || totals.difficult > 0) && (
        <div role="group" aria-label="Быстрый фильтр" className="mt-0.5 flex h-5 shrink-0 items-center gap-2 font-mono text-[11px] leading-5 tracking-[.06em] text-muted uppercase">
          {!!totals?.due && (
            <SublineFilter
              label={`${totals.due} к повт.`}
              ariaLabel={`К повторению: ${totals.due}`}
              attention
              pressed={filter.status === "due"}
              onClick={() => toggleStatus("due")}
              onMenu={() => openLedgerMenu("due")}
            />
          )}
          {!!totals?.due && !!totals.difficult && <span aria-hidden="true">·</span>}
          {!!totals?.difficult && (
            <SublineFilter
              label={`${totals.difficult} ${plural(totals.difficult, ["трудное", "трудных", "трудных"])}`}
              ariaLabel={`Трудные: ${totals.difficult}`}
              pressed={filter.status === "difficult"}
              onClick={() => toggleStatus("difficult")}
              onMenu={() => openLedgerMenu("difficult")}
            />
          )}
        </div>
      )}

      {listMode ? (
        <section aria-label="Слова" aria-busy={!results || undefined} className="mt-3.5 flex flex-col">
          <div className="meta flex h-8 items-center justify-between gap-2 border-b border-ink">
            <span className="min-w-0 truncate font-medium text-ink" role="status">
              {wait.searching
                ? "Ищем…"
                : !results
                  ? filtered
                    ? ""
                    : "Все слова"
                  : !filtered
                    ? `Все слова · ${results.length}`
                    : results.length
                      ? `Найдено ${nWords(results.length)}${themeName ? ` · ${themeName}` : ""}`
                      : "Ничего не найдено"}
            </span>
            {!filtered ? (
              <Button variant="tertiary" size="sm" className="-mr-1 text-[13px]" onClick={() => setView("themes")}>
                К темам
              </Button>
            ) : (
              narrows(filter) && (
                <span className="-mr-1 flex shrink-0 items-center">
                  <Button variant="tertiary" size="sm" className="text-[13px]" onClick={() => setFilter((f) => ({ ...DEFAULT_PHONE_FILTER, order: f.order }))}>
                    Сбросить фильтр
                  </Button>
                  {/* The visible way to what a held «к повт.» / «трудных» offers. */}
                  {statusMenu && (
                    <IconButton
                      icon="more"
                      label={statusMenu === "due" ? "Ещё: слова к повторению" : "Ещё: трудные слова"}
                      aria-haspopup="dialog"
                      className="-my-1.5"
                      onClick={() => openLedgerMenu(statusMenu)}
                    />
                  )}
                </span>
              )
            )}
          </div>
          {!results && (
            // Reserved list; rows only if the read is still pending at 300 ms (L4).
            <div aria-hidden="true" className="delayed-in flex flex-col">
              {Array.from({ length: 8 }, (_, i) => (
                <SkeletonRow key={i} index={i} height={64} meter fade />
              ))}
            </div>
          )}
          {/* Stale results stay in place, dimmed (L5); the new ones replace them in one frame. */}
          <div className={cx("flex flex-col", STALE_DIM, wait.dim && "opacity-50")}>
            {results && pageItems && words && (
              <WordList
                className={listReveal}
                items={pageItems}
                folders={words.folders}
                showFolder={filter.theme === ALL_THEMES}
                label={filtered ? "Найденные слова" : "Все слова"}
                moreLabel={results.length > shown ? `Показать ещё ${Math.min(PAGE_SIZE, results.length - shown)} из ${results.length - shown}` : undefined}
                onMore={showMore}
              />
            )}
            {results && results.length === 0 && !filtered && (
              <div className="mt-4 flex flex-col items-start gap-3">
                <p className="m-0 text-[15px] leading-[22px] text-muted">В библиотеке пока нет слов.</p>
                <Button variant="secondary" size="md" icon="plus" onClick={() => addSheet.open()}>
                  Добавить слово
                </Button>
              </div>
            )}
            {results && results.length === 0 && filtered && (
              <div className="mt-4 flex flex-col items-start gap-3">
                <p className="m-0 text-[15px] leading-[22px] text-muted">{emptyMessage}</p>
                {searching && (
                  <>
                    <ContextRow q={query.trim()} variant="library" className="self-stretch border-t border-t-ink" />
                    <Button variant="secondary" size="md" icon="plus" onClick={() => addSheet.open({ fr: query.trim() })}>
                      Добавить «{query.trim()}»
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        </section>
      ) : bootFailed ? (
        // First-run setup failed: say so where the drawers would be (B1).
        <BootNotice />
      ) : view === "themes" ? (
        <>
          {/* The drawer list (D2 B): «Все слова», «Входящие» while something is unsorted, the themes as
              ruled drawers, «Новая тема», and the upkeep folded into one row. Until the overview is
              read the last known number of drawers is reserved blank; skeleton rows only if the read
              is still pending at 300 ms (cold start, first-run seed) — L3. */}
          <div ref={drawersRef} aria-busy={!stats || undefined} className="mt-3.5 flex shrink-0 flex-col border-t border-ink">
            {!stats ? (
              <div className="delayed-in flex flex-col">
                <DrawerSkeleton index={3} />
                {shape.inbox && <DrawerSkeleton index={1} className="border-dashed border-boundary" />}
                {Array.from({ length: shape.tiles }, (_, i) => (
                  <DrawerSkeleton key={i} index={i} />
                ))}
              </div>
            ) : (
              <div className={cx("flex flex-col", drawersReveal)}>
                <PlainRow label="Все слова" count={totals?.total} ariaLabel={`Все слова: ${totals?.total ?? 0}`} onClick={() => setView("words")} />
                {inbox && inbox.total > 0 && (
                  // Dashed: not yet on record. ✦ «Разложить по темам» asks Claude; offline it says why.
                  <div className="flex h-[52px] shrink-0 items-center border-b border-dashed border-boundary">
                    <Link
                      href={folderHref(null)}
                      transitionTypes={NAV_FORWARD}
                      aria-label={`Входящие: ${nWords(inbox.total)} без темы, нужно разобрать`}
                      className="flex h-full min-w-0 flex-1 items-center gap-2.5 text-ink no-underline active:bg-surface-2"
                    >
                      <span className="font-serif text-[19px] leading-6 font-medium">Входящие</span>
                      <span className="font-mono text-[12px] leading-4 font-medium text-red tabular-nums">{inbox.total}</span>
                    </Link>
                    {online ? (
                      <IconButton icon="spark" label="Разложить по темам" strokeWidth={1.5} className="-mr-3" onClick={() => setSortOpen(true)} />
                    ) : (
                      <Button variant="tertiary" size="sm" disabled className="-mr-1 gap-1.5 text-[13px] no-underline disabled:text-muted disabled:opacity-100!">
                        <Icon name="cloud-off" size={15} strokeWidth={1.5} />
                        Нужна сеть
                      </Button>
                    )}
                  </div>
                )}
                {stats.folders.map((f, i) => (
                  <DrawerRow key={f.id} folder={f} index={i} draw={drawLines} onLongPress={() => openMenu(f)} />
                ))}
                <NewDrawerRow onClick={() => setCreateOpen(true)} />
                {upkeep.length > 0 && (
                  <FoldRow label="Уход за карточками" summary={upkeepSummary} rule="bottom" open={upkeepOpen} onOpenChange={setUpkeepOpen} bodyClassName="px-0.5">
                    <div className="flex flex-col pb-2">{upkeep}</div>
                  </FoldRow>
                )}
              </div>
            )}
          </div>
          {/* The fold row, reserved until the overview is read when it was there last time. */}
          {!stats && shape.upkeep > 0 && <div aria-hidden="true" className="h-11 shrink-0" />}
        </>
      ) : null}

      <div aria-hidden="true" className="h-6 shrink-0" />
      <SearchBar
        query={query}
        onQuery={setQuery}
        filterCount={sheetFilterCount(filter)}
        filterOpen={filterOpen}
        onFilter={() => setFilterOpen(true)}
      />

      <LibraryFilterSheet
        open={filterOpen}
        onOpenChange={setFilterOpen}
        value={filter}
        onChange={setFilter}
        folders={stats?.folders ?? []}
        counts={{ due: totals?.due, difficult: totals?.difficult, fresh: totals?.fresh, paused: totals?.paused }}
        levelCounts={cefrCounts}
        resultCount={results ? results.length : null}
        onShow={() => {
          if (!filtered) setView("words");
          setFilterOpen(false);
        }}
      />
      {menuFolder && (
        <>
          <FolderMenuSheet
            open={menuOpen}
            onOpenChange={setMenuOpen}
            folder={menuFolder}
            navigation
            words={menuFolder.stats.total}
            onEdit={() => {
              setMenuOpen(false);
              setEditOpen(true);
            }}
            onDisband={
              menuFolder.stats.total > 0
                ? () => {
                    setMenuOpen(false);
                    setDisbandOpen(true);
                  }
                : undefined
            }
            onDelete={() => void removeFolder(menuFolder)}
          />
          <DisbandSheet
            open={disbandOpen}
            onOpenChange={setDisbandOpen}
            folder={menuFolder}
            onDisbanded={(moves) =>
              snackbar.show({
                message: disbandMessage(menuFolder.name, moves),
                actionLabel: "Отменить",
                onAction: () => void restoreFolder(menuFolder.id, moves),
              })
            }
          />
          <FolderFormSheet
            open={editOpen}
            onOpenChange={setEditOpen}
            folder={menuFolder}
            usedColors={stats?.folders.filter((f) => f.id !== menuFolder.id).map((f) => f.color)}
          />
        </>
      )}
      <FolderFormSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        usedColors={stats?.folders.map((f) => f.color)}
        onSaved={(folder) => snackbar.show({ message: `Тема «${folder.name}» создана` })}
      />
      <LedgerMenuSheet
        open={ledgerOpen}
        onOpenChange={setLedgerOpen}
        kind={ledgerKind}
        count={ledgerKind === "due" ? (totals?.due ?? 0) : (totals?.difficult ?? 0)}
        onShow={() => {
          setLedgerOpen(false);
          if (ledgerKind) setFilter((f) => ({ ...f, status: ledgerKind }));
        }}
        onExercise={() => {
          setLedgerOpen(false);
          if (ledgerKind) void copyScope(ledgerKind);
        }}
      />
      <SortPlanSheet open={sortOpen} onOpenChange={setSortOpen} />
      <EnrichPlanSheet open={enrichOpen} onOpenChange={setEnrichOpen} />
      <LevelFillSheet open={levelOpen} onOpenChange={setLevelOpen} levels={levels} />
    </main>
  );
}

interface SublineFilterProps {
  label: string;
  ariaLabel: string;
  pressed: boolean;
  /** A red ▪ before it: something needs doing («к повт.»). */
  attention?: boolean;
  onClick: () => void;
  /** Long press, right click or the menu key: «Показать в библиотеке» / «Упражнение по ним в Claude». */
  onMenu: () => void;
}

/**
 * One count of the subline: an underlined mono word that filters the list (filled with ink when
 * on), holding it offers more (the list's «⋯» is the visible way to the same menu). 44px tall over
 * a 20px line.
 */
function SublineFilter({ label, ariaLabel, pressed, attention = false, onClick, onMenu }: SublineFilterProps) {
  const longPress = useLongPress(onMenu);
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={ariaLabel}
      onClick={onClick}
      {...longPress}
      className="-my-3 inline-flex h-11 shrink-0 items-center gap-2 bg-transparent p-0 font-mono text-[11px] leading-5 font-medium tracking-[.06em] text-ink uppercase select-none [-webkit-touch-callout:none]"
    >
      {attention && <span aria-hidden="true" className="size-1.5 shrink-0 bg-red" />}
      <span
        className={cx(
          "rounded-[2px]",
          pressed ? "-mx-1 bg-ink px-1 text-on-ink" : "underline decoration-boundary decoration-1 underline-offset-4 active:bg-surface-2",
        )}
      >
        {label}
      </span>
    </button>
  );
}

/** Theme drawers are their links: lit by the spotlight after a bulk change (S5). */
const drawerSelector = (id: string) => `a[href="${folderHref(id)}"]`;

/** One chore inside «Уход за карточками»: what it is about, and its action. `ai`: the action asks Claude (a spark before it). */
function UpkeepRow({
  caption,
  action,
  onClick,
  ai = false,
  disabled = false,
}: {
  caption: string;
  action: string;
  onClick: () => void;
  ai?: boolean;
  disabled?: boolean;
}) {
  return (
    <p className="m-0 flex min-h-11 items-center justify-between gap-3 border-b border-rule text-[13px] leading-[18px] text-muted last:border-b-0">
      <span className="min-w-0">{caption}</span>
      <Button variant="tertiary" size="sm" className="shrink-0 gap-1.5 text-[13px]" disabled={disabled} onClick={onClick}>
        {ai && <Icon name="spark" size={15} strokeWidth={1.5} className="shrink-0" />}
        {action}
      </Button>
    </p>
  );
}

interface SearchBarProps {
  query: string;
  onQuery: (query: string) => void;
  /** Sheet choices in effect, shown as a badge on the filter button. */
  filterCount: number;
  filterOpen: boolean;
  onFilter: () => void;
}

/**
 * Search and «Фильтр и порядок» at the bottom of the screen, right above the tab bar where the
 * thumb is. While typing it rides on top of the on-screen keyboard.
 */
function SearchBar({ query, onQuery, filterCount, filterOpen, onFilter }: SearchBarProps) {
  const [focused, setFocused] = useState(false);
  const viewport = useVisualViewport(focused);
  const keyboard = viewport && viewport.keyboard >= KEYBOARD_MIN ? viewport.keyboard : 0;
  return (
    <div
      data-library-search=""
      className={cx(
        "z-[3] border-t border-rule bg-paper px-4 py-3",
        keyboard ? "fixed inset-x-0 mx-auto w-full max-w-[440px]" : "sticky bottom-(--shell-bottom) -mx-4 mt-auto",
      )}
      style={keyboard ? { bottom: keyboard } : undefined}
    >
      <div className="flex h-12 items-center overflow-hidden rounded-card border border-ink bg-surface">
        <label className="flex h-full min-w-0 flex-1 items-center gap-2 pl-3 text-muted">
          <Icon name="search" size={18} />
          <input
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Поиск по FR и RU"
            aria-label="Поиск по FR и RU"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="search"
            className="h-10 min-w-0 flex-1 border-0 bg-transparent p-0 text-[16px] text-ink outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
          />
          {query && <IconButton icon="close" label="Очистить поиск" iconSize={18} onClick={() => onQuery("")} />}
        </label>
        <span aria-hidden="true" className="my-2.5 w-px self-stretch bg-rule" />
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={filterOpen}
          aria-label={filterCount > 0 ? `Фильтр и порядок, выбрано: ${filterCount}` : "Фильтр и порядок"}
          onClick={onFilter}
          className="relative flex h-full w-12 shrink-0 items-center justify-center bg-transparent text-ink active:bg-surface-2"
        >
          <Icon name="sliders" size={20} strokeWidth={1.5} />
          {filterCount > 0 && (
            <span
              aria-hidden="true"
              className="absolute top-1.5 right-2 flex size-4 items-center justify-center rounded-full bg-red font-mono text-[10px] leading-none text-on-ink"
            >
              {filterCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
