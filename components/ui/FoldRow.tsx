"use client";

import { useId, useState, type ReactNode } from "react";
import { Collapse } from "./Collapse";
import { cx } from "./cx";
import { Icon } from "./Icons";

/** «происхождение, второй пример, свои поля»: the parts that exist, in order (empty ones dropped). */
export function foldSummary(parts: readonly (string | false | null | undefined)[]): string {
  return parts.filter((p): p is string => !!p && p.trim().length > 0).join(", ");
}

export interface FoldRowProps {
  /** What is inside, after «Ещё ·»: say only what this item actually has (foldSummary). */
  summary?: ReactNode;
  /** «Ещё» by default. */
  label?: ReactNode;
  /** Controlled state; leave undefined with `defaultOpen` for an uncontrolled row. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Hairlines: above and below (default), only below (a row stacked under another ruled row), or none. */
  rule?: "y" | "bottom" | "none";
  className?: string;
  /** The row's padding box, e.g. "px-4" when the row runs edge to edge. */
  buttonClassName?: string;
  /** Classes for the clipping box around the children (keep focus rings inside with padding). */
  bodyClassName?: string;
  children: ReactNode;
}

/**
 * «Ещё · <what is inside> ⌄» (mockups/L-Kit.dc.html §09, synthesis §2.13): ⌄ expands in place, ›
 * navigates. One 44px row; the children open under it with Collapse (height + fade, inert while
 * closed), the chevron turns over --dur-move. Never opens a second sheet.
 */
export function FoldRow({
  summary,
  label = "Ещё",
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  rule = "y",
  className,
  buttonClassName,
  bodyClassName,
  children,
}: FoldRowProps) {
  const [own, setOwn] = useState(defaultOpen);
  const open = openProp ?? own;
  const bodyId = useId();
  const toggle = () => {
    if (openProp === undefined) setOwn(!open);
    onOpenChange?.(!open);
  };
  return (
    <div className={cx(rule === "y" && "border-y border-rule", rule === "bottom" && "border-b border-rule", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={toggle}
        className={cx(
          "press-tint flex h-11 w-full min-w-0 items-center gap-1.5 bg-transparent text-left text-[14px] leading-5 whitespace-nowrap text-ink",
          buttonClassName,
        )}
      >
        <span className="shrink-0 font-medium">{label}</span>
        {summary != null && summary !== "" && <span className="min-w-0 truncate text-muted">· {summary}</span>}
        <span className="flex-1" />
        <Icon
          name="chevron"
          size={16}
          className={cx(
            "shrink-0 text-muted transition-[rotate] duration-(--dur-move) ease-standard motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
      </button>
      <Collapse open={open} innerClassName={bodyClassName}>
        <div id={bodyId}>{children}</div>
      </Collapse>
    </div>
  );
}
