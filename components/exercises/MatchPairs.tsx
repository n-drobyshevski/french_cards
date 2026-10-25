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

// --- Phones (X-Player-B) ------------------------------------------------------------------------

/**
 * The row a Russian slip writes into on phones: the French row picked, else the first open one in
 * the board's order («Ответы вписываются в строки по порядку»). Null once every row is done.
 */
export function activePairRow(board: { fr: readonly ExercisePairTile[] }, state: Pick<PairsState, "selected" | "matched">): string | null {
  if (state.selected !== null && !state.matched.includes(state.selected)) return state.selected;
  return board.fr.find((t) => !state.matched.includes(t.key))?.key ?? null;
}

export interface PairsRowsProps {
  board: { fr: ExercisePairTile[]; ru: ExercisePairTile[] };
  state: PairsState;
  onTap: (side: "fr", key: string) => void;
  revealed?: boolean;
  disabled?: boolean;
}

/**
 * The pairs board on the phone card (X-Player-B): one row per French word with a blank line beside
 * it; the active row (`activePairRow`) has the darker dashed blank, a tap on another open row makes
 * it the active one. A match writes the translation into its row in the good tone with ✓ on a solid
 * rule; «Не знаю» writes the pairs not found in the again tone with ✕. A miss flashes the row.
 */
export function PairsRows({ board, state, onTap, revealed = false, disabled = false }: PairsRowsProps) {
  const matched = new Set(state.matched);
  const active = revealed ? null : activePairRow(board, state);
  return (
    <div role="group" aria-label="Слова" className="flex flex-col">
      {board.fr.map((t) => {
        const done = matched.has(t.key);
        const current = t.key === active;
        const flashed = state.flash?.fr === t.key;
        return (
          <button
            // The flash restarts on every miss: the key changes with it.
            key={flashed ? `${t.key}:${state.flash!.seq}` : t.key}
            type="button"
            data-pair="fr"
            aria-pressed={done || revealed ? undefined : current}
            disabled={disabled || done || revealed}
            onClick={() => onTap("fr", t.key)}
            className={cx("press-sm flex h-11 min-w-0 items-end gap-3 text-left disabled:cursor-default", flashed && "animate-[ex-miss_600ms_var(--ease-standard)]")}
          >
            <span lang="fr" className={cx("w-[46%] shrink-0 truncate pb-1 font-serif text-[19px] leading-6", done || current || revealed ? "text-ink" : "text-muted")}>
              {t.fr}
            </span>
            {done || revealed ? (
              <span
                className={cx(
                  "flex min-w-0 flex-1 items-center gap-1.5 border-b pb-1 text-[16px] leading-6 font-medium animate-[fade-in_var(--dur-quick)_var(--ease-enter)]",
                  done ? "border-ink text-good" : "border-again text-again",
                )}
              >
                <span lang="ru" className="min-w-0 truncate">
                  {t.ru}
                </span>
                <Icon name={done ? "check" : "close"} size={16} strokeWidth={2} className="shrink-0" />
                <span className="sr-only">{done ? "найдено" : "не найдено"}</span>
              </span>
            ) : (
              <span aria-hidden="true" className={cx("mb-2 h-0 min-w-0 flex-1 border-b-[1.5px] border-dashed", current ? "border-ink" : "border-rule")} />
            )}
          </button>
        );
      })}
    </div>
  );
}

export interface PairsSlipsProps {
  board: { fr: ExercisePairTile[]; ru: ExercisePairTile[] };
  state: PairsState;
  /** A Russian slip, written into `row` (the active row: picked, or the first open one). */
  onTap: (side: "ru", key: string, row: string | null) => void;
  revealed?: boolean;
  disabled?: boolean;
}

/**
 * The Russian words under the phone card (X-Player-B): slips in a 2-column grid, the word on its
 * ruled line; a slip that found its row leaves an empty dashed place behind. A miss flashes the
 * slip in the again tone (the row flashes with it).
 */
export function PairsSlips({ board, state, onTap, revealed = false, disabled = false }: PairsSlipsProps) {
  const matched = new Set(state.matched);
  const row = activePairRow(board, state);
  return (
    <div role="group" aria-label="Переводы" className="mt-4 grid shrink-0 grid-cols-2 gap-2">
      {board.ru.map((t) => {
        if (matched.has(t.key)) return <span key={t.key} aria-hidden="true" className="h-[60px] rounded-chip border border-dashed border-rule" />;
        const flashed = state.flash?.ru === t.key;
        return (
          <button
            key={flashed ? `${t.key}:${state.flash!.seq}` : t.key}
            type="button"
            data-pair="ru"
            disabled={disabled || revealed}
            onClick={() => onTap("ru", t.key, row)}
            className={cx(
              "press flex h-[60px] min-w-0 flex-col justify-end rounded-chip border bg-surface px-4 pb-3 text-left disabled:cursor-default",
              revealed ? "border-rule text-muted" : "border-boundary text-ink hoverable:bg-hover-surface",
              flashed && "animate-[ex-miss_600ms_var(--ease-standard)]",
            )}
          >
            <span lang="ru" className={cx("block truncate border-b pb-1 text-[16px] leading-[22px]", revealed ? "border-hover" : "border-rule")}>
              {t.ru}
            </span>
          </button>
        );
      })}
    </div>
  );
}
