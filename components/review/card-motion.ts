"use client";

// Card motion of the review screen (MOTION-SPEC R3–R7) that depends on values only known at run
// time — a measured headword offset, the release pose and velocity of a swipe, the moment the next
// card started settling — so it runs on the Web Animations API with the CSS tokens read from the
// page (shorter, and movement-free, under reduced motion).
import { prefersReducedMotion, tokenMs } from "@/lib/motion";
import type { Rating } from "@/lib/scheduler";
import { stackPose, type SwipeOutcome } from "./swipe";

/** The next card settles from the stack on --spring-settle over this long (MOTION-SPEC §2.3). */
export const SETTLE_MS = 350;

/** A custom property as the page resolves it now (`var()` inside it substituted), or `fallback`. */
function token(name: `--${string}`, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** A length token in px («56px» → 56). */
function tokenPx(name: `--${string}`, fallback: number): number {
  const value = parseFloat(token(name, ""));
  return Number.isFinite(value) ? value : fallback;
}

const ease = {
  standard: () => token("--ease-standard", "cubic-bezier(0.2, 0, 0.38, 0.9)"),
  enter: () => token("--ease-enter", "cubic-bezier(0, 0, 0.3, 1)"),
  exit: () => token("--ease-exit", "cubic-bezier(0.4, 0.14, 1, 1)"),
  settle: () => token("--spring-settle", "cubic-bezier(0, 0, 0.3, 1)"),
};

/** How a graded card leaves the screen. */
export type CardExit =
  /** A decided swipe: on from where it was let go, at the release velocity. */
  | { kind: "fly"; outcome: SwipeOutcome; dx: number; rotate: number; to: number; ms: number; stamp: number }
  /** A grade button (phone): ← Не знаю, ↓ Сложно, → Знаю. */
  | { kind: "grade"; rating: Rating };

/** Where an undone card comes back from: the side it left by (null: in place, desktop). */
export type ReturnSide = "left" | "right" | "below";

export const returnSide = (rating: Rating): ReturnSide => (rating === 1 ? "left" : rating === 2 ? "below" : "right");

/** How the current card appears. */
export type CardArrival =
  /** Settles out of the stack (from the drag progress it had reached), started at `at` (performance.now()). */
  | { kind: "stack"; from: number; at: number }
  /** An undone card comes back from where it left; null: opacity only (desktop). */
  | { kind: "return"; from: ReturnSide | null };

/** The resting transform of a leaving card at the start of its exit. */
export function exitStart(exit: CardExit): string | undefined {
  return exit.kind === "fly" ? `translateX(${exit.dx}px) rotate(${exit.rotate}deg)` : undefined;
}

/**
 * The exit (R4, R6): a swipe flies on to 1.2 × width at its own speed (--ease-exit); a grade button
 * sends the card --dist-exit-card sideways with a ±3° turn, or sinks it --dist-sink, fading over
 * --dur-exit. Reduced motion: it fades where it is in --dur-quick.
 */
export function playExit(el: HTMLElement, exit: CardExit): Animation {
  const from = exitStart(exit) ?? "none";
  if (prefersReducedMotion()) {
    return el.animate([{ transform: from, opacity: 1 }, { transform: from, opacity: 0 }], {
      duration: tokenMs("--dur-quick", 110),
      easing: ease.exit(),
      fill: "forwards",
      id: "card-exit",
    });
  }
  if (exit.kind === "fly") {
    return el.animate([{ transform: from }, { transform: `translateX(${exit.to}px) rotate(${exit.rotate}deg)` }], {
      duration: exit.ms,
      easing: ease.exit(),
      fill: "forwards",
      id: "card-exit",
    });
  }
  const side = tokenPx("--dist-exit-card", 56);
  const to =
    exit.rating === 2
      ? `translateY(${tokenPx("--dist-sink", 24)}px)`
      : exit.rating === 1
        ? `translateX(${-side}px) rotate(-3deg)`
        : `translateX(${side}px) rotate(3deg)`;
  return el.animate([{ transform: from, opacity: 1 }, { transform: to, opacity: 0 }], {
    duration: tokenMs("--dur-exit", 140),
    easing: ease.exit(),
    fill: "forwards",
    id: "card-exit",
  });
}

/**
 * The arrival of the current card on `el` (its own `translate` / `scale` / `opacity`, so a drag's
 * `transform` composes with it). From the stack (R5): .96 / 8 px (or wherever the drag had grown
 * it) → 1 / 0 on --spring-settle, continued from `at` so a card that mounts a few frames after the
 * commit picks up where the stack card was. Reduced: already in place, it fades in --dur-quick.
 * Returning after undo (R7): from ±--dist-exit-card (or --dist-sink below), opacity over the first
 * 70 %, --dur-enter --ease-enter; desktop: opacity only.
 */
export function playArrival(el: HTMLElement, arrive: CardArrival): void {
  const reduced = prefersReducedMotion();
  if (arrive.kind === "stack") {
    if (reduced) {
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: tokenMs("--dur-quick", 110), easing: ease.enter(), id: "card-arrive" });
      return;
    }
    const elapsed = performance.now() - arrive.at;
    if (elapsed >= SETTLE_MS) return;
    const pose = stackPose(arrive.from);
    el.animate(
      [
        { translate: `0 ${pose.y}px`, scale: String(pose.scale) },
        { translate: "0 0", scale: "1" },
      ],
      { duration: SETTLE_MS, delay: -Math.max(0, elapsed), easing: ease.settle(), id: "card-arrive" },
    );
    return;
  }
  const duration = tokenMs("--dur-enter", 240);
  el.animate([{ opacity: 0 }, { opacity: 1, offset: 0.7 }, { opacity: 1 }], { duration, easing: ease.enter(), id: "card-return-fade" });
  if (reduced || !arrive.from) return;
  const from =
    arrive.from === "below"
      ? `0 ${tokenPx("--dist-sink", 24)}px`
      : `${(arrive.from === "left" ? -1 : 1) * tokenPx("--dist-exit-card", 56)}px 0`;
  el.animate([{ translate: from }, { translate: "0 0" }], { duration, easing: ease.enter(), id: "card-arrive" });
}

/** Undo (R7): the card that was current drops back into the stack, 1 → .96 / 8 px over --dur-move. */
export function playDropToStack(el: HTMLElement): void {
  if (prefersReducedMotion()) return;
  const pose = stackPose(0);
  el.animate(
    [{ transform: "none" }, { transform: `translateY(${pose.y}px) scale(${pose.scale})` }],
    { duration: tokenMs("--dur-move", 200), easing: ease.standard(), id: "stack-drop" },
  );
}

/**
 * Reveal (R3): the headword glides `delta` px (from where it stood on the other side) to its place,
 * --dur-move --ease-standard. Reduced motion: it jumps.
 */
export function playHeadwordGlide(el: HTMLElement, delta: number): void {
  if (prefersReducedMotion() || Math.abs(delta) < 1) return;
  el.animate([{ translate: `0 ${delta}px` }, { translate: "0 0" }], {
    duration: tokenMs("--dur-move", 200),
    easing: ease.standard(),
    id: "headword-glide",
  });
}

/**
 * Offset of `el` from the top of `root` through offset parents, so a press scale or a drag does not
 * count (the answer body is never scrolled when it has just been turned to).
 */
export function topWithin(el: HTMLElement, root: HTMLElement): number {
  let top = 0;
  let node: HTMLElement | null = el;
  while (node && node !== root) {
    top += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return top;
}
