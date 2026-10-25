"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useEffect, useEffectEvent, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { blocksGlobalKeys, OPEN_LAYER_SELECTOR } from "@/components/shell/keys";
import { useShortcutsEnabled } from "@/components/shell/ShellContext";
import { BlankCard } from "@/components/ui/BlankCard";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icons";
import { db } from "@/lib/db";
import { useProgress, useProgressDay, type DayPoint, type Progress, type ProgressMistake, type ProgressRange } from "@/lib/progress";
import { useFinePointer, useMediaQuery } from "@/lib/use-media";
import {
  DESK_SQUARES,
  calendarMonths,
  dayCardNote,
  defaultDay,
  deskMonthAria,
  deskMonthTitle,
  deskSquareSize,
  deskSubline,
  monthTally,
  numericDate,
  progressAxis,
  rangeLabel,
  shortDay,
  stepDay,
  steppableDays,
  tallyLine,
  trendAria,
} from "./desk-format";
import {
  RANGE_OPTIONS,
  WEEKDAY_HEADS,
  calendarDayAria,
  calendarDayKind,
  countOf,
  dayHeading,
  dayLabel,
  dayStatParts,
  EXERCISE_FORMS,
  formatCount,
  mean,
  monthGrid,
  monthName,
  percent,
  streakAria,
  streakLine,
  weekDelta,
  type CalendarDayKind,
  type SparkPoint,
} from "./format";
import { useProgressRange } from "./range";
import { Sparkline } from "./Sparkline";

// Desktop «Прогресс» (≥ 768; mockups/D-Progress-A «Ведомость», DESKTOP-SPEC §2 panes): the main pane
// (title with the one mono streak line, D2 A; the Plex subline; the period filter; the ledger at
// full width; two calendar months) and, from 1100, the 400px day pane at the right (360 at 1200–1439,
// as the library's detail pane; below 1100 the day follows the calendar in the one column). Phones
// keep ProgressScreen's own layout.

const MEANS = "Знаю — слово держится в памяти 21 день и дольше. Помню ≈ — сколько слов вы вспомнили бы прямо сейчас.";
const SPARK_H = 32;
const DOCKED_QUERY = "(min-width: 1100px)";

const spoken = (s: string) => s.replace(/^\+/, "плюс ").replace(/^−/, "минус ");
const span = (from: string, to: string) => (from === to ? "сегодня" : `${dayLabel(from)} – ${dayLabel(to)}`);
const join = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join("; ");

