import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "@/components/ui/cx";

/**
 * Section label with the ink rule under it; rows are separated by hairlines. `anchor`: the section's
 * id, a link target («/settings#set-data» from the library's sync mark, T7).
 */
export function SettingsSection({ title, children, footer, anchor }: { title: string; children: ReactNode; footer?: ReactNode; anchor?: string }) {
  const id = `settings-${title}`;
  return (
    <section id={anchor} aria-labelledby={id} className="mt-4 shrink-0">
      <h2
        id={id}
        className="m-0 border-b border-ink pb-2 font-mono text-[11px] leading-4 font-medium tracking-[.06em] text-muted uppercase"
      >
        {title}
      </h2>
      <div className="divide-y divide-rule">{children}</div>
      {footer}
    </section>
  );
}

const rowBase = "flex w-full shrink-0 items-center gap-2 text-left";
const rowClass = `${rowBase} h-11`;
const labelClass = "min-w-0 flex-1 truncate text-[15px] leading-5";

/**
 * A row with a label and a control on the right. `caption`: a muted line under the label (the row
 * grows to fit it).
 */
export function SettingsRow({
  label,
  labelId,
  caption,
  className,
  children,
}: {
  label: ReactNode;
  labelId?: string;
  caption?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cx(caption != null ? `${rowBase} min-h-11 py-2` : rowClass, className)}>
      {caption != null ? (
        <span className="flex min-w-0 flex-1 flex-col">
          <span id={labelId} className={labelClass}>
            {label}
          </span>
          <span className="text-[12px] leading-4 text-muted">{caption}</span>
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
        rowClass,
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
