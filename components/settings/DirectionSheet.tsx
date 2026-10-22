"use client";

import { Sheet, SheetCloseButton, SheetTitle } from "@/components/ui/Sheet";
import { Icon } from "@/components/ui/Icons";
import { DIRECTION_LABELS, DIRECTION_NAMES } from "@/components/review/format";
import type { Direction } from "@/lib/types";

const OPTIONS: readonly Direction[] = ["fr_ru", "ru_fr"];

export interface DirectionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: Direction;
  onChange: (value: Direction) => void;
}

/** «Направление по умолчанию»: which side of the card is the question. */
export function DirectionSheet({ open, onOpenChange, value, onChange }: DirectionSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} height="auto">
      <div className="flex items-center justify-between pt-2 pr-1 pl-4">
        <SheetTitle>Направление</SheetTitle>
        <SheetCloseButton />
      </div>
      <div role="radiogroup" aria-label="Направление по умолчанию" className="mt-2 px-4 pb-4">
        {OPTIONS.map((d) => {
          const selected = d === value;
          return (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${DIRECTION_LABELS[d]}, ${DIRECTION_NAMES[d]}`}
              onClick={() => {
                onChange(d);
                onOpenChange(false);
              }}
              className="flex h-12 w-full items-center gap-3 border-b border-rule bg-transparent text-left active:bg-surface-2"
            >
              <span className="w-[76px] shrink-0 font-mono text-[12px] font-medium tracking-[.06em]">{DIRECTION_LABELS[d]}</span>
              <span className="min-w-0 flex-1 truncate text-[15px] text-muted">{DIRECTION_NAMES[d]}</span>
              <span className="flex w-5 shrink-0 justify-end">{selected && <Icon name="check" size={18} />}</span>
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
