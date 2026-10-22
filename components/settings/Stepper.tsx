import { Icon } from "@/components/ui/Icons";

export interface StepperProps {
  value: number;
  onStep: (delta: 1 | -1) => void;
  min?: number;
  max?: number;
  label: string;
  disabled?: boolean;
}

/** Outlined − value + stepper (30px box, 44px hit areas). */
export function Stepper({ value, onStep, min = 0, max = Infinity, label, disabled }: StepperProps) {
  const btn =
    "relative flex size-11 items-center justify-center bg-transparent p-0 text-ink disabled:opacity-40 active:text-muted";
  return (
    <div role="group" aria-label={label} className="relative -mr-1.5 flex h-11 items-center">
      <span aria-hidden="true" className="absolute inset-x-1.5 top-[7px] h-[30px] rounded-chip border border-rule bg-surface" />
      <button
        type="button"
        aria-label="Меньше"
        disabled={disabled || value <= min}
        onClick={() => onStep(-1)}
        className={`${btn} pl-1.5`}
      >
        <Icon name="minus" size={14} />
      </button>
      <output
        aria-live="polite"
        className="relative flex h-[30px] min-w-8 items-center justify-center border-x border-rule px-1 font-mono text-[14px] font-medium"
      >
        {value}
      </output>
      <button
        type="button"
        aria-label="Больше"
        disabled={disabled || value >= max}
        onClick={() => onStep(1)}
        className={`${btn} pr-1.5`}
      >
        <Icon name="plus" size={14} />
      </button>
    </div>
  );
}
