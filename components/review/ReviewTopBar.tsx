"use client";

import { useState, type ReactNode, type Ref } from "react";
import { useShell } from "@/components/shell/ShellContext";
import { IconButton } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icons";
import { WRITE_IN } from "./ReviewCard";

export interface ReviewProgress {
  /** «23 к повторению · 4 новых» / «Практика · не влияет на расписание» (phones: screen readers only). */
  left: ReactNode;
  /** «07 / 30» */
  right: string;
  ratio: number;
  /** Still loading: the row keeps its height, the counts are blank and only the track is drawn (MOTION-SPEC R1). */
  pending?: boolean;
  /** The latest grade (R12): the progress step it causes echoes its tone. */
  echo?: GradeEcho | null;
  /** Where the queue's new cards sit (0..1): 1×4 muted ticks under the line (D3 B, aria-hidden). */
  ticks?: readonly number[];
  /** «План дня»: `left` is a button that opens «План на сегодня» (D2 B); on phones it covers the whole row. */
  summary?: SummaryAction | null;
  /** The summary button (the desktop popover hangs under it). */
  summaryRef?: Ref<HTMLButtonElement>;
}

export interface SummaryAction {
  /** The button's name: «План на сегодня: 27 к повторению, 4 новых». */
  label: string;
  open: boolean;
  onOpen: () => void;
}

/** A grade for the progress echo; `seq` tells two grades of the same tone apart. */
export interface GradeEcho {
  seq: number;
  tone: "good" | "again" | "ink";
}

const ECHO_TONE: Record<GradeEcho["tone"], string> = {
  good: "starting:bg-good",
  again: "starting:bg-again",
  ink: "starting:bg-ink",
};

interface EchoSegment {
  from: number;
  to: number;
  tone: GradeEcho["tone"];
  seq: number;
}

/** The progress row's left text (summary): truncated on phones, 13px sentence case in the running head. */
const LEFT = "min-w-0 truncate md:order-2 md:font-sans md:text-[13px] md:leading-5 md:tracking-normal md:normal-case md:tabular-nums";

/** The progress row while the queue loads; the counts write in when it arrives. */
export const PENDING_PROGRESS: ReviewProgress = { left: null, right: "", ratio: 0, pending: true };

export interface ReviewTopBarProps {
  canUndo: boolean;
  onUndo: () => void;
  /** Single-letter shortcuts are on (Z is printed in the undo tooltip). */
  letters?: boolean;
  /** Counts and the progress line (`PENDING_PROGRESS` while loading); omitted on «Готово на сегодня» and empty states. */
  progress?: ReviewProgress | null;
  /** Rendered between the bar and the progress row (the screen's sr-only h1). */
  heading?: ReactNode;
  /** No running head from 768 up (empty library). */
  hideOnDesktop?: boolean;
  /** Chips on the left of the row (direction + theme, or the practice exit). */
  children?: ReactNode;
  /**
   * Under the progress line: the «План дня» reason subline (phones: for screen readers only, the
   * plan sheet says it; from 768 under the running-head rule, left-aligned with the card column).
   */
  subline?: ReactNode;
}

/**
 * Phones: one row (the split chip left, undo right; Settings is reached from the Library header),
 * then the progress row — the 1px line and «07 / 30», the whole row the «План на сегодня» button.
 *
 * From 768 up the same elements form the running head (DESKTOP-SPEC §5 #1): 56px across the
 * content, padding 0 32 — chips, the counts in 13px, then «07 / 30», undo and the `?` button at the
 * right. Its bottom rule doubles as the progress line (a 2px ink fill over the hairline). The phone
 * rows turn into `display: contents`, so there is a single copy of every control and count.
 */
export function ReviewTopBar({ canUndo, onUndo, letters = true, progress, heading, hideOnDesktop, children, subline }: ReviewTopBarProps) {
  const { openShortcuts } = useShell();
  return (
    <div
      data-review-head=""
      className={cx(
        "contents",
        hideOnDesktop
          ? "md:hidden"
          : "md:relative md:flex md:h-[57px] md:shrink-0 md:items-center md:gap-4 md:border-b md:border-rule md:px-8",
      )}
    >
      <header className="mt-4 flex h-11 shrink-0 items-center gap-2 md:contents">
        <div className="flex min-w-0 flex-1 items-center gap-2 md:order-1 md:flex-none">{children}</div>
        <div className={cx("-mr-3 flex shrink-0 items-center md:order-4 md:mr-0 md:gap-2", !progress && "md:ml-auto")}>
          <IconButton
            icon="undo"
            label="Отменить последний ответ"
            strokeWidth={1.5}
            disabled={!canUndo}
            onClick={onUndo}
            aria-keyshortcuts={letters ? "Z" : undefined}
            title={canUndo ? (letters ? "Отменить последний ответ (Z)" : "Отменить последний ответ") : "Нечего отменять"}
            className="md:size-8 md:rounded-[4px] md:disabled:text-boundary md:disabled:opacity-100 hoverable:enabled:bg-hover"
          />
          <button
            type="button"
            aria-label="Все клавиши"
            aria-haspopup="dialog"
            aria-keyshortcuts={letters ? "Shift+Slash" : undefined}
            title={letters ? "Все клавиши (?)" : "Все клавиши"}
            onClick={openShortcuts}
            className="hidden size-8 shrink-0 items-center justify-center rounded-[4px] border border-boundary bg-surface font-mono text-[13px] leading-none text-ink md:inline-flex hoverable:bg-hover-surface"
          >
            ?
          </button>
        </div>
      </header>
      {heading}
      {progress && <ProgressLine {...progress} />}
      {/* Phones keep the held-day subline for screen readers only; «План на сегодня» explains it. */}
      {subline && <div className="max-md:sr-only md:contents">{subline}</div>}
    </div>
  );
}

