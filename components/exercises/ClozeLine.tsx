import { clozeParts } from "@/lib/core/exercises";

export interface ClozeLineProps {
  /** The French sentence with its one [[answer]] span. */
  sentence: string;
  /** After the answer the gap shows the right word (good). */
  answered: boolean;
}

/**
 * A cloze sentence (Exercise-S-Cloze) in Newsreader with a dashed gap where the span was; once the
 * card is answered the right word writes into the gap in the good tone. A sentence without one
 * clean span (it never passes validateSet) shows as it is.
 */
export function ClozeLine({ sentence, answered }: ClozeLineProps) {
  const parts = clozeParts(sentence);
  const text = "m-0 font-serif text-[28px] leading-10 font-medium tracking-[-0.005em] md:text-[36px] md:leading-[48px] md:tracking-[-0.01em]";
  if (!parts) {
    return (
      <p lang="fr" className={text}>
        {sentence.replace(/\[\[|\]\]/g, "")}
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
