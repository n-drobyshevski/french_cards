import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icons";

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Selected = ink background. Sets aria-pressed (or aria-checked when role="radio"/"checkbox"). Leave undefined for action chips. */
  selected?: boolean;
  /** Mono count after the label: «К повторению 23». */
  count?: number | string;
  /** Leading icon (14px). */
  icon?: IconName;
  /** Trailing chevron for chips that open a menu: «Все темы ▾». */
  dropdown?: boolean;
  /** Dashed outline for «+ новая тема: …». */
  dashed?: boolean;
  /** Mono uppercase label, e.g. the «FR → RU» direction chip. */
  mono?: boolean;
  children?: ReactNode;
}

/** 30px filter/choice chip, radius 4, with a 44px tall hit area. */
export function Chip({
  selected,
  count,
  icon,
  dropdown = false,
  dashed = false,
  mono = false,
  className,
  type = "button",
  role,
  children,
  ...rest
}: ChipProps) {
  const checkable = role === "radio" || role === "checkbox" || role === "menuitemradio" || role === "option";
  const state =
    selected === undefined
      ? {}
      : role === "option"
        ? { "aria-selected": selected }
        : checkable
          ? { "aria-checked": selected }
          : { "aria-pressed": selected };
  return (
    <button
      type={type}
      role={role}
      {...state}
      className={cx(
        "relative inline-flex h-[30px] shrink-0 items-center gap-1 whitespace-nowrap rounded-chip border px-2.5 text-[13px] leading-4",
        "before:absolute before:-inset-y-[8px] before:inset-x-0 before:content-['']",
        "disabled:opacity-40",
        selected ? "border-ink bg-ink font-medium text-on-ink" : "bg-surface text-ink active:bg-surface-2",
        !selected && (dashed ? "border-dashed border-muted" : "border-rule"),
        mono && "gap-2 font-mono text-[12px] font-medium tracking-[.06em] uppercase",
        dropdown && "pr-2",
        className,
      )}
      {...rest}
    >
      {icon && <Icon name={icon} size={14} strokeWidth={2} />}
      {children}
      {count != null && (
        <span className={cx("font-mono text-[11px] font-normal", selected ? "text-on-ink/75" : "text-muted")}>{count}</span>
      )}
      {dropdown && <Icon name="chevron" size={14} className={selected ? "text-on-ink" : "text-muted"} />}
    </button>
  );
}
