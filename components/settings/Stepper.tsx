import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icons";

export interface StepperProps {
  value: number;
  onStep: (delta: 1 | -1) => void;
  min?: number;
  max?: number;
  label: string;
  disabled?: boolean;
  /** Shown in place of the number (e.g. «∞» for «без лимита»). */
  display?: ReactNode;
}

/**
 * Outlined − value + stepper (30px box, 44px hit areas). Press (T4): the pressed half of the box
 * tints --surface-2 and the button scales .96; the number is a plain tabular swap.
 */
export function Stepper({ value, onStep, min = 0, max = Infinity, label, disabled, display }: StepperProps) {
  // The tint fills the pressed half inside the box's 1px outline (box: 6px in, 7px down, 30px tall).
  const btn = cx(
    "press-sm relative flex size-11 items-center justify-center bg-transparent p-0 text-ink disabled:opacity-40",
    "before:absolute before:inset-y-2 before:transition-colors before:duration-(--dur-quick) before:ease-press",
    "active:before:bg-surface-2 active:before:duration-(--dur-instant) disabled:before:bg-transparent",
  );
  return (
    <div role="group" aria-label={label} className="relative -mr-1.5 flex h-11 items-center">
      <span aria-hidden="true" className="absolute inset-x-1.5 top-[7px] h-[30px] rounded-chip border border-rule bg-surface" />
      <button
        type="button"
        aria-label="Меньше"
        disabled={disabled || value <= min}
        onClick={() => onStep(-1)}
        className={cx(btn, "pl-1.5 before:right-0 before:left-[7px] before:rounded-l-[3px]")}
      >
        <Icon name="minus" size={14} />
      </button>
      <output
        aria-live="polite"
        className="relative flex h-[30px] min-w-8 items-center justify-center border-x border-rule px-1 font-mono text-[14px] font-medium tabular-nums"
      >
        {display ?? value}
      </output>
      <button
        type="button"
        aria-label="Больше"
        disabled={disabled || value >= max}
        onClick={() => onStep(1)}
        className={cx(btn, "pr-1.5 before:right-[7px] before:left-0 before:rounded-r-[3px]")}
      >
        <Icon name="plus" size={14} />
      </button>
    </div>
  );
}
