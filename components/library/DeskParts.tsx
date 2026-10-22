"use client";

import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { bottomBarRef } from "@/components/ui/bottom-clearance";
import { Chip } from "@/components/ui/Chip";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icons";
import { FlatKey, Kbd } from "@/components/ui/Kbd";
import type { Folder } from "@/lib/types";
import { nWords } from "./format";
import { INBOX_KEY, ThemeSquare } from "./MoveMenu";
import { SLANG_KEYS, slangKeyLabel, slangChipLabel, type SlangKey } from "./SlangFilter";

// Pieces of the desktop library (DESKTOP-SPEC §5 #6–10): the text filter strip with its «Сленг ▾»
// popover, the bulk bar, the selection summary and the empty detail pane.

export type StatusFilter = "all" | "due" | "difficult";

/** Tertiary text link-button: 13px 500 underlined. */
export function TextLink({ onClick, children, className, ...rest }: { onClick: () => void; children: ReactNode; className?: string; "aria-haspopup"?: "dialog" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "relative inline-flex bg-transparent p-0 text-[13px] leading-5 font-medium text-ink underline decoration-1 underline-offset-4 hoverable:text-red pointer-coarse:before:absolute pointer-coarse:before:-inset-y-3 pointer-coarse:before:inset-x-0",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

function StripItem({
  active,
  onClick,
  count,
  children,
  ...rest
}: {
  active: boolean;
  onClick: () => void;
  count?: number;
  children: ReactNode;
  "aria-expanded"?: boolean;
  "aria-haspopup"?: "dialog";
  "aria-controls"?: string;
}) {
  const pressed = rest["aria-expanded"] === undefined ? active : undefined;
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cx(
        "inline-flex h-9 shrink-0 items-center gap-1.5 bg-transparent px-0 text-[14px] whitespace-nowrap pointer-coarse:h-11",
        active ? "font-semibold text-ink" : "font-medium text-muted hoverable:text-ink",
      )}
      {...rest}
    >
      <span className={cx(active && "underline decoration-1 underline-offset-[5px]")}>{children}</span>
      {count != null && count > 0 && <span className="font-mono text-[12px] font-normal tabular-nums">{count}</span>}
    </button>
  );
}

