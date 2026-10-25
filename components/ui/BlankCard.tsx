import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icons";

export interface BlankCardAction {
  label: string;
  /** Leading 16px icon, e.g. "plus". */
  icon?: IconName;
  /** Trailing 16px icon, e.g. "chevron-right" for «К повторению ›» (a link that navigates). */
  trailingIcon?: IconName;
  /** A link when set, else a button. */
  href?: string;
  onClick?: () => void;
  /** Accessible name when it should say more than `label`. */
  ariaLabel?: string;
}

export interface BlankCardProps {
  /** The one line, Newsreader 19: «Пока нет слов», «Ничего не нашлось». */
  title: ReactNode;
  /** One optional action under the line: «+ Добавить слово». */
  action?: BlankCardAction;
  /** Heading level for the line; a <p> when omitted. */
  as?: "p" | "h1" | "h2" | "h3";
  className?: string;
}

/**
 * The empty state as a blank index card (mockups/L-Kit.dc.html §07, synthesis §2.17): a dashed
 * hairline frame (dashed = «not yet on record»), the red header rule, faint ruled lines, one serif
 * line and at most one action. No illustration, no caption.
 */
export function BlankCard({ title, action, as: Line = "p", className }: BlankCardProps) {
  const actionClass =
    "press-sm mt-1 inline-flex h-11 items-center gap-1.5 rounded-chip px-2 text-[14px] font-medium text-ink active:bg-surface-2";
  const actionBody = action && (
    <>
      {action.icon && <Icon name={action.icon} size={16} />}
      {action.label}
      {action.trailingIcon && <Icon name={action.trailingIcon} size={16} />}
    </>
  );
  return (
    <div
      className={cx(
        "relative flex min-h-28 flex-col overflow-hidden rounded-card border border-dashed border-rule-dashed bg-surface",
        className,
      )}
    >
      <span aria-hidden="true" className="h-5 shrink-0 border-b-2 border-red" />
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-[53px] bottom-0 bg-[linear-gradient(var(--card-lines)_0_1px,transparent_1px)] bg-size-[100%_32px]"
      />
      <div className="relative flex flex-1 flex-col items-center px-4 pt-1.5 pb-2 text-center">
        <Line className="m-0 font-serif text-[19px] leading-6 font-medium text-ink">{title}</Line>
        {action &&
          (action.href ? (
            <Link href={action.href} aria-label={action.ariaLabel} onClick={action.onClick} className={actionClass}>
              {actionBody}
            </Link>
          ) : (
            <button type="button" aria-label={action.ariaLabel} onClick={action.onClick} className={actionClass}>
              {actionBody}
            </button>
          ))}
      </div>
    </div>
  );
}
