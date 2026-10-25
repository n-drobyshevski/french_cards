"use client";

import type { ReactNode, TransitionEvent } from "react";
import { cx } from "./cx";

export interface CollapseProps {
  /** Open = natural height; closed = 0 tall, faded out, inert (nothing inside takes focus). */
  open: boolean;
  /** Also open from 0 on mount (a row that was just inserted). Without it a Collapse mounts as it is. */
  appear?: boolean;
  /** Called once the height has finished closing (remove the row here). */
  onClosed?: () => void;
  /** Classes for the outer grid (margins, borders belong inside on `innerClassName`). */
  className?: string;
  /** Classes for the clipping box around the children. */
  innerClassName?: string;
  children: ReactNode;
}

/**
 * Height open/close without measuring (MOTION-SPEC K6, §5.10): the grid row animates 0fr ↔ 1fr over
 * --dur-move on --ease-standard. The content fades in over --dur-enter (--ease-enter) and out over
 * --dur-quick (--ease-exit), so it is gone before the height has closed. Under reduced motion both
 * shrink to --dur-quick (the height still eases, briefly). Pair an inserted row with `spotlight`.
 * The children are clipped (overflow clip, not hidden: a clip is no scroll box, so focusing or
 * scrolling to something inside a half-open body cannot shift it): keep focus rings inside with
 * padding on `innerClassName`.
 */
export function Collapse({ open, appear = false, onClosed, className, innerClassName, children }: CollapseProps) {
  const onTransitionEnd = (event: TransitionEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && event.propertyName === "grid-template-rows" && !open) onClosed?.();
  };
  return (
    <div
      data-state={open ? "open" : "closed"}
      inert={!open}
      onTransitionEnd={onTransitionEnd}
      className={cx(
        "grid",
        open
          ? "grid-rows-[1fr] opacity-100 [transition:grid-template-rows_var(--dur-move)_var(--ease-standard),opacity_var(--dur-enter)_var(--ease-enter)]"
          : "grid-rows-[0fr] opacity-0 [transition:grid-template-rows_var(--dur-move)_var(--ease-standard),opacity_var(--dur-quick)_var(--ease-exit)]",
        appear && "starting:grid-rows-[0fr] starting:opacity-0",
        className,
      )}
    >
      <div className={cx("min-h-0 overflow-clip", innerClassName)}>{children}</div>
    </div>
  );
}
