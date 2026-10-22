// Swipe-to-grade gesture as a pure reducer, so thresholds can be unit-tested.
// right = «Знаю», left = «Не знаю». The card only follows horizontal drags; a drag that starts
// vertically is left to the browser (touch-action: pan-y) for scrolling.

export type SwipeOutcome = "again" | "good";

/** Movement (px) before the gesture picks an axis. */
export const SWIPE_SLOP = 10;
/** Share of the card width to drag past to grade on release. */
export const SWIPE_THRESHOLD = 1 / 3;
/** A release faster than this (px/ms) in the drag direction grades even below the threshold. */
export const FLICK_VELOCITY = 0.5;
/** …provided the card moved at least this far. */
export const FLICK_MIN_DISTANCE = 32;
/** Velocity is measured over the last part of the gesture only. */
export const VELOCITY_WINDOW_MS = 100;
/** Card tilt at one full card width of travel (deg); clamped to ±MAX_ROTATION. */
export const ROTATION_PER_WIDTH = 30;
export const MAX_ROTATION = 15;

export interface SwipeSample {
  x: number;
  t: number;
}

export interface SwipeState {
  /** idle → pending (pointer down, axis unknown) → dragging | ignored (vertical) → released. */
  phase: "idle" | "pending" | "dragging" | "ignored" | "released";
  pointerId: number | null;
  originX: number;
  originY: number;
  dx: number;
  dy: number;
  width: number;
  samples: SwipeSample[];
  outcome: SwipeOutcome | null;
}

export type SwipeAction =
  | { type: "down"; pointerId: number; x: number; y: number; t: number; width: number }
  | { type: "move"; pointerId: number; x: number; y: number; t: number }
  | { type: "up"; pointerId: number; x: number; y: number; t: number }
  | { type: "cancel" }
  | { type: "reset" };

export const IDLE_SWIPE: SwipeState = {
  phase: "idle",
  pointerId: null,
  originX: 0,
  originY: 0,
  dx: 0,
  dy: 0,
  width: 0,
  samples: [],
  outcome: null,
};

function addSample(samples: readonly SwipeSample[], sample: SwipeSample): SwipeSample[] {
  const kept = samples.filter((s) => sample.t - s.t <= VELOCITY_WINDOW_MS);
  kept.push(sample);
  return kept;
}

/** Horizontal velocity (px/ms) over the recent samples; 0 when it cannot be measured. */
export function swipeVelocity(samples: readonly SwipeSample[]): number {
  if (samples.length < 2) return 0;
  const first = samples[0];
  const last = samples[samples.length - 1];
  const dt = last.t - first.t;
  return dt > 0 ? (last.x - first.x) / dt : 0;
}

/** What releasing now would do. */
export function swipeDecision(dx: number, width: number, velocity: number): SwipeOutcome | null {
  if (width <= 0 || dx === 0) return null;
  const sign = Math.sign(dx);
  const far = Math.abs(dx) >= width * SWIPE_THRESHOLD;
  const flick = Math.abs(dx) >= FLICK_MIN_DISTANCE && Math.sign(velocity) === sign && Math.abs(velocity) >= FLICK_VELOCITY;
  if (!far && !flick) return null;
  return sign > 0 ? "good" : "again";
}

export function swipeReducer(state: SwipeState, action: SwipeAction): SwipeState {
  switch (action.type) {
    case "down":
      if (state.phase === "pending" || state.phase === "dragging") return state;
      return {
        ...IDLE_SWIPE,
        phase: "pending",
        pointerId: action.pointerId,
        originX: action.x,
        originY: action.y,
        width: action.width,
        samples: [{ x: action.x, t: action.t }],
      };
    case "move": {
      if (action.pointerId !== state.pointerId) return state;
      const dx = action.x - state.originX;
      const dy = action.y - state.originY;
      if (state.phase === "pending") {
        if (Math.abs(dx) < SWIPE_SLOP && Math.abs(dy) < SWIPE_SLOP) return state;
        if (Math.abs(dy) >= Math.abs(dx)) return { ...state, phase: "ignored" };
        return { ...state, phase: "dragging", dx, dy, samples: addSample(state.samples, { x: action.x, t: action.t }) };
      }
      if (state.phase !== "dragging") return state;
      return { ...state, dx, dy, samples: addSample(state.samples, { x: action.x, t: action.t }) };
    }
    case "up": {
      if (action.pointerId !== state.pointerId) return state;
      if (state.phase !== "dragging") return IDLE_SWIPE;
      const dx = action.x - state.originX;
      const samples = addSample(state.samples, { x: action.x, t: action.t });
      return { ...state, phase: "released", dx, samples, outcome: swipeDecision(dx, state.width, swipeVelocity(samples)) };
    }
    case "cancel":
      return state.phase === "released" ? state : IDLE_SWIPE;
    case "reset":
      return IDLE_SWIPE;
  }
}

export interface SwipeVisual {
  /** Card tilt in degrees. */
  rotate: number;
  /** 0..1, how far towards the grade threshold. */
  progress: number;
  /** Which stamp shows: «ЗНАЮ» (right) or «НЕ ЗНАЮ» (left). */
  side: SwipeOutcome | null;
}

export function swipeVisual(dx: number, width: number): SwipeVisual {
  if (width <= 0 || dx === 0) return { rotate: 0, progress: 0, side: null };
  const rotate = Math.max(-MAX_ROTATION, Math.min(MAX_ROTATION, (dx / width) * ROTATION_PER_WIDTH));
  const progress = Math.min(1, Math.abs(dx) / (width * SWIPE_THRESHOLD));
  return { rotate, progress, side: dx > 0 ? "good" : "again" };
}

// Swipe up on the question side flips the card.

/** Upward travel (px) that flips on release, capped by FLIP_SHARE of the card height. */
export const FLIP_DISTANCE = 72;
export const FLIP_SHARE = 0.2;
/** An upward flick faster than this (px/ms, measured over VELOCITY_WINDOW_MS) flips earlier. */
export const FLIP_FLICK_VELOCITY = 0.4;
/** Visual drag is damped so the card only lifts a little. */
export const FLIP_DAMPING = 0.35;

export interface FlipSample {
  y: number;
  t: number;
}

/** Vertical velocity (px/ms) over the recent samples; negative is upwards. */
export function flipVelocity(samples: readonly FlipSample[], now: number): number {
  const recent = samples.filter((s) => now - s.t <= VELOCITY_WINDOW_MS);
  if (recent.length < 2) return 0;
  const first = recent[0];
  const last = recent[recent.length - 1];
  const dt = last.t - first.t;
  return dt > 0 ? (last.y - first.y) / dt : 0;
}

/** True when releasing a drag of (dx, dy) on a card of `height` should flip it. */
export function flipDecision(dx: number, dy: number, height: number, velocity: number): boolean {
  if (dy >= 0 || Math.abs(dy) <= Math.abs(dx)) return false;
  const far = -dy >= Math.min(FLIP_DISTANCE, height * FLIP_SHARE);
  const flick = -dy >= FLICK_MIN_DISTANCE && velocity <= -FLIP_FLICK_VELOCITY;
  return far || flick;
}
