// Pure formatting for the «Прогресс» screen (mockups/Progress-Screen-A, Progress-Streak-A,
// Progress-Day): Russian dates and plurals, the streak line, the stage line, sparkline geometry,
// the month calendar and the accessible names. No React, no Dexie.
import { pluralRu } from "@/components/review/format";
import type { DayPoint, ProgressRange, Streaks } from "@/lib/progress";

export const DAY_FORMS = ["день", "дня", "дней"] as const;
export const REVIEW_FORMS = ["повторение", "повторения", "повторений"] as const;
export const WORD_FORMS = ["слово", "слова", "слов"] as const;
export const EXERCISE_FORMS = ["упражнение", "упражнения", "упражнений"] as const;

const MONTHS_NOM = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const MONTHS_PREP = ["январе", "феврале", "марте", "апреле", "мае", "июне", "июле", "августе", "сентябре", "октябре", "ноябре", "декабре"];
const WEEKDAYS = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
/** Calendar column heads, Monday first. */
export const WEEKDAY_HEADS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"] as const;

const NBSP = " ";

export const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** «2 410», «96»: thousands split by a no-break space like the mockups. */
export function formatCount(n: number): string {
  const rounded = Math.round(n);
  const sign = rounded < 0 ? "−" : "";
  return sign + String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/** «+23», «−5», «0». */
export function signed(n: number): string {
  const r = Math.round(n);
  return r > 0 ? `+${formatCount(r)}` : formatCount(r);
}

/** «92 %» with a no-break space; «—» without a value. */
export function percent(rate: number | null): string {
  return rate === null || !Number.isFinite(rate) ? "—" : `${Math.round(rate * 100)}${NBSP}%`;
}

/** «12 дней» */
export const countOf = (n: number, forms: readonly [string, string, string]) => `${formatCount(n)} ${pluralRu(n, forms)}`;

function parts(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m, d };
}

/** «21 октября» */
export function dayLabel(key: string): string {
  const { m, d } = parts(key);
  return `${d} ${MONTHS_GEN[m - 1]}`;
}

