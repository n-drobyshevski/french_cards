"use client";

import { useState, type ButtonHTMLAttributes } from "react";
import { haptic } from "@/lib/haptics";
import { cx } from "./cx";

export interface ToggleProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "role"> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/**
 * Square-ish switch (44×24 track, radius 4) inside a 52×44 hit area.
 * Needs an accessible name: aria-label or aria-labelledby pointing at the row label.
 * Motion (T2): after a tap the thumb slides (translate, --dur-move --ease-standard; jumps under
 * reduced motion); a value that arrives from elsewhere (first load, sync) only fades. The track
 * colour and the thumb's opacity fade over --dur-quick; press .96; a `tick` haptic on change.
 */
export function Toggle({ checked, onCheckedChange, disabled, className, onClick, type = "button", ...rest }: ToggleProps) {
  const [tapped, setTapped] = useState(false);
  return (
    <button
      type={type}
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        haptic("tick");
        setTapped(true);
        onCheckedChange(!checked);
      }}
      className={cx(
        "press-sm -mr-1 inline-flex h-11 w-[52px] shrink-0 items-center justify-center bg-transparent disabled:opacity-40",
        className,
      )}
      {...rest}
    >
      <span
        aria-hidden="true"
        className={cx(
          "box-border flex h-6 w-11 items-center rounded-chip border p-[2px] transition-colors duration-(--dur-quick) ease-standard",
          checked ? "border-ink bg-ink" : "border-muted bg-surface",
        )}
      >
        <span
          data-toggle-thumb=""
          className={cx(
            "size-[18px] rounded-[2px]",
            "[transition:background-color_var(--dur-quick)_var(--ease-standard),opacity_var(--dur-quick)_var(--ease-standard)]",
            tapped &&
              "motion-safe:[transition:translate_var(--dur-move)_var(--ease-standard),background-color_var(--dur-quick)_var(--ease-standard),opacity_var(--dur-quick)_var(--ease-standard)]",
            checked ? "translate-x-5 bg-on-ink" : "translate-x-0 bg-muted",
          )}
        />
      </span>
    </button>
  );
}
