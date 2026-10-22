"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { useAddSheet } from "@/components/providers/AddSheetContext";
import { useAppReady } from "@/components/providers/AppProviders";
import { Button, IconButton } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icons";
import { KEYBOARD_MIN, useVisualViewport } from "@/components/ui/Sheet";
import { useSnackbar } from "@/components/ui/Snackbar";
import { countEnrichCandidates, enrichPreferences } from "@/lib/enrich";
import { deleteFolder, getLibraryStats, restoreFolder, type FolderWithStats } from "@/lib/folders";
import { getSettings, updateSettings } from "@/lib/settings";
import type { Settings } from "@/lib/types";
import { getUndoableRun, undoReorgRun } from "@/lib/reorg";
import { useLayoutClass } from "@/lib/use-media";
import { DeskPlaceholder } from "./DeskPlaceholder";
import { DisbandSheet, disbandMessage } from "./DisbandSheet";
import { EnrichPlanSheet } from "./EnrichPlanSheet";
import { FolderFormSheet } from "./FolderFormSheet";
import { FolderMenuSheet } from "./FolderMenuSheet";
import { FolderTile, NewFolderTile, TileSkeleton } from "./FolderTile";
import { folderHref, nWords, plural } from "./format";
import { LibraryDesk } from "./LibraryDesk";
import { LibraryFilterSheet } from "./LibraryFilterSheet";
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
import { useLibraryWords } from "./useLibraryWords";
import { WordList } from "./WordList";

/** Rows rendered at first and added per «Показать ещё», so a big library does not render thousands at once. */
const PAGE_SIZE = 200;

type LibraryView = Settings["library_view"];

/**
 * Библиотека. Phones (< 768, mockups: Library «C · Под пальцем»): a ledger strip of counts that
 * doubles as quick filters, «Входящие» when something is unsorted, theme tiles with their newest
 * words or every word in one list (remembered on the device), and the search with «Фильтр и
 * порядок» at the bottom, above the tab bar. From 768 up: the desktop table with the detail pane
 * (LibraryDesk). The layout class is «compact» on the server and during hydration, so CSS keeps the
 * phone UI off wide screens until then.
 */
export function LibraryScreen() {
  const layout = useLayoutClass();
  if (layout !== "compact") return <LibraryDesk scope={{ kind: "all" }} />;
  return (
    <>
      <div className="contents md:hidden">
        <PhoneLibrary />
      </div>
      <DeskPlaceholder title="Библиотека" />
    </>
  );
}

