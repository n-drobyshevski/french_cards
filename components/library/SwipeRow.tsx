"use client";

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { cx } from "@/components/ui/cx";

const LONG_PRESS_MS = 500;
const SLOP = 8;

export interface SwipeRowProps {
  /** Actions revealed on swipe-left, laid out right-aligned in `actionsWidth`. */
  actions: (opts: { open: boolean }) => ReactNode;
  actionsWidth?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Plain tap (or Enter/Space). */
  onTap: () => void;
  /** Long press, right click or the context-menu key: the fallback for the swipe actions. */
  onLongPress: () => void;
  /** Accessible name of the row button. */
  label: string;
  className?: string;
  children: ReactNode;
}

/**
 * A list row that slides left to reveal actions («Переместить», «Удалить»). Vertical scrolling
 * stays native (touch-action: pan-y); a horizontal drag past the slop takes over the gesture.
 */
export function SwipeRow({
  actions,
  actionsWidth = 160,
  open,
  onOpenChange,
  onTap,
  onLongPress,
  label,
  className,
  children,
}: SwipeRowProps) {
  const [drag, setDrag] = useState<number | null>(null);
  const gesture = useRef<{
    id: number;
    x: number;
    y: number;
    base: number;
    dragging: boolean;
    timer: ReturnType<typeof setTimeout> | null;
  } | null>(null);
  const suppressClick = useRef(false);
  const longPressed = useRef(0);

  useEffect(() => () => {
    if (gesture.current?.timer) clearTimeout(gesture.current.timer);
  }, []);

  const clearTimer = () => {
    const g = gesture.current;
    if (g?.timer) {
      clearTimeout(g.timer);
      g.timer = null;
    }
  };

  const fireLongPress = () => {
    if (Date.now() - longPressed.current < 800) return;
    longPressed.current = Date.now();
    suppressClick.current = true;
    if (open) onOpenChange(false);
    onLongPress();
  };

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || gesture.current?.dragging) return;
    clearTimer();
    suppressClick.current = false;
    gesture.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      base: open ? -actionsWidth : 0,
      dragging: false,
      timer: e.pointerType === "mouse" ? null : setTimeout(() => {
        if (gesture.current) gesture.current.timer = null;
        fireLongPress();
      }, LONG_PRESS_MS),
    };
  };

  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.dragging) {
      if (Math.abs(dx) > SLOP || Math.abs(dy) > SLOP) clearTimer();
      if (Math.abs(dx) > SLOP && Math.abs(dx) > Math.abs(dy)) {
        g.dragging = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      } else return;
    }
    const raw = g.base + dx;
    // Gentle resistance past either end.
    const offset = raw > 0 ? raw / 4 : raw < -actionsWidth ? -actionsWidth + (raw + actionsWidth) / 4 : raw;
    setDrag(offset);
  };

  const finish = (e: PointerEvent<HTMLButtonElement>, cancelled: boolean) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    clearTimer();
    gesture.current = null;
    if (g.dragging) {
      suppressClick.current = true;
      const offset = drag ?? g.base;
      setDrag(null);
      const next = cancelled ? open : offset < -actionsWidth / 2;
      if (next !== open) onOpenChange(next);
    }
  };

  const offset = drag ?? (open ? -actionsWidth : 0);
  const revealed = drag !== null ? drag < -1 : open;

  return (
    <div className={cx("relative overflow-hidden", className)}>
      <div
        className="absolute inset-y-0 right-0 flex"
        style={{ width: actionsWidth }}
        aria-hidden={!revealed || undefined}
        inert={!open}
      >
        {actions({ open })}
      </div>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => finish(e, false)}
        onPointerCancel={(e) => finish(e, true)}
        onPointerLeave={(e) => {
          // Without capture (no drag yet) a release outside the row never reaches us.
          if (gesture.current && !gesture.current.dragging && gesture.current.id === e.pointerId) {
            clearTimer();
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
          "relative z-[1] flex w-full touch-pan-y items-center bg-paper text-left text-ink select-none [-webkit-touch-callout:none]",
          drag === null && "transition-transform duration-200 ease-out",
          revealed && "border-r border-rule",
        )}
        style={{ transform: offset ? `translateX(${offset}px)` : undefined }}
      >
        {children}
      </button>
    </div>
  );
}
