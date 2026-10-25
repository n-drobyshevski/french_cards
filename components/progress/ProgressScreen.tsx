"use client";

import { useState } from "react";
import { NAV_BACK } from "@/components/library/NavSlide";
import { WordDetailSheet } from "@/components/library/WordDetailSheet";
import { BlankCard } from "@/components/ui/BlankCard";
import { cx } from "@/components/ui/cx";
import { FoldRow } from "@/components/ui/FoldRow";
import { Header } from "@/components/ui/Header";
import { useProgress, type DayPoint, type Progress, type ProgressRange } from "@/lib/progress";
import { useLayoutClass } from "@/lib/use-media";
import {
  RANGE_OPTIONS,
  changeSince,
  dayLabel,
  formatCount,
  libraryAria,
  mean,
  monthName,
  percent,
  signed,
  stageParts,
  streakAria,
  streakLine,
  sublinePeriod,
  weekDelta,
  type SparkPoint,
} from "./format";
import { MonthCalendar } from "./MonthCalendar";
import { ProgressDesk } from "./ProgressDesk";
import { useProgressRange } from "./range";
import { Sparkline } from "./Sparkline";

/** «Знаю» and «помню ≈», said once behind the fold and in the sparklines' names. */
const KNOWN_MEANS = "Знаю — слово держится в памяти 21 день и дольше";
const MEMORIZED_MEANS = "Помню ≈ — сколько слов вспомнится прямо сейчас, это оценка";

/**
 * «Прогресс» (/progress, opened from the Library header's chart icon and the Done screen's
 * «Прогресс ›»). Phones (< 768): Progress-Screen-A «Ведомость» with the streak as the one mono line
 * under the title (Progress-Streak-A), the day opened in place under the calendar (Progress-Day),
 * and the blank card before any study day (Progress-Empty). From 768 up: ProgressDesk (D-Progress-A).
 * The layout class is «compact» on the server and during hydration, so CSS keeps the phone UI off
 * wide screens until then.
 */
export function ProgressScreen() {
  const wide = useLayoutClass() !== "compact";
  if (wide) return <ProgressDesk />;
  return (
    <div className="contents md:hidden">
      <PhoneProgress />
    </div>
  );
}

function PhoneProgress() {
  const [range, setRange] = useProgressRange();
  const progress = useProgress(range);
  const [wordId, setWordId] = useState<string | null>(null);

  return (
    <>
      <Header large title="Прогресс" back="/library" backLabel="Библиотека" backTransitionTypes={NAV_BACK} />
      <main aria-busy={!progress || undefined} className="flex flex-1 flex-col px-4 pb-6">
        {progress &&
          (progress.empty ? (
            <section aria-label="Прогресс: учебных дней пока нет" className="mt-6">
              <BlankCard
                title="Повтори первые карточки — каждый учебный день сохранится здесь сам."
                action={{ label: "К повторению", href: "/", trailingIcon: "chevron-right" }}
                className="[&_p]:leading-8 [&_p]:text-balance"
              />
            </section>
          ) : (
            <ProgressBody progress={progress} range={range} onRange={setRange} onOpenWord={setWordId} />
          ))}
      </main>
      <WordDetailSheet wordId={wordId} onClose={() => setWordId(null)} />
    </>
  );
}

function ProgressBody({
  progress,
  range,
  onRange,
  onOpenWord,
}: {
  progress: Progress;
  range: ProgressRange;
  onRange: (range: ProgressRange) => void;
  onOpenWord: (id: string) => void;
}) {
  const line = streakLine(progress.streak, progress.activeDays);
  return (
    <>
      {line && (
        <p className="meta m-0 mt-0.5 leading-4">
          <span aria-hidden="true">{line}</span>
          <span className="sr-only">{streakAria(progress.streak, progress.activeDays, progress.since)}</span>
        </p>
      )}
      <NowSection progress={progress} />
      <RangeFilter range={range} onRange={onRange} />
      <Ledger progress={progress} range={range} />
      {/* The ledger closes on an ink rule; the fold's own hairline is under it. */}
      <div className="shrink-0 border-t border-ink">
        <FoldRow summary="что значит «знаю» и «помню ≈»" rule="bottom" bodyClassName="pb-2.5">
          <p className="m-0 text-[14px] leading-5 text-ink">
            {KNOWN_MEANS}. {MEMORIZED_MEANS}.
          </p>
        </FoldRow>
      </div>
      <MonthCalendar progress={progress} onOpenWord={onOpenWord} />
    </>
  );
}

/** The x axis of every sparkline: the range, from the first study day (or the first stored one), to today. */
function axis(progress: Progress): { from: string; to: string } {
  const to = progress.today.day;
  const first = progress.since ?? progress.series[0]?.day ?? to;
  return { from: first > progress.rangeFrom ? first : progress.rangeFrom, to };
}