function PhoneLibrary() {
  const ready = useAppReady();
  const snackbar = useSnackbar();
  const addSheet = useAddSheet();
  const stats = useLiveQuery(() => getLibraryStats(), []);
  const settings = useLiveQuery(getSettings);
  const view: LibraryView = settings?.library_view ?? "themes";
  const lastRun = useLiveQuery(() => getUndoableRun(), []);
  const toEnrich = useLiveQuery(async () => countEnrichCandidates(enrichPreferences(await getSettings())), []);

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [filter, setFilter] = useState<PhoneFilter>(DEFAULT_PHONE_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [enrichOpen, setEnrichOpen] = useState(false);
  // Long press on a theme tile: its actions, then maybe the edit form.
  const [menuFolderId, setMenuFolderId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [disbandOpen, setDisbandOpen] = useState(false);

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

  const totals = stats?.totals;
  const inbox = stats?.inbox;
  const loading = !stats || !ready;

  const setView = (next: LibraryView) => void updateSettings({ library_view: next });
  const toggleStatus = (status: StatusFilter) => setFilter((f) => ({ ...f, status: f.status === status ? "all" : status }));
  const onAllWords = () => {
    if (filter.status !== "all") {
      setFilter((f) => ({ ...f, status: "all" }));
      setView("words");
    } else {
      setView(view === "words" ? "themes" : "words");
    }
  };

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

  const undoLastRun = async () => {
    if (!lastRun) return;
    const { restored } = await undoReorgRun(lastRun.id);
    snackbar.show({ message: restored ? "Сортировка отменена" : "Отменять нечего: слова уже перемещены" });
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
          : filter.slang.length > 0
            ? "С таким уровнем сленга слов нет."
            : "В этой теме таких слов нет.";

  return (
    <main className="flex flex-1 flex-col px-4">
      <header className="mt-4 flex h-11 shrink-0 items-center justify-between">
        <h1 className="m-0 font-serif text-[28px] leading-9 font-medium tracking-[-0.015em]">Библиотека</h1>
        <Link
          href="/settings"
          aria-label="Настройки"
          className="-mr-3 inline-flex size-11 items-center justify-center rounded-chip text-ink active:bg-surface-2"
        >
          <Icon name="gear" size={20} strokeWidth={1.5} />
        </Link>
      </header>

      {/* Ledger strip: the counts are also the quickest filters */}
      <div role="group" aria-label="Быстрый фильтр" className="mt-3 grid shrink-0 grid-cols-3 overflow-hidden rounded-card border border-rule bg-surface">
        <LedgerCell
          value={totals?.total}
          label={plural(totals?.total ?? 0, ["слово", "слова", "слов"])}
          ariaLabel={`Все слова: ${totals?.total ?? 0}`}
          pressed={view === "words" && filter.status === "all"}
          onClick={onAllWords}
        />
        <LedgerCell
          value={totals?.due}
          label="к повт."
          ariaLabel={`К повторению: ${totals?.due ?? 0}`}
          attention={!!totals?.due}
          pressed={filter.status === "due"}
          onClick={() => toggleStatus("due")}
        />
        <LedgerCell
          value={totals?.difficult}
          label={plural(totals?.difficult ?? 0, ["трудное", "трудных", "трудных"])}
          ariaLabel={`Трудные: ${totals?.difficult ?? 0}`}
          pressed={filter.status === "difficult"}
          onClick={() => toggleStatus("difficult")}
        />
      </div>

      {listMode ? (
        <section aria-label="Слова" className="mt-5 flex flex-col">
          <div className="meta flex h-8 items-center justify-between border-b border-ink">
            <span className="font-medium text-ink" role="status">
              {!results
                ? filtered
                  ? "Ищем…"
                  : "Загружаем…"
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
                <Button variant="tertiary" size="sm" className="-mr-1 text-[13px]" onClick={() => setFilter((f) => ({ ...DEFAULT_PHONE_FILTER, order: f.order }))}>
                  Сбросить фильтр
                </Button>
              )
            )}
          </div>
          {results && words && (
            <WordList
              items={results.slice(0, shown)}
              folders={words.folders}
              showFolder={filter.theme === ALL_THEMES}
              label={filtered ? "Найденные слова" : "Все слова"}
              footer={
                results.length > shown ? (
                  <Button
                    variant="secondary"
                    size="md"
                    className="mt-3 self-start"
                    onClick={() => setPage({ key: listKey, size: shown + PAGE_SIZE })}
                  >
                    Показать ещё {Math.min(PAGE_SIZE, results.length - shown)} из {results.length - shown}
                  </Button>
                ) : null
              }
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
                <Button variant="secondary" size="md" icon="plus" onClick={() => addSheet.open({ fr: query.trim() })}>
                  Добавить «{query.trim()}»
                </Button>
              )}
            </div>
          )}
        </section>
      ) : (
        <>
          {/* «Входящие»: only while something is unsorted */}
          {inbox && inbox.total > 0 && (
            <div className="mt-2 flex h-12 shrink-0 items-center gap-2 rounded-card border border-dashed border-muted pr-1 pl-3">
              <Link
                href={folderHref(null)}
                aria-label={`Входящие: ${nWords(inbox.total)} без темы, нужно разобрать`}
                className="flex h-full min-w-0 flex-1 items-center gap-2 text-[14px] leading-5 text-ink no-underline"
              >
                Входящие
                <span aria-hidden="true" className="text-muted">
                  ·
                </span>
                <span className="meta font-medium text-red">{inbox.total} без темы</span>
              </Link>
              <Button variant="tertiary" size="sm" className="text-[13px] no-underline" onClick={() => setSortOpen(true)}>
                Разложить
                <Icon name="chevron-right" size={16} />
              </Button>
            </div>
          )}

          {/* Themes */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            {loading ? (
              Array.from({ length: 6 }, (_, i) => <TileSkeleton key={i} tall />)
            ) : (
              <>
                <button
                  type="button"
                  aria-label={`Все слова одним списком: ${totals?.total ?? 0}`}
                  onClick={() => setView("words")}
                  className="col-span-2 flex h-16 items-center gap-3 rounded-card bg-ink px-3 text-left text-on-ink active:opacity-90"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-serif text-[19px] leading-6 font-medium">Все слова</span>
                    <span className="font-mono text-[11px] leading-4 tracking-[.06em] uppercase opacity-80">
                      {totals?.total ?? 0} · одним списком
                    </span>
                  </span>
                  <Icon name="chevron-right" size={18} />
                </button>
                {stats.folders.map((f) => (
                  <FolderTile key={f.id} folder={f} samples onLongPress={() => openMenu(f)} />
                ))}
                <NewFolderTile tall onClick={() => setCreateOpen(true)} />
              </>
            )}
          </div>

          {/* Card upkeep: quiet rows under the themes */}
          {totals && totals.total > 0 && (
            <div className="mt-6 flex flex-col border-t border-ink">
              {inbox && inbox.total === 0 && (
                <UpkeepRow caption="Все слова разложены" action="Разложить по темам" onClick={() => setSortOpen(true)} />
              )}
              {toEnrich && toEnrich.total > 0 && (
                <UpkeepRow
                  caption={toEnrich.noExample > 0 ? `${nWords(toEnrich.noExample)} без примера` : `Уровень сленга для ${nWords(toEnrich.total)}`}
                  action="Дополнить карточки"
                  onClick={() => setEnrichOpen(true)}
                />
              )}
              {lastRun && (
                <UpkeepRow
                  caption={`Последняя раскладка: ${lastRun.moves.length} ${plural(lastRun.moves.length, ["перемещение", "перемещения", "перемещений"])}`}
                  action="Отменить"
                  onClick={() => void undoLastRun()}
                />
              )}
            </div>
          )}
        </>
      )}

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
        counts={{ due: totals?.due, difficult: totals?.difficult, fresh: totals?.fresh }}
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
      <SortPlanSheet open={sortOpen} onOpenChange={setSortOpen} />
      <EnrichPlanSheet open={enrichOpen} onOpenChange={setEnrichOpen} />
    </main>
  );
}

