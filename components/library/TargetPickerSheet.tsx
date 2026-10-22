"use client";

import { Icon } from "@/components/ui/Icons";
import { Sheet, SheetCloseButton, SheetTitle } from "@/components/ui/Sheet";
import { cx } from "@/components/ui/cx";
import type { Folder } from "@/lib/types";

export interface PickerOption {
  key: string;
  label: string;
  /** Muted second line, e.g. «новая тема». */
  caption?: string;
  /** Theme ink for the band; null/undefined = no band. */
  color?: string | null;
  /** Dashed swatch («Входящие», «Не перемещать»). */
  dashed?: boolean;
}

/** Folder list for «Переместить»: «Входящие» first, then themes in their order. */
export function folderOptions(folders: readonly Folder[]): PickerOption[] {
  return [
    { key: "inbox", label: "Входящие", caption: "без темы", dashed: true },
    ...folders.map((f) => ({ key: f.id, label: f.name, color: f.color })),
  ];
}

export interface TargetPickerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Muted line under the title, e.g. the word being moved. */
  subtitle?: string;
  options: readonly PickerOption[];
  selectedKey?: string | null;
  onPick: (key: string) => void;
  /** Opened from inside another sheet. */
  nested?: boolean;
}

/** Single-choice list of themes in a bottom sheet. Picking closes it. */
export function TargetPickerSheet({
  open,
  onOpenChange,
  title,
  subtitle,
  options,
  selectedKey,
  onPick,
  nested,
}: TargetPickerSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} nested={nested} description={subtitle}>
      <div className="flex h-11 shrink-0 items-center justify-between pr-1 pl-4">
        <SheetTitle className="min-w-0 truncate">{title}</SheetTitle>
        <SheetCloseButton />
      </div>
      {subtitle && (
        <p lang="fr" className="m-0 truncate px-4 font-serif text-[15px] leading-5 text-muted italic">
          {subtitle}
        </p>
      )}
      <div role="radiogroup" aria-label={title} className="mt-3 flex flex-col px-4 pb-4">
        {options.map((o) => {
          const selected = o.key === selectedKey;
          return (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                onPick(o.key);
                onOpenChange(false);
              }}
              className="flex min-h-[52px] items-center gap-3 border-t border-rule bg-transparent py-2 text-left text-ink active:bg-surface-2"
            >
              <span
                aria-hidden="true"
                className={cx("h-5 w-[3px] shrink-0", o.dashed && "w-3 border border-dashed border-muted bg-transparent")}
                style={!o.dashed && o.color ? { background: o.color } : undefined}
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-serif text-[17px] leading-6 font-medium">{o.label}</span>
                {o.caption && <span className="meta">{o.caption}</span>}
              </span>
              {selected && <Icon name="check" size={18} className="shrink-0" />}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
