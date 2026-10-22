import { describe, expect, it } from "vitest";
import {
  FLICK_MIN_DISTANCE,
  FLIP_DISTANCE,
  FLIP_SHARE,
  canFlipBackFrom,
  flipBackDecision,
  flipDecision,
  flipVelocity,
  IDLE_SWIPE,
  MAX_ROTATION,
  SWIPE_SLOP,
  swipeDecision,
  swipeReducer,
  swipeVelocity,
  swipeVisual,
  type SwipeAction,
  type SwipeState,
} from "./swipe";

const W = 360;

function run(actions: SwipeAction[], from: SwipeState = IDLE_SWIPE): SwipeState {
  return actions.reduce(swipeReducer, from);
}

const down = (x = 100, y = 300, t = 0): SwipeAction => ({ type: "down", pointerId: 1, x, y, t, width: W });
const move = (x: number, y = 300, t = 0): SwipeAction => ({ type: "move", pointerId: 1, x, y, t });
const up = (x: number, y = 300, t = 0): SwipeAction => ({ type: "up", pointerId: 1, x, y, t });

describe("swipeDecision", () => {
  it("grades past a third of the card width", () => {
    expect(swipeDecision(W / 3, W, 0)).toBe("good");
    expect(swipeDecision(-W / 3, W, 0)).toBe("again");
    expect(swipeDecision(W / 3 - 1, W, 0)).toBeNull();
  });

  it("grades a fast flick below the threshold", () => {
    expect(swipeDecision(60, W, 0.8)).toBe("good");
    expect(swipeDecision(-60, W, -0.8)).toBe("again");
  });

  it("ignores a flick against the drag direction or one that barely moved", () => {
    expect(swipeDecision(60, W, -0.8)).toBeNull();
    expect(swipeDecision(FLICK_MIN_DISTANCE - 1, W, 2)).toBeNull();
    expect(swipeDecision(60, W, 0.3)).toBeNull();
  });

  it("does nothing without movement or width", () => {
    expect(swipeDecision(0, W, 5)).toBeNull();
    expect(swipeDecision(200, 0, 0)).toBeNull();
  });
});

describe("swipeVelocity", () => {
  it("measures px/ms over the samples", () => {
    expect(
      swipeVelocity([
        { x: 0, t: 0 },
        { x: 50, t: 100 },
      ]),
    ).toBe(0.5);
    expect(swipeVelocity([{ x: 0, t: 0 }])).toBe(0);
    expect(
      swipeVelocity([
        { x: 0, t: 5 },
        { x: 10, t: 5 },
      ]),
    ).toBe(0);
  });
});

describe("swipeReducer", () => {
  it("waits for the slop before picking an axis", () => {
    const s = run([down(), move(100 + SWIPE_SLOP - 1)]);
    expect(s.phase).toBe("pending");
  });

  it("starts dragging on a horizontal move and tracks dx", () => {
    const s = run([down(100), move(130, 305, 16), move(170, 310, 32)]);
    expect(s.phase).toBe("dragging");
    expect(s.dx).toBe(70);
    expect(s.dy).toBe(10);
  });

  it("leaves a vertical gesture to the browser", () => {
    const s = run([down(100, 300), move(104, 330), move(200, 330)]);
    expect(s.phase).toBe("ignored");
    expect(s.dx).toBe(0);
  });

  it("releases with «Знаю» past the threshold to the right", () => {
    const s = run([down(100, 300, 0), move(130, 300, 200), move(230, 300, 600), up(240, 300, 1000)]);
    expect(s.phase).toBe("released");
    expect(s.outcome).toBe("good");
  });

  it("releases with «Не знаю» on a quick flick to the left", () => {
    const s = run([down(200, 300, 0), move(185, 300, 10), move(160, 300, 40), up(140, 300, 60)]);
    expect(s.outcome).toBe("again");
  });

  it("snaps back on a slow short drag", () => {
    const s = run([down(100, 300, 0), move(120, 300, 300), move(150, 300, 900), up(150, 300, 1200)]);
    expect(s.phase).toBe("released");
    expect(s.outcome).toBeNull();
  });

  it("only uses the last 100 ms for velocity", () => {
    // Fast at first, then the finger rests before lifting: no flick.
    const s = run([down(100, 300, 0), move(115, 300, 5), move(160, 300, 30), move(160, 300, 400), up(160, 300, 450)]);
    expect(s.outcome).toBeNull();
  });

  it("treats a tap as no gesture", () => {
    expect(run([down(), up(101)])).toEqual(IDLE_SWIPE);
  });

  it("ignores other pointers", () => {
    const s = run([down(100), { type: "move", pointerId: 2, x: 300, y: 300, t: 10 }]);
    expect(s.phase).toBe("pending");
  });

  it("cancels a drag back to idle, but keeps a decided release", () => {
    expect(run([down(100), move(150), { type: "cancel" }])).toEqual(IDLE_SWIPE);
    const released = run([down(100, 300, 0), move(300, 300, 50), up(300, 300, 60)]);
    expect(swipeReducer(released, { type: "cancel" })).toBe(released);
    expect(swipeReducer(released, { type: "reset" })).toEqual(IDLE_SWIPE);
  });
});

