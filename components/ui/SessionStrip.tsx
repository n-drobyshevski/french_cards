import type { CSSProperties } from "react";
import { cx } from "./cx";

/**
 * One card (or exercise item) of a session, in the order it was shown:
 * first = right the first time (ink fill), miss = a miss (--again outline + a bar inside: the shape
 * cue, never colour alone), requeued = came back / an extra repeat (hollow ink outline),
 * current = the one on screen (ticks only: taller ink), future = still ahead (ticks only: --edge).
 */
export type StripMark = "first" | "miss" | "requeued" | "current" | "future";

export interface StripCounts {
  total: number;
  first: number;
  miss: number;
  requeued: number;
  current: number;
  future: number;
}

export function countStrip(marks: readonly StripMark[]): StripCounts {
  const c: StripCounts = { total: marks.length, first: 0, miss: 0, requeued: 0, current: 0, future: 0 };
  for (const m of marks) c[m] += 1;
  return c;
}

function plural(n: number, [one, few, many]: readonly [string, string, string]): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export const CARD_NOUN = ["карточка", "карточки", "карточек"] as const;

/**
 * The exact counts, for the strip's aria-label.
 * cells: «30 карточек: 24 с первого раза, 3 ошибки, 3 повтора» (zero parts left out).
 * ticks: «Вопрос 7 из 12, ещё 1 повтор. С первого раза 5, ошибка 1» — requeued ticks are repeats
 * appended to the queue, so they are not part of «из 12».
 */
export function sessionStripLabel(
  marks: readonly StripMark[],
  size: "ticks" | "cells",
  noun: readonly [string, string, string] = CARD_NOUN,
): string {
  const c = countStrip(marks);
  if (size === "cells") {
    const parts = [
      c.first > 0 && `${c.first} с первого раза`,
      c.miss > 0 && `${c.miss} ${plural(c.miss, ["ошибка", "ошибки", "ошибок"])}`,
      c.requeued > 0 && `${c.requeued} ${plural(c.requeued, ["повтор", "повтора", "повторов"])}`,
    ].filter(Boolean);
    return `${c.total} ${plural(c.total, noun)}${parts.length ? `: ${parts.join(", ")}` : ""}`;
  }
  const items = c.total - c.requeued;
  const at = c.first + c.miss + c.current;
  const head = `Вопрос ${at} из ${items}`;
  const extra = c.requeued > 0 ? `, ещё ${c.requeued} ${plural(c.requeued, ["повтор", "повтора", "повторов"])}` : "";
  return `${head}${extra}. С первого раза ${c.first}, ${plural(c.miss, ["ошибка", "ошибки", "ошибок"])} ${c.miss}`;
}

export interface SessionStripProps {
  marks: readonly StripMark[];
  /** ticks: 4px rules (10px for the current one) that share the row; player header and resume card. cells: 8×20 cells, wrapping; Done screens. */
  size: "ticks" | "cells";
  /**
   * The accessible name with the exact counts (role="img"). Omitted: sessionStripLabel(). false:
   * aria-hidden, for a strip inside a button that carries the label itself.
   */
  label?: string | false;
  /** The noun for the default cells label: ["вопрос", "вопроса", "вопросов"] for exercises. */
  noun?: readonly [string, string, string];
  /**
   * Write the strip in once on mount (§5.12): 4 groups 40ms apart, each a 4px rise + fade over
   * --dur-enter, starting after `writeInDelay` ms (e.g. 720 inside the Done beat). Reduced motion:
   * a short fade.
   */
  writeIn?: boolean;
  writeInDelay?: number;
  className?: string;
}

const TICK: Record<StripMark, string> = {
  first: "h-1 bg-ink",
  miss: "h-1 border border-again flex items-center justify-center",
  requeued: "h-1 border border-ink",
  current: "h-2.5 bg-ink",
  future: "h-1 bg-edge",
};

const CELL: Record<StripMark, string> = {
  first: "bg-ink",
  miss: "relative border-[1.5px] border-again bg-surface",
  requeued: "border border-ink bg-surface",
  // Not used by the Done screens; drawn like ticks would read them.
  current: "bg-ink",
  future: "bg-edge",
};

/**
 * One strip for session progress and results (synthesis §2.4): ticks in the exercise player and
 * the resume card, cells on both Done screens, one colour code. The current item is taller ink,
 * not red; a miss always carries a shape (outline + inner bar), not only --again.
 */
export function SessionStrip({ marks, size, label, noun, writeIn = false, writeInDelay = 0, className }: SessionStripProps) {
  const a11y =
    label === false
      ? { "aria-hidden": true as const }
      : { role: "img", "aria-label": label ?? sessionStripLabel(marks, size, noun) };
  const groupSize = Math.max(1, Math.ceil(marks.length / 4));

  if (size === "ticks") {
    return (
      <span {...a11y} className={cx("flex h-2.5 min-w-0 items-center gap-[3px]", className)}>
        {marks.map((mark, i) => (
          <span key={i} data-mark={mark} className={cx("min-w-0 flex-1 box-border", TICK[mark])}>
            {mark === "miss" && <span className="size-0.5 bg-again" />}
          </span>
        ))}
      </span>
    );
  }

  return (
    <span {...a11y} className={cx("flex flex-wrap gap-1", className)}>
      {marks.map((mark, i) => (
        <span
          key={i}
          data-mark={mark}
          style={
            writeIn
              ? ({ "--strip-group": Math.floor(i / groupSize), "--strip-delay": `${writeInDelay}ms` } as CSSProperties)
              : undefined
          }
          className={cx("box-border h-5 w-2 shrink-0 rounded-[1px]", CELL[mark], writeIn && "strip-write")}
        >
          {mark === "miss" && <span className="absolute inset-x-[1.5px] inset-y-[5px] bg-again" />}
        </span>
      ))}
    </span>
  );
}
