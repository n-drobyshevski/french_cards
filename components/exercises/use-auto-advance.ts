"use client";

// The right answer's auto-advance (MOTION-SPEC §5.15, pick D4 C): once the stamp has landed
// (230 ms), a 2px good hairline drains over 1000 ms and the player moves on. A tap anywhere holds
// it (the hairline stops where it is and the line offers «Дальше»). Under prefers-reduced-motion
// nothing auto-advances: the line shows «Дальше» at once.
import { useCallback, useEffect, useEffectEvent, useState } from "react";
import { REDUCED_MOTION_QUERY } from "@/lib/motion";
import { useMediaQuery } from "@/lib/use-media";
import { RESULT_LOCK_MS } from "./player-keys";

/** The hairline's run (--ease-linear). */
export const AUTO_ADVANCE_MS = 1000;

/** idle: nothing to advance; running: the hairline drains; held: a tap stopped it; off: reduced motion. */
export type AutoAdvancePhase = "idle" | "running" | "held" | "off";

/**
 * The phase for the result `token` (one per answered card, null when there is none): off under
 * reduced motion, held once `heldToken` names this result.
 */
export function autoAdvancePhase(token: number | null, reducedMotion: boolean, heldToken: number | null): AutoAdvancePhase {
  if (token === null) return "idle";
  if (reducedMotion) return "off";
  return heldToken === token ? "held" : "running";
}

/** When the advance fires after the answer: the stamp lands, then the hairline runs out. */
export const autoAdvanceAt = (delayMs = RESULT_LOCK_MS, durationMs = AUTO_ADVANCE_MS) => delayMs + durationMs;

/**
 * Runs `onAdvance` AUTO_ADVANCE_MS after the stamp has landed for result `token` (pass null when
 * the card is not a right answer). Returns the phase and `hold()` (a tap anywhere).
 */
export function useAutoAdvance(token: number | null, onAdvance: () => void): { phase: AutoAdvancePhase; hold: () => void } {
  const reduced = useMediaQuery(REDUCED_MOTION_QUERY);
  const [heldToken, setHeldToken] = useState<number | null>(null);
  const phase = autoAdvancePhase(token, reduced, heldToken);
  const advance = useEffectEvent(onAdvance);

  useEffect(() => {
    if (phase !== "running") return;
    const timer = window.setTimeout(() => advance(), autoAdvanceAt());
    return () => window.clearTimeout(timer);
  }, [phase, token]);

  const hold = useCallback(() => {
    if (token !== null) setHeldToken(token);
  }, [token]);

  return { phase, hold };
}
