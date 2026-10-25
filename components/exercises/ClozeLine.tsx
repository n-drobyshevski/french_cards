import type { ReactNode } from "react";
import { clozeParts } from "@/lib/core/exercises";

export interface ClozeLineProps {
  /** The French sentence with its one [[answer]] span. */
  sentence: string;
  /** After the answer the gap shows the right word (good). */
  answered: boolean;
  /**
   * Phones (X-Player-B): the gap is the dashed blank the word drops into, and a wrong pick is
   * written in it first, struck through in the again tone, before the right word.
   */
  phone?: boolean;
  /** Phones: the option picked when it was wrong. */
  wrong?: string | null;
  /** Phones: the right word opens the word sheet (a live library word only). */
  onWord?: (() => void) | null;
}

/**
 * A cloze sentence (Exercise-S-Cloze) in Newsreader with a dashed gap where the span was; once the
 * card is answered the right word writes into the gap in the good tone. A sentence without one
 * clean span (it never passes validateSet) shows as it is.
 */
export function ClozeLine({
  sentence,
  answered,
  phone = false,
  wrong = null,
  onWord = null,
}: ClozeLineProps) {
  const parts = clozeParts(sentence);
  const text = phone
    ? "m-0 font-serif text-[32px] leading-[42px] font-medium tracking-[-0.01em]"
    : "m-0 font-serif text-[28px] leading-10 font-medium tracking-[-0.005em] md:text-[36px] md:leading-[48px] md:tracking-[-0.01em]";
  if (!parts) {
    return (
      <p lang="fr" className={text}>
        {sentence.replace(/\[\[|\]\]/g, "")}
      </p>
    );
  }
  if (phone) {
    let gap: ReactNode;
    if (!answered) {
      gap = (
        <span
          className="mx-1 inline-block h-[1em] w-[3.3em] border-b-[1.5px] border-dashed border-boundary align-baseline"
          role="img"
          aria-label="пропуск"
        />
      );
    } else {
      const word = (
        <span className="inline-block border-b-[1.5px] border-good leading-8 text-good">
          {parts.answer}
        </span>
      );
      gap = (
        <span className="animate-[fade-in_var(--dur-quick)_var(--ease-enter)]">
          {wrong && (
            <>
              <span className="sr-only">ваш ответ: </span>
              <s className="mr-2 text-[22px] font-normal text-again decoration-[1.5px]">
                {wrong}
              </s>
              <span className="sr-only">, верный: </span>
            </>
          )}
          {onWord ? (
            <button
              type="button"
              onClick={onWord}
              aria-label={`Открыть карточку слова «${parts.answer}»`}
              className="press-sm -my-1 py-1 text-left"
            >
              {word}
            </button>
          ) : (
            word
          )}
        </span>
      );
    }
    return (
      <p lang="fr" className={text}>
        {parts.before}
        {gap}
        {parts.after}
      </p>
    );
  }
  return (
    <p lang="fr" className={text}>
      {parts.before}
      {answered ? (
        <span className="text-good underline decoration-good decoration-1 underline-offset-[6px] animate-[fade-in_var(--dur-quick)_var(--ease-enter)]">
          {parts.answer}
        </span>
      ) : (
        <span
          className="relative mx-1 inline-block h-[1em] w-[3.3em] border-b-2 border-dashed border-muted align-baseline"
          role="img"
          aria-label="пропуск"
        />
      )}
      {parts.after}
    </p>
  );
}
