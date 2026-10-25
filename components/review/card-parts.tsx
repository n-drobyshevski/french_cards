// The index card's shared parts: the review card (ReviewCard) and the exercise player's question
// card (components/exercises/QuestionCard) draw the same shell and the same 46px header with the
// red rule under it (SPEC.md «Упражнения»: «The question is the review index card»).
import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";

/** Index-card shell: white, radius 6, 1px rule, the red header rule 44px from the top. */
export const cardShell = "flex flex-col overflow-hidden rounded-card border border-rule bg-surface text-ink";

/**
 * The card's header: mono label left, `children` (the slang meter, a tag) right, the 2px red rule
 * under it. `practice` (phones, spec change §4): the rule turns dashed ink — not on the record.
 */
export function CardHeader({ label, children, practice = false }: { label: ReactNode; children?: ReactNode; practice?: boolean }) {
  return (
    <span
      data-card-rule={practice ? "practice" : undefined}
      className={cx(
        "flex h-[46px] shrink-0 items-center justify-between border-b-2 border-red px-5 md:h-12 md:px-10",
        practice && "max-md:border-dashed max-md:border-ink",
      )}
    >
      <span className="font-mono text-[11px] tracking-[.06em] text-muted md:tracking-normal md:tabular-nums">{label}</span>
      {children}
    </span>
  );
}
