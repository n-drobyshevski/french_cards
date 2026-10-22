"use client";

import { memo, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Button } from "@/components/ui/Button";
import { Collapse } from "@/components/ui/Collapse";
import { Icon } from "@/components/ui/Icons";
import { Sheet, SheetCloseButton, SheetTitle } from "@/components/ui/Sheet";
import { SlangMeter, slangAbbr } from "@/components/ui/SlangMeter";
import { useSnackbar } from "@/components/ui/Snackbar";
import { cx } from "@/components/ui/cx";
import { exitMs } from "@/lib/motion";
import { useShowOrigin } from "@/lib/use-show-origin";
import type { Folder, Word } from "@/lib/types";
import { moveWords, restoreMoves, restoreWords, softDeleteWords } from "@/lib/words";
import { posAbbr, STATUS_DOT, STATUS_LABELS } from "./format";
import { markLeaving, markReturning, useLeavingList } from "./leaving";
import { SwipeRow } from "./SwipeRow";
import { folderOptions, TargetPickerSheet } from "./TargetPickerSheet";
import type { LibraryWord } from "./useLibraryWords";
import { WordDetailSheet } from "./WordDetailSheet";

const ACTIONS_WIDTH = 160;

/**
 * Row body: status dot, French headword with its abbreviation, Russian, slang meter and «к повт.».
 * `struck`: deleted — a 1px ink line draws across the word and its translation (--dur-exit, linear).
 */
export function WordRowContent({ item, showFolder, struck = false }: { item: LibraryWord; showFolder?: boolean; struck?: boolean }) {
  const { word, schedule } = item;
  const abbr = posAbbr(word);
  const origin = useShowOrigin() ? word.origin : null;
  return (
    <span className="relative flex h-16 w-full min-w-0 items-center gap-3 border-b border-rule transition-[border-color] duration-(--dur-quick) ease-standard group-data-lifted/swipe:border-ink">
      {struck && (
        <span
          aria-hidden="true"
          data-strike=""
          className="pointer-events-none absolute top-6 right-0 left-[18px] h-px origin-left bg-ink transition-[scale] duration-(--dur-exit) ease-linear starting:scale-x-0"
        />
      )}
      <span aria-hidden="true" className={cx("size-1.5 shrink-0 rounded-full", STATUS_DOT[schedule.status])} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-baseline gap-2 whitespace-nowrap">
          <span lang="fr" className="truncate font-serif text-[19px] leading-6 font-medium">
            {word.fr}
          </span>
          {abbr && (
            <span lang="fr" className="abbr shrink-0 text-[15px] leading-5">
              {abbr}
            </span>
          )}
        </span>
        <span className="truncate text-[14px] leading-5 text-muted">
          {word.ru}
          {origin && <span className="text-muted/80"> · {origin}</span>}
          {showFolder && <span className="text-muted/80"> · {item.folder?.name ?? "Входящие"}</span>}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-2">
        <SlangMeter level={word.slang_level} verlan={word.verlan} showLabel={false} />
        <span
          className={cx(
            "font-mono text-[11px] leading-4 tracking-[.06em] uppercase",
            schedule.tone === "due" && "font-medium text-red",
            schedule.tone === "new" && "font-medium text-ink",
            schedule.tone === "later" && "text-muted",
            schedule.tone === "paused" && "text-muted",
          )}
        >
          {schedule.dueLabel}
        </span>
      </span>
    </span>
  );
}

/** Accessible row name: «la thune — бабки, деньги, arg., выучено, следующий показ через 4 д». */
export function rowLabel(item: LibraryWord, showFolder?: boolean): string {
  const { word, schedule } = item;
  const parts = [`${word.fr} — ${word.ru}`, slangAbbr(word.slang_level, word.verlan), STATUS_LABELS[schedule.status]];
  if (schedule.tone === "due") parts.push("к повторению");
  else if (schedule.tone === "later") parts.push(`следующий показ ${schedule.dueLabel}`);
  else if (schedule.tone === "paused") parts.push("на паузе");
  if (showFolder) parts.push(`тема: ${item.folder?.name ?? "Входящие"}`);
  return parts.join(", ");
}

export interface WordListProps {
  items: readonly LibraryWord[];
  folders: readonly Folder[];
  /** Show the theme name after the translation (search results across themes). */
  showFolder?: boolean;
  /** Accessible name of the list. */
  label: string;
  className?: string;
  /** More rows than shown: the «Показать ещё» button after the list, with this text. */
  moreLabel?: string;
  onMore?: () => void;
}

