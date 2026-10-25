"use client";

import { useId, useState } from "react";
import { Collapse } from "@/components/ui/Collapse";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icons";
import { SLANG_NAMES_RU, SlangMeter } from "@/components/ui/SlangMeter";
import { useProgressDay, type DayPoint, type Progress, type ProgressMistake } from "@/lib/progress";
import {
  WEEKDAY_HEADS,
  calendarDayAria,
  calendarDayKind,
  dayHeading,
  dayLabel,
  dayStatParts,
  monthAria,
  monthGrid,
  monthSummary,
  monthSummaryLine,
  monthTitle,
  squareSize,
  type CalendarDayKind,
} from "./format";

export interface MonthCalendarProps {
  progress: Progress;
  /** A mistake row opens the word's card. */
  onOpenWord: (wordId: string) => void;
}

/**
 * This month's calendar (Progress-Screen-A, Progress-Day): a square per active day sized by its
 * reviews, a dashed frame for a day without a session, today outlined in red. A tap selects the day
 * (1.5px ink outline) and opens its numbers in place under the grid (Collapse), with «Свернуть».
 * The month's summary line follows.
 */
export function MonthCalendar({ progress, onOpenWord }: MonthCalendarProps) {
  const today = progress.today.day;
  const month = today.slice(0, 7);
  const headingId = useId();
  const [selected, setSelected] = useState<string | null>(null);
  // Keep the last day on screen while the detail folds away.
  const [shown, setShown] = useState<string | null>(null);
  if (selected !== null && selected !== shown) setShown(selected);

  const active = new Set(progress.activeDayKeys);
  const byDay = new Map<string, DayPoint>(progress.series.map((p) => [p.day, p]));
  const cells = monthGrid(month);
  const maxReviews = Math.max(0, ...cells.map((k) => (k && active.has(k) ? (byDay.get(k)?.reviews ?? 0) : 0)));
  const summary = monthSummary(month, today, progress.since, progress.activeDayKeys, progress.series);
  const summaryLine = monthSummaryLine(summary);

  const collapse = () => {
    const day = selected;
    setSelected(null);
    // The «Свернуть» button goes inert: focus returns to the day it opened from.
    if (day) document.querySelector<HTMLElement>(`[data-progress-day="${day}"]`)?.focus();
  };

  return (
    <section aria-labelledby={headingId} className="mt-3.5 shrink-0">
      <div className="flex h-6 items-baseline justify-between">
        <h2 id={headingId} className="m-0 font-serif text-[19px] leading-6 font-medium">
          {monthTitle(month)}
        </h2>
      </div>
      <div aria-hidden="true" className="-mx-0.5 mt-1 grid grid-cols-7">
        {WEEKDAY_HEADS.map((d) => (
          <span key={d} className="meta text-center leading-4">
            {d}
          </span>
        ))}
      </div>
      <div role="group" aria-label={monthAria(month, summary, progress.weekCount)} className="-mx-0.5 grid grid-cols-7">
        {cells.map((key, i) => {
          if (!key) return <div key={`pad${i}`} aria-hidden="true" className="h-11" />;
          const kind = calendarDayKind(key, today, progress.since, active);
          const point = byDay.get(key);
          const isActive = active.has(key);
          const reviews = point?.reviews ?? 0;
          return (
            <DayCell
              key={key}
              day={key}
              kind={kind}
              active={isActive}
              size={squareSize(reviews, maxReviews)}
              selected={selected === key}
              label={calendarDayAria(key, kind, reviews, point?.exercises ?? 0, isActive)}
              onSelect={isActive || kind === "today" ? () => (selected === key ? collapse() : setSelected(key)) : undefined}
            />
          );
        })}
      </div>
      <Collapse open={selected !== null} onClosed={() => setShown(null)}>
        {shown && <DayDetail day={shown} onCollapse={collapse} onOpenWord={onOpenWord} />}
      </Collapse>
      {summaryLine && <p className="abbr m-0 mt-2 text-[15px] leading-5 tabular-nums">{summaryLine}</p>}
    </section>
  );
}

interface DayCellProps {
  day: string;
  kind: CalendarDayKind;
  active: boolean;
  size: 12 | 16 | 20;
  selected: boolean;
  label: string;
  /** Days with something to open (active days and today) are buttons. */
  onSelect?: () => void;
}

const SQUARE = { 12: "size-3", 16: "size-4", 20: "size-5" } as const;

