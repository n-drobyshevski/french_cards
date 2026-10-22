"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { haptic, thresholdNotifier } from "@/lib/haptics";
import {
  IDLE_SWIPE,
  SWIPE_SLOP,
  swipeDecision,
  swipeReducer,
  swipeVelocity,
  type SwipeAction,
  type SwipeOutcome,
  type SwipeState,
} from "./swipe";

export interface SwipeView {
  dx: number;
  width: number;
  /** dragging: follows the finger. settling: springs back to rest, then idle. */
  mode: "idle" | "dragging" | "settling";
  /** Pointer down on the card and not (yet) a drag: the press state (data-pressed). */
  pressed: boolean;
}

/** Where a decided swipe was let go, for the fly-out that carries on from there. */
export interface SwipeRelease {
  dx: number;
  width: number;
  /** px/ms over the last part of the gesture. */
  velocity: number;
}

const REST: SwipeView = { dx: 0, width: 0, mode: "idle", pressed: false };

/**
 * Pointer handlers for swipe-to-grade, and the card's press state (MOTION-SPEC §5.1: a gesture
 * surface sets data-pressed from pointer events and drops it once a drag passes the slop). The
 * element should have `touch-action: pan-y` so vertical scrolling stays native.
 *
 * A decided release calls `onDecide` at once with the release pose (the screen flies a snapshot of
 * the card on from there); it returns false when the grade was not taken, and the card springs back.
 * A cancelled swipe springs back over `settleMs()`, then the view returns to idle.
 */
export function useSwipe({
  enabled,
  haptics = false,
  settleMs,
  onDecide,
}: {
  enabled: boolean;
  haptics?: boolean;
  settleMs: () => number;
  onDecide: (outcome: SwipeOutcome, release: SwipeRelease) => boolean;
}) {
  const state = useRef<SwipeState>(IDLE_SWIPE);
  const [view, setView] = useState<SwipeView>(REST);
  /** Set when a pointer-up ends a drag, so the click that follows is not taken as a tap. */
  const dragged = useRef(false);
  const [threshold] = useState(thresholdNotifier);
  const settleTimer = useRef<number | undefined>(undefined);
  /** Where the press began, until the pointer has moved past the slop. */
  const pressOrigin = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => () => window.clearTimeout(settleTimer.current), []);

  const dispatch = (action: SwipeAction) => {
    const prev = state.current;
    const next = swipeReducer(prev, action);
    state.current = next;
    return { prev, next };
  };

  const settle = () => {
    state.current = IDLE_SWIPE;
    window.clearTimeout(settleTimer.current);
    setView((v) => (v.dx === 0 && v.mode !== "dragging" ? { ...REST, width: v.width } : { dx: 0, width: v.width, mode: "settling", pressed: false }));
    // Back at rest: idle again, so nothing stays layered for the spring (was a stuck `settling`).
    settleTimer.current = window.setTimeout(() => setView((v) => (v.mode === "settling" ? { ...v, mode: "idle" } : v)), settleMs());
  };

  const release = () => {
    pressOrigin.current = null;
    setView((v) => (v.pressed ? { ...v, pressed: false } : v));
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || !event.isPrimary) return;
    window.clearTimeout(settleTimer.current);
    dragged.current = false;
    // A control inside the card (an abbreviation hint) presses itself, not the card.
    const control = (event.target as Element).closest("button, a[href], [role=button]");
    if (!control || control === event.currentTarget) {
      pressOrigin.current = { x: event.clientX, y: event.clientY };
      setView((v) => ({ ...v, pressed: true }));
    }
    if (!enabled) return;
    threshold.reset();
    const width = event.currentTarget.getBoundingClientRect().width;
    dispatch({ type: "down", pointerId: event.pointerId, x: event.clientX, y: event.clientY, t: event.timeStamp, width });
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    // Without swipes (a mouse): a drag, e.g. selecting text, drops the press after the slop too.
    const origin = pressOrigin.current;
    if (origin && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) >= SWIPE_SLOP) {
      pressOrigin.current = null;
      release();
    }
    if (state.current.phase !== "pending" && state.current.phase !== "dragging") return;
    const { prev, next } = dispatch({
      type: "move",
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      t: event.timeStamp,
    });
    if (next.phase === "ignored") {
      release();
      return;
    }
    if (next.phase !== "dragging") return;
    if (prev.phase === "pending") {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // The pointer may already be gone; the drag still works without capture.
      }
    }
    threshold.update(swipeDecision(next.dx, next.width, 0) !== null, haptics);
    setView({ dx: next.dx, width: next.width, mode: "dragging", pressed: false });
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    if (state.current.phase !== "pending" && state.current.phase !== "dragging") {
      release();
      return;
    }
    const { prev, next } = dispatch({ type: "up", pointerId: event.pointerId, x: event.clientX, y: event.clientY, t: event.timeStamp });
    dragged.current = prev.phase === "dragging";
    if (next.phase === "released" && next.outcome) {
      const outcome = next.outcome;
      if (onDecide(outcome, { dx: next.dx, width: next.width, velocity: swipeVelocity(next.samples) })) {
        if (haptics) haptic(outcome);
        // The screen has taken over the card (it flies on as a snapshot); this one is replaced.
        state.current = IDLE_SWIPE;
        return;
      }
    }
    settle();
  };

  const onPointerCancel = () => {
    if (state.current.phase !== "pending" && state.current.phase !== "dragging") {
      release();
      return;
    }
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
    handlers: {
      onPointerDown,
      onPointerUp,
      onPointerCancel,
      onPointerMove,
      onPointerLeave: release,
      ...(enabled ? { onLostPointerCapture } : {}),
    },
  };
}