/** Row events, stable through a ref so the rows can be memoised. */
interface ListRowHandlers {
  setOpen: (id: string, open: boolean) => void;
  tap: (id: string) => void;
  longPress: (word: Word) => void;
  fullSwipe: (word: Word) => void;
  startMove: (word: Word) => void;
  remove: (word: Word) => void;
}

interface WordListRowProps {
  id: string;
  item: LibraryWord;
  leaving: boolean;
  returning: boolean;
  open: boolean;
  lifted: boolean;
  struck: boolean;
  showFolder?: boolean;
  handlers: RefObject<ListRowHandlers>;
}

const WordListRow = memo(function WordListRow({ id, item, leaving, returning, open, lifted, struck, showFolder, handlers }: WordListRowProps) {
  return (
    <li
      aria-hidden={leaving || undefined}
      className={cx(
        // 8px into the gutter on the left (room for the lifted card's edge), to the screen edge on the right.
        "-mr-4 -ml-2",
        !lifted && !leaving && !returning && "[contain-intrinsic-size:auto_64px] [content-visibility:auto]",
      )}
    >
      <Collapse open={!leaving} appear={returning} innerClassName={lifted ? "-mt-0.5 pt-0.5" : undefined}>
        <SwipeRow
          open={open}
          onOpenChange={(next) => handlers.current.setOpen(id, next)}
          onTap={() => handlers.current.tap(id)}
          onLongPress={() => handlers.current.longPress(item.word)}
          onFullSwipe={() => handlers.current.fullSwipe(item.word)}
          lifted={lifted}
          highlight={returning}
          label={rowLabel(item, showFolder)}
          actionsWidth={ACTIONS_WIDTH}
          actions={({ open, locked }) => (
            <>
              <button
                type="button"
                tabIndex={open ? 0 : -1}
                onClick={() => handlers.current.startMove(item.word)}
                className={cx(
                  "flex h-full shrink-0 flex-col items-center justify-center gap-1 overflow-hidden bg-surface-2 text-[12px] font-medium whitespace-nowrap text-ink transition-[flex-basis] duration-(--dur-move) ease-standard active:opacity-80",
                  locked ? "basis-0" : "basis-[88px]",
                )}
              >
                <Icon name="move" size={18} />
                Переместить
              </button>
              <button
                type="button"
                tabIndex={open ? 0 : -1}
                onClick={() => handlers.current.remove(item.word)}
                className="flex h-full min-w-[72px] flex-1 flex-col items-center justify-center gap-1 bg-again text-[12px] font-medium text-on-ink active:opacity-80"
              >
                <Icon name="trash" size={18} />
                Удалить
              </button>
            </>
          )}
        >
          <span className="flex w-full min-w-0 pr-4 pl-2">
            <WordRowContent item={item} showFolder={showFolder} struck={struck} />
          </span>
        </SwipeRow>
      </Collapse>
    </li>
  );
});

/**
 * Word rows with swipe-left actions «Переместить» / «Удалить», a long-press menu as their
 * fallback, and the word detail sheet on tap. Every change offers «Отменить».
 *
 * Rows never just vanish (§5.10, L7, L10): a deleted word is struck out, then its row closes;
 * a word moved out of this list closes; «Отменить» opens the row again and lights it (spotlight).
 */
