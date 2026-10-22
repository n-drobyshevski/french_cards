"use client";

import { useState } from "react";
import { cx } from "@/components/ui/cx";

/**
 * A button label that turns into another one in the same slot («Стоп» → «Повторить», MOTION-SPEC
 * §3.9): every label is stacked in one grid cell, so the button keeps the widest width without
 * measuring; the shown one crossfades in --dur-quick, the others are hidden from everyone.
 */
export function StackedLabels<T extends string>({ labels, current }: { labels: readonly T[]; current: T }) {
  return (
    <span className="grid">
      {labels.map((label) => (
        <span
          key={label}
          aria-hidden={label !== current || undefined}
          className={cx(
            "col-start-1 row-start-1 text-center transition-[opacity,visibility] duration-(--dur-quick) ease-standard",
            label !== current && "invisible opacity-0",
          )}
        >
          {label}
        </span>
      ))}
    </span>
  );
}

/**
 * Text that changes in place («Добавить 5 слов» → «Добавить 4 слова», MOTION-SPEC I6): the old
 * text fades out while the new one fades in, both in one grid cell (no width jump while they
 * cross), tabular numbers. The first text appears without a fade.
 */
export function CrossfadeText({ text, className }: { text: string; className?: string }) {
  const [shown, setShown] = useState<{ text: string; prev: string | null; n: number }>({ text, prev: null, n: 0 });
  if (shown.text !== text) setShown({ text, prev: shown.text, n: shown.n + 1 });
  return (
    <span className={cx("grid tabular-nums", className)}>
      {shown.prev !== null && (
        <span
          key={`prev-${shown.n}`}
          aria-hidden="true"
          className="col-start-1 row-start-1 animate-[fade-out_var(--dur-quick)_var(--ease-exit)_forwards]"
          onAnimationEnd={() => setShown((s) => (s.n === shown.n ? { ...s, prev: null } : s))}
        >
          {shown.prev}
        </span>
      )}
      <span key={`now-${shown.n}`} className={cx("col-start-1 row-start-1", shown.n > 0 && "animate-[fade-in_var(--dur-quick)_var(--ease-enter)]")}>
        {text}
      </span>
    </span>
  );
}
