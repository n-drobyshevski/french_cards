"use client";

import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icons";
import {
  isRussian,
  tileVerdict,
  type PlayerResult,
  type TileVerdict,
} from "./player-state";

export interface OptionGridProps {
  /** The options in grid order (index + 1 is the key). */
  options: readonly string[];
  /** Index of the right option. */
  correct: number;
  /** The card's answer; null while asked. */
  result: PlayerResult | null;
  onPick: (index: number) => void;
  /** The tile's content; default: the option text (French in Newsreader, Russian in Plex). */
  renderOption?: (
    option: string,
    index: number,
    verdict: TileVerdict,
  ) => ReactNode;
  /** Blocks taps (the card is leaving). */
  locked?: boolean;
}

// Every tone keeps the ✓ / ✕ corner clear (the label never reflows when the answer lands); the
// right tile's 2px border takes its extra pixel out of the padding.
// Phones (X-Player-B): slips — the word on its own ruled line at the slip's foot, 16px in.
const TONE: Record<TileVerdict, string> = {
  idle: "border border-boundary pr-8 pl-3.5 text-ink hoverable:bg-hover-surface max-md:px-4 max-md:pb-4",
  right:
    "border-2 border-good pr-[31px] pl-[13px] text-good max-md:px-[15px] max-md:pb-[15px]",
  wrong: "border border-again pr-8 pl-3.5 text-again max-md:px-4 max-md:pb-4",
  dim: "border border-rule pr-8 pl-3.5 text-muted max-md:px-4 max-md:pb-4",
};

/** The slip's ruled line under the word (phones only): a hairline, fainter on the dimmed slips. */
const SLIP_LINE = "max-md:border-b max-md:pb-1.5";
const SLIP_LINE_TONE: Record<TileVerdict, string> = {
  idle: "max-md:border-rule",
  right: "max-md:border-rule",
  wrong: "max-md:border-rule",
  dim: "max-md:border-hover",
};

/**
 * The default tile text: French options in Newsreader 19, Russian ones in Plex 16 (two lines fit).
 * Phones (X-Player-B): Russian in Plex 17, French in regular Newsreader; `strong` (the right slip
 * once answered) sets it medium.
 */
export function OptionText({
  text,
  strong = false,
}: {
  text: string;
  strong?: boolean;
}) {
  const ru = isRussian(text);
  return (
    <span
      lang={ru ? "ru" : "fr"}
      className={cx(
        // A word longer than the tile breaks (hyphenated where the browser can) instead of running under the ✓ / ✕ or being clipped.
        "line-clamp-2 min-w-0 hyphens-auto [overflow-wrap:anywhere]",
        // Russian options read as plain text on phones (L-ExPlayer-B), medium from 768.
        ru
          ? "text-[16px] leading-[22px] max-md:text-[17px] md:font-medium"
          : "font-serif text-[19px] leading-6 font-medium max-md:font-normal",
        strong && "max-md:font-medium",
      )}
    >
      {text}
    </span>
  );
}

/**
 * The answers as a 2×2 grid (pick D6 B), on phones and desktop alike: 76px slips on phones (no
 * index, the word on its ruled line at the foot — X-Player-B; 64px on short screens), 64px tiles
 * from 768 with Kbd caps 1–4. A tap answers at once (pick D4 C). After it the right tile gets a 2px
 * good border + check, a wrong pick a 1px again border + cross, the rest dim; the tapped tile
 * flashes its tone first (MOTION-SPEC §5.15). Screen readers hear «верный ответ» / «ваш ответ».
 */
export function OptionGrid({
  options,
  correct,
  result,
  onPick,
  renderOption,
  locked = false,
}: OptionGridProps) {
  return (
    <div
      role="group"
      aria-label="Варианты ответа"
      className="mt-4 grid shrink-0 grid-cols-2 gap-2"
    >
      {options.map((option, i) => {
        const verdict = tileVerdict(i, correct, result);
        const tapped = result?.pick === i;
        return (
          <button
            key={i}
            type="button"
            data-option={i + 1}
            aria-keyshortcuts={String(i + 1)}
            disabled={result !== null}
            onClick={() => {
              if (!locked) onPick(i);
            }}
            className={cx(
              "press relative flex h-[76px] min-w-0 items-center overflow-hidden rounded-card bg-surface text-left disabled:cursor-default md:h-16",
              "max-md:flex-col max-md:items-stretch max-md:rounded-chip max-md:justify-end max-md:[@media(max-height:740px)]:h-16",
              TONE[verdict],
            )}
          >
            {tapped && (
              <span
                aria-hidden="true"
                className={cx(
                  "pointer-events-none absolute inset-0 opacity-0 animate-[ex-fill_180ms_var(--ease-press)]",
                  verdict === "right" ? "bg-good/25" : "bg-again/25",
                )}
              />
            )}
            {/* Phones carry no index (L-ExPlayer-B); from 768 the Kbd cap 1–4. */}
            <span
              className={cx(
                "relative flex min-w-0 items-baseline gap-3.5",
                SLIP_LINE,
                SLIP_LINE_TONE[verdict],
              )}
            >
              <kbd
                aria-hidden="true"
                className={cx(
                  "hidden h-[18px] min-w-[18px] shrink-0 items-center justify-center self-center rounded-[3px] border bg-surface px-1 font-mono text-[11px] leading-none font-normal md:inline-flex",
                  verdict === "idle"
                    ? "border-rule text-muted"
                    : "border-current",
                )}
              >
                {i + 1}
              </kbd>
              {renderOption ? (
                renderOption(option, i, verdict)
              ) : (
                <OptionText text={option} strong={verdict === "right"} />
              )}
            </span>
            {(verdict === "right" || verdict === "wrong") && (
              <>
                <Icon
                  name={verdict === "right" ? "check" : "close"}
                  size={18}
                  className="absolute top-2.5 right-2.5"
                />
                <span className="sr-only">
                  {verdict === "right" ? "верный ответ" : "ваш ответ"}
                </span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
