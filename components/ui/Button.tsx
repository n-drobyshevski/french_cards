"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useDelayedFlag } from "@/lib/use-delayed-flag";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icons";

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

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, Omit<ButtonStyleOptions, "className"> {
  /** Leading icon from the Icon set. */
  icon?: IconName;
  /** Trailing content, e.g. a mono count: «Применить 10». */
  trailing?: ReactNode;
  /**
   * Waiting on its action: blocks a second tap at once but keeps full contrast; after `pendingDelay`
   * the label swaps to `pendingLabel` («Добавляем…») with the width locked to the wider label.
   */
  pending?: boolean;
  pendingLabel?: ReactNode;
  /** 150 ms by default; 0 for actions that always wait on the network («Войти»). */
  pendingDelay?: number;
  /** A sibling in the same footer is pending: block taps, keep the look. */
  blocked?: boolean;
}

export function Button({
  variant = "primary",
  size = "lg",
  block,
  icon,
  trailing,
  pending = false,
  pendingLabel,
  pendingDelay = 150,
  blocked = false,
  disabled,
  className,
  type = "button",
  onClick,
  children,
  ...rest
}: ButtonProps) {
  const swapped = useDelayedFlag(pending && pendingLabel != null, {
    delay: pendingDelay,
    min: 0,
  });
  const stopped = pending || blocked;
  return (
    <button
      type={type}
      disabled={disabled}
      aria-disabled={stopped || undefined}
      aria-busy={pending || undefined}
      data-blocked={stopped ? "" : undefined}
      className={buttonClasses({ variant, size, block, className })}
      onClick={(event) => {
        if (stopped) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === "sm" ? 16 : 18} />}
      {pendingLabel != null ? (
        // Both labels share one grid cell, so the button keeps the wider width without measuring.
        <span className="grid">
          <span
            aria-hidden={swapped || undefined}
            className={cx("col-start-1 row-start-1 transition-opacity duration-(--dur-exit) ease-exit", swapped && "opacity-0")}
          >
            {children}
          </span>
          <span
            aria-hidden={!swapped || undefined}
            className={cx(
              "col-start-1 row-start-1 transition-opacity duration-(--dur-quick) ease-enter",
              !swapped && "opacity-0",
              swapped && (variant === "primary" ? "opacity-72" : "text-muted"),
            )}
          >
            {pendingLabel}
          </span>
        </span>
      ) : (
        children
      )}
      {trailing != null && <span className="font-mono text-[13px] tracking-[.04em]">{trailing}</span>}
    </button>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  /** Required accessible name (Russian), e.g. «Закрыть». */
  label: string;
  iconSize?: number;
  strokeWidth?: number;
}

/** 44×44 transparent icon button (header actions, sheet close). */
export function IconButton({ icon, label, iconSize = 20, strokeWidth, className, type = "button", ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={cx(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-chip bg-transparent text-ink active:bg-surface-2 disabled:opacity-40",
        className,
      )}
      {...rest}
    >
      <Icon name={icon} size={iconSize} strokeWidth={strokeWidth} />
    </button>
  );
}
