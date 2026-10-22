"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Sheet, SheetCloseButton, SheetTitle } from "@/components/ui/Sheet";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icons";
import { getLibraryStats, type FolderStats } from "@/lib/folders";
import type { FolderChoice } from "./filter";

interface Option {
  value: FolderChoice;
  name: string;
  stats: FolderStats | undefined;
}

export interface FolderPickerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: FolderChoice;
  onChange: (value: FolderChoice) => void;
}

function statsLine(stats: FolderStats | undefined): string {
  if (!stats) return "";
  return stats.due > 0 ? `${stats.total} · ${stats.due} к повт.` : String(stats.total);
}

/** «Все темы ▾» picker: every theme with its word and due counts. */
export function FolderPickerSheet({ open, onOpenChange, value, onChange }: FolderPickerSheetProps) {
  const lib = useLiveQuery(() => (open ? getLibraryStats() : undefined), [open]);

  const options: Option[] = [{ value: "all", name: "Все темы", stats: lib?.totals }];
  if (!lib || lib.inbox.total > 0 || value === "inbox") options.push({ value: "inbox", name: "Входящие", stats: lib?.inbox });
  for (const f of lib?.folders ?? []) options.push({ value: f.id, name: f.name, stats: f.stats });

  return (
    <Sheet open={open} onOpenChange={onOpenChange} height="auto">
      <div className="flex items-center justify-between pt-2 pr-1 pl-4">
        <SheetTitle>Темы</SheetTitle>
        <SheetCloseButton />
      </div>
      <div role="radiogroup" aria-label="Тема для повторения" className="mt-2 px-4 pb-4">
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                onChange(o.value);
                onOpenChange(false);
              }}
              className="flex h-12 w-full items-center gap-3 border-b border-rule bg-transparent text-left active:bg-surface-2"
            >
              <span className={cx("min-w-0 flex-1 truncate font-serif text-[19px] leading-6", selected ? "font-medium" : "")}>
                {o.name}
              </span>
              <span className={cx("meta shrink-0", o.stats && o.stats.due > 0 && "text-ink")}>{statsLine(o.stats)}</span>
              <span className="flex w-5 shrink-0 justify-end">{selected && <Icon name="check" size={18} />}</span>
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
