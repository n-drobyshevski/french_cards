"use client";

import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icons";
import type { ExercisePairTile } from "@/lib/types";
import type { PairsState } from "./player-state";

export interface MatchPairsProps {
  /** The board: French and Russian columns, each shuffled (pairsBoard with the attempt's random). */
  board: { fr: ExercisePairTile[]; ru: ExercisePairTile[] };
  state: PairsState;
  onTap: (side: "fr" | "ru", key: string) => void;
  /** «Не знаю»: the Russian column lines up with the French one and the pairs not found show in the again tone. */
  revealed?: boolean;
  /** No taps (answered, or the card is leaving). */
  disabled?: boolean;
}

const tile =
  "press relative flex h-[52px] min-w-0 items-center rounded-card border bg-surface px-[15px] text-left disabled:cursor-default";

/**
 * «Соедини слово и перевод» (Exercise-S-Pairs): two columns of 52px tiles, French left (Newsreader)
 * and Russian right. Tap a French tile (2px ink outline), then its translation: a match fades both to
 * good with a check; a miss flashes both in the again tone (the player logs it as a wrong answer for
 * that word). Done when every pair is found.
 */
export function MatchPairs({ board, state, onTap, revealed = false, disabled = false }: MatchPairsProps) {
  const matched = new Set(state.matched);
  const ru = revealed ? board.fr.map((t) => board.ru.find((r) => r.key === t.key) ?? t) : board.ru;

  const look = (key: string, side: "fr" | "ru") => {
    if (matched.has(key)) return "border-good text-muted opacity-55";
    if (revealed) return "border-again text-again";
    if (side === "fr" && state.selected === key) return "border-2 border-ink px-[14px] text-ink";
    const flashed = state.flash && (side === "fr" ? state.flash.fr : state.flash.ru) === key;
    return cx("border-boundary text-ink hoverable:bg-hover-surface", flashed && "animate-[ex-miss_600ms_var(--ease-standard)]");
  };

  const column = (side: "fr" | "ru", tiles: ExercisePairTile[]) => (
    <div role="group" aria-label={side === "fr" ? "Слова" : "Переводы"} className="flex min-w-0 flex-col gap-2">
      {tiles.map((t) => {
        const done = matched.has(t.key);
        const flashed = state.flash && (side === "fr" ? state.flash.fr : state.flash.ru) === t.key;
        return (
          <button
            // The flash restarts on every miss: the key changes with it.
            key={flashed ? `${t.key}:${state.flash!.seq}` : t.key}
            type="button"
            data-pair={side}
            aria-pressed={side === "fr" ? state.selected === t.key : undefined}
            disabled={disabled || done || revealed}
            onClick={() => onTap(side, t.key)}
            className={cx(tile, look(t.key, side))}
          >
            <span
              lang={side}
              className={cx(
                "min-w-0 truncate",
                side === "fr" ? "font-serif text-[19px] leading-6 font-medium" : "text-[15px] leading-5 font-medium",
              )}
            >
              {side === "fr" ? t.fr : t.ru}
            </span>
            {done && (
              <>
                <Icon name="check" size={16} className="absolute top-1/2 right-3 -translate-y-1/2 text-good" />
                <span className="sr-only">найдено</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="grid grid-cols-2 gap-3">
      {column("fr", board.fr)}
      {column("ru", ru)}
    </div>
  );
}
