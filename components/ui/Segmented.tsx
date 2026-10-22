"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "./cx";

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: ReactNode;
  /** Needed when label is not plain text. */
  ariaLabel?: string;
  lang?: string;
  disabled?: boolean;
}

export interface SegmentedProps<T extends string | number> {
  options: readonly SegmentedOption<T>[];
  /** null: nothing selected yet (e.g. a slang level still being detected); the first segment takes focus. */
  value: T | null;
  onChange: (value: T) => void;
  /** Accessible group name (or use ariaLabelledby). */
  ariaLabel?: string;
  ariaLabelledby?: string;
  /**
   * compact: 30px ink-outlined segments in a 44px row (settings).
   * block: full-width 44px grid with rule dividers (forms).
   */
  variant?: "compact" | "block";
  /** Mono labels with fixed 44px segments, e.g. «2 / 3». */
  mono?: boolean;
  /** Extra classes for each segment's visible box (e.g. "font-serif italic text-[16px]"). */
  itemClassName?: string;
  className?: string;
}

/** Single-choice segmented control (radiogroup, arrow keys move the selection). */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
  ariaLabelledby,
  variant = "compact",
  mono = false,
  itemClassName,
  className,
}: SegmentedProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex =
    value === null
      ? -1
      : Math.max(
          0,
          options.findIndex((o) => o.value === value),
        );

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    for (let i = 1; i <= options.length; i++) {
      const next = (index + step * i + options.length) % options.length;
      if (!options[next].disabled) {
        onChange(options[next].value);
        refs.current[next]?.focus();
        return;
      }
    }
  };

  const block = variant === "block";
  const last = options.length - 1;

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
      className={cx(
        block
          ? "grid h-11 overflow-hidden rounded-chip border border-rule"
          : "inline-flex h-11 items-center",
        className,
      )}
      style={block ? { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` } : undefined}
    >
      {options.map((option, i) => {
        const selected = i === selectedIndex;
        // Press (§5.9): the visible box tints while its button is down; compact segments also scale .96.
        const tint = "transition-colors duration-(--dur-quick) ease-press group-active:duration-(--dur-instant)";
        const box = block
          ? cx(
              "flex h-full w-full items-center justify-center px-1 text-[13px] leading-4",
              tint,
              i < last && "border-r border-rule",
              selected ? "bg-ink font-medium text-on-ink" : "bg-surface text-muted group-active:bg-surface-2",
              mono && "font-mono text-[12px]",
            )
          : cx(
              "flex h-[30px] items-center justify-center border border-ink text-[13px] leading-4 whitespace-nowrap",
              tint,
              i < last && "border-r-0",
              i === 0 && "rounded-l-chip",
              i === last && "rounded-r-chip",
              mono ? "w-full font-mono text-[12px]" : "px-3",
              selected ? "bg-ink font-medium text-on-ink" : "bg-surface text-ink group-active:bg-surface-2",
            );
        return (
          <button
            key={String(option.value)}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.ariaLabel}
            lang={option.lang}
            disabled={option.disabled}
            tabIndex={selected || (selectedIndex === -1 && i === 0) ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cx(
              "group flex items-center bg-transparent p-0 disabled:opacity-40",
              block ? "h-full min-w-0 touch-manipulation" : "press-sm h-11",
              !block && mono && "w-11",
            )}
          >
            <span className={cx(box, itemClassName)}>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