describe("swipeVisual", () => {
  it("tilts with the drag and clamps", () => {
    expect(swipeVisual(70, W).rotate).toBeCloseTo((70 / W) * 30);
    expect(swipeVisual(10_000, W).rotate).toBe(MAX_ROTATION);
    expect(swipeVisual(-10_000, W).rotate).toBe(-MAX_ROTATION);
  });

  it("fades the stamp in up to the threshold", () => {
    expect(swipeVisual(W / 6, W)).toMatchObject({ progress: 0.5, side: "good" });
    expect(swipeVisual(-W, W)).toMatchObject({ progress: 1, side: "again" });
    expect(swipeVisual(0, W)).toEqual({ rotate: 0, progress: 0, side: null });
  });
});

describe("flipDecision", () => {
  const H = 480;
  it("flips after an upward drag past the distance threshold", () => {
    expect(flipDecision(0, -FLIP_DISTANCE, H, 0)).toBe(true);
    expect(flipDecision(0, -(FLIP_DISTANCE - 1), H, 0)).toBe(false);
  });

  it("uses a share of the height on short cards", () => {
    expect(flipDecision(0, -(200 * FLIP_SHARE), 200, 0)).toBe(true);
  });

  it("flips on a quick upward flick", () => {
    expect(flipDecision(0, -FLICK_MIN_DISTANCE, H, -0.6)).toBe(true);
    expect(flipDecision(0, -FLICK_MIN_DISTANCE, H, -0.1)).toBe(false);
  });

  it("ignores downward and mostly horizontal drags", () => {
    expect(flipDecision(0, 120, H, 1)).toBe(false);
    expect(flipDecision(150, -100, H, -1)).toBe(false);
  });
});

describe("flipVelocity", () => {
  it("measures recent vertical speed, negative upwards", () => {
    expect(flipVelocity([{ y: 300, t: 0 }, { y: 250, t: 50 }, { y: 200, t: 100 }], 100)).toBe(-1);
    expect(flipVelocity([{ y: 300, t: 0 }], 0)).toBe(0);
  });
});

describe("flipBackDecision", () => {
  it("mirrors the swipe-up thresholds downwards", () => {
    expect(flipBackDecision(0, FLIP_DISTANCE, 480, 0)).toBe(true);
    expect(flipBackDecision(0, FLIP_DISTANCE - 1, 480, 0)).toBe(false);
    expect(flipBackDecision(0, FLICK_MIN_DISTANCE, 480, 0.6)).toBe(true);
    expect(flipBackDecision(0, -120, 480, -1)).toBe(false);
    expect(flipBackDecision(150, 100, 480, 1)).toBe(false);
  });

  it("only starts from the top of the answer text", () => {
    expect(canFlipBackFrom(0)).toBe(true);
    expect(canFlipBackFrom(24)).toBe(false);
  });
});