export const WordList = memo(function WordList({ items, folders, showFolder, label, className, moreLabel, onMore }: WordListProps) {
  const snackbar = useSnackbar();
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [menuWord, setMenuWord] = useState<Word | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [moveWord, setMoveWord] = useState<Word | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  // Deleted rows, struck out until they have closed (and again unstruck by «Отменить»).
  const [struck, setStruck] = useState<ReadonlySet<string>>(() => new Set());
  // What to do once the long-press menu has finished closing (opening another sheet).
  const afterMenu = useRef<(() => void) | null>(null);
  const entries = useLeavingList(items, (item) => item.word.id);

  const strike = (id: string, on: boolean) =>
    setStruck((prev) => {
      if (prev.has(id) === on) return prev;
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const startMove = (word: Word) => {
    setOpenRow(null);
    setMoveWord(word);
    setMoveOpen(true);
  };

  const move = async (word: Word, key: string) => {
    const to = key === "inbox" ? null : key;
    // Leaving this list (a theme page, a filter): the row closes instead of vanishing.
    markLeaving([word.id]);
    try {
      const records = await moveWords([word.id], to);
      if (records.length === 0) return;
      const name = to === null ? "«Входящие»" : `«${folders.find((f) => f.id === to)?.name ?? "тему"}»`;
      snackbar.show({
        message: `${to === null ? "Перемещено во" : "Перемещено в"} ${name}`,
        actionLabel: "Отменить",
        onAction: () => {
          markReturning([word.id]);
          void restoreMoves(records);
        },
      });
    } catch (e) {
      snackbar.show({ message: e instanceof Error ? e.message : "Не получилось переместить" });
    }
  };

  /** The write: the row closes as it starts, and the snackbar comes with it. */
  const deleteNow = async (word: Word) => {
    markLeaving([word.id]);
    try {
      await softDeleteWords([word.id]);
      snackbar.show({
        message: (
          <>
            Удалено · <span lang="fr">{word.fr}</span>
          </>
        ),
        actionLabel: "Отменить",
        onAction: () => {
          markReturning([word.id]);
          strike(word.id, false);
          void restoreWords([word.id]);
        },
      });
    } catch (e) {
      strike(word.id, false);
      snackbar.show({ message: e instanceof Error ? e.message : "Не получилось удалить" });
    }
  };

  /** «Удалить»: the word is struck out (--dur-exit), then deleted and its row closes. */
  const remove = (word: Word) => {
    setOpenRow(null);
    strike(word.id, true);
    window.setTimeout(() => void deleteNow(word), exitMs());
  };

  const handlers = useRef<ListRowHandlers>(null as unknown as ListRowHandlers);
  const rowHandlers: ListRowHandlers = {
    setOpen: (id, open) => setOpenRow(open ? id : null),
    tap: (id) => {
      setOpenRow(null);
      setDetailId(id);
    },
    longPress: (word) => {
      setOpenRow(null);
      setMenuWord(word);
      setMenuOpen(true);
    },
    fullSwipe: (word) => {
      setOpenRow(null);
      void deleteNow(word);
    },
    startMove,
    remove,
  };
  useLayoutEffect(() => {
    handlers.current = rowHandlers;
  });

  return (
    <>
      <ul aria-label={label} className={cx("m-0 flex list-none flex-col p-0", className)}>
        {entries.map(({ id, item, leaving, returning }) => (
          <WordListRow
            key={id}
            id={id}
            item={item}
            leaving={leaving}
            returning={returning}
            open={openRow === id}
            lifted={menuOpen && menuWord?.id === id}
            struck={struck.has(id)}
            showFolder={showFolder}
            handlers={handlers}
          />
        ))}
      </ul>
      {moreLabel && onMore && (
        <Button variant="secondary" size="md" className="mt-3 self-start" onClick={onMore}>
          {moreLabel}
        </Button>
      )}

      <Sheet
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onClosed={() => {
          setMenuWord(null);
          const next = afterMenu.current;
          afterMenu.current = null;
          next?.();
        }}
        description="Действия со словом"
      >
        <div className="flex h-11 items-center justify-between pr-1 pl-4">
          <SheetTitle className="min-w-0 truncate">
            <span lang="fr">{menuWord?.fr}</span>
          </SheetTitle>
          <SheetCloseButton />
        </div>
        <div className="mt-2 flex flex-col px-4 pb-4">
          {[
            { key: "open", icon: "pencil" as const, label: "Открыть карточку" },
            { key: "move", icon: "move" as const, label: "Переместить в тему" },
            { key: "delete", icon: "trash" as const, label: "Удалить слово", danger: true },
          ].map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => {
                const word = menuWord;
                if (!word) return;
                if (a.key === "open") afterMenu.current = () => setDetailId(word.id);
                else if (a.key === "move") afterMenu.current = () => startMove(word);
                else afterMenu.current = () => remove(word);
                setMenuOpen(false);
              }}
              className={cx(
                "flex h-[52px] items-center gap-3 border-t border-rule bg-transparent text-left text-[15px] active:bg-surface-2",
                a.danger ? "font-medium text-again" : "text-ink",
              )}
            >
              <Icon name={a.icon} size={18} />
              {a.label}
            </button>
          ))}
        </div>
      </Sheet>

      <TargetPickerSheet
        open={moveOpen}
        onOpenChange={setMoveOpen}
        title="Переместить в тему"
        subtitle={moveWord?.fr}
        options={folderOptions(folders)}
        selectedKey={moveWord ? (moveWord.folder_id !== null && folders.some((f) => f.id === moveWord.folder_id) ? moveWord.folder_id : "inbox") : null}
        onPick={(key) => moveWord && void move(moveWord, key)}
      />

      <WordDetailSheet wordId={detailId} onClose={() => setDetailId(null)} />
    </>
  );
});
