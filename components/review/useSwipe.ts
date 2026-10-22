"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  FLIP_DAMPING,
  flipDecision,
  flipVelocity,
  IDLE_SWIPE,
  SWIPE_SLOP,
  swipeReducer,
  VELOCITY_WINDOW_MS,
  type FlipSample,
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
export function useSwipe({ enabled, onDecide }: { enabled: boolean; onDecide: (outcome: SwipeOutcome) => void }) {
  const state = useRef<SwipeState>(IDLE_SWIPE);
  const [view, setView] = useState<SwipeView>({ dx: 0, width: 0, mode: "idle" });

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
    setView({ dx: next.dx, width: next.width, mode: "dragging" });
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    if (state.current.phase !== "pending" && state.current.phase !== "dragging") return;
    const { next } = dispatch({ type: "up", pointerId: event.pointerId, x: event.clientX, y: event.clientY, t: event.timeStamp });
    if (next.phase === "released" && next.outcome) {
      const outcome = next.outcome;
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

/**
 * Swipe up on the question side to flip. The card lifts (damped) with the finger and flips on
 * release past the threshold or on a quick flick. The element needs `touch-action: none` so the
 * browser does not scroll or pull-to-refresh instead. `consumeClick()` tells the element's
 * onClick to skip the click that follows a flip gesture.
 */
export function useSwipeUp({ enabled, onFlip }: { enabled: boolean; onFlip: () => void }) {
  const gesture = useRef<{
    id: number;
    x: number;
    y: number;
    height: number;
    phase: "pending" | "dragging" | "ignored";
    samples: FlipSample[];
  } | null>(null);
  const flipped = useRef(false);
  const [lift, setLift] = useState(0);
  const [settling, setSettling] = useState(false);

  const end = () => {
    gesture.current = null;
    setSettling(true);
    setLift(0);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (!enabled || event.button !== 0 || !event.isPrimary) return;
    flipped.current = false;
    gesture.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      height: event.currentTarget.getBoundingClientRect().height,
      phase: "pending",
      samples: [{ y: event.clientY, t: event.timeStamp }],
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const g = gesture.current;
    if (!g || event.pointerId !== g.id || g.phase === "ignored") return;
    const dx = event.clientX - g.x;
    const dy = event.clientY - g.y;
    g.samples = [...g.samples.filter((s) => event.timeStamp - s.t <= VELOCITY_WINDOW_MS), { y: event.clientY, t: event.timeStamp }];
    if (g.phase === "pending") {
      if (Math.abs(dx) < SWIPE_SLOP && Math.abs(dy) < SWIPE_SLOP) return;
      g.phase = dy < 0 && Math.abs(dy) > Math.abs(dx) ? "dragging" : "ignored";
      if (g.phase === "ignored") return;
    }
    setSettling(false);
    setLift(Math.min(0, dy) * FLIP_DAMPING);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const g = gesture.current;
    if (!g || event.pointerId !== g.id) return;
    const dx = event.clientX - g.x;
    const dy = event.clientY - g.y;
    const samples = [...g.samples, { y: event.clientY, t: event.timeStamp }];
    const flip = g.phase === "dragging" && flipDecision(dx, dy, g.height, flipVelocity(samples, event.timeStamp));
    if (g.phase !== "pending") flipped.current = true; // a drag is never also a tap
    end();
    if (flip) onFlip();
  };

  const onPointerCancel = (event: ReactPointerEvent<HTMLElement>) => {
    if (gesture.current && event.pointerId === gesture.current.id) end();
  };

  return {
    lift,
    settling,
    /** True once if the click being handled ends a drag, so it must not flip again. */
    consumeClick: () => {
      const was = flipped.current;
      flipped.current = false;
      return was;
    },
    handlers: enabled ? { onPointerDown, onPointerMove, onPointerUp, onPointerCancel } : {},
  };
}
