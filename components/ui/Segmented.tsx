"use client";

import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
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

/** Where the ink slab sits (px in the group); `glide` after a tap, `fade` when it shows or hides. */
interface Slab {
  x: number;
  w: number;
  on: boolean;
  glide: boolean;
  fade: boolean;
}

/** The slab is a 100px ink block scaled to the segment's width (transform only, §5.9). */
const SLAB_BASE = 100;

/**
 * Single-choice segmented control (radiogroup, arrow keys move the selection).
 * Motion (T3): one ink slab under the options; after a tap (or Enter / Space) it glides to the new
 * segment with `transform` (--dur-move --ease-standard; jumps under reduced motion) while the
 * labels' colour crossfades over --dur-quick. A value that arrives on its own (first load,
 * detection) or an arrow key places it at once; a selection that appears or clears fades. Press .96.
 * Until the slab is measured (the server render), the selected segment fills itself.
 */
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
  const group = useRef<HTMLDivElement>(null);
  /** When a tap last chose a value: the slab glides only to a value the user just picked. */
  const tappedAt = useRef(0);
  const [slab, setSlab] = useState<Slab | null>(null);
  const selectedIndex =
    value === null
      ? -1
      : Math.max(
          0,
          options.findIndex((o) => o.value === value),
        );

  useLayoutEffect(() => {
    const root = group.current;
    if (!root) return;
    const glide = performance.now() - tappedAt.current < 1000;
    tappedAt.current = 0;
    const measure = () => {
      const el = selectedIndex >= 0 ? refs.current[selectedIndex] : null;
      return el ? { x: el.offsetLeft, w: el.offsetWidth, on: true } : null;
    };
    const place = (next: ReturnType<typeof measure>, moved: boolean) =>
      setSlab((prev) => {
        if (!next) {
          if (!prev) return { x: 0, w: 0, on: false, glide: false, fade: false };
          return prev.on ? { ...prev, on: false, glide: false, fade: true } : prev;
        }
        if (prev && prev.on && prev.x === next.x && prev.w === next.w) return prev;
        return { ...next, glide: moved && !!prev?.on, fade: !!prev && !prev.on };
      });
    place(measure(), glide);
    // Late fonts or a wider container move the segments: follow without gliding.
    const observer = new ResizeObserver(() => place(measure(), false));
    observer.observe(root);
    return () => observer.disconnect();
  }, [selectedIndex, options.length]);

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
  // The selected segment paints its own ink only until the slab has been placed.
  const ownFill = slab === null;

  const slabEl = (
    <span
      data-seg-slab=""
      aria-hidden="true"
      className={cx(
        "absolute inset-y-0 left-0 origin-left bg-ink",
        slab?.on ? "opacity-100" : "opacity-0",
        slab?.glide && "motion-safe:[transition:transform_var(--dur-move)_var(--ease-standard)]",
        slab?.fade && "[transition:opacity_var(--dur-quick)_var(--ease-standard)]",
      )}
      style={{
        width: SLAB_BASE,
        transform: slab ? `translateX(${slab.x}px) scaleX(${slab.w / SLAB_BASE})` : "scaleX(0)",
      }}
    />
  );

  return (
    <div
      ref={group}
      role="radiogroup"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
      className={cx(
        "relative",
        block
          ? "grid h-11 overflow-hidden rounded-chip border border-rule bg-surface"
          : "inline-flex h-11 items-center",
        className,
      )}
      style={block ? { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` } : undefined}
    >
      {block ? (
        slabEl
      ) : (
        // The segments' 30px row: paper under them, clipped to the outline's rounded ends.
        <span aria-hidden="true" className="absolute inset-x-0 top-[7px] h-[30px] overflow-hidden rounded-chip bg-surface">
          {slabEl}
        </span>
      )}
      {options.map((option, i) => {
        const selected = i === selectedIndex;
        // Press (§5.9): the visible box tints while its button is down; the label colour crossfades.
        const tint = "transition-colors duration-(--dur-quick) ease-press group-active:duration-(--dur-instant)";
        const box = block
          ? cx(
              "flex h-full w-full items-center justify-center px-1 text-[13px] leading-4",
              tint,
              i < last && "border-r border-rule",
              selected
                ? cx("font-medium text-on-ink", ownFill ? "bg-ink" : "bg-transparent")
                : "bg-transparent text-muted group-active:bg-surface-2",
              mono && "font-mono text-[12px]",
            )
          : cx(
              "flex h-[30px] items-center justify-center border border-ink text-[13px] leading-4 whitespace-nowrap",
              tint,
              i < last && "border-r-0",
              i === 0 && "rounded-l-chip",
              i === last && "rounded-r-chip",
              mono ? "w-full font-mono text-[12px]" : "px-3",
              selected
                ? cx("font-medium text-on-ink", ownFill ? "bg-ink" : "bg-transparent")
                : "bg-transparent text-ink group-active:bg-surface-2",
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
            onClick={() => {
              if (!selected) tappedAt.current = performance.now();
              onChange(option.value);
            }}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cx(
              "group press-sm relative flex items-center bg-transparent p-0 disabled:opacity-40",
              block ? "h-full min-w-0" : "h-11",
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