/** «Все · К повторению 23 · Трудные 9 · Сленг ▾» (text filter strip token). */
export function FilterStrip({
  status,
  onStatus,
  slang,
  onSlang,
  dueCount,
  difficultCount,
}: {
  status: StatusFilter;
  onStatus: (s: StatusFilter) => void;
  slang: SlangKey[];
  onSlang: (keys: SlangKey[]) => void;
  dueCount: number;
  difficultCount: number;
}) {
  const popId = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useOpenState(wrap);

  return (
    <div role="group" aria-label="Фильтр" className="flex min-w-0 items-center gap-5">
      <StripItem
        active={status === "all" && slang.length === 0}
        onClick={() => {
          onStatus("all");
          onSlang([]);
        }}
      >
        Все
      </StripItem>
      <StripItem active={status === "due"} count={dueCount} onClick={() => onStatus(status === "due" ? "all" : "due")}>
        К повторению
      </StripItem>
      <StripItem active={status === "difficult"} count={difficultCount} onClick={() => onStatus(status === "difficult" ? "all" : "difficult")}>
        Трудные
      </StripItem>
      <div ref={wrap} className="relative">
        <StripItem active={slang.length > 0} aria-expanded={open} aria-haspopup="dialog" aria-controls={popId} onClick={() => setOpen(!open)}>
          <span className="inline-flex items-center gap-1">
            {slangChipLabel(slang)}
            <Icon name="chevron" size={14} />
          </span>
        </StripItem>
        {open && (
          <div
            id={popId}
            role="dialog"
            aria-label="Уровень сленга"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setOpen(false);
                wrap.current?.querySelector<HTMLButtonElement>("button[aria-expanded]")?.focus();
              }
            }}
            className="absolute top-full left-0 z-30 mt-1 w-[280px] rounded-[6px] border border-ink bg-surface p-3"
          >
            <div className="flex h-6 items-center justify-between">
              <span className="text-[13px] font-medium">Уровень сленга</span>
              {slang.length > 0 && (
                <button
                  type="button"
                  onClick={() => onSlang([])}
                  className="bg-transparent p-0 text-[13px] text-ink underline decoration-1 underline-offset-4"
                >
                  Сбросить
                </button>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {SLANG_KEYS.map((k) => (
                <Chip
                  key={String(k)}
                  role="checkbox"
                  selected={slang.includes(k)}
                  onClick={() => onSlang(slang.includes(k) ? slang.filter((x) => x !== k) : SLANG_KEYS.filter((x) => x === k || slang.includes(x)))}
                  lang={k === 0 ? undefined : "fr"}
                  className="font-serif text-[14px] italic"
                >
                  {slangKeyLabel(k)}
                </Chip>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Open state of a popover that closes on a click outside `wrap`. */
function useOpenState(wrap: RefObject<HTMLElement | null>): [boolean, (open: boolean) => void] {
  const [open, setOpenRaw] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrap.current && e.target instanceof Node && !wrap.current.contains(e.target)) setOpenRaw(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open, wrap, setOpenRaw]);
  return [open, setOpenRaw];
}

/** The bar over the list while words are selected (bulk bar token): count, move, delete, clear. */
export function BulkBar({
  count,
  onMove,
  onDelete,
  onClear,
  deleteKey,
  shortcuts,
}: {
  count: number;
  onMove: (anchor: HTMLElement) => void;
  onDelete: () => void;
  onClear: () => void;
  deleteKey: string;
  shortcuts: boolean;
}) {
  const action = "inline-flex h-9 items-center gap-2 rounded-[4px] bg-transparent px-2 text-[14px] font-medium hoverable:bg-hover-surface pointer-coarse:h-11";
  return (
    <div
      ref={bottomBarRef}
      role="toolbar"
      aria-label="Выбранные слова"
      className="absolute inset-x-6 bottom-4 z-10 flex h-[52px] items-center gap-3 rounded-[6px] border border-ink bg-surface pr-2 pl-4"
    >
      <span className="text-[14px] whitespace-nowrap" aria-live="polite">
        <span className="font-mono text-[12px] tabular-nums">{count}</span> выбрано
      </span>
      <span aria-hidden="true" className="h-5 w-px bg-rule" />
      <button type="button" aria-haspopup="menu" aria-keyshortcuts={shortcuts ? "M" : undefined} onClick={(e) => onMove(e.currentTarget)} className={cx(action, "text-ink")}>
        <Icon name="move" size={16} />
        Переместить…
        {shortcuts && <Kbd aria-hidden="true">M</Kbd>}
      </button>
      <span aria-hidden="true" className="h-5 w-px bg-rule" />
      <button type="button" aria-keyshortcuts="Delete Meta+Backspace Control+Backspace" onClick={onDelete} className={cx(action, "text-again")}>
        <Icon name="trash" size={16} />
        Удалить
        <Kbd aria-hidden="true">{deleteKey}</Kbd>
      </button>
      <span className="flex-1" />
      <button
        type="button"
        aria-label="Снять выделение"
        title="Снять выделение (Esc)"
        aria-keyshortcuts="Escape"
        onClick={onClear}
        className={cx(action, "px-1.5 text-ink")}
      >
        <Icon name="close" size={18} />
        <Kbd aria-hidden="true">Esc</Kbd>
      </button>
    </div>
  );
}

export interface SummaryTarget {
  key: string;
  name: string;
  color: string | null;
  count: number;
}

/** Detail pane while words are selected: their list and the themes to move them to (D-Library-Bulk). */
export function SelectionSummary({
  words,
  targets,
  onMove,
  onNewTheme,
  dragHint,
  coarse,
}: {
  words: readonly { id: string; fr: string; ru: string }[];
  targets: readonly SummaryTarget[];
  onMove: (key: string) => void;
  onNewTheme: () => void;
  dragHint: boolean;
  coarse: boolean;
}) {
  const shown = words.slice(0, 12);
  const btn = cx(
    "flex min-w-0 items-center gap-2 rounded-[4px] border bg-transparent px-2.5 text-left text-ink",
    coarse ? "h-11" : "h-8",
  );
  return (
    <div className="flex flex-col">
      <h2 aria-live="polite" className="m-0 font-serif text-[28px] leading-9 font-medium tracking-[-0.015em]">
        {nWords(words.length)}
      </h2>
      <ul className="m-0 mt-3 list-none border-t border-rule p-0">
        {shown.map((w) => (
          <li key={w.id} className="flex h-9 min-w-0 items-baseline gap-2 border-b border-rule pt-2">
            <span lang="fr" className="shrink-0 truncate font-serif text-[16px] leading-5 font-medium">
              {w.fr}
            </span>
            <span className="min-w-0 truncate text-[13px] text-muted">— {w.ru}</span>
          </li>
        ))}
        {words.length > shown.length && <li className="pt-2 text-[13px] text-muted">и ещё {nWords(words.length - shown.length)}</li>}
      </ul>
      <h3 className="m-0 mt-8 border-b border-ink pb-1.5 text-[13px] leading-5 font-medium">Переместить в тему</h3>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {targets.map((t) => (
          <button key={t.key} type="button" onClick={() => onMove(t.key)} className={cx(btn, "border-boundary hoverable:bg-hover")}>
            <ThemeSquare color={t.key === INBOX_KEY ? null : t.color} />
            <span className="min-w-0 flex-1 truncate font-serif text-[16px] leading-5">{t.name}</span>
            <span className="font-mono text-[12px] text-muted tabular-nums">{t.count}</span>
          </button>
        ))}
        <button type="button" aria-haspopup="dialog" onClick={onNewTheme} className={cx(btn, "border-dashed border-boundary text-[14px] font-medium hoverable:bg-hover")}>
          + Новая тема…
        </button>
      </div>
      {dragHint && <p className="m-0 mt-3 text-[12px] leading-4 text-muted">Или перетащите слова на тему слева.</p>}
    </div>
  );
}

/** Empty detail pane: a blank ruled card and the keys that pick a word. */
export function EmptyPane({ shortcuts }: { shortcuts: boolean }) {
  return (
    <div className="mt-12 flex flex-col overflow-hidden rounded-[6px] border border-rule bg-surface">
      <div className="h-10" />
      <div aria-hidden="true" className="h-0.5 bg-red" />
      <div
        className="flex h-40 flex-col justify-center gap-2 px-5"
        style={{ backgroundImage: "repeating-linear-gradient(to bottom, transparent 0 31px, var(--card-lines) 31px 32px)" }}
      >
        <p className="m-0 font-serif text-[20px] leading-7 text-muted">Выберите слово</p>
        {shortcuts && (
          <p className="m-0 flex items-center gap-2">
            <FlatKey>J</FlatKey>
            <FlatKey>K</FlatKey>
            <FlatKey>↵</FlatKey>
          </p>
        )}
      </div>
    </div>
  );
}

/** Targets for the summary / bulk move: «Входящие» (unless shown), themes in order (minus the shown one). */
export function summaryTargets(folders: readonly Folder[], counts: ReadonlyMap<string, number>, exclude: string | null): SummaryTarget[] {
  const all: SummaryTarget[] = [
    { key: INBOX_KEY, name: "Входящие", color: null, count: counts.get(INBOX_KEY) ?? 0 },
    ...folders.map((f) => ({ key: f.id, name: f.name, color: f.color, count: counts.get(f.id) ?? 0 })),
  ];
  return all.filter((t) => t.key !== exclude);
}
