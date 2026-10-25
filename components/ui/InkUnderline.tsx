import type { CSSProperties, ReactNode } from "react";
import { cx } from "./cx";

export interface InkUnderlineProps {
  /** The word inside the sentence: «Allez, on <InkUnderline>se casse</InkUnderline> d’ici.» */
  children: ReactNode;
  /**
   * False: no line yet (the side is still hidden). It draws once when this turns true, or on mount
   * when it starts true. Default true.
   */
  active?: boolean;
  /** Draw the line (default) or show it at once (a search match, a list that was already seen). */
  animate?: boolean;
  /** Wait before drawing, in ms (to follow another beat, e.g. the reveal). */
  delay?: number;
  lang?: string;
  className?: string;
}

/**
 * The ink underline (spec change §3, MOTION-SPEC «ink underline drawn once»): a 1.5px brand-red line
 * under «the word» in a sentence, drawn left → right over 200ms, linear, once. Reduced motion: it is
 * there at once. Brand red only: it means «this is the word / the match», never a grade.
 */
export function InkUnderline({ children, active = true, animate = true, delay = 0, lang, className }: InkUnderlineProps) {
  const style = delay ? ({ "--ink-delay": `${delay}ms` } as CSSProperties) : undefined;
  return (
    <span lang={lang} className={cx("relative inline-block", className)}>
      {children}
      <span
        aria-hidden="true"
        data-ink-underline=""
        style={style}
        className={cx(
          "pointer-events-none absolute inset-x-0 bottom-px h-[1.5px] origin-left bg-red",
          !active ? "scale-x-0" : animate && "ink-draw",
        )}
      />
    </span>
  );
}