/**
 * Phones: the 1px ink progress line with «07 / 30» after it, one 44px row (L-Review-Q-B).
 * From 768 up «23 к повторению · 4 новых» and the counter join the running head and the line
 * becomes its bottom rule's fill.
 * The fill steps as `scaleX` from the left and the phone's tick with `translateX` (never width or
 * left), --dur-move --ease-standard; the counter is a plain tabular swap (MOTION-SPEC R8, §5.5).
 */
export function ProgressLine({ left, right, ratio, pending, echo, ticks, summary, summaryRef }: ReviewProgress) {
  const p = Math.max(0, Math.min(1, ratio));

  // R12, the last-grade echo: the step a grade causes is drawn in the grade's tone (good / again; ink
  // for «Сложно») and fades to ink over --dur-spotlight. A grade echoes once, on the first step after
  // it (a session's step lands with the read, after the grade); a step back (undo) drops the echo.
  const [seen, setSeen] = useState({ ratio: p, seq: echo?.seq ?? 0 });
  const [segment, setSegment] = useState<EchoSegment | null>(null);
  if (p !== seen.ratio) {
    const fresh = !pending && echo != null && echo.seq !== seen.seq && p > seen.ratio;
    setSeen({ ratio: p, seq: fresh ? echo.seq : seen.seq });
    if (fresh) setSegment({ from: seen.ratio, to: p, tone: echo.tone, seq: echo.seq });
    else if (segment && p < segment.to) setSegment(null);
  }

  // While pending the spans stay (empty) so nothing shifts; the counts fade in when they arrive.
  // Phones: one 44px row — the line, then «07 / 30»; the summary button lies over the whole row and
  // carries the counts in its name (spec change §1). The left text stays for screen readers only.
  return (
    <div className="relative mt-1 flex h-11 shrink-0 items-center gap-4 font-mono text-[11px] leading-4 tracking-[.06em] uppercase md:contents">
      {summary ? (
        // From 768 a 30px text button: the counts underlined in dotted ink, then the 14px chevron
        // (up while open).
        <button
          ref={summaryRef}
          type="button"
          data-plan-summary=""
          aria-haspopup="dialog"
          aria-expanded={summary.open}
          aria-label={summary.label}
          onClick={summary.onOpen}
          className={cx(
            LEFT,
            "flex cursor-pointer items-center gap-1 border-0 bg-transparent px-0 text-left text-ink uppercase max-md:absolute max-md:inset-0 max-md:z-10 max-md:rounded-[4px]",
            "md:-ml-1.5 md:inline-flex md:h-[30px] md:items-center md:gap-1 md:overflow-visible md:rounded-[4px] md:px-1.5 md:py-0 hoverable:bg-hover aria-expanded:md:bg-hover",
            !pending && WRITE_IN,
          )}
        >
          <span className="min-w-0 truncate max-md:hidden md:underline md:decoration-ink md:decoration-dotted md:decoration-1 md:underline-offset-4">
            {left}
          </span>
          <Icon name={summary.open ? "chevron-up" : "chevron"} size={14} className="shrink-0 text-muted max-md:hidden" />
        </button>
      ) : (
        <span className={cx(LEFT, "text-muted max-md:sr-only", !pending && WRITE_IN)}>{left}</span>
      )}
      <div aria-hidden="true" className="relative h-[9px] min-w-0 flex-1 md:absolute md:inset-x-0 md:top-14 md:h-0.5">
        <div className="absolute inset-x-0 top-[2px] h-px bg-rule md:hidden" />
        {!pending && (
          <>
            <div
              data-progress-fill=""
              className="absolute inset-x-0 top-[2px] h-px origin-left bg-ink transition-transform duration-(--dur-move) ease-standard md:top-0 md:h-0.5"
              style={{ transform: `scaleX(${p})` }}
            />
            {/* The echo grows with the fill (same span, duration and curve), then inks over. */}
            {segment && (
              <div
                key={segment.seq}
                data-progress-echo={segment.tone}
                className={cx(
                  "absolute top-[2px] h-px origin-left scale-x-100 bg-ink starting:scale-x-0 md:top-0 md:h-0.5",
                  "[transition:scale_var(--dur-move)_var(--ease-standard),background-color_var(--dur-spotlight)_linear]",
                  ECHO_TONE[segment.tone],
                )}
                style={{ left: `${(segment.from * 100).toFixed(3)}%`, width: `${((segment.to - segment.from) * 100).toFixed(3)}%` }}
              />
            )}
            {/* The tick travels over the width less its own 1px, so at 100 % it ends on the line's end. */}
            <div
              aria-hidden="true"
              className="absolute inset-y-0 right-px left-0 transition-transform duration-(--dur-move) ease-standard md:hidden"
              style={{ transform: `translateX(${(p * 100).toFixed(2)}%)` }}
            >
              <div className="h-[5px] w-px bg-ink" />
            </div>
            {/* D3 B: where the new cards sit, under the line (they hang below its 5px box; nothing moves). */}
            {ticks && ticks.length > 0 && (
              <div data-new-ticks="" className="absolute top-[5px] right-px left-0 h-1 md:top-0.5 md:right-0">
                {ticks.map((t, i) => (
                  <div key={i} className="absolute top-0 h-1 w-px bg-muted" style={{ left: `${(Math.max(0, Math.min(1, t)) * 100).toFixed(2)}%` }} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <span
        className={cx(
          "shrink-0 text-[12px] font-medium text-ink tabular-nums md:order-3 md:ml-auto md:text-[13px] md:leading-5 md:tracking-normal",
          !pending && WRITE_IN,
        )}
      >
        {right}
      </span>
    </div>
  );
}
