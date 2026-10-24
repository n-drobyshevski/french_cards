"use client";

import { useRef, type KeyboardEvent } from "react";
import { cx } from "@/components/ui/cx";

export interface TextOption<T extends string | number> {
  value: T;
  label: string;
  lang?: string;
  /** When the visible label is not the whole name («B1, сейчас оценка»). */
  ariaLabel?: string;
  /** A dotted underline under an unselected option (the estimate in «Уровень языка»). */
  dotted?: boolean;
}

/**
 * Text options (DESKTOP-SPEC §3): 14px choices split by 16px hairlines; selected = ink 600 with a
 * 1px underline 4px under the baseline, the rest muted. A radiogroup; arrows move the choice.
 */
export function TextOptions<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabelledby,
  itemClassName,
  className,
}: {
  options: readonly TextOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabelledby?: string;
  itemClassName?: string;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div role="radiogroup" aria-labelledby={ariaLabelledby} className={cx("flex items-center", className)}>
      {options.map((o, i) => {
        const selected = o.value === value;
        return (
          <span key={String(o.value)} className="flex items-center">
            {i > 0 && <span aria-hidden="true" className="h-4 w-px bg-rule" />}
            <button
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              aria-label={o.ariaLabel}
              lang={o.lang}
              onClick={() => onChange(o.value)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cx(
                "h-8 bg-transparent px-3 text-[14px] underline-offset-4",
                selected ? "font-semibold text-ink underline decoration-1" : "font-medium text-muted hoverable:text-ink",
                !selected && o.dotted && "underline decoration-dotted decoration-1",
                i === 0 && "pl-0",
                itemClassName,
              )}
            >
              {o.label}
            </button>
          </span>
        );
      })}
    </div>
  );
}
