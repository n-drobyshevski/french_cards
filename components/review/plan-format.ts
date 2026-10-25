// Pure copy for «План дня» (SPEC «План дня и уровень языка»): the review summary, the reason
// subline, the «План на сегодня» receipt and reason line, the plan summaries of Settings and
// «Готово на сегодня», the wait screen's minutes and return timeline, and the plan sheet's day
// strip. lib/core/plan.ts `planDay` gives the numbers.
import type { DayPlan, PlanItem } from "@/lib/core/plan";
import type { StudyPlan } from "@/lib/core/study-plan";
import type { Direction } from "@/lib/types";
import { CARD_FORMS, formatPercent, pluralRu, WORD_FORMS } from "./format";

/** The settings sub-screen «План повторения» (Settings → «Повторение» → «План повторения ›»). */
export const PLAN_SETTINGS_HREF = "/settings/plan";

/**
 * «Назавтра» (`ru_fr: "together"`, the rule before the plan) keeps one allowance of new cards for
 * both directions, so there `new_words` counts cards and the copy says «карточек», not «слов».
 */
export const countsCards = (plan: Pick<StudyPlan, "ru_fr">) => plan.ru_fr === "together";

/** «10 слов» / «10 карточек» (the plan's new words a day). */
export function newUnits(plan: Pick<StudyPlan, "ru_fr">, n: number): string {
  return `${n} ${pluralRu(n, countsCards(plan) ? CARD_FORMS : WORD_FORMS)}`;
}

/** «10 слов в день · до 200 повторений» (with no cap «… · без лимита повторений»). */
export function planSummary(plan: StudyPlan): string {
  const cap = plan.review_cap === null ? "без лимита повторений" : `до ${plan.review_cap} повторений`;
  return `${newUnits(plan, plan.new_words)} в день · ${cap}`;
}

/** The short form beside «Изменить план ›»: «10 слов · до 200» / «10 слов · без лимита». */
export function planShort(plan: StudyPlan): string {
  return `${newUnits(plan, plan.new_words)} · ${plan.review_cap === null ? "без лимита" : `до ${plan.review_cap}`}`;
}

/** The new cards of today's queue, split as the header names them: new words and reverse sides. */
export interface QueueNew {
  fresh: number;
  /** RU→FR sides new today («обратных»): only with «После 3 дней узнавания» and both directions. */
  reverse: number;
}

export function queueNew(queue: readonly Pick<PlanItem, "isNew" | "direction">[], plan: Pick<StudyPlan, "ru_fr">, direction?: Direction): QueueNew {
  const split = plan.ru_fr === "after" && direction !== "ru_fr";
  let fresh = 0;
  let reverse = 0;
  for (const item of queue) {
    if (!item.isNew) continue;
    if (split && item.direction === "ru_fr") reverse++;
    else fresh++;
  }
  return { fresh, reverse };
}

/** The summary button's name: «План на сегодня: 27 к повторению, 4 новых, 6 обратных». */
export const summaryAria = (parts: readonly string[]) => `План на сегодня: ${parts.join(", ")}`;

/** New words are held back today (a backlog, the load, accuracy) and the override is not on. */
export function planHeld(day: Pick<DayPlan, "override" | "reason">): boolean {
  return !day.override && (day.reason === "backlog" || day.reason === "load" || day.reason === "accuracy");
}

/** One part of the reason subline: a muted text, then an ink value. */
export interface SublinePart {
  text: string;
  value?: string;
}

/**
 * The reason subline under the progress line, only while new words are held back (null
 * otherwise): «Новых 4 из 10 · точность за неделю 74 %», «Новых 4 из 10 · много повторений на
 * неделе», «Отложено 140 · новые на паузе». Sentence case (phones set it in capitals).
 */
export function sublineParts(day: DayPlan): SublinePart[] | null {
  if (!planHeld(day)) return null;
  if (day.reason === "backlog") return [{ text: "Отложено", value: String(day.deferred) }, { text: "новые на паузе" }];
  const fresh = { text: "Новых", value: `${day.budget} из ${day.ceiling}` };
  if (day.reason === "accuracy") return [fresh, { text: "точность за неделю", value: formatPercent(day.accuracy7) }];
  return [fresh, { text: "много повторений на неделе" }];
}

/** New words (cards with «Назавтра») of the library the budget can still draw on, every theme. */
const availableNew = (day: DayPlan, plan: Pick<StudyPlan, "ru_fr">) => (countsCards(plan) ? day.available.fr + day.available.ru : day.available.fr);

/** «Новых слов 4 из 10»: today's new words (introduced plus still to come), never above the day's number. */
export function newWordsToday(day: DayPlan, plan: Pick<StudyPlan, "ru_fr">): number {
  return Math.min(day.budget, day.newToday + availableNew(day, plan));
}

/** «Обратных сторон 6»: RU→FR sides introduced today plus the ones still allowed and unlocked. */
export function reverseToday(day: DayPlan): number {
  return day.ruToday + Math.min(day.ruLeft, day.available.ru);
}

/** The sheet's reason line, or null on a normal day and once «Всё равно добавить новые» is on. */
export function reasonLine(day: DayPlan, plan: Pick<StudyPlan, "ru_fr">): string | null {
  if (day.override) return null;
  switch (day.reason) {
    case "backlog":
      return `Повторений больше, чем помещается в день: ${day.deferred} — на завтра. Новые на паузе.`;
    case "load":
      return "На неделе много повторений — новых сегодня меньше.";
    case "accuracy":
      return `Точность за неделю ${formatPercent(day.accuracy7)} — новых сегодня меньше.`;
    case "empty": {
      const left = availableNew(day, plan);
      if (left === 0) return countsCards(plan) ? "Новых карточек в библиотеке больше нет." : "Новых слов в библиотеке больше нет.";
      return `Новых ${countsCards(plan) ? "карточек" : "слов"} в библиотеке осталось ${left}.`;
    }
    default:
      return null;
  }
}

