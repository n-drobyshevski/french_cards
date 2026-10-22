"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Snackbar } from "@/components/ui/Snackbar";
import { cx } from "@/components/ui/cx";

interface Entry {
  id: number;
  message: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  actionKey?: string;
}

export interface InlineSnackbarOptions {
  message: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  /** Key cap after the action from 768 up («Отменить» + `Z`). */
  actionKey?: string;
}

/**
 * From 768 up the bar floats like the app snackbar, centred in the content area (right of
 * --shell-nav), max 480 wide: 56 from the bottom on the review card (above the hint line; 24 when
 * the window is under 760 tall and the hint line is hidden), 24 on «Готово на сегодня» (DESKTOP-SPEC §2).
 */
const DESK_PLACEMENT = {
  review: "md:bottom-6 md:[@media(min-height:760px)]:bottom-14",
  done: "md:bottom-6",
} as const;

const DURATION_MS = 5000;
let nextId = 1;

/**
 * Snackbar placed in the page flow on phones (review screen: between the card and the grade
 * buttons), so it never covers the buttons. One at a time; hides after 5 s unless hovered or focused.
 */
export function useInlineSnackbar() {
  const [entry, setEntry] = useState<Entry | null>(null);
  const [paused, setPaused] = useState(false);

  const show = useCallback((options: InlineSnackbarOptions) => {
    setEntry({ ...options, id: nextId++ });
    setPaused(false);
  }, []);
  const hide = useCallback(() => setEntry(null), []);

  useEffect(() => {
    if (!entry || paused) return;
    const timer = window.setTimeout(() => setEntry((e) => (e?.id === entry.id ? null : e)), DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [entry, paused]);

  /** The bar in place; `className` spaces it from its neighbours on phones (default: 16px above). */
  const render = (className = "mt-4", placement: keyof typeof DESK_PLACEMENT = "review") => (
    <div
      role="status"
      aria-live="polite"
      className={cx(
        "shrink-0 md:pointer-events-none md:fixed md:right-0 md:left-(--shell-nav) md:z-[60] md:mx-auto md:w-full md:max-w-[512px] md:px-4",
        DESK_PLACEMENT[placement],
      )}
    >
      {entry && (
        <div
          key={entry.id}
          className={cx(className, "motion-safe:animate-[snackbar-in_160ms_ease-out] md:pointer-events-auto md:m-0")}
          onPointerEnter={() => setPaused(true)}
          onPointerLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
        >
          <Snackbar
            message={entry.message}
            actionLabel={entry.actionLabel}
            actionKey={entry.actionKey}
            onAction={
              entry.onAction
                ? () => {
                    const action = entry.onAction;
                    setEntry(null);
                    action?.();
                  }
                : undefined
            }
          />
        </div>
      )}
    </div>
  );

  return { show, hide, render };
}
