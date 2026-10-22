"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useDeferredValue, useId, useMemo, useState } from "react";
import { useAddSheet } from "@/components/providers/AddSheetContext";
import { useAppReady } from "@/components/providers/AppProviders";
import { Button, IconButton } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icons";
import { Segmented } from "@/components/ui/Segmented";
import { useSnackbar } from "@/components/ui/Snackbar";
import { countEnrichCandidates, enrichPreferences } from "@/lib/enrich";
import { getLibraryStats } from "@/lib/folders";
import { getSettings, updateSettings } from "@/lib/settings";
import type { Settings } from "@/lib/types";
import { getUndoableRun, undoReorgRun } from "@/lib/reorg";
import { matchesSearch } from "@/lib/text";
import { FolderFormSheet } from "./FolderFormSheet";
import { FolderTile, InboxTile, NewFolderTile, TileSkeleton } from "./FolderTile";
import { nWords, plural } from "./format";
import { matchesSlang, SlangFilterChip, SlangFilterPanel, type SlangKey } from "./SlangFilter";
import { EnrichPlanSheet } from "./EnrichPlanSheet";
import { SortPlanSheet } from "./SortPlanSheet";
import { useLibraryWords } from "./useLibraryWords";
import { DeskPlaceholder } from "./DeskPlaceholder";
import { LibraryDesk } from "./LibraryDesk";
import { useLayoutClass } from "@/lib/use-media";
import { WordList } from "./WordList";

type StatusFilter = "all" | "due" | "difficult";

/** Rows rendered at first and added per «Показать ещё», so a big library does not render thousands at once. */
const PAGE_SIZE = 200;

type LibraryView = Settings["library_view"];

const VIEW_OPTIONS = [
  { value: "themes", label: "Темы" },
  { value: "words", label: "Все слова" },
] as const;

