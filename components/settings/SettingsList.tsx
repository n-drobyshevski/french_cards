import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "@/components/ui/cx";

/** Section label with the ink rule under it; rows are separated by hairlines. */
export function SettingsSection({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  const id = `settings-${title}`;
  return (
    <section aria-labelledby={id} className="mt-4 shrink-0">
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

const rowClass = "flex h-11 w-full shrink-0 items-center gap-2 text-left";
const labelClass = "min-w-0 flex-1 truncate text-[15px] leading-5";

/** A row with a label and a control on the right. */
export function SettingsRow({ label, labelId, children }: { label: ReactNode; labelId?: string; children?: ReactNode }) {
  return (
    <div className={rowClass}>
      <span id={labelId} className={labelClass}>
        {label}
      </span>
      {children}
    </div>
  );
}

export interface SettingsButtonRowProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: ReactNode;
  /** Right-side content: value, icon, chevron. */
  trailing?: ReactNode;
  tone?: "ink" | "again";
}

/** A tappable row («Экспорт JSON», «Направление по умолчанию ›»). */
export function SettingsButtonRow({
  label,
  trailing,
  tone = "ink",
  className,
  type = "button",
  ...rest
}: SettingsButtonRowProps) {
  return (
    <button
      type={type}
      className={cx(
        rowClass,
        "bg-transparent active:bg-surface-2 disabled:opacity-40",
        tone === "again" ? "text-again" : "text-ink",
        className,
      )}
      {...rest}
    >
      <span className={cx(labelClass, tone === "again" && "font-medium")}>{label}</span>
      {trailing}
    </button>
  );
}