/** «Всё равно добавить новые» would add something: the day is below the ceiling and the library has new ones. */
export function overrideOffered(day: DayPlan, plan: Pick<StudyPlan, "ru_fr">): boolean {
  return day.canOverride && availableNew(day, plan) > 0;
}

/** The phone plan sheet's day strip: its parts in order, the mono labels and the full name. */
export interface DayStrip {
  /** К повторению: one ink bar. */
  due: number;
  /** New-word (or card, with «Назавтра») slots: the day's ceiling. */
  slots: number;
  /** Today's new words in those slots (introduced plus still to come). */
  fresh: number;
  /** Обратных сторон, only with «После 3 дней узнавания». */
  reverse: number;
  /** Отложено: after the cap rule, only when some are. */
  deferred: number;
  /** «ПОВТ. 27», «НОВ. 4/10», «ОБР. 6», «ОТЛ. 140» (shown parts only). */
  parts: { key: string; text: string; value: string }[];
  /** «К повторению 27, новых слов 4 из 10, обратных сторон 6, отложено 140». */
  label: string;
}

export function dayStrip({ due, day, plan }: { due: number; day: DayPlan; plan: StudyPlan }): DayStrip {
  const fresh = newWordsToday(day, plan);
  const reverse = plan.ru_fr === "after" ? reverseToday(day) : 0;
  // Zero parts are left off the line (the new slots always show: they carry the day's number);
  // the accessible name keeps every number.
  const parts = [
    ...(due > 0 ? [{ key: "due", text: "Повт.", value: String(due) }] : []),
    { key: "new", text: "Нов.", value: `${fresh}/${day.ceiling}` },
  ];
  const label = [`К повторению ${due}`, `${countsCards(plan) ? "новых карточек" : "новых слов"} ${fresh} из ${day.ceiling}`];
  if (plan.ru_fr === "after") {
    if (reverse > 0) parts.push({ key: "reverse", text: "Обр.", value: String(reverse) });
    label.push(`обратных сторон ${reverse}`);
  }
  if (day.deferred > 0) {
    parts.push({ key: "deferred", text: "Отл.", value: String(day.deferred) });
    label.push(`отложено ${day.deferred}`);
  }
  return { due, slots: day.ceiling, fresh, reverse, deferred: day.deferred, parts, label: label.join(", ") };
}

/** «Ждут 3 карточки» (the wait screen's summary). */
export function waitingSummary(n: number): string {
  // The verb agrees with the noun's form: «Ждёт 21 карточка», «Ждут 11 карточек».
  return `${pluralRu(n, ["Ждёт", "Ждут", "Ждут"])} ${n} ${pluralRu(n, CARD_FORMS)}`;
}

/** «Ещё 3 карточки» (the wait screen's headline, before «— через 12 мин»). */
export const moreCards = (n: number) => `Ещё ${n} ${pluralRu(n, CARD_FORMS)}`;

/** «ещё 3 карточки» (the phone wait screen's headline, after «Через 12 мин —»). */
export const waitTitle = (n: number) => `ещё ${n} ${pluralRu(n, CARD_FORMS)}`;

export interface ReturnAxis {
  /** The axis length in ms: 1, 2, 4, 8, 16 or 24 h. */
  span: number;
  /** Four labels at 1/4 … 1 of the span: «15», «30», «45», «60 мин» / «1 ч» … «4 ч». */
  marks: { at: number; label: string }[];
}

const AXIS_SPANS_MIN = [60, 120, 240, 480, 960, 1440];

/**
 * The wait screen's return timeline: the shortest axis that holds the last waiting card (`ms`
 * from the axis start), labelled in minutes up to 2 h and in hours beyond.
 */
export function returnAxis(ms: number): ReturnAxis {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  const span = AXIS_SPANS_MIN.find((s) => s >= minutes) ?? AXIS_SPANS_MIN[AXIS_SPANS_MIN.length - 1];
  const marks = [1, 2, 3, 4].map((q) => {
    const m = (span * q) / 4;
    const label = span <= 120 ? (q === 4 ? `${m} мин` : String(m)) : `${String(m / 60).replace(".", ",")} ч`;
    return { at: q / 4, label };
  });
  return { span: span * 60_000, marks };
}

/** Waiting cards on the axis, soonest first: cards due within the same 2 % of the axis share a mark. */
export function returnGroups(dues: readonly number[], start: number, span: number): { due: number; at: number; count: number }[] {
  const groups: { due: number; at: number; count: number }[] = [];
  for (const due of [...dues].sort((a, b) => a - b)) {
    const at = Math.min(1, Math.max(0, (due - start) / span));
    const last = groups[groups.length - 1];
    if (last && at - last.at < 0.02) last.count += 1;
    else groups.push({ due, at, count: 1 });
  }
  return groups;
}

/** «12 мин», «1 ч 5 мин»: time until a waiting card is due, minutes rounded up (never «0 мин»). */
export function waitIn(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  if (minutes < 60) return `${minutes} мин`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

/**
 * Where the new cards sit on the progress line (0..1, D3 B ticks): the queue's new cards counted
 * from the cards already done today, out of the day's total.
 */
export function newTicks(queue: readonly Pick<PlanItem, "isNew">[], done: number, total: number): number[] {
  if (total <= 0) return [];
  const ticks: number[] = [];
  queue.forEach((item, i) => {
    if (item.isNew) ticks.push(Math.min(1, (done + i) / total));
  });
  return ticks;
}
