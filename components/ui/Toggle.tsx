import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx";

export interface ToggleProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "role"> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/**
 * Square-ish switch (44×24 track, radius 4) inside a 52×44 hit area.
 * Needs an accessible name: aria-label or aria-labelledby pointing at the row label.
 */
export function Toggle({ checked, onCheckedChange, disabled, className, onClick, type = "button", ...rest }: ToggleProps) {
  return (
    <button
      type={type}
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) onCheckedChange(!checked);
      }}
      className={cx(
        "-mr-1 inline-flex h-11 w-[52px] shrink-0 items-center justify-center bg-transparent disabled:opacity-40",
        className,
      )}
      {...rest}
    >
      <span
        aria-hidden="true"
        className={cx(
          "flex h-6 w-11 box-border rounded-chip transition-colors duration-150",
          checked ? "justify-end bg-ink p-[3px]" : "justify-start border border-muted bg-surface p-[2px]",
        )}
      >
        <span className={cx("size-[18px] rounded-[2px]", checked ? "bg-on-ink" : "bg-muted")} />
      </span>
    </button>
  );
}
