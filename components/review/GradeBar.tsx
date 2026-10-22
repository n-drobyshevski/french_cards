import { cx } from "@/components/ui/cx";
import { Kbd } from "@/components/ui/Kbd";
import type { Rating } from "@/lib/scheduler";
import { GRADE_LABELS } from "./format";

/**
 * Per grade: border/text at rest (phones keep the hairline on «Сложно»; desktop uses the 3:1
 * interactive boundary), the 2px hover border (an inset ring, so nothing moves), and the ink-filled
 * flash for a press or a key (DESKTOP-SPEC §3).
 */
const TONES: Record<Rating, { box: string; sub: string; desk: string }> = {
  1: {
    box: "border-again text-again",
    sub: "",
    desk: "hoverable:ring-again md:active:bg-again data-flash:bg-again",
  },
  2: {
    box: "border-rule text-ink md:border-boundary",
    sub: "text-muted",
    desk: "hoverable:ring-boundary md:active:bg-boundary data-flash:bg-boundary",
  },
  3: {
    box: "border-good text-good",
    sub: "",
    desk: "hoverable:ring-good md:active:bg-good data-flash:bg-good",
  },
  4: { box: "border-rule text-ink", sub: "text-muted", desk: "" },
};

export interface GradeBarProps {
  buttons: 2 | 3;
  /** Sub-labels under each grade («<1 мин», «6 мин», «1 д»); omitted in practice. */
  intervals?: Partial<Record<Rating, string>>;
  onGrade: (rating: Rating) => void;
  /** The grade just chosen with a key: its button flashes ink for 120ms (desktop). */
  flash?: Rating | null;
  disabled?: boolean;
  className?: string;
}

/**
 * Outlined grade buttons: Не знаю / (Сложно) / Знаю, each with its next interval.
 * From 768 up: key caps 1 2 3 at the left of each button, and «Не знаю» set apart by a 16px gap with
 * a hairline (grid 254 · 16 · 188 · 8 · 254 at the 720 card width, scaled with the card).
 */
export function GradeBar({ buttons, intervals, onGrade, flash, disabled, className }: GradeBarProps) {
  const ratings: Rating[] = buttons === 2 ? [1, 3] : [1, 2, 3];
  return (
    <div
      role="group"
      aria-label="Оценка"
      className={cx(
        "grid shrink-0 gap-2 md:items-center md:gap-0",
        buttons === 2
          ? "grid-cols-[repeat(2,minmax(0,1fr))] md:grid-cols-[minmax(0,1fr)_16px_minmax(0,1fr)]"
          : "grid-cols-[minmax(0,1.15fr)_minmax(0,.85fr)_minmax(0,1.15fr)] md:grid-cols-[minmax(0,254fr)_16px_minmax(0,188fr)_8px_minmax(0,254fr)]",
        className,
      )}
    >
      {ratings.map((rating, i) => {
        const sub = intervals?.[rating];
        const key = String(i + 1);
        const button = (
          <button
            key={rating}
            type="button"
            disabled={disabled}
            onClick={() => onGrade(rating)}
            aria-keyshortcuts={buttons === 2 && rating === 3 ? "2 3" : key}
            aria-label={
              sub
                ? `${GRADE_LABELS[rating]}, следующий показ ${sub === "<1 мин" ? "меньше чем через минуту" : `через ${sub}`}`
                : undefined
            }
            data-flash={flash === rating ? "" : undefined}
            className={cx(
              "group relative flex h-14 flex-col items-center justify-center gap-0.5 rounded-btn border bg-surface active:bg-surface-2 disabled:opacity-40",
              "md:ring-inset hoverable:ring-1 md:active:text-on-ink data-flash:text-on-ink",
              TONES[rating].box,
              TONES[rating].desk,
            )}
          >
            <Kbd aria-hidden="true" className="absolute top-[18px] left-3 max-md:hidden">
              {key}
            </Kbd>
            <span className="text-[15px] leading-5 font-medium">{GRADE_LABELS[rating]}</span>
            {sub && (
              <span
                className={cx(
                  "font-mono text-[11px] leading-4 tracking-[.04em] md:group-active:text-on-ink group-data-flash:text-on-ink",
                  TONES[rating].sub,
                )}
              >
                {sub}
              </span>
            )}
          </button>
        );
        // «Не знаю» stands apart: a hairline in the 16px gap after it; an 8px gap before «Знаю».
        if (rating === 1) {
          return [
            button,
            <span key="rule" aria-hidden="true" className="hidden h-6 w-px justify-self-center bg-rule md:block" />,
          ];
        }
        if (rating === 2) return [button, <span key="gap" aria-hidden="true" className="hidden md:block" />];
        return button;
      })}
    </div>
  );
}
