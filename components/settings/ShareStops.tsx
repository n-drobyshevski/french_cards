"use client";

import { useId } from "react";
import { cx } from "@/components/ui/cx";

export interface ShareStop<T extends string> {
  value: T;
  label: string;
}

/**
 * A 3-stop slider («Сколько в наборе», board Exercise-S-Settings-Focus): native radios drawn as stops
 * on a 2px track, labels under them. Each column is the hit area (64px tall); arrows move and pick
 * (native radio group). `value` null: nothing chosen yet (values still loading). `disabled` dims the
 * whole slider and blocks it, keeping the value.
 */
export function ShareStops<T extends string>({
  options,
  value,
  onChange,
  labelledBy,
  disabled = false,
  className,
}: {
  options: readonly ShareStop<T>[];
  value: T | null;
  onChange: (value: T) => void;
  labelledBy: string;
  disabled?: boolean;
  className?: string;
}) {
  const name = useId();
  const selected = value === null ? -1 : options.findIndex((o) => o.value === value);
  const last = options.length - 1;
  const inset = `${50 / options.length}%`;
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-disabled={disabled || undefined}
      data-share-stops=""
      className={cx("relative grid h-16 transition-opacity duration-(--dur-quick)", disabled && "opacity-40", className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span aria-hidden="true" className="absolute top-[21px] h-0.5 bg-rule" style={{ left: inset, right: inset }} />
      <span aria-hidden="true" className="absolute top-[21px] h-0.5" style={{ left: inset, right: inset }}>
        <span
          className="absolute inset-0 origin-left bg-ink motion-safe:[transition:transform_var(--dur-move)_var(--ease-standard)]"
          style={{ transform: `scaleX(${selected > 0 ? selected / last : 0})` }}
        />
      </span>
      {options.map((option, i) => {
        const checked = i === selected;
        return (
          <label
            key={option.value}
            className={cx(
              "relative flex flex-col items-center rounded-[4px] has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-ink",
              disabled ? "cursor-default" : "cursor-pointer",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={checked}
              disabled={disabled}
              onChange={() => onChange(option.value)}
              className="absolute top-0 left-0 m-0 size-px opacity-0"
            />
            <span aria-hidden="true" className="flex h-11 items-center justify-center">
              {checked ? (
                <span className="flex size-[22px] items-center justify-center rounded-[4px] border-2 border-ink bg-surface">
                  <span className="size-2 rounded-[1px] bg-ink" />
                </span>
              ) : (
                <span
                  className={cx(
                    "size-2.5 rounded-[2px] transition-colors duration-(--dur-quick)",
                    i < selected ? "bg-ink" : "border border-boundary bg-paper",
                  )}
                />
              )}
            </span>
            <span className={cx("text-[13px] leading-4 whitespace-nowrap", checked ? "font-medium text-ink" : "text-muted")}>
              {option.label}
            </span>
          </label>
        );
      })}
    </div>
  );
}
