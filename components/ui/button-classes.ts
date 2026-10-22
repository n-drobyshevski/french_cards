import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "danger";
/** lg 52px (main actions), md 44px, sm 32px (compact tools inside a 44px row). */
export type ButtonSize = "lg" | "md" | "sm";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "border border-ink bg-ink text-on-ink active:opacity-85",
  secondary: "border border-ink bg-surface text-ink active:bg-surface-2",
  tertiary:
    "bg-transparent text-ink underline decoration-1 underline-offset-4 active:decoration-2 active:text-muted",
  danger: "bg-transparent text-again active:underline active:decoration-1 active:underline-offset-4",
};

const SIZES: Record<ButtonSize, string> = {
  lg: "h-[52px] px-5 text-[15px] gap-2",
  md: "h-11 px-4 text-[15px] gap-2",
  sm: "h-8 px-2.5 text-[13px] gap-1.5",
};

export interface ButtonStyleOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Full width. */
  block?: boolean;
  className?: string;
}

/** Class string for button-looking elements that are not <button>, e.g. next/link. */
export function buttonClasses({ variant = "primary", size = "lg", block = false, className }: ButtonStyleOptions = {}): string {
  return cx(
    "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-btn font-medium leading-5 no-underline",
    "transition-[opacity,background-color] duration-(--dur-quick) ease-press disabled:pointer-events-none disabled:opacity-40 aria-disabled:pointer-events-none aria-disabled:opacity-40",
    // Pending (or a pending sibling's footer) blocks taps but keeps full contrast (MOTION-SPEC §3.5).
    "data-blocked:pointer-events-none data-blocked:opacity-100!",
    VARIANTS[variant],
    SIZES[size],
    // Text-only variants keep a 44px hit area at sm size.
    (variant === "tertiary" || variant === "danger") && size === "sm" && "relative before:absolute before:-inset-y-1.5 before:inset-x-0",
    block && "w-full",
    className,
  );
}
