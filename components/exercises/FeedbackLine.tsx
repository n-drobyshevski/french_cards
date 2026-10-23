"use client";

import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { Kbd } from "@/components/ui/Kbd";
import { isRussian, resultAnnouncement, type ResultTone } from "./player-state";
import type { AutoAdvancePhase } from "./use-auto-advance";

export interface FeedbackLineProps {
  /** right: auto-advance (unless held / reduced motion); wrong: the answer and «Дальше»; pairs: a pairs board with misses. */
  tone: ResultTone;
  /** The right answer, shown on a wrong answer («ОТВЕТ femme»). */
  answer?: ReactNode;
  /** Plain text of the answer, for its language. */
  answerText?: string | null;
  /** explain_ru: one muted line, cut with an ellipsis. */
  explain?: string | null;
  /** Mismatches on a pairs board. */
  misses?: number;
  /** «Слово ›»: opens the library word (none for a new word). */
  onWord?: (() => void) | null;
  /** The auto-advance on a right answer. */
  phase: AutoAdvancePhase;
  onHold: () => void;
  onNext: () => void;
}

const nextButton =
  "press shrink-0 items-center justify-center gap-2.5 rounded-btn border border-ink bg-ink font-medium text-on-ink active:border-ink-press active:bg-ink-press";

/**
 * The one result line under the grid (pick D5 C), inside the player's fixed action zone, so nothing
 * moves when the answer lands. Wrong / «Не знаю»: mono «ОТВЕТ» + the right answer in the good tone,
 * `explain_ru`, «Слово ›», and the black «Дальше» that waits. Right: `explain_ru` + «Слово ›», and
 * the auto-advance — a 2px good hairline draining over 1 s under «Дальше через 1 с · нажмите,
 * чтобы остаться»; a tap holds it and «Дальше» takes its place (always, under reduced motion).
 * From 768: one 64px row ruled at the bottom, «Дальше ↵» at its right, the hairline on the rule.
 */
export function FeedbackLine({ tone, answer, answerText, explain, misses = 0, onWord, phase, onHold, onNext }: FeedbackLineProps) {
  const running = tone === "right" && (phase === "running" || phase === "held");
  const held = phase === "held";
  const timer = tone === "right" && phase === "running";
  const lang = answerText && !isRussian(answerText) ? "fr" : "ru";

  const drain = (
    <span
      aria-hidden="true"
      className={cx(
        "absolute top-0 left-0 h-[2px] w-full origin-left bg-good animate-[ex-drain_1000ms_linear_230ms_both]",
        held && "[animation-play-state:paused]",
      )}
    />
  );

  return (
    <section
      aria-label="Результат ответа"
      data-exercise-result={tone}
      className="flex h-full flex-col animate-[fade-in_var(--dur-quick)_var(--ease-standard)] md:relative md:h-16 md:flex-row md:items-center md:gap-3 md:border-b md:border-rule"
    >
      {/* For reading the page; the player's live region announces it. */}
      <span className="sr-only">{resultAnnouncement(tone, misses)}</span>
      <div className="flex h-11 min-w-0 shrink-0 items-center gap-2 md:h-auto md:flex-1 md:gap-3">
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
          <span className="min-w-0 flex-1 truncate text-[13px] leading-5 text-muted">
            {tone === "wrong" || tone === "pairs" ? "· " : ""}
            {explain}
          </span>
        )}
        {!explain && <span className="flex-1" />}
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

      {/* Phones: the bottom of the zone. */}
      <div className="flex min-h-0 flex-1 flex-col justify-end md:hidden">
        {timer ? (
          <>
            <div className="relative h-[2px] shrink-0">
              <span aria-hidden="true" className="absolute inset-x-0 top-px h-px bg-rule" />
              {drain}
            </div>
            <button
              type="button"
              onClick={onHold}
              className="mt-1 h-11 shrink-0 p-0 text-left font-mono text-[11px] leading-4 tracking-[.06em] text-muted uppercase"
            >
              Дальше через 1 с · нажмите, чтобы остаться
            </button>
          </>
        ) : (
          <button type="button" data-advance="" onClick={onNext} className={cx(nextButton, "inline-flex h-[52px] w-full text-[15px]")}>
            Дальше
          </button>
        )}
      </div>

      {/* From 768: the end of the row; the hairline runs on the row's bottom rule. */}
      {running && <div className="absolute inset-x-0 -bottom-px hidden h-[2px] max-md:hidden md:block">{drain}</div>}
      {timer && (
        <span className="hidden shrink-0 font-mono text-[11px] leading-4 tracking-[.06em] whitespace-nowrap text-muted uppercase xl:inline">
          через 1 с · нажмите, чтобы остаться
        </span>
      )}
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