/** «+23 за неделю» read aloud: «плюс 23 за неделю». */
const spoken = (s: string) => s.replace(/^\+/, "плюс ").replace(/^−/, "минус ");

const span = (from: string, to: string) => (from === to ? "сегодня" : `${dayLabel(from)} – ${dayLabel(to)}`);

/** «с 0 до 412; от 348 до 412»: first → last, and the extremes when they differ. */
function trendAria(values: readonly number[]): string {
  if (values.length === 0) return "";
  const first = values[0];
  const last = values[values.length - 1];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const out = [`с ${formatCount(first)} до ${formatCount(last)}`];
  if (lo < Math.min(first, last) || hi > Math.max(first, last)) out.push(`от ${formatCount(lo)} до ${formatCount(hi)}`);
  return out.join("; ");
}

/** «412 знаю» with its sparkline and «+23 за неделю», the four-part line and «учу 350 · новых 500 · на паузе 56». */
function NowSection({ progress }: { progress: Progress }) {
  const { today, weekAgo, series } = progress;
  const { from, to } = axis(progress);
  const delta = weekDelta(today, weekAgo);
  const points: SparkPoint[] = series.map((p) => ({ day: p.day, value: p.known }));
  const stage = stageParts(today);
  const label = [
    `Знаю, ${span(from, to)}: ${trendAria(points.map((p) => p.value))}`,
    `сегодня ${formatCount(today.known)}${delta ? ` — ${spoken(delta)}` : ""}`,
  ].join("; ");
  return (
    <section aria-label="Сейчас в библиотеке" className="mt-3 shrink-0">
      <div className="flex items-center gap-3">
        <p className="m-0 flex min-w-0 flex-1 flex-col">
          <span className="flex items-baseline gap-1.5 whitespace-nowrap">
            <span className="font-serif text-[28px] leading-8 font-medium tabular-nums">{formatCount(today.known)}</span>
            <span className="text-[15px] leading-5 font-medium">знаю</span>
          </span>
          {delta && <span className="abbr text-[15px] leading-5 whitespace-nowrap">{delta}</span>}
        </p>
        <Sparkline points={points} from={from} to={to} floor={0} label={`${label}. ${KNOWN_MEANS}`} />
        <span aria-hidden="true" className="w-14 flex-none" />
      </div>
      <StageBar point={today} />
      {stage.length > 0 && <p className="abbr m-0 mt-1.5 text-[15px] leading-5 whitespace-nowrap">{stage.join(" · ")}</p>}
    </section>
  );
}

/** One thin line in four runs: знаю (ink), учу (grey), новых (dashed: not yet on record), на паузе (rule). */
function StageBar({ point }: { point: DayPoint }) {
  if (point.total <= 0) return null;
  const runs = [
    { n: point.known, className: "h-0.5 bg-ink" },
    { n: point.learning, className: "h-0.5 bg-muted/70" },
    { n: point.fresh, className: "h-0 border-t border-dashed border-muted/70" },
    { n: point.paused, className: "h-px bg-rule" },
  ].filter((r) => r.n > 0);
  return (
    <div role="img" aria-label={libraryAria(point)} className="mt-2.5 flex h-0.5 items-end gap-[3px]">
      {runs.map((r, i) => (
        <span key={i} style={{ flex: `${r.n} 1 0` }} className={cx("min-w-0", r.className)} />
      ))}
    </div>
  );
}

