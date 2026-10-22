import type { CSSProperties } from "react";
import { cx } from "./cx";

/**
 * Static ruled blanks (MOTION-SPEC §3.3): a skeleton row is the real row's frame — same height, padding
 * and hairline — with flat bars for text. Bars never move (no shimmer, no pulse); the "alive" signal is
 * the region's StatusLine. Everything here is aria-hidden; the region carries aria-busy and the status.
 */

/** Bar widths per row, so a stack never reads as a pattern. */
export const SKELETON_WIDTHS: readonly (readonly [number, number])[] = [
  [72, 88],
  [96, 64],
  [56, 104],
  [80, 72],
];

/** Stack depth: «more may come», no count promised. */
export const SKELETON_FADE = [1, 0.75, 0.5, 0.3] as const;

export function SkeletonBar({
  width,
  height = 8,
  className,
}: {
  width: number | string;
  height?: 3 | 6 | 8;
  className?: string;
}) {
  return (
    <span aria-hidden="true" className={cx("block shrink-0 rounded-[2px] bg-surface-2", className)} style={{ width, height }} />
  );
}

/** Four 10×3 segments standing in for the slang meter. */
export function SkeletonMeter({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cx("inline-flex shrink-0 gap-[2px]", className)}>
      {[0, 1, 2, 3].map((s) => (
        <span key={s} className="h-[3px] w-2.5 bg-surface-2" />
      ))}
    </span>
  );
}

export interface SkeletonRowProps {
  /** Row height in px: 44 Словарь, 72 Варианты, 56 import stream, 64 library row, 40/48 desktop table, 76 «Список». */
  height: number;
  /** Index in the stack: picks bar widths and the fade step. */
  index?: number;
  /** 1 = headword only; 2 = headword + secondary line; 3 = + a third (example) line. */
  lines?: 1 | 2 | 3;
  /** Slang-meter stand-in on the right. */
  meter?: boolean;
  /** Fade with depth (1, .75, .5, .3). */
  fade?: boolean;
  /** Hairline under the row (default on). */
  rule?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function SkeletonRow({
  height,
  index = 0,
  lines = 2,
  meter = false,
  fade = false,
  rule = true,
  className,
  style,
}: SkeletonRowProps) {
  const [a, b] = SKELETON_WIDTHS[index % SKELETON_WIDTHS.length];
  return (
    <div
      aria-hidden="true"
      className={cx("flex shrink-0 items-center justify-between gap-3", rule && "border-b border-rule", className)}
      style={{
        height,
        opacity: fade ? SKELETON_FADE[Math.min(index, SKELETON_FADE.length - 1)] : undefined,
        ...style,
      }}
    >
      <span className="flex min-w-0 flex-col gap-1.5">
        <SkeletonBar width={a + 40} />
        {lines >= 2 && <SkeletonBar width={b + 24} height={6} />}
        {lines >= 3 && <SkeletonBar width={a + b} height={6} />}
      </span>
      {meter && <SkeletonMeter className="mr-1" />}
    </div>
  );
}

/** A stack of skeleton rows, depth-faded by default. */
export function SkeletonRows({ count, ...row }: Omit<SkeletonRowProps, "index"> & { count: number }) {
  return (
    <div aria-hidden="true" className="flex flex-col">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonRow key={i} index={i} fade {...row} />
      ))}
    </div>
  );
}
