import { cx } from "@/components/ui/cx";
import type { Rating } from "@/lib/scheduler";
import { GRADE_LABELS } from "./format";

const TONES: Record<Rating, { box: string; sub: string }> = {
  1: { box: "border-again text-again", sub: "" },
  2: { box: "border-rule text-ink", sub: "text-muted" },
  3: { box: "border-good text-good", sub: "" },
  4: { box: "border-rule text-ink", sub: "text-muted" },
};

export interface GradeBarProps {
  buttons: 2 | 3;
  /** Sub-labels under each grade («<1 мин», «6 мин», «1 д»); omitted in practice. */
  intervals?: Partial<Record<Rating, string>>;
  onGrade: (rating: Rating) => void;
  disabled?: boolean;
  className?: string;
}

/** Outlined grade buttons: Не знаю / (Сложно) / Знаю, each with its next interval. */
export function GradeBar({ buttons, intervals, onGrade, disabled, className }: GradeBarProps) {
  const ratings: Rating[] = buttons === 2 ? [1, 3] : [1, 2, 3];
  return (
    <div
      role="group"
      aria-label="Оценка"
      className={cx("grid shrink-0 gap-2", className)}
      style={{
        gridTemplateColumns: buttons === 2 ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1.15fr) minmax(0, .85fr) minmax(0, 1.15fr)",
      }}
    >
      {ratings.map((rating, i) => {
        const sub = intervals?.[rating];
        return (
          <button
            key={rating}
            type="button"
            disabled={disabled}
            onClick={() => onGrade(rating)}
            aria-keyshortcuts={String(i + 1)}
            aria-label={
              sub
                ? `${GRADE_LABELS[rating]}, следующий показ ${sub === "<1 мин" ? "меньше чем через минуту" : `через ${sub}`}`
                : undefined
            }
            className={cx(
              "flex h-14 flex-col items-center justify-center gap-0.5 rounded-btn border bg-surface active:bg-surface-2 disabled:opacity-40",
              TONES[rating].box,
            )}
          >
            <span className="text-[15px] leading-5 font-medium">{GRADE_LABELS[rating]}</span>
            {sub && <span className={cx("font-mono text-[11px] leading-4 tracking-[.04em]", TONES[rating].sub)}>{sub}</span>}
          </button>
        );
      })}
    </div>
  );
}