/** «среда» (the study day's calendar date). */
export function weekdayOf(key: string): string {
  const { y, m, d } = parts(key);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** «Среда, 21 октября» (the opened day's heading). */
export const dayHeading = (key: string) => `${capitalize(weekdayOf(key))}, ${dayLabel(key)}`;

/** «Октябрь 2026» for "2026-10" or a day key. */
export function monthTitle(key: string): string {
  const { y, m } = parts(key);
  return `${capitalize(MONTHS_NOM[m - 1])} ${y}`;
}

/** «октябрь» */
export const monthName = (key: string) => MONTHS_NOM[parts(key).m - 1];
/** «в октябре» */
export const inMonth = (key: string) => `в ${MONTHS_PREP[parts(key).m - 1]}`;

/** «10–28 сентября», «28 сентября – 3 октября», «3 сентября». */
export function dayRange(from: string, to: string): string {
  if (from === to) return dayLabel(from);
  const a = parts(from);
  const b = parts(to);
  if (a.y === b.y && a.m === b.m) return `${a.d}–${b.d} ${MONTHS_GEN[b.m - 1]}`;
  return `${dayLabel(from)} – ${dayLabel(to)}`;
}

// ---------------------------------------------------------------------------------------------
// The one mono line under the title (D2 A)

/**
 * «12 дней подряд · лучшая 19 · 48 дней занятий» (lower case; the line is set in caps). No streak
 * part while the current streak is 0, no «лучшая» while the current one is the best; null before
 * any active day (rule 10).
 */
export function streakLine(streak: Streaks, activeDays: number): string | null {
  if (activeDays <= 0) return null;
  const out: string[] = [];
  if (streak.current > 0) out.push(`${countOf(streak.current, DAY_FORMS)} подряд`);
  if (streak.best > 0 && streak.best > streak.current) out.push(`лучшая ${formatCount(streak.best)}`);
  out.push(`${countOf(activeDays, DAY_FORMS)} занятий`);
  return out.join(" · ");
}

/** «Серия: 12 дней подряд, с 14 октября. Лучшая серия — 19 дней, 10–28 сентября. Всего 48 дней занятий с 3 сентября.» */
export function streakAria(streak: Streaks, activeDays: number, since: string | null): string {
  const out: string[] = [];
  if (streak.current > 0) out.push(`Серия: ${countOf(streak.current, DAY_FORMS)} подряд${streak.currentFrom ? `, с ${dayLabel(streak.currentFrom)}` : ""}.`);
  if (streak.best > 0 && streak.bestFrom && streak.bestTo)
    out.push(`Лучшая серия — ${countOf(streak.best, DAY_FORMS)}, ${dayRange(streak.bestFrom, streak.bestTo)}.`);
  out.push(`Всего ${countOf(activeDays, DAY_FORMS)} занятий${since ? ` с ${dayLabel(since)}` : ""}.`);
  return out.join(" ");
}

// ---------------------------------------------------------------------------------------------
// «412 знаю» and the stage line

/** «учу 350 · новых 500 · на паузе 56»: the parts at 0 are left out. */
export function stageParts(p: Pick<DayPoint, "learning" | "fresh" | "paused">): string[] {
  const out: string[] = [];
  if (p.learning > 0) out.push(`учу ${formatCount(p.learning)}`);
  if (p.fresh > 0) out.push(`новых ${formatCount(p.fresh)}`);
  if (p.paused > 0) out.push(`на паузе ${formatCount(p.paused)}`);
  return out;
}

/** «Библиотека, 1318 слов: знаю 412, учу 350, новых 500, на паузе 56» */
export function libraryAria(p: Pick<DayPoint, "known" | "learning" | "fresh" | "paused" | "total">): string {
  return `Библиотека, ${countOf(p.total, WORD_FORMS)}: знаю ${formatCount(p.known)}, учу ${formatCount(p.learning)}, новых ${formatCount(p.fresh)}, на паузе ${formatCount(p.paused)}`;
}

/** «+23 за неделю» (null without the stored day a week ago, or when nothing changed). */
export function weekDelta(today: Pick<DayPoint, "known">, weekAgo: Pick<DayPoint, "known"> | null): string | null {
  if (!weekAgo) return null;
  const delta = today.known - weekAgo.known;
  return delta === 0 ? null : `${signed(delta)} за неделю`;
}

// ---------------------------------------------------------------------------------------------
// The period the table's sublines speak of

export const RANGE_OPTIONS: readonly { value: ProgressRange; label: string; long: string }[] = [
  { value: "month", label: "Месяц", long: "месяц" },
  { value: "3m", label: "3 месяца", long: "3 месяца" },
  { value: "year", label: "Год", long: "год" },
  { value: "all", label: "Всё", long: "всё время" },
];

export interface Period {
  /** First day the subline counts from. */
  from: string;
  /** «за октябрь» / «за год» / «с 3 сентября» (a change). */
  over: string;
  /** «в октябре» / «за год» / «с 3 сентября» (a sum). */
  within: string;
}

/** Month and 3 months speak of this month (as the mockup's «+50 за октябрь»); year and all of the range. */
export function sublinePeriod(range: ProgressRange, today: string, rangeFrom: string): Period {
  if (range === "month" || range === "3m") {
    return { from: `${today.slice(0, 7)}-01`, over: `за ${monthName(today)}`, within: inMonth(today) };
  }
  if (range === "year") return { from: rangeFrom, over: "за год", within: "за год" };
  return { from: rangeFrom, over: `с ${dayLabel(rangeFrom)}`, within: `с ${dayLabel(rangeFrom)}` };
}

/**
 * How much `value` changed over the period: today's value minus the last point before `from`
 * (else the first point from `from` on, when it is not the last). Null without a baseline.
 */
export function changeSince<T extends { day: string }>(series: readonly T[], from: string, value: (p: T) => number): number | null {
  if (series.length < 2) return null;
  const last = series[series.length - 1];
  let base: T | undefined;
  for (const p of series) {
    if (p.day < from) base = p;
    else break;
  }
  base ??= series.find((p) => p.day >= from);
  if (!base || base === last) return null;
  return value(last) - value(base);
}

/** Mean of the values (0 for none). */
export const mean = (values: readonly number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

// ---------------------------------------------------------------------------------------------
// «Новых слов в день» against the plan (pick D1 A): plan units, the plan's ceiling as the dashed line

/**
 * The usual new words a day (plan units, `new_words`): the median over the study days shown (a day
 * with at least one answer; days off are not data, N3). Today counts once it took the whole
 * ceiling, so a half-done morning never lowers it. Null without a study day.
 */
export function usualNewWords(series: readonly Pick<DayPoint, "day" | "reviews" | "new_words">[], today: string, ceiling: number | null): number | null {
  const values = series
    .filter((p) => p.reviews > 0 && (p.day < today || (ceiling !== null && p.new_words >= ceiling)))
    .map((p) => p.new_words)
    .sort((a, b) => a - b);
  if (values.length === 0) return null;
  const mid = values.length >> 1;
  return Math.round(values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2);
}

/** «обычно 6 · до 10 по плану» (N1: the plan is «до N»; N2: never «6/10»); «обычно 6» without a plan. */
export function planSubline(usual: number | null, ceiling: number | null): string | null {
  if (usual === null) return null;
  return ceiling === null ? `обычно ${formatCount(usual)}` : `обычно ${formatCount(usual)} · до ${formatCount(ceiling)} по плану`;
}

// ---------------------------------------------------------------------------------------------
// Sparkline geometry (120×24, 1px ink, baseline at 23.5, today's point red)

export interface SparkPoint {
  day: string;
  value: number;
}

export interface SparkGeometry {
  /** Polyline `points` attributes, one per run of consecutive days. */
  lines: string[];
  /** Lone points (a run of one day), drawn as 1px dots. */
  dots: { x: number; y: number }[];
  /** The red point: today's value; null when today is not plotted. */
  today: { x: number; y: number } | null;
  /** The dashed reference line (average, target), when given. */
  refY: number | null;
  /** The marked day (desktop: the day open in the pane): its x, and its value's y when it has one. */
  marker: { x: number; y: number | null } | null;
}

export interface SparkOptions {
  width?: number;
  height?: number;
  /** Lowest value of the y scale; the data minimum when omitted (0 is usual for counts). */
  floor?: number;
  /** Highest value of the y scale at least this (e.g. 1 for a share). */
  ceil?: number;
  /** A dashed reference value (average, target): kept inside the scale. */
  reference?: number | null;
  /** A day to mark with a hairline (and a hollow point on its value); ignored outside [from, to]. */
  marker?: string | null;
}

const dayIndex = (key: string) => {
  const { y, m, d } = parts(key);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Sparkline geometry over the days [from, to]: x by day, y scaled to the values (and the reference).
 * Days without a point break the line (a gap stays a gap). The red point is the one on `to`.
 */
export function sparkGeometry(points: readonly SparkPoint[], from: string, to: string, opts: SparkOptions = {}): SparkGeometry {
  const { width = 120, height = 24, floor, ceil, reference = null, marker = null } = opts;
  const left = 2;
  const right = width - 4;
  const top = 4;
  const bottom = height - 3;
  const start = dayIndex(from);
  const span = Math.max(0, dayIndex(to) - start);
  const shown = points.filter((p) => p.day >= from && p.day <= to && Number.isFinite(p.value));
  const values = shown.map((p) => p.value);
  if (reference !== null && Number.isFinite(reference)) values.push(reference);
  let lo = floor ?? (values.length ? Math.min(...values) : 0);
  let hi = Math.max(ceil ?? -Infinity, ...(values.length ? values : [lo]));
  if (floor !== undefined) lo = Math.min(lo, ...values);
  if (hi <= lo) hi = lo + 1;
  const flat = values.length > 0 && values.every((v) => v === values[0]);
  const x = (day: string) => r1(span === 0 ? right : left + ((dayIndex(day) - start) / span) * (right - left));
  const y = (v: number) => r1(flat && floor === undefined ? (top + bottom) / 2 : bottom - ((v - lo) / (hi - lo)) * (bottom - top));

  const runs: SparkPoint[][] = [];
  let prev = -Infinity;
  for (const p of shown) {
    const i = dayIndex(p.day);
    if (i === prev + 1 && runs.length) runs[runs.length - 1].push(p);
    else runs.push([p]);
    prev = i;
  }
  const lines: string[] = [];
  const dots: { x: number; y: number }[] = [];
  for (const run of runs) {
    if (run.length === 1) dots.push({ x: x(run[0].day), y: y(run[0].value) });
    else lines.push(run.map((p) => `${x(p.day)},${y(p.value)}`).join(" "));
  }
  const last = shown[shown.length - 1];
  return {
    lines,
    dots: dots.filter((d) => !(last && last.day === to && d.x === x(last.day))),
    today: last && last.day === to ? { x: x(last.day), y: y(last.value) } : null,
    refY: reference !== null && Number.isFinite(reference) ? y(reference) : null,
    marker:
      marker !== null && marker >= from && marker <= to
        ? { x: x(marker), y: ((p) => (p ? y(p.value) : null))(shown.find((p) => p.day === marker)) }
        : null,
  };
}

// ---------------------------------------------------------------------------------------------
// The month calendar

/** The weeks of a month, Monday first: day keys, null for the padding cells. */
export function monthGrid(monthKey: string): (string | null)[] {
  const { y, m } = parts(`${monthKey.slice(0, 7)}-01`);
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0 = Sunday
  const lead = (first + 6) % 7;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d++) cells.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

/** Side of a day's square (px) by its review count against the month's busiest day: 12, 16 or 20. */
export function squareSize(reviews: number, max: number): 12 | 16 | 20 {
  if (max <= 0 || reviews <= 0) return 12;
  const share = reviews / max;
  return share > 0.82 ? 20 : share > 0.67 ? 16 : 12;
}

export type CalendarDayKind = "active" | "missed" | "today" | "future" | "before";

/** What a day of the calendar shows: before the first active day and after today, nothing. */
export function calendarDayKind(key: string, today: string, since: string | null, active: ReadonlySet<string>): CalendarDayKind {
  if (key > today) return "future";
  if (active.has(key)) return key === today ? "today" : "active";
  if (key === today) return "today";
  if (!since || key < since) return "before";
  return "missed";
}

/** «1 октября, 108 повторений», «6 октября, без занятий», «25 октября, 96 повторений, сегодня». */
export function calendarDayAria(key: string, kind: CalendarDayKind, reviews: number, exercises: number, active: boolean): string {
  const head = dayLabel(key);
  if (kind === "future") return `${head}, впереди`;
  if (kind === "before") return head;
  const what = !active
    ? "без занятий"
    : [reviews > 0 && countOf(reviews, REVIEW_FORMS), exercises > 0 && countOf(exercises, EXERCISE_FORMS)].filter(Boolean).join(", ") || "занятия";
  return kind === "today" ? `${head}, ${what}, сегодня` : `${head}, ${what}`;
}

/** «6, 7 и 13 октября» (days of one month). */
export function listDays(keys: readonly string[]): string {
  if (keys.length === 0) return "";
  const nums = keys.map((k) => String(parts(k).d));
  const tail = MONTHS_GEN[parts(keys[0]).m - 1];
  const joined = nums.length === 1 ? nums[0] : `${nums.slice(0, -1).join(", ")} и ${nums[nums.length - 1]}`;
  return `${joined} ${tail}`;
}

export interface MonthSummary {
  /** Active days of the month up to today. */
  active: number;
  /** Days of the month that could have been active: from the 1st (or the first active day) to today. */
  elapsed: number;
  /** The days without a session among those (missed), ascending. */
  missed: string[];
  reviews: number;
  /** Change of «знаю» over the month; null without a baseline. */
  knownDelta: number | null;
}

/** The month under the calendar: «22 дня из 25 · 2 410 повторений · знаю +64». */
export function monthSummary(
  monthKey: string,
  today: string,
  since: string | null,
  activeKeys: readonly string[],
  series: readonly DayPoint[],
): MonthSummary {
  const ym = monthKey.slice(0, 7);
  const first = `${ym}-01`;
  const active = new Set(activeKeys);
  const cells = monthGrid(ym).filter((k): k is string => k !== null && k <= today && !!since && k >= since);
  const missed = cells.filter((k) => !active.has(k) && k !== today);
  const inMonthPoints = series.filter((p) => p.day.startsWith(ym));
  return {
    active: cells.filter((k) => active.has(k)).length,
    elapsed: cells.filter((k) => k !== today || active.has(k)).length,
    missed,
    reviews: inMonthPoints.reduce((sum, p) => sum + p.reviews, 0),
    knownDelta: changeSince(series, first, (p) => p.known),
  };
}

/** «22 дня из 25 · 2 410 повторений · знаю +64»; parts at 0 left out; null when nothing is left. */
export function monthSummaryLine(s: MonthSummary): string | null {
  const out: string[] = [];
  if (s.active > 0) out.push(`${countOf(s.active, DAY_FORMS)} из ${formatCount(s.elapsed)}`);
  if (s.reviews > 0) out.push(countOf(s.reviews, REVIEW_FORMS));
  if (s.knownDelta) out.push(`знаю ${signed(s.knownDelta)}`);
  return out.length ? out.join(" · ") : null;
}

/** «Октябрь 2026: занятия 22 дня из 25, без занятий 6, 7 и 13 октября; на этой неделе 7 из 7; …» */
export function monthAria(monthKey: string, s: MonthSummary, weekCount: number): string {
  const out = [`${monthTitle(monthKey)}: занятия ${countOf(s.active, DAY_FORMS)} из ${formatCount(s.elapsed)}`];
  if (s.missed.length) out[0] += `, без занятий ${listDays(s.missed)}`;
  out.push(`на этой неделе ${formatCount(weekCount)} из 7`);
  out.push("размер квадрата — число повторений, пунктирная рамка — день без занятий");
  return out.join("; ");
}

/**
 * The opened day's mono line: «Повторено 104 · Новых слов 10 · Новых карточек 14 · Верно 92 % · Знаю
 * 398» (zeros left out). New words are the plan's units; the cards (both directions) follow when they
 * differ. `together`: the plan counts cards («Новых карточек» only).
 */
export function dayStatParts(
  p: Pick<DayPoint, "reviews" | "new_introduced" | "new_words" | "correct" | "known">,
  together = false,
): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  if (p.reviews > 0) out.push({ label: "Повторено", value: formatCount(p.reviews) });
  if (together) {
    if (p.new_introduced > 0) out.push({ label: "Новых карточек", value: formatCount(p.new_introduced) });
  } else {
    if (p.new_words > 0) out.push({ label: "Новых слов", value: formatCount(p.new_words) });
    if (p.new_introduced > 0 && p.new_introduced !== p.new_words) out.push({ label: "Новых карточек", value: formatCount(p.new_introduced) });
  }
  if (p.correct !== null) out.push({ label: "Верно", value: percent(p.correct) });
  out.push({ label: "Знаю", value: formatCount(p.known) });
  return out;
}
