"use client";

// Settings controls for the desktop layout (DESKTOP-SPEC §3 tokens, board 20 D-Settings): section
// heading with an ink rule, 44px rows with hairlines, the checkbox option row (the only on/off
// control on desktop), text options for 2–3-way choices, the outlined stepper and the direction
// select with its popover.
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode } from "react";
import { DIRECTION_LABELS, DIRECTION_NAMES } from "@/components/review/format";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icons";
import type { Direction } from "@/lib/types";

/** «Повторение», «Оформление»…: Plex 500 13 + 1px ink rule, 24px between sections. */
export function DeskSection({
  id,
  title,
  first,
  children,
}: {
  id: string;
  title: string;
  first?: boolean;
  children: ReactNode;
}) {
  const headingId = `${id}-h`;
  return (
    <section id={id} data-settings-section="" aria-labelledby={headingId} className={cx("flex scroll-mt-6 flex-col", !first && "mt-6")}>
      <div className="mb-1 flex h-7 items-center border-b border-ink">
        <h2 id={headingId} tabIndex={-1} className="m-0 text-[13px] leading-5 font-medium text-ink focus:outline-none">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

/** A 44px row: label left, control right, hairline under. */
export function DeskRow({ label, labelId, children }: { label: ReactNode; labelId?: string; children?: ReactNode }) {
  return (
    <div className="flex h-11 items-center gap-4 border-b border-rule">
      <span id={labelId} className="min-w-0 flex-1 truncate text-[15px] leading-5 text-ink">
        {label}
      </span>
      {children}
    </div>
  );
}

export interface DeskButtonRowProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: ReactNode;
  trailing?: ReactNode;
  tone?: "ink" | "again";
}

/** A whole-row button («Экспорт JSON», «Выйти»); the hover fill runs 8px past the text. */
export function DeskButtonRow({ label, trailing, tone = "ink", className, type = "button", ...rest }: DeskButtonRowProps) {
  return (
    <div className="flex h-11 items-center border-b border-rule">
      <button
        type={type}
        className={cx(
          "-mx-2 flex h-[43px] min-w-0 flex-1 cursor-pointer items-center justify-between gap-4 rounded-[4px] border-0 bg-transparent px-2 text-left text-[15px] leading-5 hoverable:bg-hover focus-visible:outline-offset-[-2px] disabled:cursor-default disabled:text-boundary disabled:hover:bg-transparent",
          tone === "again" ? "text-again" : "text-ink",
          className,
        )}
        {...rest}
      >
        <span className="min-w-0 truncate">{label}</span>
        {trailing}
      </button>
    </div>
  );
}

const CHECK = (
  <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.5 6.2 5 8.6 9.5 3.6" />
  </svg>
);

/**
 * Settings option row (§3): 14px checkbox, 12px gap, label 15 and an optional 12px caption; the whole
 * row is the hit area (min 44). Keyboard focus rings the row.
 */
export function CheckboxRow({
  label,
  caption,
  checked,
  disabled,
  onCheckedChange,
}: {
  label: ReactNode;
  caption?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <label
      className={cx(
        "relative -mx-2 flex min-h-11 items-start gap-3 rounded-[4px] px-2 py-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-ink",
        disabled ? "cursor-default" : "cursor-pointer hoverable:bg-hover",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onCheckedChange(e.target.checked)}
        aria-labelledby={`${id}-l`}
        aria-describedby={caption ? `${id}-d` : undefined}
        className="peer absolute top-0 left-0 m-0 size-px opacity-0"
      />
      <span className="mt-[3px] flex shrink-0">
        <span
          aria-hidden="true"
          data-check=""
          className={cx(
            "inline-flex size-3.5 items-center justify-center rounded-[2px] border",
            checked ? "border-ink bg-ink text-on-ink" : "border-muted bg-surface",
            disabled && "opacity-40",
          )}
        >
          {checked && CHECK}
        </span>
      </span>
      <span className="min-w-0">
        <span id={`${id}-l`} className={cx("block text-[15px] leading-5", disabled ? "text-boundary" : "text-ink")}>
          {label}
        </span>
        {caption && (
          <span id={`${id}-d`} className="mt-0.5 block text-[12px] leading-4 text-muted">
            {caption}
          </span>
        )}
      </span>
      <span aria-hidden="true" className="absolute inset-x-2 bottom-0 h-px bg-rule" />
    </label>
  );
}

export interface TextOption<T extends string | number> {
  value: T;
  label: string;
  ariaLabel?: string;
}

/**
 * Text options (§3, 3–4-way choices): 14px words split by 16px rules; selected = ink 600 with a 1px
 * underline, rest muted. A radiogroup with a roving tab stop; arrows move and select.
 */
export function TextOptions<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabelledby,
  disabled,
}: {
  options: readonly TextOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabelledby: string;
  disabled?: boolean;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div role="radiogroup" aria-labelledby={ariaLabelledby} className="-mr-3 flex shrink-0 items-center">
      {options.map((option, i) => {
        const selected = option.value === value;
        return (
          <span key={String(option.value)} className="flex items-center">
            {i > 0 && <span aria-hidden="true" className="h-4 w-px shrink-0 bg-rule" />}
            <button
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              data-text-option=""
              aria-checked={selected}
              aria-label={option.ariaLabel}
              tabIndex={selected ? 0 : -1}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cx(
                "h-8 cursor-pointer rounded-[4px] border-0 bg-transparent px-3 text-[14px] leading-5 focus-visible:outline-offset-[-2px]",
                selected
                  ? "font-semibold text-ink underline decoration-1 underline-offset-4"
                  : "font-medium text-muted hoverable:text-ink",
              )}
            >
              {option.label}
            </button>
          </span>
        );
      })}
    </div>
  );
}

