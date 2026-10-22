"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useDelayedFlag } from "@/lib/use-delayed-flag";
import { buttonClasses, type ButtonStyleOptions } from "./button-classes";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icons";

export { buttonClasses, type ButtonSize, type ButtonStyleOptions, type ButtonVariant } from "./button-classes";

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

/** 44×44 transparent icon button (header actions, sheet close). With a mouse its name shows on hover. */
export function IconButton({ icon, label, iconSize = 20, strokeWidth, className, type = "button", title, ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={title ?? label}
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
