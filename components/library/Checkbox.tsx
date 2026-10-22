import { cx } from "@/components/ui/cx";

/**
 * The desktop checkbox mark (DESKTOP-SPEC §3): 14×14, radius 2, 1px muted border; checked = ink
 * fill with a white check; indeterminate = an 8px dash. Purely visual: the row or gutter around it
 * is the control (role="checkbox" / aria-selected there).
 */
export function CheckMark({ checked, indeterminate = false, className }: { checked: boolean; indeterminate?: boolean; className?: string }) {
  const on = checked || indeterminate;
  return (
    <span
      aria-hidden="true"
      className={cx(
        "box-border flex size-3.5 shrink-0 items-center justify-center rounded-[2px] border",
        on ? "border-ink bg-ink text-on-ink" : "border-muted bg-surface",
        className,
      )}
    >
      {indeterminate ? (
        <span className="h-[1.5px] w-2 bg-on-ink" />
      ) : checked ? (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="m5 12 5 5 9-10" />
        </svg>
      ) : null}
    </span>
  );
}