const stepBtn =
  "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[4px] border border-boundary bg-surface p-0 text-ink hoverable:bg-hover-surface disabled:cursor-default disabled:border-rule disabled:text-boundary";

/** − value + with 32px outlined buttons; the value is the spinbutton (↑/↓, PageUp/PageDown). */
export function DeskStepper({
  value,
  onStep,
  min = 0,
  max = Infinity,
  labelledBy,
  disabled,
}: {
  value: number;
  onStep: (delta: 1 | -1) => void;
  min?: number;
  max?: number;
  labelledBy: string;
  disabled?: boolean;
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (disabled) return;
    const delta = event.key === "ArrowUp" || event.key === "ArrowRight" || event.key === "PageUp" ? 1 : event.key === "ArrowDown" || event.key === "ArrowLeft" || event.key === "PageDown" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    if ((delta > 0 && value < max) || (delta < 0 && value > min)) onStep(delta);
  };
  return (
    <div className="flex shrink-0 items-center">
      <button type="button" tabIndex={-1} aria-label="Меньше" disabled={disabled || value <= min} onClick={() => onStep(-1)} className={stepBtn}>
        <Icon name="minus" size={16} />
      </button>
      <span
        role="spinbutton"
        tabIndex={0}
        aria-labelledby={labelledBy}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={Number.isFinite(max) ? max : undefined}
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
        className="w-12 rounded-[4px] text-center font-mono text-[15px] leading-5 text-ink tabular-nums"
      >
        {value}
      </span>
      <button type="button" tabIndex={-1} aria-label="Больше" disabled={disabled || value >= max} onClick={() => onStep(1)} className={stepBtn}>
        <Icon name="plus" size={16} />
      </button>
    </div>
  );
}

const DIRECTIONS: readonly Direction[] = ["fr_ru", "ru_fr"];

/**
 * «FR → RU ▾» select (§5 board 20): a 32px outlined button opening a listbox popover (menu token:
 * white, 1px ink border, radius 6) with two 44px options. ↑/↓ move, ↵/Пробел pick, Esc closes.
 */
export function DirectionSelect({
  value,
  onChange,
  labelId,
  disabled,
}: {
  value: Direction;
  onChange: (value: Direction) => void;
  labelId: string;
  disabled?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const show = () => {
    setActive(Math.max(0, DIRECTIONS.indexOf(value)));
    setOpen(true);
  };
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };
  const pick = (d: Direction) => {
    if (d !== value) onChange(d);
    close(true);
  };

  useEffect(() => {
    if (!open) return;
    listRef.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setActive((a) => (a + step + DIRECTIONS.length) % DIRECTIONS.length);
        break;
      }
      case "Home":
        event.preventDefault();
        setActive(0);
        break;
      case "End":
        event.preventDefault();
        setActive(DIRECTIONS.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        pick(DIRECTIONS[active]);
        break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        close(true);
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        id={`${id}-button`}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-labelledby={`${labelId} ${id}-button`}
        disabled={disabled}
        onClick={() => (open ? close(false) : show())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            show();
          }
        }}
        className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-[4px] border border-boundary bg-surface pr-2 pl-2.5 font-mono text-[12px] font-medium tracking-[.06em] whitespace-nowrap text-ink hoverable:bg-hover-surface disabled:cursor-default disabled:opacity-40"
      >
        <span data-value="">{DIRECTION_LABELS[value]}</span>
        <Icon name="chevron" size={14} className="text-muted" />
      </button>
      {open && (
        <div
          ref={listRef}
          id={`${id}-list`}
          role="listbox"
          data-state="open"
          tabIndex={-1}
          aria-labelledby={labelId}
          aria-activedescendant={`${id}-opt-${active}`}
          onKeyDown={onListKeyDown}
          className="absolute top-[calc(100%+4px)] right-0 z-30 min-w-[280px] rounded-[6px] border border-ink bg-surface p-1 focus:outline-none"
        >
          {DIRECTIONS.map((d, i) => {
            const selected = d === value;
            return (
              <div
                key={d}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={selected}
                onPointerMove={() => setActive(i)}
                onClick={() => pick(d)}
                className={cx(
                  "flex h-11 cursor-pointer items-center gap-3 rounded-[4px] px-2",
                  i === active && "bg-hover-surface",
                )}
              >
                <span className="w-[68px] shrink-0 font-mono text-[12px] font-medium tracking-[.06em] text-ink">{DIRECTION_LABELS[d]}</span>
                <span className="min-w-0 flex-1 text-[13px] leading-5 whitespace-nowrap text-muted">{DIRECTION_NAMES[d]}</span>
                <span className="flex w-4 shrink-0 justify-end text-ink">{selected && <Icon name="check" size={16} />}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
