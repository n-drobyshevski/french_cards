"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { IconButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icons";

export interface ReviewTopBarProps {
  canUndo: boolean;
  onUndo: () => void;
  /** Chips on the left of the row (direction + theme, or the practice exit). */
  children?: ReactNode;
}

/** One row: chips on the left, undo and settings on the right. */
export function ReviewTopBar({ canUndo, onUndo, children }: ReviewTopBarProps) {
  return (
    <header className="mt-4 flex h-11 shrink-0 items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
      <div className="-mr-3 flex shrink-0 items-center">
        <IconButton
          icon="undo"
          label="Отменить последний ответ"
          strokeWidth={1.5}
          disabled={!canUndo}
          onClick={onUndo}
          aria-keyshortcuts="Z"
        />
        <Link
          href="/settings"
          aria-label="Настройки"
          className="inline-flex size-11 items-center justify-center rounded-chip text-ink active:bg-surface-2"
        >
          <Icon name="gear" size={20} strokeWidth={1.5} />
        </Link>
      </div>
    </header>
  );
}

/** «23 к повторению · 4 новых ……… 07 / 30» with the 1px ink progress line. */
export function ProgressLine({ left, right, ratio }: { left: ReactNode; right: string; ratio: number }) {
  const pct = `${(ratio * 100).toFixed(1)}%`;
  return (
    <>
      <div className="mt-4 flex shrink-0 items-baseline justify-between gap-3 font-mono text-[11px] leading-4 tracking-[.06em] uppercase">
        <span className="min-w-0 truncate text-muted">{left}</span>
        <span className="shrink-0 font-medium text-ink">{right}</span>
      </div>
      <div aria-hidden="true" className="relative mt-2 h-[5px] shrink-0">
        <div className="absolute inset-x-0 top-[2px] h-px bg-rule" />
        <div className="absolute top-[2px] left-0 h-px bg-ink transition-[width] duration-200" style={{ width: pct }} />
        <div
          className="absolute top-0 h-[5px] w-px bg-ink transition-[left] duration-200"
          style={{ left: `min(${pct}, calc(100% - 1px))` }}
        />
      </div>
    </>
  );
}