/** Месяц · 3 месяца · Год · Всё: a text filter, the chosen one underlined (per device, range.ts). */
function RangeFilter({ range, onRange }: { range: ProgressRange; onRange: (range: ProgressRange) => void }) {
  return (
    <div className="flex h-11 shrink-0 items-center">
      <div role="group" aria-label="Период" className="-ml-2.5 flex items-center">
        {RANGE_OPTIONS.map((o) => {
          const on = o.value === range;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => onRange(o.value)}
              className={cx(
                "press-sm inline-flex h-11 min-w-11 items-center justify-center rounded-chip bg-transparent px-2.5 text-[14px] whitespace-nowrap active:bg-surface-2",
                on ? "font-semibold text-ink underline decoration-1 underline-offset-4" : "font-medium text-muted",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface LedgerRow {
  title: string;
  sub: string | null;
  points: SparkPoint[];
  value: string;
  label: string;
  floor?: number;
  ceil?: number;
  reference?: number | null;
}

function ledgerRows(progress: Progress, range: ProgressRange): LedgerRow[] {
  const { today, series, retention } = progress;
  const { from, to } = axis(progress);
  const when = span(from, to);
  const period = sublinePeriod(range, to, from);
  const inPeriod = series.filter((p) => p.day >= period.from);
  const studied = series.filter((p) => p.active || p.day === to);

  // Помню ≈
  const memorized = series.map((p) => ({ day: p.day, value: Math.round(p.memorized) }));
  const memDelta = changeSince(memorized, period.from, (p) => p.value);
  const memSub = memDelta ? `${signed(memDelta)} ${period.over}` : null;

  // Повторений в день: the active days, and today; the dashed line is their average.
  const reviewDays = series.filter((p) => p.reviews > 0);
  const avg = Math.round(mean(reviewDays.map((p) => p.reviews)));
  const reviews = studied.map((p) => ({ day: p.day, value: p.reviews }));
  const reviewTotal = series.reduce((sum, p) => sum + p.reviews, 0);
  const reviewValues = reviewDays.map((p) => p.reviews);

  // Новых в день
  const fresh = studied.map((p) => ({ day: p.day, value: p.new_introduced }));
  const freshSum = inPeriod.reduce((sum, p) => sum + p.new_introduced, 0);
  const freshValues = series.filter((p) => p.active).map((p) => p.new_introduced);

  // Верно: the days with reviews; the dashed line is the target.
  const correct = series.filter((p) => p.correct !== null).map((p) => ({ day: p.day, value: p.correct as number }));
  const months = retention.month.filter((m) => m.rate !== null).map((m) => `${monthName(`${m.month}-01`)} ${percent(m.rate)}`);

  const range2 = (values: number[]) => (values.length ? `от ${formatCount(Math.min(...values))} до ${formatCount(Math.max(...values))}` : "");
  const join = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join("; ");

  return [
    {
      title: "Помню ≈",
      sub: memSub,
      points: memorized,
      floor: 0,
      value: formatCount(today.memorized),
      label: `${join(`Помню ≈, ${when}: ${trendAria(memorized.map((p) => p.value))}`, `сегодня ${formatCount(today.memorized)}${memSub ? ` — ${spoken(memSub)}` : ""}`)}. ${MEMORIZED_MEANS}`,
    },
    {
      title: "Повторений в день",
      sub: avg > 0 ? `в среднем ${formatCount(avg)}` : null,
      points: reviews,
      floor: 0,
      reference: avg > 0 ? avg : null,
      value: formatCount(today.reviews),
      label: join(
        `Повторений в день, ${when}: ${[range2(reviewValues), avg > 0 && `в среднем ${formatCount(avg)}`].filter(Boolean).join(", ")}`,
        reviewTotal > 0 && `всего ${formatCount(reviewTotal)}`,
        avg > 0 && "пунктир — среднее",
        `сегодня ${formatCount(today.reviews)}`,
      ),
    },
    {
      title: "Новых в день",
      sub: freshSum > 0 ? `${formatCount(freshSum)} ${period.within}` : null,
      points: fresh,
      floor: 0,
      value: formatCount(today.new_introduced),
      label: join(
        `Новых карточек в день, ${when}: ${range2(freshValues)}`,
        freshSum > 0 && `${formatCount(freshSum)} ${period.within}`,
        `сегодня ${formatCount(today.new_introduced)}`,
      ),
    },
    {
      title: "Верно",
      sub: `цель ${percent(retention.target)}`,
      points: correct,
      ceil: 1,
      reference: retention.target,
      value: percent(today.correct),
      label: join(
        `Верно, ${when}: ${months.join(", ") || "пока без повторений"}`,
        retention.last30.rate !== null && `за 30 дней ${percent(retention.last30.rate)}`,
        `пунктир — цель ${percent(retention.target)}`,
        today.correct !== null && `сегодня ${percent(today.correct)}`,
      ),
    },
  ];
}

/** «Ведомость»: four ruled rows, each a name with its italic subline, a sparkline and today's value. */
function Ledger({ progress, range }: { progress: Progress; range: ProgressRange }) {
  const { from, to } = axis(progress);
  const rangeName = RANGE_OPTIONS.find((o) => o.value === range)?.long ?? "";
  return (
    <div role="table" aria-label={`Ведомость за ${rangeName}`} className="shrink-0 border-t border-ink">
      {ledgerRows(progress, range).map((row, i) => (
        <div key={row.title} role="row" className={cx("flex h-[46px] items-center gap-3", i > 0 && "border-t border-rule")}>
          <span role="rowheader" className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[15px] leading-5 text-ink">{row.title}</span>
            {row.sub && <span className="abbr truncate text-[14px] leading-[18px]">{row.sub}</span>}
          </span>
          <span role="cell">
            <Sparkline points={row.points} from={from} to={to} floor={row.floor} ceil={row.ceil} reference={row.reference} label={row.label} />
          </span>
          <span role="cell" className="w-14 flex-none text-right font-mono text-[16px] leading-5 font-medium whitespace-nowrap text-ink tabular-nums">
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}
