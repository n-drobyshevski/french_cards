"use client";

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { haptic, thresholdNotifier } from "@/lib/haptics";

const LONG_PRESS_MS = 500;
const SLOP = 8;
/** A release faster than this (px/ms) opens or closes the actions whatever the distance (L8). */
const FLICK = 0.5;
/** Past this share of the row a swipe locks «Удалить»: the button fills the row, release deletes. */
const FULL_SWIPE = 0.6;
/** If the delete after a full swipe did not take the row away, bring it back. */
const FLUNG_RESET_MS = 1_000;

export interface SwipeRowProps {
  /** Actions revealed on swipe-left, laid out right-aligned in `actionsWidth` (wider while dragged past it). `locked`: a full swipe will delete. */
  actions: (opts: { open: boolean; locked: boolean }) => ReactNode;
  actionsWidth?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Plain tap (or Enter/Space). */
  onTap: () => void;
  /** Long press, right click or the context-menu key: the fallback for the swipe actions. */
  onLongPress: () => void;
  /** Released after a swipe past 60 % of the row (the full swipe): delete. Without it the drag stops at the actions. */
  onFullSwipe?: () => void;
  /** Lifted off the list while its menu is open (after a long press). */
  lifted?: boolean;
  /** Back after «Отменить»: lit with the spotlight (paper fade) as it opens. */
  highlight?: boolean;
  /** Accessible name of the row button. */
  label: string;
  className?: string;
  children: ReactNode;
}

/**
 * A list row that slides left to reveal actions («Переместить», «Удалить»). Vertical scrolling
 * stays native (touch-action: pan-y); a horizontal drag past the slop takes over the gesture and
 * the row follows the finger 1:1. A flick opens or closes it whatever the distance; a swipe past
 * 60 % locks «Удалить» (it fills the row, a haptic tick) and the release deletes (L8).
 *
 * Press (L7, §5.1): a --surface-2 tint, no scale (a full-width row). Held, the tint deepens to
 * --selected over --dur-long-press, so the long press visibly charges; when it fires the row is
 * lifted (`lifted`: 2px up on a white card with an ink edge) and the haptic tick plays.
 */
