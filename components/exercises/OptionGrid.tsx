"use client";

import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icons";
import { isRussian, tileVerdict, type PlayerResult, type TileVerdict } from "./player-state";

export interface OptionGridProps {
  /** The options in grid order (index + 1 is the key). */
  options: readonly string[];
  /** Index of the right option. */
  correct: number;
  /** The card's answer; null while asked. */
  result: PlayerResult | null;
  onPick: (index: number) => void;
  /** The tile's content; default: the option text (French in Newsreader, Russian in Plex). */
  renderOption?: (option: string, index: number, verdict: TileVerdict) => ReactNode;
  /** Blocks taps (the card is leaving). */
  locked?: boolean;
}

const TONE: Record<TileVerdict, string> = {
  idle: "border border-boundary text-ink hoverable:bg-hover-surface",
  right: "border-2 border-good px-[13px] pr-[25px] text-good",
  wrong: "border border-again pr-[26px] text-again",
  dim: "border border-rule text-muted",
};

/** The default tile text: French options in Newsreader 19, Russian ones in Plex 16 (two lines fit). */
export function OptionText({ text }: { text: string }) {
  const ru = isRussian(text);
  return (
    <span
      lang={ru ? "ru" : "fr"}
      className={cx(
        "line-clamp-2 min-w-0",
        ru ? "text-[16px] leading-[22px] font-medium" : "font-serif text-[19px] leading-6 font-medium",
      )}
    >
      {text}
    </span>
  );
}

/**
 * The answers as a 2×2 grid (pick D6 B), on phones and desktop alike: 88px tiles on phones, 64px
 * from 768 with Kbd caps 1–4. A tap answers at once (pick D4 C). After it the right tile gets a 2px
 * good border + check, a wrong pick a 1px again border + cross, the rest dim; the tapped tile
 * flashes its tone first (MOTION-SPEC §5.15). Screen readers hear «верный ответ» / «ваш ответ».
 */
export function OptionGrid({ options, correct, result, onPick, renderOption, locked = false }: OptionGridProps) {
  return (
    <div role="group" aria-label="Варианты ответа" className="mt-4 grid shrink-0 grid-cols-2 gap-2">
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
              "press relative flex h-[88px] min-w-0 items-center overflow-hidden rounded-card bg-surface px-3.5 text-left disabled:cursor-default md:h-16",
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
            <span className="relative flex min-w-0 items-baseline gap-3 md:gap-3.5">
              <span
                aria-hidden="true"
                className={cx("w-3 shrink-0 font-mono text-[12px] leading-4 font-medium md:hidden", verdict === "idle" ? "text-muted" : "text-current")}
              >
                {i + 1}
              </span>
              <kbd
                aria-hidden="true"
                className={cx(
                  "hidden h-[18px] min-w-[18px] shrink-0 items-center justify-center self-center rounded-[3px] border bg-surface px-1 font-mono text-[11px] leading-none font-normal md:inline-flex",
                  verdict === "idle" ? "border-rule text-muted" : "border-current",
                )}
              >
                {i + 1}
              </kbd>
              {renderOption ? renderOption(option, i, verdict) : <OptionText text={option} />}
            </span>
            {(verdict === "right" || verdict === "wrong") && (
              <>
                <Icon name={verdict === "right" ? "check" : "close"} size={18} className="absolute top-2.5 right-2.5" />
                <span className="sr-only">{verdict === "right" ? "верный ответ" : "ваш ответ"}</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