interface LedgerCellProps {
  value: number | undefined;
  label: string;
  ariaLabel: string;
  pressed: boolean;
  /** Red number: something needs doing («к повт.»). */
  attention?: boolean;
  onClick: () => void;
}

/** One count of the ledger strip; pressing it filters the list (ink when on). */
function LedgerCell({ value, label, ariaLabel, pressed, attention = false, onClick }: LedgerCellProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={ariaLabel}
      onClick={onClick}
      className={cx(
        "flex h-16 flex-col items-start justify-center gap-0.5 border-l border-rule px-3 text-left first:border-l-0",
        pressed ? "bg-ink text-on-ink" : "bg-transparent text-ink active:bg-surface-2",
      )}
    >
      <span className={cx("font-serif text-[26px] leading-7 font-medium", !pressed && attention && "text-red")}>{value ?? "–"}</span>
      <span className={cx("font-mono text-[11px] leading-4 tracking-[.06em] uppercase", pressed ? "opacity-80" : "text-muted")}>{label}</span>
    </button>
  );
}

function UpkeepRow({ caption, action, onClick }: { caption: string; action: string; onClick: () => void }) {
  return (
    <p className="m-0 flex min-h-11 items-center justify-between gap-3 border-b border-rule text-[13px] leading-[18px] text-muted">
      <span className="min-w-0">{caption}</span>
      <Button variant="tertiary" size="sm" className="shrink-0 text-[13px]" onClick={onClick}>
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
        "z-[3] border-t border-rule bg-paper px-4 py-2.5",
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
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={filterOpen}
          aria-label={filterCount > 0 ? `Фильтр и порядок, выбрано: ${filterCount}` : "Фильтр и порядок"}
          onClick={onFilter}
          className="relative flex h-full w-[52px] shrink-0 items-center justify-center border-l border-rule bg-transparent text-ink active:bg-surface-2"
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