export function SwipeRow({
  actions,
  actionsWidth = 160,
  open,
  onOpenChange,
  onTap,
  onLongPress,
  onFullSwipe,
  lifted = false,
  highlight = false,
  label,
  className,
  children,
}: SwipeRowProps) {
  const [drag, setDrag] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  // Slid all the way out after a full swipe, until the row collapses away.
  const [flung, setFlung] = useState<number | null>(null);
  // Held by a finger: the tint, deepening to --selected while the long press charges.
  const [pressed, setPressed] = useState(false);
  const gesture = useRef<{
    id: number;
    x: number;
    y: number;
    base: number;
    width: number;
    dragging: boolean;
    timer: ReturnType<typeof setTimeout> | null;
    /** Last sample for the release velocity. */
    t: number;
    lx: number;
    v: number;
  } | null>(null);
  const suppressClick = useRef(false);
  const longPressed = useRef(0);
  const lockTick = useRef(thresholdNotifier());

  useEffect(() => () => {
    if (gesture.current?.timer) clearTimeout(gesture.current.timer);
  }, []);
  useEffect(() => {
    if (flung === null) return;
    const timer = setTimeout(() => setFlung(null), FLUNG_RESET_MS);
    return () => clearTimeout(timer);
  }, [flung]);

  const clearTimer = () => {
    const g = gesture.current;
    if (g?.timer) {
      clearTimeout(g.timer);
      g.timer = null;
    }
  };

  const fireLongPress = () => {
    setPressed(false);
    if (Date.now() - longPressed.current < 800) return;
    longPressed.current = Date.now();
    suppressClick.current = true;
    if (open) onOpenChange(false);
    haptic("tick");
    onLongPress();
  };

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || gesture.current?.dragging) return;
    clearTimer();
    suppressClick.current = false;
    const touch = e.pointerType !== "mouse";
    // Mouse presses tint through :active; touch sets it here (iOS :active is unreliable).
    if (touch && !open) setPressed(true);
    gesture.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      base: open ? -actionsWidth : 0,
      width: e.currentTarget.offsetWidth,
      dragging: false,
      t: e.timeStamp,
      lx: e.clientX,
      v: 0,
      timer: touch
        ? setTimeout(() => {
            if (gesture.current) gesture.current.timer = null;
            fireLongPress();
          }, LONG_PRESS_MS)
        : null,
    };
  };

  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.dragging) {
      if (Math.abs(dx) > SLOP || Math.abs(dy) > SLOP) {
        clearTimer();
        setPressed(false);
      }
      if (Math.abs(dx) > SLOP && Math.abs(dx) > Math.abs(dy)) {
        g.dragging = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      } else return;
    }
    const dt = e.timeStamp - g.t;
    if (dt > 0) g.v = 0.8 * ((e.clientX - g.lx) / dt) + 0.2 * g.v;
    g.t = e.timeStamp;
    g.lx = e.clientX;

    const raw = g.base + dx;
    const far = onFullSwipe ? -g.width : -actionsWidth;
    // 1:1 inside the travel, gentle resistance past either end.
    const offset = raw > 0 ? raw / 4 : raw < far ? far + (raw - far) / 4 : raw;
    setDrag(offset);
    if (onFullSwipe) {
      const past = -offset > g.width * FULL_SWIPE;
      setLocked(past);
      lockTick.current.update(past, true);
    }
  };

  const finish = (e: PointerEvent<HTMLButtonElement>, cancelled: boolean) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    clearTimer();
    setPressed(false);
    gesture.current = null;
    lockTick.current.reset();
    if (!g.dragging) return;
    suppressClick.current = true;
    const offset = drag ?? g.base;
    setDrag(null);
    setLocked(false);
    if (!cancelled && locked && onFullSwipe) {
      setFlung(-g.width);
      onFullSwipe();
      return;
    }
    // Recent movement faster than a flick wins over the distance.
    const flick = e.timeStamp - g.t < 100 && Math.abs(g.v) > FLICK;
    const next = cancelled ? open : flick ? g.v < 0 : offset < -actionsWidth / 2;
    if (next !== open) onOpenChange(next);
  };

  const offset = flung ?? drag ?? (open ? -actionsWidth : 0);
  const revealed = drag !== null ? drag < -1 : open || flung !== null;
  const settling = drag === null;

  return (
    <div className={cx("relative", offset !== 0 && "overflow-hidden", className)}>
      <div
        className={cx(
          "absolute inset-y-0 right-0 flex",
          !revealed && "invisible",
          settling && "transition-[width] duration-[350ms] ease-(--spring-settle)",
        )}
        style={{ width: Math.max(actionsWidth, -offset) }}
        aria-hidden={!revealed || undefined}
        inert={!open}
      >
        {actions({ open, locked: locked || flung !== null })}
      </div>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        data-lifted={lifted ? "" : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => finish(e, false)}
        onPointerCancel={(e) => finish(e, true)}
        onPointerLeave={(e) => {
          // Without capture (no drag yet) a release outside the row never reaches us.
          if (gesture.current && !gesture.current.dragging && gesture.current.id === e.pointerId) {
            clearTimer();
            setPressed(false);
            gesture.current = null;
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          clearTimer();
          fireLongPress();
        }}
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          if (open) onOpenChange(false);
          else onTap();
        }}
        className={cx(
          "group/swipe relative z-[1] flex w-full touch-pan-y items-center bg-paper text-left text-ink select-none [-webkit-touch-callout:none]",
          settling && "transition-transform duration-[350ms] ease-(--spring-settle)",
          revealed && "border-r border-rule",
        )}
        style={{ transform: offset ? `translateX(${offset}px)` : undefined }}
      >
        {/* Lift layer: on a long press the row rises 2px onto a white card with an ink edge, 8px
            wider than the text column (no shadow). */}
        <span
          className={cx(
            "relative isolate flex w-full min-w-0 transition-[translate] duration-(--dur-quick) ease-standard",
            "before:pointer-events-none before:absolute before:inset-y-0 before:right-2 before:left-0 before:-z-[1] before:rounded-[4px] before:border before:border-transparent before:transition-[border-color,background-color] before:duration-(--dur-quick) before:ease-standard",
            "group-data-lifted/swipe:[translate:0_calc(-2px*var(--motion-scale))] group-data-lifted/swipe:before:border-ink group-data-lifted/swipe:before:bg-surface",
          )}
        >
          {/* Press layer: the tint; held by a finger it deepens to --selected (the charge). */}
          <span data-pressed={pressed ? "" : undefined} className={cx("press-tint relative isolate flex w-full min-w-0", highlight && "spotlight")}>
            <span
              aria-hidden="true"
              className={cx(
                "pointer-events-none absolute inset-0 -z-[1] bg-selected opacity-0",
                pressed
                  ? "opacity-100 transition-opacity duration-(--dur-long-press) ease-linear"
                  : "transition-opacity duration-(--dur-quick) ease-standard",
              )}
            />
            {children}
          </span>
        </span>
      </button>
    </div>
  );
}