/**
 * Библиотека. Phones (< 768): counts, search, filters, and two views: theme tiles («Разложить по
 * темам») or every word in one list, remembered on the device. From 768 up: the desktop table with
 * the detail pane (LibraryDesk). The layout class is «compact» on the server and during hydration,
 * so CSS keeps the phone UI off wide screens until then.
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
  const slangPanelId = useId();
  const stats = useLiveQuery(() => getLibraryStats(), []);
  const settings = useLiveQuery(getSettings);
  const view: LibraryView = settings?.library_view ?? "themes";
  const lastRun = useLiveQuery(() => getUndoableRun(), []);
  const toEnrich = useLiveQuery(async () => countEnrichCandidates(enrichPreferences(await getSettings())), []);

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [slang, setSlang] = useState<SlangKey[]>([]);
  const [slangOpen, setSlangOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [enrichOpen, setEnrichOpen] = useState(false);

  const filtered = query.trim() !== "" || status !== "all" || slang.length > 0;
  const listMode = filtered || view === "words";
  const words = useLibraryWords(undefined, listMode);
  // «Показать ещё» starts over whenever the list changes.
  const listKey = `${view}\u0001${deferredQuery}\u0001${status}\u0001${slang.join(",")}`;
  const [page, setPage] = useState({ key: listKey, size: PAGE_SIZE });
  const shown = page.key === listKey ? page.size : PAGE_SIZE;

  const results = useMemo(() => {
    if (!words) return null;
    return words.words.filter(
      (item) =>
        (status !== "due" || item.schedule.due) &&
        (status !== "difficult" || item.schedule.status === "difficult") &&
        matchesSlang(item.word, slang) &&
        matchesSearch(item.word, deferredQuery),
    );
  }, [words, status, slang, deferredQuery]);

  const totals = stats?.totals;
  const inbox = stats?.inbox;
  const loading = !stats || !ready;

  const undoLastRun = async () => {
    if (!lastRun) return;
    const { restored } = await undoReorgRun(lastRun.id);
    snackbar.show({ message: restored ? "Сортировка отменена" : "Отменять нечего: слова уже перемещены" });
  };

  return (
    <main className="flex flex-1 flex-col px-4 pb-6">
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
      <p className="meta m-0 min-h-4">
        {totals && (
          <>
            {nWords(totals.total)}
            {totals.due > 0 && (
              <>
                {" · "}
                <span className="font-medium text-ink">{totals.due} к повторению</span>
              </>
            )}
          </>
        )}
      </p>

      {/* Search */}
      <label className="mt-4 flex h-11 shrink-0 items-center gap-2 rounded-chip border border-rule bg-surface pl-3 text-muted focus-within:border-ink">
        <Icon name="search" size={18} />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по FR и RU"
          aria-label="Поиск по FR и RU"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="search"
          className="h-10 min-w-0 flex-1 border-0 bg-transparent p-0 text-[15px] text-ink outline-none placeholder:text-muted pointer-coarse:text-[16px] [&::-webkit-search-cancel-button]:hidden"
        />
        {query && <IconButton icon="close" label="Очистить поиск" iconSize={18} onClick={() => setQuery("")} />}
      </label>

      {/* Filters: the row scrolls and bleeds into the right gutter */}
      <div
        role="group"
        aria-label="Фильтр"
        className="-mr-4 mt-3 flex shrink-0 items-center gap-1 overflow-x-auto py-[7px] pr-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <Chip
          selected={status === "all" && slang.length === 0}
          onClick={() => {
            setStatus("all");
            setSlang([]);
            setSlangOpen(false);
          }}
        >
          Все
        </Chip>
        <Chip selected={status === "due"} count={totals?.due} onClick={() => setStatus(status === "due" ? "all" : "due")}>
          К повторению
        </Chip>
        <Chip
          selected={status === "difficult"}
          count={totals?.difficult}
          onClick={() => setStatus(status === "difficult" ? "all" : "difficult")}
        >
          Трудные
        </Chip>
        <SlangFilterChip value={slang} onChange={setSlang} open={slangOpen} onOpenChange={setSlangOpen} panelId={slangPanelId} />
      </div>
      <SlangFilterPanel id={slangPanelId} value={slang} onChange={setSlang} open={slangOpen} onOpenChange={setSlangOpen} />

      {/* View: theme tiles or every word; a search or filter always shows the matching words */}
      {!filtered && (
        <Segmented
          options={VIEW_OPTIONS}
          value={view}
          onChange={(next) => void updateSettings({ library_view: next })}
          ariaLabel="Показывать"
          className="mt-3"
        />
      )}

      {listMode ? (
        <section aria-label="Слова" className="mt-6 flex flex-col">
          <div className="meta flex items-baseline justify-between border-b border-ink pb-2">
            <span className="font-medium text-ink" role="status">
              {!results
                ? filtered
                  ? "Ищем…"
                  : "Загружаем…"
                : !filtered
                  ? `Все слова · ${results.length}`
                  : results.length
                    ? `Найдено ${nWords(results.length)}`
                    : "Ничего не найдено"}
            </span>
            <span>Уровень · показ</span>
          </div>
          {results && words && (
            <WordList
              items={results.slice(0, shown)}
              folders={words.folders}
              showFolder
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
              <p className="m-0 text-[15px] leading-[22px] text-muted">
                {query.trim()
                  ? "Такого слова нет ни во французском, ни в переводе."
                  : status === "due"
                    ? "Сегодня повторять нечего."
                    : status === "difficult"
                      ? "Трудных слов нет."
                      : "С таким уровнем сленга слов нет."}
              </p>
              {query.trim() && (
                <Button variant="secondary" size="md" icon="plus" onClick={() => addSheet.open({ fr: query.trim() })}>
                  Добавить «{query.trim()}»
                </Button>
              )}
            </div>
          )}
        </section>
      ) : (
        <>
          {/* Re-sort entry: a plain secondary row */}
          {totals && totals.total > 0 && (
            <button
              type="button"
              onClick={() => setSortOpen(true)}
              className="mt-4 flex h-14 shrink-0 items-center gap-3 rounded-card border border-ink bg-surface pr-3 pl-4 text-left text-ink active:bg-surface-2"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[15px] leading-5 font-medium">Разложить по темам</span>
                <span className="text-[12px] leading-4 text-muted">
                  {inbox && inbox.total > 0 ? `${nWords(inbox.total)} без темы` : "Все слова разложены"}
                </span>
              </span>
              <Icon name="chevron-right" size={18} />
            </button>
          )}
          {toEnrich && toEnrich.total > 0 && (
            <button
              type="button"
              onClick={() => setEnrichOpen(true)}
              className="mt-2 flex h-14 shrink-0 items-center gap-3 rounded-card border border-rule bg-surface pr-3 pl-4 text-left text-ink active:bg-surface-2"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[15px] leading-5 font-medium">Дополнить карточки</span>
                <span className="text-[12px] leading-4 text-muted">
                  {toEnrich.noExample > 0 ? `${nWords(toEnrich.noExample)} без примера` : `Уровень сленга для ${nWords(toEnrich.total)}`}
                </span>
              </span>
              <Icon name="chevron-right" size={18} />
            </button>
          )}
          {lastRun && (
            <p className="m-0 mt-2 flex items-center justify-between gap-2 text-[12px] leading-4 text-muted">
              <span>
                Последняя раскладка: {lastRun.moves.length}{" "}
                {plural(lastRun.moves.length, ["перемещение", "перемещения", "перемещений"])}
              </span>
              <Button variant="tertiary" size="sm" className="text-[12px]" onClick={() => void undoLastRun()}>
                Отменить
              </Button>
            </p>
          )}

          {/* Themes */}
          <div className="meta mt-6 flex items-baseline justify-between border-t border-ink pt-2">
            <span className="font-medium text-ink">Темы</span>
            {stats && totals && inbox && (
              <span>
                {stats.folders.length} {plural(stats.folders.length, ["тема", "темы", "тем"])} · {nWords(totals.total - inbox.total)}
              </span>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {loading ? (
              Array.from({ length: 6 }, (_, i) => <TileSkeleton key={i} />)
            ) : (
              <>
                {inbox && inbox.total > 0 && <InboxTile stats={inbox} />}
                {stats.folders.map((f) => (
                  <FolderTile key={f.id} folder={f} />
                ))}
                <NewFolderTile onClick={() => setCreateOpen(true)} />
              </>
            )}
          </div>
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
