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

/** 30px filter/choice chip, radius 4, with a 44px tall hit area. Press .96; the ink fill crossfades over --dur-quick. */
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
        "press-sm relative inline-flex h-[30px] shrink-0 items-center gap-1 whitespace-nowrap rounded-chip border px-2.5 text-[13px] leading-4",
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

export interface SplitChipHalf extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> {
  /** Visible text: «FR → RU», «Все темы». */
  label: ReactNode;
  /** Each half is its own button with its own name: «Направление FR → RU, сменить», «Что повторять: все темы». */
  "aria-label": string;
  /** Mono uppercase text (the direction half). */
  mono?: boolean;
  /** Trailing ▾ for a half that opens a menu or sheet. */
  dropdown?: boolean;
}

export interface SplitChipProps {
  start: SplitChipHalf;
  end: SplitChipHalf;
  className?: string;
}

const splitHalf =
  "relative inline-flex h-11 items-center gap-1 whitespace-nowrap bg-transparent text-ink disabled:opacity-40 " +
  // The pressed tint fills only the 30px frame, not the 44px hit area.
  "before:absolute before:inset-x-0 before:inset-y-[8px] before:content-[''] before:transition-colors before:duration-(--dur-quick) before:ease-press active:before:bg-surface-2 active:before:duration-(--dur-instant)";

function SplitHalf({ half, side }: { half: SplitChipHalf; side: "start" | "end" }) {
  const { label, mono = false, dropdown = false, className, type = "button", ...rest } = half;
  return (
    <button
      type={type}
      {...rest}
      className={cx(
        splitHalf,
        "touch-manipulation",
        side === "start" ? "pr-2 pl-2.5 before:left-px before:rounded-l-[3px]" : "pr-2 pl-[9px] before:right-px before:rounded-r-[3px]",
        mono ? "font-mono text-[12px] font-medium tracking-[.06em] uppercase" : "text-[13px] leading-4",
        className,
      )}
    >
      <span className="relative inline-flex items-center gap-1">
        {label}
        {dropdown && <Icon name="chevron" size={14} className="text-muted" />}
      </span>
    </button>
  );
}

/**
 * Two chips in one 30px frame (mockups/L-Kit.dc.html §03, spec change §1): «FR → RU ┊ Все темы ▾».
 * Each half is a 44px-tall button with its own aria-label; a 1px × 16px hairline divides them.
 * Phone review header; desktop keeps its separate chips.
 */
export function SplitChip({ start, end, className }: SplitChipProps) {
  return (
    <div role="group" className={cx("relative inline-flex h-11 shrink-0 items-stretch self-start", className)}>
      <span aria-hidden="true" className="absolute inset-x-0 top-[7px] h-[30px] rounded-chip border border-rule bg-surface" />
      <SplitHalf half={start} side="start" />
      <span aria-hidden="true" className="relative h-4 w-px self-center bg-rule" />
      <SplitHalf half={end} side="end" />
    </div>
  );
}
