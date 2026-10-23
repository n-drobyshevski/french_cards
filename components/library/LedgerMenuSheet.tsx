"use client";

import { CopyGlyph } from "@/components/exercises/RequestBuilder";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icons";
import { Sheet, SheetCloseButton, SheetTitle } from "@/components/ui/Sheet";
import { plural } from "./format";

const ROW = "flex min-h-[52px] items-center gap-3 border-t border-rule bg-transparent text-left text-[15px] text-ink active:bg-surface-2";

export type LedgerKind = "due" | "difficult";

export interface LedgerMenuSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The cell held; null keeps the last one shown while the sheet closes. */
  kind: LedgerKind | null;
  count: number;
  /** «Показать в библиотеке»: what a tap on the cell does (the filter). */
  onShow: () => void;
  /** «Упражнение по ним в Claude»: copies the request for these words. */
  onExercise: () => void;
}

function title(kind: LedgerKind | null, count: number): string {
  if (kind === "due") return `${count} к повторению`;
  return `${count} ${plural(count, ["трудное слово", "трудных слова", "трудных слов"])}`;
}

/**
 * A long press on the ledger's «к повт.» / «трудных» (Exercise-S-Entry-Library-Done): show those
 * words (the cell's tap), or copy a request for an exercise made of them. No spark: the app does
 * not call Claude, the user pastes the request into a chat.
 */
export function LedgerMenuSheet({ open, onOpenChange, kind, count, onShow, onExercise }: LedgerMenuSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} dialogWidth={440} description="Действия со словами">
      <div className="flex h-11 shrink-0 items-center justify-between pr-1 pl-4">
        <SheetTitle className="min-w-0 truncate">{title(kind, count)}</SheetTitle>
        <SheetCloseButton />
      </div>
      <div className="mt-2 flex flex-col px-4 pb-4">
        <button type="button" onClick={onShow} className={ROW}>
          <Icon name="sliders" size={18} strokeWidth={1.5} className="shrink-0" />
          Показать в библиотеке
        </button>
        <button type="button" onClick={onExercise} aria-describedby="ledger-exercise-caption" className={cx(ROW, "border-b py-2")}>
          <CopyGlyph className="shrink-0" />
          <span className="flex min-w-0 flex-col">
            <span className="leading-5">Упражнение по ним в Claude</span>
            <span id="ledger-exercise-caption" className="text-[12px] leading-4 text-muted">
              Скопируем запрос — вставьте его в чат, набор придёт в «Упражнения».
            </span>
          </span>
        </button>
      </div>
    </Sheet>
  );
}
