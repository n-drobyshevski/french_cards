"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { haptic, thresholdNotifier } from "@/lib/haptics";
import {
  IDLE_SWIPE,
  swipeDecision,
  swipeReducer,
  type SwipeAction,
  type SwipeOutcome,
  type SwipeState,
} from "./swipe";

/** Fly-out time after a decided swipe, before the grade is applied. */
export const FLY_OUT_MS = 180;

export interface SwipeView {
  dx: number;
  width: number;
  /** dragging: follows the finger. settling: animates back. flying: leaves the screen. */
  mode: "idle" | "dragging" | "settling" | "flying";
}

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/**
 * Pointer handlers for swipe-to-grade. The element should have `touch-action: pan-y` so vertical
 * scrolling stays native. Calls `onDecide` once the card has flown out.
 */
export function useSwipe({
  enabled,
  haptics = false,
  onDecide,
}: {
  enabled: boolean;
  haptics?: boolean;
  onDecide: (outcome: SwipeOutcome) => void;
}) {
  const state = useRef<SwipeState>(IDLE_SWIPE);
  const [view, setView] = useState<SwipeView>({ dx: 0, width: 0, mode: "idle" });
  /** Set when a pointer-up ends a drag, so the click that follows is not taken as a tap. */
  const dragged = useRef(false);
  const [threshold] = useState(thresholdNotifier);

  const dispatch = (action: SwipeAction) => {
    const prev = state.current;
    const next = swipeReducer(prev, action);
    state.current = next;
    return { prev, next };
  };

  const settle = () => {
    state.current = IDLE_SWIPE;
    setView((v) =>
      v.mode === "flying" || (v.dx === 0 && v.mode !== "dragging") ? v : { dx: 0, width: v.width, mode: "settling" },
    );
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (!enabled || view.mode === "flying" || event.button !== 0 || !event.isPrimary) return;
    threshold.reset();
    const width = event.currentTarget.getBoundingClientRect().width;
    dispatch({ type: "down", pointerId: event.pointerId, x: event.clientX, y: event.clientY, t: event.timeStamp, width });
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (state.current.phase !== "pending" && state.current.phase !== "dragging") return;
    const { prev, next } = dispatch({
      type: "move",
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      t: event.timeStamp,
    });
    if (next.phase !== "dragging") return;
    if (prev.phase === "pending") {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // The pointer may already be gone; the drag still works without capture.
      }
    }
    threshold.update(swipeDecision(next.dx, next.width, 0) !== null, haptics);
    setView({ dx: next.dx, width: next.width, mode: "dragging" });
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    if (state.current.phase !== "pending" && state.current.phase !== "dragging") return;
    const { prev, next } = dispatch({ type: "up", pointerId: event.pointerId, x: event.clientX, y: event.clientY, t: event.timeStamp });
    dragged.current = prev.phase === "dragging";
    if (next.phase === "released" && next.outcome) {
      const outcome = next.outcome;
      if (haptics) haptic(outcome);
      const off = Math.sign(next.dx) * next.width * 1.4;
      setView({ dx: off, width: next.width, mode: "flying" });
      window.setTimeout(() => onDecide(outcome), reducedMotion() ? 0 : FLY_OUT_MS);
      return;
    }
    settle();
  };

  const onPointerCancel = () => {
    if (state.current.phase !== "pending" && state.current.phase !== "dragging") return;
    settle();
  };

  // On touch the browser implicitly captures the pointer on the child under the finger; moving
  // the capture to the card makes that child fire lostpointercapture, which bubbles here. Only
  // the card itself losing capture ends the drag.
  const onLostPointerCapture = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget || event.pointerId !== state.current.pointerId) return;
    onPointerCancel();
  };

  return {
    view,
    /** True once if the click being handled ends a drag (not a tap). */
    consumeClick: () => {
      const was = dragged.current;
      dragged.current = false;
      return was || state.current.phase === "released";
    },
    handlers: enabled
      ? {
          onPointerDown,
          onPointerMove,
          onPointerUp,
          onPointerCancel,
          onLostPointerCapture,
        }
      : {},
  };
}