export function ProgressDesk() {
  const [range, setRange] = useProgressRange();
  const progress = useProgress(range);
  const docked = useMediaQuery(DOCKED_QUERY);
  const [picked, setPicked] = useState<string | null>(null);
  const titleId = useId();

  const ready = progress && !progress.empty ? progress : null;
  const today = ready?.today.day ?? null;
  // The pane opens on today once studied, else on the latest study day; a pick stays until it is in the future.
  const day = ready && today ? (picked && picked <= today ? picked : defaultDay(ready.activeDayKeys, today)) : null;
  const days = ready && today ? steppableDays(ready.activeDayKeys, today) : [];
  const prev = day ? stepDay(days, day, -1) : null;
  const next = day ? stepDay(days, day, 1) : null;

  const select = (key: string | null, focusDay = false) => {
    if (!key) return;
    setPicked(key);
    // Stepping from a calendar day keeps the focus on the calendar, on the new day.
    if (focusDay) requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-progress-day="${key}"]`)?.focus());
  };

  // ← → другой день (anywhere on the screen, except while typing or inside a menu or dialog).
  const step = useEffectEvent((dir: -1 | 1, focusDay: boolean) => select(dir < 0 ? prev : next, focusDay));
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (blocksGlobalKeys(event.target) || document.querySelector(OPEN_LAYER_SELECTOR)) return;
      event.preventDefault();
      const onDay = !!(event.target as HTMLElement | null)?.closest?.("[data-progress-day]");
      step(event.key === "ArrowLeft" ? -1 : 1, onDay);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const dayPane = ready && day && (
    <DayPane
      progress={ready}
      day={day}
      prev={prev}
      next={next}
      onStep={(dir) => select(dir < 0 ? prev : next)}
      docked={docked}
    />
  );

  return (
    <main
      data-wide=""
      aria-labelledby={titleId}
      aria-busy={!progress || undefined}
      style={{ height: "calc(100dvh - var(--safe-top))" }}
      className="flex min-h-0 w-full flex-none overflow-hidden"
    >
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain px-6 pt-5 pb-10">
        <div className="flex h-9 shrink-0 items-baseline justify-between gap-4">
          <h1 id={titleId} className="m-0 font-serif text-[28px] leading-9 font-medium tracking-[-0.015em]">
            Прогресс
          </h1>
          {ready && <StreakLine progress={ready} />}
        </div>
        {progress?.empty && (
          <section aria-label="Прогресс: учебных дней пока нет" className="mt-6 w-full max-w-[560px]">
            <BlankCard
              title="Повтори первые карточки — каждый учебный день сохранится здесь сам."
              action={{ label: "К повторению", href: "/", trailingIcon: "chevron-right" }}
              className="[&_p]:leading-8 [&_p]:text-balance"
            />
          </section>
        )}
        {ready && (
          <>
            <Subline progress={ready} />
            <RangeFilter progress={ready} range={range} onRange={setRange} />
            <Ledger progress={ready} range={range} marker={day} />
            <Calendar progress={ready} selected={day} onSelect={(key) => select(key)} />
            {!docked && dayPane && (
              <section aria-label="Выбранный день" className="mt-8 w-full max-w-[480px] shrink-0 border-t border-rule pt-4">
                {dayPane}
              </section>
            )}
          </>
        )}
      </div>
      {docked && dayPane && (
        <aside
          aria-label="Выбранный день"
          className="flex w-[400px] shrink-0 flex-col overflow-y-auto overscroll-contain border-l border-rule px-6 pt-4 pb-5 min-[1200px]:max-[1439px]:w-[360px]"
        >
          {dayPane}
        </aside>
      )}
    </main>
  );
}

/** The one mono line by the title (D2 A): «12 дней подряд · лучшая 19 · 48 дней занятий». */
function StreakLine({ progress }: { progress: Progress }) {
  const line = streakLine(progress.streak, progress.activeDays);
  if (!line) return null;
  return (
    <p className="meta m-0 min-w-0 truncate leading-4 tabular-nums">
      <span aria-hidden="true">{line}</span>
      <span className="sr-only">{streakAria(progress.streak, progress.activeDays, progress.since)}</span>
    </p>
  );
}

/** «412 знаю · 350 учу · 500 новых · помню ≈ 640 · 88 % верно» and what «знаю» and «помню ≈» mean. */
function Subline({ progress }: { progress: Progress }) {
  const parts = deskSubline(progress.today);
  return (
    <>
      <p className="m-0 mt-1 shrink-0 text-[13px] leading-5 text-muted tabular-nums">
        {parts.map((p, i) => (
          <span key={p.text}>
            {i > 0 && " · "}
            {p.strong ? <span className="font-medium text-ink">{p.text}</span> : p.text}
          </span>
        ))}
      </p>
      <p className="m-0 mt-0.5 shrink-0 text-[12px] leading-4 text-muted">{MEANS}</p>
    </>
  );
}

/** Месяц · 3 месяца · Год · Всё (text, the chosen one underlined) and the dates it covers. */
function RangeFilter({ progress, range, onRange }: { progress: Progress; range: ProgressRange; onRange: (range: ProgressRange) => void }) {
  const { from, to } = progressAxis(progress);
  return (
    <div className="mt-3 flex h-8 shrink-0 items-center justify-between gap-4">
      <div role="group" aria-label="Период" className="flex items-center gap-5">
        {RANGE_OPTIONS.map((o) => {
          const on = o.value === range;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => onRange(o.value)}
              className={cx(
                "hover-fade inline-flex h-8 items-center bg-transparent p-0 text-[14px] whitespace-nowrap",
                on ? "font-semibold text-ink underline decoration-1 underline-offset-4" : "font-medium text-muted hoverable:text-ink",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      <span className="font-mono text-[12px] whitespace-nowrap text-muted tabular-nums">
        <span className="sr-only">Период: </span>
        {rangeLabel(from, to)}
      </span>
    </div>
  );
}

interface LedgerRow {
  title: string;
  points: SparkPoint[];
  value: string;
  change: string | null;
  label: string;
  floor?: number;
  ceil?: number;
  reference?: number | null;
}

function ledgerRows(progress: Progress): LedgerRow[] {
  const { today, weekAgo, series, retention } = progress;
  const { from, to } = progressAxis(progress);
  const when = span(from, to);
  const studied = series.filter((p) => p.active || p.day === to);
  const activeDays = series.filter((p) => p.active);

  const known = series.map((p) => ({ day: p.day, value: p.known }));
  const delta = weekDelta(today, weekAgo);

  const reviewDays = series.filter((p) => p.reviews > 0);
  const reviewAvg = Math.round(mean(reviewDays.map((p) => p.reviews)));
  const reviewValues = reviewDays.map((p) => p.reviews);
  const reviewTotal = series.reduce((sum, p) => sum + p.reviews, 0);

  const freshAvg = Math.round(mean(activeDays.map((p) => p.new_introduced)));
  const freshValues = activeDays.map((p) => p.new_introduced);

  const correct = series.filter((p) => p.correct !== null).map((p) => ({ day: p.day, value: p.correct as number }));
  const months = retention.month.filter((m) => m.rate !== null).map((m) => `${monthName(`${m.month}-01`)} ${percent(m.rate)}`);

  const spread = (values: number[]) => (values.length ? `от ${formatCount(Math.min(...values))} до ${formatCount(Math.max(...values))}` : "пока нет");

  return [
    {
      title: "Знаю слов",
      points: known,
      floor: 0,
      value: formatCount(today.known),
      change: delta,
      label: join(`Знаю слов, ${when}: ${trendAria(known.map((p) => p.value))}`, `сегодня ${formatCount(today.known)}${delta ? ` — ${spoken(delta)}` : ""}`),
    },
    {
      title: "Повторений в день",
      points: studied.map((p) => ({ day: p.day, value: p.reviews })),
      floor: 0,
      reference: reviewAvg > 0 ? reviewAvg : null,
      value: formatCount(today.reviews),
      change: reviewAvg > 0 ? `в среднем ${formatCount(reviewAvg)}` : null,
      label: join(
        `Повторений в день, ${when}: ${[spread(reviewValues), reviewAvg > 0 && `в среднем ${formatCount(reviewAvg)}`].filter(Boolean).join(", ")}`,
        reviewTotal > 0 && `всего ${formatCount(reviewTotal)}`,
        reviewAvg > 0 && "пунктир — среднее",
        `сегодня ${formatCount(today.reviews)}`,
      ),
    },
    {
      title: "Новых в день",
      points: studied.map((p) => ({ day: p.day, value: p.new_introduced })),
      floor: 0,
      reference: freshAvg > 0 ? freshAvg : null,
      value: formatCount(today.new_introduced),
      change: freshAvg > 0 ? `в среднем ${formatCount(freshAvg)}` : null,
      label: join(
        `Новых карточек в день, ${when}: ${[spread(freshValues), freshAvg > 0 && `в среднем ${formatCount(freshAvg)}`].filter(Boolean).join(", ")}`,
        freshAvg > 0 && "пунктир — среднее",
        `сегодня ${formatCount(today.new_introduced)}`,
      ),
    },
    {
      title: "Верно",
      points: correct,
      ceil: 1,
      reference: retention.target,
      value: percent(today.correct),
      change: `цель ${percent(retention.target)}`,
      label: join(
        `Верно, ${when}: ${months.join(", ") || "пока без повторений"}`,
        retention.last30.rate !== null && `за 30 дней ${percent(retention.last30.rate)}`,
        `пунктир — цель ${percent(retention.target)}`,
        today.correct !== null && `сегодня ${percent(today.correct)}`,
      ),
    },
  ];
}

/** Width of an element, kept up to date (the sparklines draw at the column's real width). */
function useWidth<T extends HTMLElement>(fallback: number): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(40, Math.floor(el.getBoundingClientRect().width)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

const COL_NAME = "w-[148px] flex-none min-[1440px]:w-[168px]";
const COL_SPARK = "min-w-[100px] flex-[3_1_0] max-w-[520px]";
const COL_NOW = "w-[88px] flex-none text-right";
const COL_CHANGE = "min-w-[112px] flex-[1_1_0] text-right";
const HEAD = "font-mono text-[11px] leading-4 tracking-[.06em] text-muted uppercase";

/** «Ведомость»: the four rows at full width with the wider sparklines, today's value and its change. */
function Ledger({ progress, range, marker }: { progress: Progress; range: ProgressRange; marker: string | null }) {
  const { from, to } = progressAxis(progress);
  const [sparkRef, sparkWidth] = useWidth<HTMLSpanElement>(320);
  const rangeName = RANGE_OPTIONS.find((o) => o.value === range)?.long ?? "";
  return (
    <div role="table" aria-label={`Ведомость за ${rangeName}`} className="mt-2 shrink-0 border-b border-ink">
      <div role="row" className="flex h-8 items-center gap-4 border-b border-ink">
        <span role="columnheader" className={cx(COL_NAME, HEAD)}>
          Показатель
        </span>
        <span role="columnheader" ref={sparkRef} className={cx(COL_SPARK, HEAD, "flex justify-between gap-2")}>
          <span className="sr-only">По дням, </span>
          <span>{shortDay(from)}</span>
          {from !== to && (
            <>
              <span className="sr-only"> – </span>
              <span>{shortDay(to)}</span>
            </>
          )}
        </span>
        <span role="columnheader" className={cx(COL_NOW, HEAD)}>
          Сейчас
        </span>
        <span role="columnheader" className={cx(COL_CHANGE, HEAD)}>
          Изменение
        </span>
      </div>
      {ledgerRows(progress).map((row, i) => (
        <div key={row.title} role="row" className={cx("flex h-12 items-center gap-4", i > 0 && "border-t border-rule")}>
          <span role="rowheader" className={cx(COL_NAME, "truncate text-[14px] leading-5 text-ink")}>
            {row.title}
          </span>
          <span role="cell" className={COL_SPARK}>
            <Sparkline
              points={row.points}
              from={from}
              to={to}
              floor={row.floor}
              ceil={row.ceil}
              reference={row.reference}
              marker={marker}
              width={sparkWidth}
              height={SPARK_H}
              todayTone="ink"
              label={row.label}
            />
          </span>
          <span role="cell" className={cx(COL_NOW, "font-mono text-[15px] leading-5 font-medium whitespace-nowrap text-ink tabular-nums")}>
            {row.value}
          </span>
          <span role="cell" className={cx(COL_CHANGE, "truncate text-[13px] leading-5 whitespace-nowrap text-muted tabular-nums")}>
            {row.change}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Reviews per day for the months shown: the range's points, the stored rows for older days. */
function useMonthReviews(progress: Progress, months: string[]): Map<string, number> {
  const first = `${months[0]}-01`;
  const last = `${months[months.length - 1]}-31`;
  const stored = useLiveQuery(
    async () => {
      const rows = await db.progress_days.where("id").between(first, last, true, true).toArray();
      return rows.filter((r) => r.deleted_at === null).map((r) => [r.id, r.reviews] as const);
    },
    [first, last],
  );
  const out = new Map<string, number>(stored ?? []);
  for (const p of progress.series) out.set(p.day, p.reviews);
  out.set(progress.today.day, progress.today.reviews);
  return out;
}

/** «Календарь»: two months side by side (this one and the last), squares by reviews, the legend. */
function Calendar({ progress, selected, onSelect }: { progress: Progress; selected: string | null; onSelect: (day: string) => void }) {
  const today = progress.today.day;
  const headingId = useId();
  const months = calendarMonths(today, selected, progress.since);
  const reviews = useMonthReviews(progress, months);
  const active = new Set(progress.activeDayKeys);
  const exercises = new Map(progress.series.map((p) => [p.day, p.exercises]));
  const shownDays = months.flatMap((m) => monthGrid(m)).filter((k): k is string => !!k && active.has(k));
  const max = Math.max(0, ...shownDays.map((k) => reviews.get(k) ?? 0));
  const week = `${formatCount(progress.weekCount)} из 7 на этой неделе`;

  return (
    <section aria-labelledby={headingId} className="mt-6 shrink-0">
      <div className="flex h-5 items-baseline justify-between gap-4">
        <h2 id={headingId} className="m-0 text-[13px] leading-5 font-medium">
          Календарь
        </h2>
        <span className="text-[12px] leading-5 text-muted tabular-nums">{week}</span>
      </div>
      <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] items-start gap-x-12 gap-y-6">
        {months.map((month) => (
          <Month
            key={month}
            month={month}
            today={today}
            since={progress.since}
            active={active}
            selected={selected}
            reviews={reviews}
            exercises={exercises}
            max={max}
            onSelect={onSelect}
          />
        ))}
      </div>
      <p className="m-0 mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[12px] leading-4 text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span>Меньше</span>
          {DESK_SQUARES.map((s) => (
            <span key={s} aria-hidden="true" style={{ width: s, height: s }} className="inline-block rounded-[1px] bg-ink" />
          ))}
          <span>больше повторений</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block size-3 rounded-[1px] border border-muted" />
          <span>без занятий</span>
        </span>
      </p>
    </section>
  );
}

interface MonthProps {
  month: string;
  today: string;
  since: string | null;
  active: ReadonlySet<string>;
  selected: string | null;
  reviews: ReadonlyMap<string, number>;
  exercises: ReadonlyMap<string, number>;
  max: number;
  onSelect: (day: string) => void;
}

function Month({ month, today, since, active, selected, reviews, exercises, max, onSelect }: MonthProps) {
  const headingId = useId();
  const tally = monthTally(month, today, since, active);
  const line = tallyLine(tally);
  return (
    <div className="min-w-0">
      <div className="flex h-5 items-baseline justify-between gap-2">
        <h3 id={headingId} className="m-0 text-[13px] leading-5 font-medium">
          {deskMonthTitle(month, today)}
        </h3>
        {line && <span className="text-[12px] leading-5 text-muted tabular-nums">{line}</span>}
      </div>
      <div aria-hidden="true" className="-mx-0.5 mt-1.5 grid grid-cols-7">
        {WEEKDAY_HEADS.map((d) => (
          <span key={d} className="meta text-center leading-4">
            {d}
          </span>
        ))}
      </div>
      <div role="group" aria-label={deskMonthAria(month, tally)} className="-mx-0.5 mt-0.5 grid grid-cols-7">
        {monthGrid(month).map((key, i) => {
          if (!key) return <div key={`pad${i}`} aria-hidden="true" className="h-10" />;
          const kind = calendarDayKind(key, today, since, active);
          const isActive = active.has(key);
          const n = reviews.get(key) ?? 0;
          return (
            <DayCell
              key={key}
              day={key}
              kind={kind}
              active={isActive}
              size={deskSquareSize(n, max)}
              selected={selected === key}
              label={calendarDayAria(key, kind, n, exercises.get(key) ?? 0, isActive)}
              onSelect={isActive || kind === "today" ? () => onSelect(key) : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}

interface DayCellProps {
  day: string;
  kind: CalendarDayKind;
  active: boolean;
  size: 6 | 10 | 13 | 16;
  selected: boolean;
  label: string;
  onSelect?: () => void;
}

function DayCell({ day, kind, active, size, selected, label, onSelect }: DayCellProps) {
  const quiet = kind === "missed" || kind === "future" || kind === "before" || (kind === "today" && !active);
  const body = (
    <>
      <span className={cx("font-mono text-[11px] leading-[14px] tabular-nums", kind === "today" ? "font-medium text-ink" : quiet ? "text-muted" : "text-ink")}>
        {Number(day.slice(8))}
      </span>
      <span className="flex size-[18px] items-center justify-center">
        {active ? (
          <span style={{ width: size, height: size }} className="rounded-[1px] bg-ink" />
        ) : kind === "missed" ? (
          <span className="size-3 rounded-[1px] border border-muted" />
        ) : null}
      </span>
    </>
  );
  // Selected: 1px ink frame on white; today (when not selected): the 1.5px red frame.
  const frame = cx(
    "mx-0.5 flex h-10 min-w-0 flex-col items-center justify-center gap-0.5 rounded-chip border text-ink",
    selected ? "border-ink bg-surface" : kind === "today" ? "border-[1.5px] border-red" : "border-transparent",
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
      className={cx(frame, "hover-fade p-0", !selected && "bg-transparent hoverable:bg-hover")}
    >
      {body}
    </button>
  );
}

interface DayPaneProps {
  progress: Progress;
  day: string;
  prev: string | null;
  next: string | null;
  onStep: (dir: -1 | 1) => void;
  docked: boolean;
}

/** The selected day: «День» with ‹ ›, the receipt card, «Ошибки» (rows open the word in Библиотека). */
function DayPane({ progress, day, prev, next, onStep, docked }: DayPaneProps) {
  const detail = useProgressDay(day);
  const fine = useFinePointer();
  const shortcuts = useShortcutsEnabled();
  const titleId = useId();
  const missesId = useId();
  const point: DayPoint | undefined = detail?.point;
  const stats = point ? dayStatParts(point) : [];
  if (point && point.exercises > 0) stats.splice(stats.length - 1, 0, { label: "Упражнений", value: formatCount(point.exercises) });
  const mistakes = detail?.mistakes ?? [];

  return (
    <div aria-busy={detail === undefined || undefined} className="flex flex-1 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-1">
        <span className="flex-1 text-[13px] font-medium">День</span>
        <StepButton dir={-1} target={prev} onStep={onStep} shortcuts={shortcuts} />
        <StepButton dir={1} target={next} onStep={onStep} shortcuts={shortcuts} />
      </div>

      <article aria-labelledby={titleId} className="mt-4 flex shrink-0 flex-col overflow-hidden rounded-card border border-rule bg-surface">
        <div className="flex h-10 shrink-0 items-center justify-between border-b-2 border-red px-5 font-mono text-[11px] text-muted tabular-nums">
          <span>{detail?.ordinal != null ? `ДЕНЬ № ${detail.ordinal}` : day === progress.today.day ? "СЕГОДНЯ" : ""}</span>
          <span>{numericDate(day)}</span>
        </div>
        <div className="flex flex-col px-5 pt-[18px] pb-4">
          <h2 id={titleId} className="m-0 font-serif text-[28px] leading-9 font-medium tracking-[-0.015em]">
            {dayHeading(day)}
          </h2>
          <dl className="m-0 mt-3 border-y border-ink">
            {stats.map((s) => (
              <div key={s.label} className="flex h-10 items-center gap-2">
                <dt className="text-[15px] text-ink">{s.label}</dt>
                <span aria-hidden="true" className="mt-1.5 h-0 flex-1 border-b border-dotted border-muted" />
                <dd className="m-0 min-w-12 text-right font-mono text-[15px] font-medium text-ink tabular-nums">{s.value}</dd>
              </div>
            ))}
            {!point && <div className="h-10" />}
          </dl>
          <p className="m-0 mt-2 text-[12px] leading-4 text-muted tabular-nums">{dayCardNote(day, progress.today.day, progress.today.known)}</p>
        </div>
      </article>

      {mistakes.length > 0 && (
        <section aria-labelledby={missesId} className="mt-6 shrink-0">
          <div className="flex h-5 items-baseline justify-between">
            <h3 id={missesId} className="m-0 text-[13px] leading-5 font-medium">
              Ошибки
            </h3>
            <span className="font-mono text-[12px] leading-5 text-muted tabular-nums">{mistakes.length}</span>
          </div>
          <ul className="m-0 mt-2 list-none border-t border-rule p-0">
            {mistakes.map((m) => (
              <li key={m.word_id}>
                <MistakeRow word={m} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {point && !point.active && day !== progress.today.day && (
        <p className="m-0 mt-6 text-[13px] leading-5 text-muted">{dayLabel(day)} — без занятий.</p>
      )}
      {point && point.active && point.reviews === 0 && point.exercises > 0 && (
        <p className="m-0 mt-6 text-[13px] leading-5 text-muted tabular-nums">Только {countOf(point.exercises, EXERCISE_FORMS)}, без повторений.</p>
      )}

      {docked && fine && (
        <p aria-hidden="true" className="meta m-0 mt-auto pt-6 leading-4">
          ← → другой день
        </p>
      )}
    </div>
  );
}

function StepButton({ dir, target, onStep, shortcuts }: { dir: -1 | 1; target: string | null; onStep: (dir: -1 | 1) => void; shortcuts: boolean }) {
  const name = dir < 0 ? "Предыдущий день" : "Следующий день";
  const key = dir < 0 ? "ArrowLeft" : "ArrowRight";
  return (
    <button
      type="button"
      aria-label={target ? `${name}: ${dayLabel(target)}` : name}
      title={`${name} (${dir < 0 ? "←" : "→"})`}
      aria-keyshortcuts={shortcuts ? key : undefined}
      disabled={!target}
      onClick={() => onStep(dir)}
      className="hover-fade inline-flex size-8 flex-none items-center justify-center rounded-chip bg-transparent text-ink enabled:hoverable:bg-hover disabled:text-muted/50"
    >
      <Icon name={dir < 0 ? "chevron-left" : "chevron-right"} size={20} strokeWidth={1.5} />
    </button>
  );
}

/** A word graded «Не знаю» that day: the headword and its translation; opens the word in Библиотека. */
function MistakeRow({ word }: { word: ProgressMistake }) {
  return (
    <Link
      href={`/library?word=${encodeURIComponent(word.word_id)}`}
      aria-label={`${word.fr} — ${word.ru}. Открыть в библиотеке`}
      className="hover-fade flex h-11 items-center gap-3 border-b border-rule px-1 text-ink no-underline hoverable:bg-hover focus-visible:outline-offset-[-2px]"
    >
      <span lang="fr" className="shrink-0 font-serif text-[19px] leading-6 font-medium whitespace-nowrap">
        {word.fr}
      </span>
      <span className="min-w-0 flex-1 truncate text-[14px] text-muted">{word.ru}</span>
    </Link>
  );
}
