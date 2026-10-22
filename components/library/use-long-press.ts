"use client";

import { useEffect, useRef, type MouseEvent, type PointerEvent } from "react";

/** Hold this long to open the menu (same as word rows, SwipeRow). */
export const LONG_PRESS_MS = 500;
/** A finger that moves farther is scrolling, not holding. */
const SLOP = 10;
/** The timer and the browser's own `contextmenu` can both fire for one press; and the click after it is swallowed. */
const GUARD_MS = 800;

/**
 * The finger lifting after a long press still produces a click, and it lands on whatever is under
 * it by then — often the menu that just opened. Swallow that one click, wherever it lands; a new
 * press or key (a real tap in the menu, which now opens in 380ms) ends the guard.
 */
function swallowNextClick() {
  if (typeof document === "undefined") return;
  const swallow = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    done();
  };
  const done = () => {
    clearTimeout(timer);
    document.removeEventListener("click", swallow, true);
    document.removeEventListener("pointerdown", done, true);
    document.removeEventListener("keydown", done, true);
  };
  const timer = setTimeout(done, GUARD_MS);
  document.addEventListener("click", swallow, true);
  document.addEventListener("pointerdown", done, true);
  document.addEventListener("keydown", done, true);
}

/**
 * Long press on a touch target (a link): a held finger, Android's `contextmenu`, or the keyboard's
 * context-menu key call `onLongPress`; the browser's own link menu and the click that follows the
 * press are suppressed. Spread the handlers on the element and add `select-none` and
 * `[-webkit-touch-callout:none]` so iOS does not show its link preview.
 */
export function useLongPress(onLongPress: () => void) {
  const press = useRef<{ id: number; x: number; y: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const fired = useRef(0);
  const latest = useRef(onLongPress);
  useEffect(() => {
    latest.current = onLongPress;
  });
  useEffect(() => () => {
    if (press.current) clearTimeout(press.current.timer);
  }, []);

  const cancel = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };
  const fire = () => {
    press.current = null;
    if (Date.now() - fired.current < GUARD_MS) return;
    fired.current = Date.now();
    swallowNextClick();
    latest.current();
  };

  return {
    onPointerDown(e: PointerEvent) {
      if (e.pointerType === "mouse" || !e.isPrimary) return;
      cancel();
      press.current = { id: e.pointerId, x: e.clientX, y: e.clientY, timer: setTimeout(fire, LONG_PRESS_MS) };
    },
    onPointerMove(e: PointerEvent) {
      const p = press.current;
      if (p && p.id === e.pointerId && (Math.abs(e.clientX - p.x) > SLOP || Math.abs(e.clientY - p.y) > SLOP)) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onContextMenu(e: MouseEvent) {
      e.preventDefault();
      cancel();
      fire();
    },
    onClickCapture(e: MouseEvent) {
      if (Date.now() - fired.current < GUARD_MS) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
  };
}
