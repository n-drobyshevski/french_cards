import { describe, expect, it } from "vitest";
import {
  FLICK_MIN_DISTANCE,
  FLY_MAX_MS,
  FLY_MIN_MS,
  flyOut,
  IDLE_SWIPE,
  MAX_ROTATION,
  STAMP_RAMP,
  STAMP_START,
  SWIPE_SLOP,
  deckEdges,
  stackPose,
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

  it("caps the distance on a wide (desktop) card at 200 px", () => {
    expect(swipeDecision(199, 720, 0)).toBeNull();
    expect(swipeDecision(200, 720, 0)).toBe("good");
    expect(swipeDecision(-200, 720, 0)).toBe("again");
    // Phones keep a third of the card.
    expect(swipeDecision(119, 360, 0)).toBeNull();
    expect(swipeDecision(120, 360, 0)).toBe("good");
    expect(swipeVisual(200, 720).locked).toBe(true);
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
  it("tilts with the drag and caps at 8°", () => {
    expect(swipeVisual(70, W).rotate).toBeCloseTo((70 / W) * 30);
    expect(MAX_ROTATION).toBe(8);
    expect(swipeVisual(10_000, W).rotate).toBe(MAX_ROTATION);
    expect(swipeVisual(-10_000, W).rotate).toBe(-MAX_ROTATION);
  });

  it("ramps the stamp from 16 px to .6 just before the threshold, then locks it at 1", () => {
    expect(swipeVisual(STAMP_START, W)).toMatchObject({ stamp: 0, locked: false, side: "good" });
    expect(swipeVisual(W / 6, W)).toMatchObject({ progress: 0.5, side: "good", locked: false });
    expect(swipeVisual(W / 3 - 0.5, W).stamp).toBeCloseTo(STAMP_RAMP, 2);
    expect(swipeVisual(W / 3 - 0.5, W).stamp).toBeLessThanOrEqual(STAMP_RAMP);
    expect(swipeVisual(-W / 3, W)).toMatchObject({ progress: 1, side: "again", locked: true, stamp: 1 });
    expect(swipeVisual(0, W)).toEqual({ rotate: 0, progress: 0, side: null, locked: false, stamp: 0 });
  });
});

describe("stackPose", () => {
  it("grows the card behind from .97 / 4 px to .985 / 2 px at the threshold", () => {
    expect(stackPose(0)).toEqual({ scale: 0.97, y: 4 });
    expect(stackPose(1).scale).toBeCloseTo(0.985);
    expect(stackPose(1).y).toBeCloseTo(2);
    expect(stackPose(5)).toEqual(stackPose(1));
  });
});

describe("deckEdges", () => {
  it("draws 3 edges for 10+ cards left, 2 for 2–9, 1 for the last", () => {
    expect([0, 1, 2, 9, 10, 200].map(deckEdges)).toEqual([0, 1, 2, 2, 3, 3]);
  });
});

describe("flyOut", () => {
  it("leaves to 1.2 × width at the release velocity, within 120–220 ms", () => {
    expect(flyOut(150, W, 4)).toEqual({ to: W * 1.2, ms: FLY_MIN_MS });
    expect(flyOut(150, W, 0)).toEqual({ to: W * 1.2, ms: FLY_MAX_MS });
    expect(flyOut(-150, W, -1.5)).toEqual({ to: -W * 1.2, ms: Math.round((W * 1.2 - 150) / 1.5) });
    // A flick against the drag counts as no speed.
    expect(flyOut(-150, W, 3).ms).toBe(FLY_MAX_MS);
  });
});