function DayCell({ day, kind, active, size, selected, label, onSelect }: DayCellProps) {
  const quiet = kind === "missed" || kind === "future" || kind === "before" || (kind === "today" && !active);
  const body = (
    <>
      <span
        className={cx(
          "font-mono text-[11px] leading-[14px] tabular-nums",
          kind === "today" ? "font-medium text-ink" : quiet ? "text-muted" : "text-ink",
        )}
      >
        {Number(day.slice(8))}
      </span>
      <span className="flex size-[22px] items-center justify-center">
        {active ? (
          <span className={cx(SQUARE[size], "rounded-[1px] bg-ink")} />
        ) : kind === "missed" ? (
          <span className="size-3.5 rounded-[1px] border border-dashed border-rule-dashed" />
        ) : null}
      </span>
    </>
  );
  const frame = cx(
    "mx-0.5 flex h-11 flex-col items-center justify-center gap-0.5 rounded-chip border text-ink",
    selected ? "border-[1.5px] border-ink" : kind === "today" ? "border-[1.5px] border-red" : "border-transparent",
  );
  if (!onSelect) {
    return (
      <div role="img" aria-label={label} className={frame}>
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      data-progress-day={day}
      onClick={onSelect}
      className={cx(frame, "press-sm min-w-0 bg-transparent p-0 active:bg-surface-2")}
    >
      {body}
    </button>
  );
}

/** The opened day (Progress-Day): heading + «Свернуть», one mono line of its numbers, «Ошибки». */
function DayDetail({ day, onCollapse, onOpenWord }: { day: string; onCollapse: () => void; onOpenWord: (id: string) => void }) {
  const detail = useProgressDay(day);
  const headingId = useId();
  const missesId = useId();
  const stats = detail ? dayStatParts(detail.point) : [];
  return (
    <section aria-labelledby={headingId} className="border-t border-ink">
      <div className="flex h-11 items-center">
        <h3 id={headingId} className="m-0 min-w-0 flex-1 truncate font-serif text-[19px] leading-6 font-medium">
          {dayHeading(day)}
          {detail?.ordinal != null && <span className="sr-only">, день № {detail.ordinal}</span>}
        </h3>
        <button
          type="button"
          aria-label={`Свернуть итоги ${dayLabel(day)}`}
          onClick={onCollapse}
          className="press-sm -mr-1 inline-flex h-11 items-center gap-1 rounded-chip bg-transparent px-1 text-[14px] font-medium text-ink active:bg-surface-2"
        >
          Свернуть
          <Icon name="chevron-up" size={16} />
        </button>
      </div>
      {stats.length > 0 && (
        <p className="meta m-0 leading-4 tabular-nums">
          {stats.map((s, i) => (
            <span key={s.label}>
              {i > 0 && " · "}
              {s.label} <span className="font-medium text-ink">{s.value}</span>
            </span>
          ))}
        </p>
      )}
      {detail && detail.mistakes.length > 0 && (
        <div role="group" aria-labelledby={missesId} className="mt-3.5">
          <p id={missesId} className="m-0 text-[15px] leading-7 text-muted">
            Ошибки
          </p>
          <ul className="m-0 list-none border-t border-rule p-0">
            {detail.mistakes.map((m) => (
              <li key={m.word_id}>
                <MistakeRow word={m} onOpen={() => onOpenWord(m.word_id)} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function mistakeAria(m: ProgressMistake): string {
  const slang = [m.slang_level > 0 && SLANG_NAMES_RU[m.slang_level], m.verlan && "верлан"].filter(Boolean).join(", ");
  return `${m.fr} — ${m.ru}${slang ? `, ${slang}` : ""}. Открыть карточку`;
}

function MistakeRow({ word, onOpen }: { word: ProgressMistake; onOpen: () => void }) {
  return (
    <button
      type="button"
      aria-label={mistakeAria(word)}
      aria-haspopup="dialog"
      onClick={onOpen}
      className="press-tint flex h-12 w-full items-center gap-2.5 border-b border-rule bg-transparent p-0 text-left text-ink"
    >
      <span className="flex min-w-0 flex-1 items-baseline gap-2 overflow-hidden whitespace-nowrap">
        <span lang="fr" className="shrink-0 font-serif text-[19px] leading-6 font-medium">
          {word.fr}
        </span>
        <span className="min-w-0 truncate text-[15px] leading-5 text-muted">— {word.ru}</span>
      </span>
      {(word.slang_level > 0 || word.verlan) && (
        <span aria-hidden="true" className="inline-flex w-28 flex-none items-center">
          <SlangMeter level={word.slang_level} verlan={word.verlan} hideNeutral />
        </span>
      )}
    </button>
  );
}
