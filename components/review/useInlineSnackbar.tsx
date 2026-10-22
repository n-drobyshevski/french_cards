"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Snackbar } from "@/components/ui/Snackbar";
import { cx } from "@/components/ui/cx";

interface Entry {
  id: number;
  message: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}

export interface InlineSnackbarOptions {
  message: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}

const DURATION_MS = 5000;
let nextId = 1;

/**
 * Snackbar placed in the page flow (review screen: between the card and the grade buttons),
 * so it never covers the buttons. One at a time; hides after 5 s unless hovered or focused.
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

  /** The bar in place; `className` spaces it from its neighbours (default: 16px above). */
  const render = (className = "mt-4") => (
    <div role="status" aria-live="polite" className="shrink-0">
      {entry && (
        <div
          key={entry.id}
          className={cx(className, "motion-safe:animate-[snackbar-in_160ms_ease-out]")}
          onPointerEnter={() => setPaused(true)}
          onPointerLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
        >
          <Snackbar
            message={entry.message}
            actionLabel={entry.actionLabel}
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
