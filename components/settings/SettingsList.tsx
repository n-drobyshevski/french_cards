import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icons";

const rowBase = "flex w-full shrink-0 items-center gap-2 text-left";
const rowClass = `${rowBase} h-11`;
/** The phone sub-screens' few-row lists («Повторение»): 52px rows. */
const tallRowClass = `${rowBase} h-13`;
const labelClass = "min-w-0 flex-1 truncate text-[15px] leading-5";

/**
 * A row with a label and a control on the right. `caption`: a muted line under the label (the row
 * grows to fit it).
 */
export function SettingsRow({
  label,
  labelId,
  caption,
  captionId,
  tall = false,
  className,
  children,
}: {
  label: ReactNode;
  labelId?: string;
  caption?: ReactNode;
  /** The caption's id, for the control's aria-describedby. */
  captionId?: string;
  /** 52px (60 with a caption) instead of 44. */
  tall?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cx(caption != null ? `${rowBase} ${tall ? "min-h-15 py-2.5" : "min-h-11 py-2"}` : tall ? tallRowClass : rowClass, className)}>
      {caption != null ? (
        <span className={cx("flex min-w-0 flex-1 flex-col", tall && "gap-0.5")}>
          <span id={labelId} className={labelClass}>
            {label}
          </span>
          <span id={captionId} className="text-[12px] leading-4 text-muted">
            {caption}
          </span>
        </span>
      ) : (
        <span id={labelId} className={labelClass}>
          {label}
        </span>
      )}
      {children}
    </div>
  );
}

export interface SettingsButtonRowProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: ReactNode;
  /** Right-side content: value, icon, chevron. */
  trailing?: ReactNode;
  tone?: "ink" | "again";
  /** Its action is running: taps are blocked and aria-busy is set, the row keeps its look (T6). */
  pending?: boolean;
  /** The progress label («Сохраняем…»), swapped in place of `label` while `swapped`. */
  pendingLabel?: ReactNode;
  /** Show `pendingLabel` now (the caller times it, e.g. useDelayedFlag). */
  swapped?: boolean;
  /** Another row's action is running: block taps, keep the look (no grey). */
  blocked?: boolean;
  /** 52px instead of 44. */
  tall?: boolean;
}

/**
 * A tappable row («Экспорт JSON», «Направление по умолчанию ›»). While its action runs the label
 * swaps in place to `pendingLabel` (both stacked in one cell, so nothing moves), never greyed.
 */
export function SettingsButtonRow({
  label,
  trailing,
  tone = "ink",
  pending = false,
  pendingLabel,
  swapped = false,
  blocked = false,
  tall = false,
  className,
  type = "button",
  onClick,
  ...rest
}: SettingsButtonRowProps) {
  const stopped = pending || blocked;
  const labelText = cx(labelClass, tone === "again" && "font-medium");
  return (
    <button
      type={type}
      aria-disabled={stopped || undefined}
      aria-busy={pending || undefined}
      data-blocked={stopped ? "" : undefined}
      className={cx(
        tall ? tallRowClass : rowClass,
        "press-tint bg-transparent disabled:opacity-40",
        tone === "again" ? "text-again" : "text-ink",
        className,
      )}
      onClick={(event) => {
        if (stopped) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      {...rest}
    >
      {pendingLabel != null ? (
        <span className="grid min-w-0 flex-1">
          <span
            aria-hidden={swapped || undefined}
            className={cx(labelText, "col-start-1 row-start-1 transition-opacity duration-(--dur-exit) ease-exit", swapped && "opacity-0")}
          >
            {label}
          </span>
          <span
            aria-hidden={!swapped || undefined}
            className={cx(labelText, "col-start-1 row-start-1 transition-opacity duration-(--dur-quick) ease-enter", !swapped && "opacity-0")}
          >
            {pendingLabel}
          </span>
        </span>
      ) : (
        <span className={labelText}>{label}</span>
      )}
      {trailing}
    </button>
  );
}

/** An index row opened the sub-screen being shown: its back arrow goes back in history. */
let openedFromIndex = false;

/** Whether the sub-screen now opening was opened from the index (read once, as it mounts). */
export const wasOpenedFromIndex = () => openedFromIndex;

/** Forget it once the sub-screen has read it (a later deep link opens it without the index). */
export function forgetOpenedFromIndex() {
  openedFromIndex = false;
}

/**
 * A row of the phone Settings index (pick S1 B): the name in Newsreader 19, under it a 12px muted
 * caption with the current values, a chevron; the whole row is the link to the sub-screen. `dashed`:
 * the bottom rule is dashed (nothing on record yet, e.g. no custom fields). The accessible name is
 * «Повторение: FR → RU, 3 кнопки, свайпы».
 */
export function SettingsIndexRow({
  href,
  label,
  caption,
  captionText,
  dashed = false,
}: {
  href: string;
  label: string;
  /** The caption as drawn (e.g. with a status dot); `captionText` is its words. */
  caption?: ReactNode;
  /** The caption's words, for the accessible name; empty while the values load. */
  captionText: string;
  dashed?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={() => {
        openedFromIndex = true;
      }}
      aria-label={captionText ? `${label}: ${captionText.replace(/ · /g, ", ")}` : label}
      className={cx(
        "press-tint flex min-h-16 shrink-0 items-center gap-2.5 border-b py-[11px] text-ink no-underline",
        dashed ? "border-dashed border-boundary" : "border-rule",
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-serif text-[19px] leading-6 font-medium">{label}</span>
        <span className="min-h-4 truncate text-[12px] leading-4 text-muted">{caption ?? captionText}</span>
      </span>
      <Icon name="chevron-right" size={16} strokeWidth={1.75} className="-mr-0.5 shrink-0 text-muted" />
    </Link>
  );
}
