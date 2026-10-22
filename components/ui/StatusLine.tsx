"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatElapsed, useElapsed } from "@/lib/use-delayed-flag";
import { cx } from "./cx";

export interface StatusLineProps {
  /** The stage in words, in place: «Подбираем варианты» → «3 варианта». */
  text: ReactNode;
  /** A real count in the same line: «Найдено 7», «3 / 12». */
  count?: ReactNode;
  /** The region is still waiting: elapsed after 3 s, ink run after 1.5 s (unless determinate). */
  active: boolean;
  /** Determinate progress 0–1: the hairline becomes a 1px ink bar. Callers move it only forward, on real events. */
  progress?: number;
  /** Stopped or failed: the bar freezes, muted. */
  frozen?: boolean;
  /** Short status for screen readers (at most one update per 2 s is announced). */
  announce?: string;
  /** No ink run here (another loop on the screen is the alive signal, e.g. the import scan line). */
  noRun?: boolean;
  className?: string;
}

/**
 * One status line per waiting region (MOTION-SPEC §3.4): mono 11px uppercase, 20px tall, on a 1px
 * hairline. The only indeterminate indicator in the product is the ink run on that hairline.
 */
export function StatusLine({
  text,
  count,
  active,
  progress,
  frozen = false,
  announce,
  noRun = false,
  className,
}: StatusLineProps) {
  const elapsed = useElapsed(active);
  const determinate = progress !== undefined;
  const run = useRunAfter(active && !determinate && !noRun, 1500);
  const live = useThrottledText(announce ?? (typeof text === "string" ? text : ""), 2000);

  return (
    <div className={cx("relative", className)}>
      <div className="meta flex h-5 items-center justify-between gap-3 tabular-nums">
        <span className="min-w-0 truncate">
          {text}
          {count != null && <span className="ml-2">{count}</span>}
        </span>
        {active && elapsed !== null && elapsed >= 3 && <span className="shrink-0">{formatElapsed(elapsed)}</span>}
      </div>
      <div aria-hidden="true" className="relative h-px overflow-hidden bg-rule">
        {determinate && (
          <span
            className={cx(
              "absolute inset-y-0 left-0 w-full origin-left transition-transform duration-(--dur-move) ease-standard",
              frozen ? "bg-muted" : "bg-ink",
            )}
            style={{
              transform: `scaleX(${Math.min(1, Math.max(0, progress))})`,
            }}
          />
        )}
        {run && <span className="motion-loop absolute inset-y-0 w-8 bg-ink animate-[ink-run_2000ms_linear_infinite]" />}
      </div>
      <span role="status" aria-live="polite" className="sr-only">
        {live}
      </span>
    </div>
  );
}

function useRunAfter(active: boolean, ms: number): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => setOn(true), ms);
    return () => {
      window.clearTimeout(timer);
      setOn(false);
    };
  }, [active, ms]);
  return active && on;
}

/** Announce at most one status per `ms`; the latest one wins. */
function useThrottledText(text: string, ms: number): string {
  const [shown, setShown] = useState(text);
  const last = useRef(0);
  useEffect(() => {
    const wait = Math.max(0, last.current + ms - performance.now());
    const timer = window.setTimeout(() => {
      last.current = performance.now();
      setShown(text);
    }, wait);
    return () => window.clearTimeout(timer);
  }, [text, ms]);
  return shown;
}
