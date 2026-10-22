"use client";

import { useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icons";
import { Sheet, SheetCloseButton, SheetTitle } from "@/components/ui/Sheet";
import { SlangMeter, slangAbbr } from "@/components/ui/SlangMeter";
import { useSnackbar } from "@/components/ui/Snackbar";
import { cx } from "@/components/ui/cx";
import type { Folder, Word } from "@/lib/types";
import { moveWords, restoreMoves, restoreWords, softDeleteWords } from "@/lib/words";
import { posAbbr, STATUS_DOT, STATUS_LABELS } from "./format";
import { SwipeRow } from "./SwipeRow";
import { folderOptions, TargetPickerSheet } from "./TargetPickerSheet";
import type { LibraryWord } from "./useLibraryWords";
import { WordDetailSheet } from "./WordDetailSheet";

const ACTIONS_WIDTH = 160;

/** Row body: status dot, French headword with its abbreviation, Russian, slang meter and «к повт.». */
export function WordRowContent({ item, showFolder }: { item: LibraryWord; showFolder?: boolean }) {
  const { word, schedule } = item;
  const abbr = posAbbr(word);
  return (
    <span className="flex h-16 w-full min-w-0 items-center gap-3 border-b border-rule">
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
  footer?: ReactNode;
}

/**
 * Word rows with swipe-left actions «Переместить» / «Удалить», a long-press menu as their
 * fallback, and the word detail sheet on tap. Every change offers «Отменить».
 */
export function WordList({ items, folders, showFolder, label, className, footer }: WordListProps) {
  const snackbar = useSnackbar();
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [menuWord, setMenuWord] = useState<Word | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [moveWord, setMoveWord] = useState<Word | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  // What to do once the long-press menu has finished closing (opening another sheet).
  const afterMenu = useRef<(() => void) | null>(null);

  const startMove = (word: Word) => {
    setOpenRow(null);
    setMoveWord(word);
    setMoveOpen(true);
  };

  const move = async (word: Word, key: string) => {
    const to = key === "inbox" ? null : key;
    try {
      const records = await moveWords([word.id], to);
      if (records.length === 0) return;
      const name = to === null ? "«Входящие»" : `«${folders.find((f) => f.id === to)?.name ?? "тему"}»`;
      snackbar.show({
        message: `${to === null ? "Перемещено во" : "Перемещено в"} ${name}`,
        actionLabel: "Отменить",
        onAction: () => void restoreMoves(records),
      });
    } catch (e) {
      snackbar.show({ message: e instanceof Error ? e.message : "Не получилось переместить" });
    }
  };

  const remove = async (word: Word) => {
    setOpenRow(null);
    try {
      await softDeleteWords([word.id]);
      snackbar.show({
        message: (
          <>
            Удалено · <span lang="fr">{word.fr}</span>
          </>
        ),
        actionLabel: "Отменить",
        onAction: () => void restoreWords([word.id]),
      });
    } catch (e) {
      snackbar.show({ message: e instanceof Error ? e.message : "Не получилось удалить" });
    }
  };

  return (
    <>
      <ul aria-label={label} className={cx("m-0 flex list-none flex-col p-0", className)}>
        {items.map((item) => (
          <li key={item.word.id} className="-mr-4 [contain-intrinsic-size:auto_64px] [content-visibility:auto]">
            <SwipeRow
              open={openRow === item.word.id}
              onOpenChange={(open) => setOpenRow(open ? item.word.id : null)}
              onTap={() => {
                setOpenRow(null);
                setDetailId(item.word.id);
              }}
              onLongPress={() => {
                setOpenRow(null);
                setMenuWord(item.word);
                setMenuOpen(true);
              }}
              label={rowLabel(item, showFolder)}
              actionsWidth={ACTIONS_WIDTH}
              actions={({ open }) => (
                <>
                  <button
                    type="button"
                    tabIndex={open ? 0 : -1}
                    onClick={() => startMove(item.word)}
                    className="flex h-full w-[88px] flex-col items-center justify-center gap-1 bg-surface-2 text-[12px] font-medium text-ink active:opacity-80"
                  >
                    <Icon name="move" size={18} />
                    Переместить
                  </button>
                  <button
                    type="button"
                    tabIndex={open ? 0 : -1}
                    onClick={() => void remove(item.word)}
                    className="flex h-full w-[72px] flex-col items-center justify-center gap-1 bg-again text-[12px] font-medium text-on-ink active:opacity-80"
                  >
                    <Icon name="trash" size={18} />
                    Удалить
                  </button>
                </>
              )}
            >
              <span className="flex w-full min-w-0 pr-4">
                <WordRowContent item={item} showFolder={showFolder} />
              </span>
            </SwipeRow>
          </li>
        ))}
      </ul>
      {footer}

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
                else void remove(word);
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
}
