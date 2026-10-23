"use client";

import { useEffect, useRef } from "react";
import { cardShell, CardHeader } from "@/components/review/card-parts";
import { posAbbr } from "@/components/review/format";
import { buttonClasses } from "@/components/ui/button-classes";
import { cx } from "@/components/ui/cx";
import { SlangMeter } from "@/components/ui/SlangMeter";
import type { ExerciseNewWord } from "@/lib/types";

/** «lalanguefrancaise.com» from the page Claude found the word on; null when it is not a URL. */
export function sourceDomain(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

export interface NewWordCardProps {
  word: ExerciseNewWord;
  setTitle: string;
  onNext: () => void;
  /** Focus «Понятно» when the card appears (desktop: ↵ presses it). */
  autoFocus?: boolean;
}

/**
 * The intro card before a web word's first question (Exercise-S-NewWord): «НОВОЕ СЛОВО · ИЗ ВЕБА»
 * with the meter, the headword and its POS, the translation, the note, the example, «Слова ещё нет
 * в библиотеке…», the source domain in the footer; then «Понятно» (↵ from 768).
 */
export function NewWordCard({ word, setTitle, onNext, autoFocus = false }: NewWordCardProps) {
  const pos = posAbbr(word);
  const domain = sourceDomain(word.source_url);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (autoFocus) button.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  return (
    <>
      <article aria-label="Новое слово" data-exercise-focus="" tabIndex={-1} className={cx(cardShell, "relative min-h-[300px] outline-none flex-1 md:min-h-[360px] md:flex-none")}>
        <CardHeader
          label={
            <span className="inline-flex items-center gap-2">
              <span className="font-medium text-ink">НОВОЕ СЛОВО</span>
              <span>· ИЗ ВЕБА</span>
            </span>
          }
        >
          <SlangMeter level={word.slang_level} verlan={word.verlan} />
        </CardHeader>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pt-7 md:px-10 md:pt-8">
          <h2 lang="fr" className="m-0 font-serif text-[40px] leading-[1.1] font-medium tracking-[-0.015em] break-words md:text-[48px]">
            {word.fr}
          </h2>
          {pos && (
            <span lang="fr" className="mt-2 font-serif text-[15px] leading-5 text-muted italic">
              {pos}
            </span>
          )}
          <p className="m-0 mt-6 text-[22px] leading-7 font-medium">{word.ru}</p>
          {word.note && <p className="m-0 mt-2 max-w-[40ch] text-[14px] leading-5 text-muted">{word.note}</p>}
          {word.example_fr && (
            <div className="mt-6 flex flex-col gap-1 border-t border-rule pt-4">
              <span lang="fr" className="font-serif text-[17px] leading-6 italic">
                {word.example_fr}
              </span>
              {word.example_ru && <span className="text-[13px] leading-5 text-muted">{word.example_ru}</span>}
            </div>
          )}
          <span className="min-h-4 flex-1" />
          <p className="m-0 mb-4 text-[13px] leading-5 text-muted">Слова ещё нет в библиотеке. Добавить его можно на экране итогов.</p>
        </div>
        {domain && (
          <div className="mx-5 flex h-11 shrink-0 items-center border-t border-rule font-mono text-[11px] tracking-[.06em] text-muted uppercase md:mx-10">
            <span className="min-w-0 truncate">
              источник: <span className="text-ink">{domain}</span>
            </span>
          </div>
        )}
      </article>
      <div className="mt-4 flex shrink-0 flex-col-reverse gap-2 pb-4 md:flex-row-reverse md:items-center md:justify-between md:pb-0">
        <button
          ref={button}
          type="button"
          data-advance=""
          aria-keyshortcuts="Enter"
          onClick={onNext}
          className={buttonClasses({ variant: "primary", size: "lg", block: true, className: "font-semibold md:w-auto md:min-w-[152px]" })}
        >
          Понятно
        </button>
        <span className="meta text-center">
          набор: <span className="text-ink">{setTitle}</span> · вопрос — следующим
        </span>
      </div>
    </>
  );
}
