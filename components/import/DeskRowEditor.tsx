"use client";

import { useId, type KeyboardEvent } from "react";
import { FlatKey } from "@/components/ui/Kbd";
import { cx } from "@/components/ui/cx";
import { useFormatKeys } from "@/lib/key-names";
import { SLANG_LABELS, type SlangLevel } from "@/lib/types";
import { CheckMark, deskButton, ROW_GRID } from "./desk";
import { useRowDraft } from "./ImportRowItem";
import type { ImportRow } from "./rows";

const input =
  "h-8 w-full min-w-0 rounded-[4px] border border-boundary bg-surface px-2 text-ink outline-none placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ink";

/** Slang level as text options (DESKTOP-SPEC §3): rules between, the chosen one ink 600 underlined. */
function LevelOptions({ value, onChange, labelledBy }: { value: SlangLevel; onChange: (v: SlangLevel) => void; labelledBy: string }) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = ((value + step + 4) % 4) as SlangLevel;
    onChange(next);
    e.currentTarget.querySelector<HTMLElement>(`[data-level="${next}"]`)?.focus();
  };
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} onKeyDown={onKeyDown} className="flex h-8 items-center">
      {SLANG_LABELS.map((label, i) => (
        <span key={label} className="flex items-center">
          {i > 0 && <span aria-hidden="true" className="h-4 w-px bg-rule" />}
          <button
            type="button"
            role="radio"
            data-level={i}
            aria-checked={value === i}
            tabIndex={value === i ? 0 : -1}
            lang={i === 0 ? undefined : "fr"}
            onClick={() => onChange(i as SlangLevel)}
            className={cx(
              "h-8 bg-transparent px-2 font-serif text-[14px] leading-5 italic underline-offset-4 focus-visible:outline-offset-[-2px]",
              value === i ? "font-semibold text-ink underline decoration-1" : "font-medium text-muted hoverable:text-ink",
              i === 0 && "-ml-2",
            )}
          >
            {label}
          </button>
        </span>
      ))}
    </div>
  );
}

export interface DeskRowEditorProps {
  row: ImportRow;
  onSave: (patch: Partial<ImportRow>) => void;
  onCancel: () => void;
}

/**
 * Inline edit of one row on desktop: FR and RU in their columns, level and verl. beside them,
 * example, its translation and a note on the second line. ↵ saves, Esc cancels (one Esc layer).
 */
export function DeskRowEditor({ row, onSave, onCancel }: DeskRowEditorProps) {
  const id = useId();
  const keys = useFormatKeys();
  const d = useRowDraft(row);

  return (
    <li
      data-row-key={row.key}
      aria-current="true"
      className="relative border-b border-rule bg-surface px-6 py-3 xl:px-8"
    >
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-ink" />
      <form
        aria-label={`Правка «${row.fr || "строки"}»`}
        onSubmit={(e) => {
          e.preventDefault();
          const patch = d.patch();
          if (patch) onSave(patch);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          }
        }}
        className="flex flex-col gap-2"
      >
        <div className={cx(ROW_GRID, "items-center")}>
          <span />
          <span className="px-2">
            <input
              lang="fr"
              autoFocus
              aria-label="Французский"
              autoComplete="off"
              spellCheck={false}
              value={d.fr}
              onChange={(e) => d.setFr(e.target.value)}
              className={cx(input, "font-serif text-[18px] leading-6 font-medium")}
            />
          </span>
          <span className="px-2">
            <input
              aria-label="Русский"
              autoComplete="off"
              value={d.ru}
              onChange={(e) => d.setRu(e.target.value)}
              className={cx(input, "text-[14px] leading-5")}
            />
          </span>
          <span className="col-span-2 flex min-w-0 items-center gap-3 pl-2">
            <span id={`${id}-lvl`} className="sr-only">
              Уровень сленга
            </span>
            <LevelOptions value={d.level} onChange={d.setLevel} labelledBy={`${id}-lvl`} />
            <button
              type="button"
              role="checkbox"
              aria-checked={d.verlan}
              aria-label="верлан"
              onClick={() => d.setVerlan((v) => !v)}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[4px] bg-transparent px-1 font-serif text-[14px] text-ink italic hoverable:bg-hover-surface focus-visible:outline-offset-[-2px]"
            >
              <CheckMark checked={d.verlan} />
              <span lang="fr">verl.</span>
            </button>
          </span>
        </div>

        <div className={cx(ROW_GRID, "items-center")}>
          <span />
          <span className="px-2">
            <input
              lang="fr"
              aria-label="Пример"
              placeholder="Пример, необязательно"
              autoComplete="off"
              value={d.exampleFr}
              onChange={(e) => d.setExampleFr(e.target.value)}
              className={cx(input, "font-serif text-[15px] italic")}
            />
          </span>
          <span className="px-2">
            <input
              aria-label="Перевод примера"
              placeholder="Перевод примера"
              autoComplete="off"
              disabled={!d.exampleFr.trim()}
              value={d.exampleRu}
              onChange={(e) => d.setExampleRu(e.target.value)}
              className={cx(input, "text-[14px] disabled:border-rule disabled:bg-transparent")}
            />
          </span>
          <span className="col-span-2 pl-2">
            <input
              aria-label="Заметка"
              placeholder="Заметка, необязательно"
              autoComplete="off"
              value={d.note}
              onChange={(e) => d.setNote(e.target.value)}
              className={cx(input, "text-[14px]")}
            />
          </span>
        </div>

        <div className={cx(ROW_GRID, "items-center")}>
          <span />
          <span className="col-span-2 min-w-0 px-2 text-[12px] leading-4">
            {!d.valid ? (
              <span className="text-again">Нужны и французское слово, и перевод.</span>
            ) : row.frAsSeen && row.frAsSeen !== d.fr ? (
              <span className="text-muted">
                На скриншоте: <span lang="fr" className="font-serif text-[14px] italic">{row.frAsSeen}</span>
              </span>
            ) : (
              <span className="text-muted">
                <FlatKey>{keys("Enter")}</FlatKey> сохранить · <FlatKey>Esc</FlatKey> отменить
              </span>
            )}
          </span>
          <span className="col-span-2 flex items-center justify-end gap-2">
            <button type="button" onClick={onCancel} className={deskButton("tertiary")}>
              Отмена
            </button>
            <button type="submit" aria-disabled={!d.valid || undefined} className={deskButton("primary", undefined, true)}>
              Готово
            </button>
          </span>
        </div>
      </form>
    </li>
  );
}
