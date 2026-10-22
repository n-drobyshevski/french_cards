"use client";

import type { CSSProperties, ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icons";
import { SlangMeter } from "@/components/ui/SlangMeter";
import type { Direction, Word } from "@/lib/types";
import { posAbbr } from "./format";
import type { SwipeOutcome } from "./swipe";
import { swipeVisual } from "./swipe";
import { useSwipe } from "./useSwipe";

/** Index-card shell: white, radius 6, 1px rule, the red header rule 44px from the top. */
const cardShell = "flex flex-col overflow-hidden rounded-card border border-rule bg-surface text-ink";

function CardHeader({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <span className="flex h-[46px] shrink-0 items-center justify-between border-b-2 border-red px-5">
      <span className="font-mono text-[11px] tracking-[.06em] text-muted">{label}</span>
      {children}
    </span>
  );
}

/** Prompt size steps down for long expressions so they stay on the card. */
function promptSize(text: string): string {
  if (text.length <= 16) return "text-[40px] leading-[1.1]";
  if (text.length <= 28) return "text-[32px] leading-[1.15]";
  return "text-[26px] leading-[1.2]";
}

export interface ReviewCardProps {
  word: Word;
  direction: Direction;
  revealed: boolean;
  onReveal: () => void;
  /** «Повседневное» / «Входящие» */
  folderName: string;
  swipeEnabled: boolean;
  onSwipe: (outcome: SwipeOutcome) => void;
  /** Show the next card peeking behind while dragging. */
  hasNext: boolean;
}

/** The review card: question side (tap to flip) or answer side (swipe to grade). */
export function ReviewCard({ word, direction, revealed, onReveal, folderName, swipeEnabled, onSwipe, hasNext }: ReviewCardProps) {
  const swipe = useSwipe({ enabled: revealed && swipeEnabled, onDecide: onSwipe });
  const { dx, width, mode } = swipe.view;
  const visual = swipeVisual(dx, width || 1);
  const moving = mode !== "idle" || dx !== 0;

  const fromFr = direction === "fr_ru";
  const label = fromFr ? "FR" : "RU";
  const prompt = fromFr ? word.fr : word.ru;
  const pos = posAbbr(word);

  const motion: CSSProperties | undefined = moving
    ? {
        transform: `translateX(${dx}px) rotate(${visual.rotate}deg)`,
        transition: mode === "dragging" ? "none" : "transform 180ms ease-out",
      }
    : undefined;

  return (
    <div data-review-focus="" className="relative mt-4 flex min-h-[280px] flex-1 flex-col">
      {hasNext && moving && (
        <div aria-hidden="true" className={cx(cardShell, "absolute inset-0 scale-[.96]")}>
          <CardHeader label={label} />
        </div>
      )}

      {!revealed ? (
        <button
          type="button"
          onClick={onReveal}
          aria-label={`Карточка ${prompt}, перевернуть`}
          className={cx(cardShell, "absolute inset-0 text-left")}
        >
          <CardHeader label={label} />
          <span className="flex min-h-0 flex-1 flex-col justify-center px-6 pb-6">
            <span
              lang={fromFr ? "fr" : undefined}
              className={cx("font-serif font-medium tracking-[-0.015em] break-words", promptSize(prompt))}
            >
              {prompt}
            </span>
            {fromFr && pos && (
              <span lang="fr" className="abbr mt-2 text-[15px] leading-5">
                {pos}
              </span>
            )}
          </span>
          <span className="mx-5 flex h-12 shrink-0 items-center gap-2 border-t border-rule text-[12px] text-muted">
            <Icon name="flip" size={14} />
            <span>тапни, чтобы перевернуть</span>
          </span>
        </button>
      ) : (
        <article
          {...swipe.handlers}
          data-review-answer=""
          tabIndex={-1}
          aria-label={`${word.fr} — ${word.ru}`}
          style={motion}
          className={cx(
            cardShell,
            "absolute inset-0 outline-none will-change-transform",
            swipeEnabled && "touch-pan-y select-none",
          )}
        >
          <CardHeader label={label}>
            <SlangMeter level={word.slang_level} verlan={word.verlan} />
          </CardHeader>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-6 pt-6 pb-4">
            <h2 lang="fr" className={cx("m-0 font-serif font-medium tracking-[-0.015em] break-words", promptSize(word.fr))}>
              {word.fr}
            </h2>
            {pos && (
              <span lang="fr" className="abbr mt-2 text-[15px] leading-5">
                {pos}
              </span>
            )}
            <p className="mt-6 mb-0 text-[22px] leading-7 font-medium break-words">{word.ru}</p>
            {word.note && (
              <p className="mt-2 mb-0 max-w-[32ch] text-[14px] leading-5 whitespace-pre-line text-muted">{word.note}</p>
            )}
            {(word.example_fr || word.example_ru) && (
              <div className="mt-6 flex flex-col gap-1 border-t border-rule pt-4">
                {word.example_fr && (
                  <span lang="fr" className="font-serif text-[17px] leading-6 italic">
                    {word.example_fr}
                  </span>
                )}
                {word.example_ru && <span className="text-[13px] leading-5 text-muted">{word.example_ru}</span>}
              </div>
            )}
          </div>

          <div className="meta mx-5 flex h-12 shrink-0 items-center border-t border-rule">
            <span className="truncate">
              тема: <span className="text-ink">{folderName}</span>
            </span>
          </div>

          {visual.side && (
            <span
              aria-hidden="true"
              style={{
                opacity: visual.progress * 0.9,
                transform: `rotate(${visual.side === "good" ? -8 : 8}deg)`,
              }}
              className={cx(
                "pointer-events-none absolute top-3 inline-flex h-10 items-center rounded-chip border-2 px-3.5 font-mono text-[20px] font-medium tracking-[.16em]",
                visual.side === "good" ? "left-14 border-good text-good" : "right-14 border-again text-again",
              )}
            >
              {visual.side === "good" ? "ЗНАЮ" : "НЕ ЗНАЮ"}
            </span>
          )}
        </article>
      )}
    </div>
  );
}

/** Placeholder with the same footprint while the next card loads. */
export function ReviewCardPlaceholder() {
  return (
    <div className="relative mt-4 flex min-h-[280px] flex-1 flex-col">
      <div aria-hidden="true" className={cx(cardShell, "absolute inset-0")}>
        <CardHeader label="" />
      </div>
    </div>
  );
}
