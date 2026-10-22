"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useShell } from "@/components/shell/ShellContext";
import { IconButton } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icons";

export interface ReviewProgress {
  /** «23 к повторению · 4 новых» / «Практика · не влияет на расписание» */
  left: ReactNode;
  /** «07 / 30» */
  right: string;
  ratio: number;
}

export interface ReviewTopBarProps {
  canUndo: boolean;
  onUndo: () => void;
  /** Single-letter shortcuts are on (Z is printed in the undo tooltip). */
  letters?: boolean;
  /** Counts and the progress line; omitted while loading, on «Готово на сегодня» and empty states. */
  progress?: ReviewProgress | null;
  /** Rendered between the bar and the progress row (the screen's sr-only h1). */
  heading?: ReactNode;
  /** No running head from 768 up («Готово на сегодня», empty library). */
  hideOnDesktop?: boolean;
  /** Chips on the left of the row (direction + theme, or the practice exit). */
  children?: ReactNode;
}

/**
 * Phones: one row (chips left; undo and settings right), then the progress row with its 1px line.
 *
 * From 768 up the same elements form the running head (DESKTOP-SPEC §5 #1): 56px across the
 * content, padding 0 32 — chips, the counts in 13px, then «07 / 30», undo and the `?` button at the
 * right. Its bottom rule doubles as the progress line (a 2px ink fill over the hairline). The phone
 * rows turn into `display: contents`, so there is a single copy of every control and count.
 */
export function ReviewTopBar({ canUndo, onUndo, letters = true, progress, heading, hideOnDesktop, children }: ReviewTopBarProps) {
  const { openShortcuts } = useShell();
  return (
    <div
      data-review-head=""
      className={cx(
        "contents",
        hideOnDesktop
          ? "md:hidden"
          : "md:relative md:flex md:h-[57px] md:shrink-0 md:items-center md:gap-4 md:border-b md:border-rule md:px-8",
      )}
    >
      <header className="mt-4 flex h-11 shrink-0 items-center gap-2 md:contents">
        <div className="flex min-w-0 flex-1 items-center gap-2 md:order-1 md:flex-none">{children}</div>
        <div className={cx("-mr-3 flex shrink-0 items-center md:order-4 md:mr-0 md:gap-2", !progress && "md:ml-auto")}>
          <IconButton
            icon="undo"
            label="Отменить последний ответ"
            strokeWidth={1.5}
            disabled={!canUndo}
            onClick={onUndo}
            aria-keyshortcuts={letters ? "Z" : undefined}
            title={canUndo ? (letters ? "Отменить последний ответ (Z)" : "Отменить последний ответ") : "Нечего отменять"}
            className="md:size-8 md:rounded-[4px] md:disabled:text-boundary md:disabled:opacity-100 hoverable:enabled:bg-hover"
          />
          <Link
            href="/settings"
            aria-label="Настройки"
            className="inline-flex size-11 items-center justify-center rounded-chip text-ink active:bg-surface-2 md:hidden"
          >
            <Icon name="gear" size={20} strokeWidth={1.5} />
          </Link>
          <button
            type="button"
            aria-label="Все клавиши"
            aria-haspopup="dialog"
            aria-keyshortcuts={letters ? "Shift+Slash" : undefined}
            title={letters ? "Все клавиши (?)" : "Все клавиши"}
            onClick={openShortcuts}
            className="hidden size-8 shrink-0 items-center justify-center rounded-[4px] border border-boundary bg-surface font-mono text-[13px] leading-none text-ink md:inline-flex hoverable:bg-hover-surface"
          >
            ?
          </button>
        </div>
      </header>
      {heading}
      {progress && <ProgressLine left={progress.left} right={progress.right} ratio={progress.ratio} />}
    </div>
  );
}

/**
 * Phones: «23 К ПОВТОРЕНИЮ · 4 НОВЫХ ……… 07 / 30» with the 1px ink progress line under it.
 * From 768 up the two texts join the running head and the line becomes its bottom rule's fill.
 */
export function ProgressLine({ left, right, ratio }: ReviewProgress) {
  const pct = `${(ratio * 100).toFixed(1)}%`;
  return (
    <>
      <div className="mt-4 flex shrink-0 items-baseline justify-between gap-3 font-mono text-[11px] leading-4 tracking-[.06em] uppercase md:contents">
        <span className="min-w-0 truncate text-muted md:order-2 md:font-sans md:text-[13px] md:leading-5 md:tracking-normal md:normal-case md:tabular-nums">
          {left}
        </span>
        <span className="shrink-0 font-medium text-ink md:order-3 md:ml-auto md:text-[13px] md:leading-5 md:tracking-normal md:tabular-nums">
          {right}
        </span>
      </div>
      <div aria-hidden="true" className="relative mt-2 h-[5px] shrink-0 md:absolute md:inset-x-0 md:top-14 md:mt-0 md:h-0.5">
        <div className="absolute inset-x-0 top-[2px] h-px bg-rule md:hidden" />
        <div
          className="absolute top-[2px] left-0 h-px bg-ink transition-[width] duration-200 md:top-0 md:h-0.5"
          style={{ width: pct }}
        />
        <div
          className="absolute top-0 h-[5px] w-px bg-ink transition-[left] duration-200 md:hidden"
          style={{ left: `min(${pct}, calc(100% - 1px))` }}
        />
      </div>
    </>
  );
}
