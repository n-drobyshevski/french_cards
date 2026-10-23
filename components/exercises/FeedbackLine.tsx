"use client";

import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { Kbd } from "@/components/ui/Kbd";
import { isRussian, resultAnnouncement, type ResultTone } from "./player-state";

export interface FeedbackLineProps {
  /** right; wrong / «Не знаю»: the answer too; pairs: a pairs board with misses. Each waits for «Дальше». */
  tone: ResultTone;
  /** The right answer, shown on a wrong answer («ОТВЕТ femme»). */
  answer?: ReactNode;
  /** Plain text of the answer, for its language. */
  answerText?: string | null;
  /** explain_ru: on phones its own line under the answer (two lines at most); from 768 one muted line, cut with an ellipsis. */
  explain?: string | null;
  /** Mismatches on a pairs board. */
  misses?: number;
  /** «Слово ›»: opens the library word (none for a new word). */
  onWord?: (() => void) | null;
  onNext: () => void;
}

const nextButton =
  "press shrink-0 items-center justify-center gap-2.5 rounded-btn border border-ink bg-ink font-medium text-on-ink active:border-ink-press active:bg-ink-press";

/**
 * The one result line under the grid (pick D5 C), inside the player's fixed action zone, so nothing
 * moves when the answer lands. Wrong / «Не знаю»: mono «ОТВЕТ» + the right answer in the good tone,
 * `explain_ru`, «Слово ›», and the black «Дальше». Right: `explain_ru` + «Слово ›», and the same
 * «Дальше» — nothing moves on by itself (changed from the 1 s auto-advance on 2026-10-23). On
 * phones `explain_ru` takes its own line under the answer. From 768: one 64px row ruled at the
 * bottom, «Дальше ↵» at its right.
 */
export function FeedbackLine({ tone, answer, answerText, explain, misses = 0, onWord, onNext }: FeedbackLineProps) {
  const lang = answerText && !isRussian(answerText) ? "fr" : "ru";

  return (
    <section
      aria-label="Результат ответа"
      data-exercise-result={tone}
      // The player focuses «Дальше»; the line is the fallback when none is visible.
      tabIndex={-1}
      className="flex h-full flex-col outline-none animate-[fade-in_var(--dur-quick)_var(--ease-standard)] md:relative md:h-16 md:flex-row md:items-center md:gap-3 md:border-b md:border-rule"
    >
      {/* For reading the page; the player's live region announces it. */}
      <span className="sr-only">{resultAnnouncement(tone, misses)}</span>
      {/* Phones: the answer row (dropped when it would be empty: a right answer with no «Слово ›»). */}
      <div className={cx("flex h-11 min-w-0 shrink-0 items-center gap-2 md:h-auto md:flex-1 md:gap-3", tone === "right" && !onWord && "max-md:hidden")}>
        {tone === "wrong" && answer != null && (
          <>
            <span className="meta shrink-0">ответ</span>
            <span
              lang={lang}
              className={cx(
                "max-w-[60%] shrink-0 truncate text-good",
                lang === "fr" ? "font-serif text-[19px] leading-6 font-medium" : "text-[16px] leading-[22px] font-medium md:font-serif md:text-[19px] md:leading-6",
              )}
            >
              {answer}
            </span>
          </>
        )}
        {tone === "pairs" && <span className="meta shrink-0">ошибок: {misses}</span>}
        {explain && (
          <span className="min-w-0 flex-1 truncate text-[13px] leading-5 text-muted max-md:hidden">
            {tone === "wrong" || tone === "pairs" ? "· " : ""}
            {explain}
          </span>
        )}
        <span className={cx("flex-1", explain && "md:hidden")} />
        {onWord && (
          <button
            type="button"
            onClick={onWord}
            className="press-sm inline-flex h-11 shrink-0 items-center text-[13px] font-medium text-ink md:underline md:underline-offset-[3px]"
          >
            Слово ›
          </button>
        )}
      </div>

      {/* Phones: the explanation in full (it teaches the word), under the answer. */}
      {explain && <p className="m-0 line-clamp-2 shrink-0 text-[13px] leading-5 whitespace-normal text-muted md:hidden [@media(max-height:740px)]:line-clamp-1">{explain}</p>}

      {/* Phones: the bottom of the zone. */}
      <div className="flex min-h-0 flex-1 flex-col justify-end md:hidden">
        <button type="button" data-advance="" onClick={onNext} className={cx(nextButton, "inline-flex h-[52px] w-full text-[15px]")}>
          Дальше
        </button>
      </div>

      {/* From 768: the end of the row. */}
      <button
        type="button"
        data-advance=""
        aria-keyshortcuts="Enter"
        onClick={onNext}
        className={cx(nextButton, "hidden h-11 min-w-[152px] pr-3 pl-5 text-[15px] font-semibold md:inline-flex")}
      >
        Дальше
        <Kbd tone="ink" aria-hidden="true">
          ↵
        </Kbd>
      </button>
    </section>
  );
}
