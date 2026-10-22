import type { HTMLAttributes } from "react";
import { cx } from "./cx";

export interface KbdProps extends HTMLAttributes<HTMLElement> {
  /** paper (default): white cap with a hairline. ink: on dark buttons and the snackbar. */
  tone?: "paper" | "ink";
}

/**
 * Key cap (DESKTOP-SPEC §3): mono 11, 18px tall, 1px hairline, radius 3. Reads as a typed label,
 * not a key. Inside a labelled control pass aria-hidden and put the key in aria-keyshortcuts.
 * Format combos with useFormatKeys() from lib/key-names (⌘↵ on Mac, Ctrl+Enter elsewhere).
 */
export function Kbd({ tone = "paper", className, children, ...rest }: KbdProps) {
  return (
    <kbd
      className={cx(
        "inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-[3px] border px-1 font-mono text-[11px] leading-none font-normal whitespace-nowrap",
        tone === "ink" ? "border-on-ink/40 bg-transparent text-on-ink" : "border-rule bg-surface text-muted",
        className,
      )}
      {...rest}
    >
      {children}
    </kbd>
  );
}

/** Flat key name without a box, for hint lines and the sidebar («+ Новое слово  N»). */
export function FlatKey({ className, children, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd className={cx("font-mono text-[11px] leading-4 font-normal text-muted", className)} {...rest}>
      {children}
    </kbd>
  );
}
