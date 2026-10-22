"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icons";
import { Sheet, SheetCloseButton, SheetTitle } from "@/components/ui/Sheet";
import { cx } from "@/components/ui/cx";
import type { Folder, SlangLevel } from "@/lib/types";
import { nWords } from "./format";
import {
  ALL_THEMES,
  DEFAULT_PHONE_FILTER,
  INBOX_THEME,
  ORDER_OPTIONS,
  type PhoneFilter,
  type StatusFilter,
} from "./phone-filter";
import { SLANG_KEYS, slangKeyLabel, type SlangKey } from "./SlangFilter";

export interface LibraryFilterCounts {
  due?: number;
  difficult?: number;
  fresh?: number;
  paused?: number;
}

export interface LibraryFilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: PhoneFilter;
  onChange: (value: PhoneFilter) => void;
  folders: readonly Folder[];
  counts: LibraryFilterCounts;
  /** Words the current filter and search leave; null while counting. */
  resultCount: number | null;
  /** «Показать N слов»: closes the sheet and shows the list. */
  onShow: () => void;
}

function Group({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-5 first:mt-2">
      <h3 id={id} className="meta m-0 mb-1 font-medium">
        {label}
      </h3>
      {children}
    </section>
  );
}

/** The slang meter's four segments, decorative (the chip text names the level). */
function Segments({ level, selected }: { level: SlangLevel; selected: boolean }) {
  const fill = selected ? "bg-on-ink" : level === 3 ? "bg-red" : "bg-ink";
  return (
    <span aria-hidden="true" className="inline-flex items-center gap-[2px]">
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className={cx("h-[2px] w-2", i <= level ? fill : selected ? "bg-on-ink/35" : "bg-rule")} />
      ))}
    </span>
  );
}

/**
 * «Фильтр и порядок» (phone library): status, slang levels, theme and order in one sheet. Every
 * choice applies at once; the footer shows how many words are left.
 */
export function LibraryFilterSheet({ open, onOpenChange, value, onChange, folders, counts, resultCount, onShow }: LibraryFilterSheetProps) {
  const set = (patch: Partial<PhoneFilter>) => onChange({ ...value, ...patch });
  const toggleSlang = (k: SlangKey) =>
    set({ slang: value.slang.includes(k) ? value.slang.filter((x) => x !== k) : SLANG_KEYS.filter((x) => x === k || value.slang.includes(x)) });

  const statuses: { key: StatusFilter; label: string; count?: number }[] = [
    { key: "all", label: "Все" },
    { key: "due", label: "К повторению", count: counts.due },
    { key: "difficult", label: "Трудные", count: counts.difficult },
    { key: "new", label: "Новые", count: counts.fresh },
    // Only once some word is «на паузе» (or the filter is on).
    ...(counts.paused || value.status === "paused" ? [{ key: "paused" as const, label: "На паузе", count: counts.paused }] : []),
  ];
  const themes = [
    { key: ALL_THEMES, label: "Все темы" },
    { key: INBOX_THEME, label: "Входящие", dashed: true },
    ...folders.map((f) => ({ key: f.id, label: f.name })),
  ];

  const footer = (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-2">
      <Button variant="tertiary" onClick={() => onChange(DEFAULT_PHONE_FILTER)}>
        Сбросить
      </Button>
      <Button disabled={resultCount === 0} onClick={onShow}>
        {resultCount === null ? "Показать" : resultCount === 0 ? "Ничего не найдено" : `Показать ${nWords(resultCount)}`}
      </Button>
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Фильтр и порядок" footer={footer}>
      <div className="flex h-11 shrink-0 items-center justify-between pr-1 pl-4">
        <SheetTitle>Фильтр и порядок</SheetTitle>
        <SheetCloseButton />
      </div>
      <div className="px-4 pb-4">
        <Group id="filter-status" label="Показать">
          <div role="radiogroup" aria-labelledby="filter-status" className="flex flex-wrap gap-x-1.5 gap-y-3 py-2">
            {statuses.map((s) => (
              <Chip key={s.key} role="radio" selected={value.status === s.key} count={s.count} onClick={() => set({ status: s.key })}>
                {s.label}
              </Chip>
            ))}
          </div>
        </Group>

        <Group id="filter-slang" label="Уровень сленга">
          <div role="group" aria-labelledby="filter-slang" className="flex flex-wrap gap-x-1.5 gap-y-3 py-2">
            {SLANG_KEYS.map((k) => (
              <Chip
                key={String(k)}
                role="checkbox"
                selected={value.slang.includes(k)}
                dashed={k === "verl"}
                onClick={() => toggleSlang(k)}
                lang={k === 0 ? undefined : "fr"}
                className="gap-1.5 font-serif text-[15px] italic"
              >
                {k !== "verl" && <Segments level={k} selected={value.slang.includes(k)} />}
                {slangKeyLabel(k)}
              </Chip>
            ))}
          </div>
        </Group>

        <Group id="filter-theme" label="Тема">
          <div role="radiogroup" aria-labelledby="filter-theme" className="flex flex-wrap gap-x-1.5 gap-y-3 py-2">
            {themes.map((t) => (
              <Chip key={t.key} role="radio" selected={value.theme === t.key} dashed={t.dashed} onClick={() => set({ theme: t.key })}>
                {t.label}
              </Chip>
            ))}
          </div>
        </Group>

        <Group id="filter-order" label="Порядок">
          <div role="radiogroup" aria-labelledby="filter-order" className="flex flex-col">
            {ORDER_OPTIONS.map((o, i) => {
              const selected = value.order === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => set({ order: o.value })}
                  className={cx("flex h-11 items-center justify-between bg-transparent text-left text-[15px] text-ink active:bg-surface-2", i > 0 && "border-t border-rule")}
                >
                  {o.label}
                  {selected && <Icon name="check" size={18} />}
                </button>
              );
            })}
          </div>
        </Group>
      </div>
    </Sheet>
  );
}
