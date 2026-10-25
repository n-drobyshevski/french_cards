"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { LeavingSnackbars, Snackbar, useLeavingSnackbars, usePageHidden } from "@/components/ui/Snackbar";
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
 * Where the bar sits. Review card, phones: over the card's footer zone, 8px above the grade bar,
 * so the card never resizes (MOTION-SPEC R9); render it inside a `relative` box that starts at the
 * grade bar. «Готово на сегодня», phones: in the flow above the actions.
 * From 768 up the bar floats like the app snackbar, centred in the content area (right of
 * --shell-nav), max 480 wide: 56 from the bottom on the review card (above the hint line; 24 when
 * the window is under 760 tall and the hint line is hidden), 24 on «Готово на сегодня» (DESKTOP-SPEC §2).
 */
const PLACEMENT = {
  review: "max-md:absolute max-md:inset-x-0 max-md:bottom-full max-md:z-10 max-md:mb-2 md:bottom-6 md:[@media(min-height:760px)]:bottom-14",
  done: "shrink-0 md:bottom-6",
} as const;

const DURATION_MS = 5000;
let nextId = 1;

/**
 * Snackbar of the review screen, placed by the screen instead of the app's floating host so it
 * never covers the grade buttons. One at a time; hides after 5 s unless hovered or focused (the
 * timer also stops while the page is hidden). Enters with an 8px rise (--dur-enter), leaves the
 * way it came (--dur-exit); a replacement enters while the old bar leaves. Fades only under
 * reduced motion.
 */
export function useInlineSnackbar() {
  const [entry, setEntry] = useState<Entry | null>(null);
  const [paused, setPaused] = useState(false);
  const hidden = usePageHidden();
  const { leaving, leave } = useLeavingSnackbars<Entry>();
  const current = useRef<Entry | null>(null);

  const swap = useCallback(
    (next: Entry | null, swiped = false) => {
      // A swiped bar has already left the screen: no outgoing copy at its old place.
      if (current.current && !swiped) leave(current.current);
      current.current = next;
      setEntry(next);
      setPaused(false);
    },
    [leave],
  );
  const show = useCallback((options: InlineSnackbarOptions) => swap({ ...options, id: nextId++ }), [swap]);
  const hide = useCallback(() => swap(null), [swap]);

  useEffect(() => {
    if (!entry || paused || hidden) return;
    const timer = window.setTimeout(hide, DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [entry, paused, hidden, hide]);

  /** The bar in place; `className` spaces it from its neighbours when it is in the flow. */
  const render = (className?: string, placement: keyof typeof PLACEMENT = "review") => (
    <div
      role="status"
      aria-live="polite"
      className={cx(
        "pointer-events-none md:fixed md:right-0 md:left-(--shell-nav) md:z-[60] md:mx-auto md:w-full md:max-w-[512px] md:px-4",
        PLACEMENT[placement],
      )}
    >
      {(entry || leaving.length > 0) && (
        <div className="relative flow-root">
          <LeavingSnackbars leaving={leaving} overlap={!!entry} className={cx(className, "md:m-0")} />
          {entry && (
            <div
              key={entry.id}
              className={cx(className, "snackbar-in pointer-events-auto md:m-0")}
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
                        hide();
                        action?.();
                      }
                    : undefined
                }
                onDismiss={() => swap(null, true)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );

  return { show, hide, render };
}
