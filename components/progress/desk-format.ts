// Pure formatting for the desktop «Прогресс» (≥ 768, mockups/D-Progress-A «Ведомость»): the
// subline, the ledger's date heads, the two calendar months, the day pane's stepping. No React, no
// Dexie. The phone screen's helpers are in ./format.
import type { DayPoint } from "@/lib/progress";
import { DAY_FORMS, capitalize, countOf, formatCount, listDays, monthGrid, monthName, percent } from "./format";

const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сент", "окт", "нояб", "дек"];

function parts(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m, d };
}

/** «3 сент», «25 окт»: the ledger's first and last day (column heads, set in caps). */
export function shortDay(key: string): string {
  const { m, d } = parts(key);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** «21.10.2026» (the day card's header). */
export function numericDate(key: string): string {
  const { y, m, d } = parts(key);
  return `${pad(d)}.${pad(m)}.${y}`;
}

/** «3.09 – 25.10.2026» (the range at the filter's right); the year once when both ends share it. */
export function rangeLabel(from: string, to: string): string {
  const a = parts(from);
  const b = parts(to);
  const end = `${b.d}.${pad(b.m)}.${b.y}`;
  if (from === to) return end;
  return a.y === b.y ? `${a.d}.${pad(a.m)} – ${end}` : `${a.d}.${pad(a.m)}.${a.y} – ${end}`;
}

export interface SublinePart {
  text: string;
  /** «412 знаю»: ink 500, the rest muted. */
  strong?: boolean;
}

/**
 * «412 знаю · 350 учу · 500 новых · 56 на паузе · помню ≈ 640 · 88 % верно»: «знаю» always, the
 * other counts only above 0, «верно» only once today has reviews.
 */
export function deskSubline(today: Pick<DayPoint, "known" | "learning" | "fresh" | "paused" | "memorized" | "correct">): SublinePart[] {
  const out: SublinePart[] = [{ text: `${formatCount(today.known)} знаю`, strong: true }];
  if (today.learning > 0) out.push({ text: `${formatCount(today.learning)} учу` });
  if (today.fresh > 0) out.push({ text: `${formatCount(today.fresh)} новых` });
  if (today.paused > 0) out.push({ text: `${formatCount(today.paused)} на паузе` });
  if (Math.round(today.memorized) > 0) out.push({ text: `помню ≈ ${formatCount(today.memorized)}` });
  if (today.correct !== null) out.push({ text: `${percent(today.correct)} верно` });
  return out;
}

/** «с 0 до 412; от 348 до 412»: first → last, and the extremes when they lie outside. */
export function trendAria(values: readonly number[]): string {
  if (values.length === 0) return "пока нет данных";
  const first = values[0];
  const last = values[values.length - 1];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const out = [`с ${formatCount(first)} до ${formatCount(last)}`];
  if (lo < Math.min(first, last) || hi > Math.max(first, last)) out.push(`от ${formatCount(lo)} до ${formatCount(hi)}`);
  return out.join("; ");
}

// ---------------------------------------------------------------------------------------------
// The calendar: two months side by side

/** "2026-10" plus `n` months. */
export function addMonths(month: string, n: number): string {
  const { y, m } = parts(`${month.slice(0, 7)}-01`);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}`;
}

/**
 * The months the calendar shows, oldest first: this month and the one before (only when there was
 * something to show in it). A day picked further back brings its own month and the next one.
 */
export function calendarMonths(today: string, selected: string | null, since: string | null): string[] {
  const current = today.slice(0, 7);
  const previous = addMonths(current, -1);
  const pick = selected?.slice(0, 7);
  if (pick && pick < previous) return [pick, addMonths(pick, 1)];
  const first = since?.slice(0, 7);
  return first && first <= previous ? [previous, current] : [current];
}

/** «Сентябрь», «Декабрь 2025» (the year only when it is not today's). */
export function deskMonthTitle(month: string, today: string): string {
  const name = capitalize(monthName(`${month.slice(0, 7)}-01`));
  return month.slice(0, 4) === today.slice(0, 4) ? name : `${name} ${month.slice(0, 4)}`;
}

/** Side of a day's square (px) by its reviews against the busiest day shown: 6, 10, 13 or 16. */
export function deskSquareSize(reviews: number, max: number): 6 | 10 | 13 | 16 {
  if (max <= 0 || reviews <= 0) return 6;
  const share = reviews / max;
  return share > 0.85 ? 16 : share > 0.65 ? 13 : share > 0.4 ? 10 : 6;
}

/** The legend's squares, smallest first. */
export const DESK_SQUARES = [6, 10, 13, 16] as const;

/** «26 дней из 28» for a month: active days of those from the first study day (or the 1st) to today. */
export function monthTally(month: string, today: string, since: string | null, active: ReadonlySet<string>): { active: number; elapsed: number; missed: string[] } {
  const cells = monthGrid(month).filter((k): k is string => k !== null && k <= today && !!since && k >= since);
  const on = cells.filter((k) => active.has(k));
  return {
    active: on.length,
    // Today counts once it has been studied: until then it is not a missed day.
    elapsed: cells.filter((k) => k !== today || active.has(k)).length,
    missed: cells.filter((k) => !active.has(k) && k !== today),
  };
}

export const tallyLine = (t: { active: number; elapsed: number }) =>
  t.active > 0 ? `${countOf(t.active, DAY_FORMS)} из ${formatCount(t.elapsed)}` : null;

/** «Октябрь 2026: занятия 22 дня из 25, без занятий 6, 7 и 13 октября» (the month grid's name). */
export function deskMonthAria(month: string, tally: { active: number; elapsed: number; missed: string[] }): string {
  const title = `${capitalize(monthName(`${month}-01`))} ${month.slice(0, 4)}`;
  if (tally.elapsed === 0 && tally.active === 0) return `${title}: занятий не было`;
  let line = `${title}: занятия ${countOf(tally.active, DAY_FORMS)} из ${formatCount(tally.elapsed)}`;
  if (tally.missed.length) line += `, без занятий ${listDays(tally.missed)}`;
  return `${line}; размер квадрата — число повторений, рамка — день без занятий`;
}

// ---------------------------------------------------------------------------------------------
// The day pane

/** The days the pane steps through (← →): the active ones and today, ascending, no duplicates. */
export function steppableDays(activeKeys: readonly string[], today: string): string[] {
  const set = new Set(activeKeys.filter((k) => k <= today));
  set.add(today);
  return [...set].sort();
}

/** The day the pane opens on: today once studied, else the latest active day, else today. */
export function defaultDay(activeKeys: readonly string[], today: string): string {
  let last: string | null = null;
  for (const k of activeKeys) if (k <= today && (last === null || k > last)) last = k;
  return last ?? today;
}

/** The previous (−1) or next (+1) day of `days` from `day` (which need not be among them); null at the end. */
export function stepDay(days: readonly string[], day: string, dir: -1 | 1): string | null {
  if (dir < 0) {
    let prev: string | null = null;
    for (const k of days) if (k < day && (prev === null || k > prev)) prev = k;
    return prev;
  }
  let next: string | null = null;
  for (const k of days) if (k > day && (next === null || k < next)) next = k;
  return next;
}

/** The note under the day card: «Знаю — на конец дня. Сегодня 412.» / «Знаю — на сейчас.» */
export function dayCardNote(day: string, today: string, knownToday: number): string {
  return day === today ? "Знаю — на сейчас, день ещё идёт." : `Знаю — на конец дня. Сегодня ${formatCount(knownToday)}.`;
}

/** The x axis of every sparkline: from the first study day (or the range's start, if later) to today. */
export function progressAxis(p: { today: { day: string }; since: string | null; series: readonly { day: string }[]; rangeFrom: string }): {
  from: string;
  to: string;
} {
  const to = p.today.day;
  const first = p.since ?? p.series[0]?.day ?? to;
  return { from: first > p.rangeFrom ? first : p.rangeFrom, to };
}
