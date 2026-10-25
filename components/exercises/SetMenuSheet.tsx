"use client";

import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icons";
import { Sheet, SheetCloseButton, SheetTitle } from "@/components/ui/Sheet";
import { setLevelLabel } from "@/lib/core/exercises";
import type { ExerciseSet } from "@/lib/types";
import { CopyGlyph } from "./RequestBuilder";

const ROW = "flex h-[52px] items-center gap-3 border-t border-rule bg-transparent text-left text-[15px] active:bg-surface-2";

export interface SetMenuSheetProps {
  /** The set the menu is for; null keeps the last one shown while the sheet closes. */
  set: ExerciseSet | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** «Продолжить» in place of «Начать» while the set has an unfinished run. */
  resumable?: boolean;
  onStart: () => void;
  onCopySimilar: () => void;
  onDelete: () => void;
}

/**
 * A long press (or right click) on a set tile: Начать / Скопировать запрос на похожий / Удалить (with
 * undo). The set's level sits by the title («УРОВЕНЬ ≈B1»): a played tile shows its ticks instead.
 */
export function SetMenuSheet({ set, open, onOpenChange, resumable = false, onStart, onCopySimilar, onDelete }: SetMenuSheetProps) {
  const level = set ? setLevelLabel(set) : null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange} dialogWidth={440} description="Действия с набором">
      <div className="flex h-11 shrink-0 items-center justify-between pr-1 pl-4 md:mt-2 md:pl-6">
        <SheetTitle className="min-w-0 truncate">{set?.title ?? "Набор"}</SheetTitle>
        {level && <span className="meta ml-auto shrink-0 pl-3 leading-4">Уровень {level}</span>}
        <SheetCloseButton />
      </div>
      <div className="mt-2 flex flex-col px-4 pb-4 md:px-6 md:pb-6">
        <button type="button" onClick={onStart} className={cx(ROW, "text-ink")}>
          <Icon name="chevron-right" size={18} />
          {resumable ? "Продолжить" : "Начать"}
        </button>
        <button type="button" onClick={onCopySimilar} className={cx(ROW, "text-ink")}>
          <CopyGlyph />
          Скопировать запрос на похожий
        </button>
        <button type="button" onClick={onDelete} className={cx(ROW, "font-medium text-again")}>
          <Icon name="trash" size={18} />
          Удалить
        </button>
      </div>
    </Sheet>
  );
}
