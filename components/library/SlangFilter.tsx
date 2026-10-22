"use client";

import { useId } from "react";
import { Chip } from "@/components/ui/Chip";
import { SLANG_LABELS, type SlangLevel, type Word } from "@/lib/types";

/** A slang level, or "verl" for verlan words. */
export type SlangKey = SlangLevel | "verl";

const KEYS: readonly SlangKey[] = [0, 1, 2, 3, "verl"];
const label = (k: SlangKey) => (k === "verl" ? "verl." : SLANG_LABELS[k]);

/** Selected levels are OR-ed; «verl.» additionally requires a verlan word. */
export function matchesSlang(word: Pick<Word, "slang_level" | "verlan">, keys: readonly SlangKey[]): boolean {
  const levels = keys.filter((k): k is SlangLevel => k !== "verl");
  if (levels.length > 0 && !levels.includes(word.slang_level)) return false;
  return !keys.includes("verl") || word.verlan;
}

/** Chip text: «Сленг», «Сленг: arg.», «Сленг: 3». */
export function slangChipLabel(keys: readonly SlangKey[]): string {
  if (keys.length === 0) return "Сленг";
  if (keys.length === 1) return `Сленг: ${label(keys[0])}`;
  return `Сленг: ${keys.length}`;
}

export interface SlangFilterProps {
  value: readonly SlangKey[];
  onChange: (value: SlangKey[]) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** «Сленг ▾» chip; the panel renders separately with <SlangFilterPanel>. */
export function SlangFilterChip({ value, open, onOpenChange, panelId }: SlangFilterProps & { panelId: string }) {
  return (
    <Chip
      dropdown
      selected={value.length > 0}
      aria-expanded={open}
      aria-controls={panelId}
      aria-pressed={undefined}
      onClick={() => onOpenChange(!open)}
    >
      {slangChipLabel(value)}
    </Chip>
  );
}

/** Multi-select of slang levels shown under the filter row. */
export function SlangFilterPanel({ value, onChange, open, onOpenChange, id }: SlangFilterProps & { id: string }) {
  const headingId = useId();
  if (!open) return null;
  const toggle = (k: SlangKey) =>
    onChange(value.includes(k) ? value.filter((x) => x !== k) : KEYS.filter((x) => x === k || value.includes(x)));
  return (
    <div
      id={id}
      role="group"
      aria-labelledby={headingId}
      onKeyDown={(e) => {
        if (e.key === "Escape") onOpenChange(false);
      }}
      className="mt-3 rounded-card border border-rule bg-surface px-3 pt-2 pb-3"
    >
      <div className="flex h-8 items-center justify-between">
        <span id={headingId} className="meta">
          Уровень сленга
        </span>
        {value.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="relative h-8 bg-transparent px-1 text-[13px] text-ink underline decoration-1 underline-offset-4 before:absolute before:-inset-y-1.5 before:inset-x-0"
          >
            Сбросить
          </button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-1 gap-y-3">
        {KEYS.map((k) => (
          <Chip
            key={String(k)}
            role="checkbox"
            selected={value.includes(k)}
            onClick={() => toggle(k)}
            lang={k === 0 ? undefined : "fr"}
            className="font-serif text-[15px] italic"
          >
            {label(k)}
          </Chip>
        ))}
      </div>
    </div>
  );
}
