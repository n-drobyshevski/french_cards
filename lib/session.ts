// Daily review sessions: today's queue (due first, then new up to the daily limit), header counts,
// the end-of-session summary and practice rounds that never touch scheduling.
import { db } from "./db";
import { reviewStateId, type Rating } from "./scheduler";
import { getSettings } from "./settings";
import type { Direction, ReviewLog, ReviewState, Word } from "./types";

/** A study day starts at 04:00 local time, so late-night reviews count for the previous day. */
export const DAY_START_HOUR = 4;

export interface SessionFilter {
  /** undefined = all folders; null = «Входящие»; otherwise a folder id. */
  folderId?: string | null;
  /** undefined = both directions. */
  direction?: Direction;
}

export interface QueueItem {
  /** review_state id: `${word_id}:${direction}` */
  key: string;
  word: Word;
  state: ReviewState;
  direction: Direction;
  isNew: boolean;
}

export interface SessionCounts {
  /** Cards still due today (review + learning), including ones due later today. */
  due: number;
  /** New cards still allowed today. */
  new: number;
  /** Reviews logged today (undone reviews excluded). */
  done: number;
  /**
   * done + queued cards not yet reviewed today — the denominator of `07 / 30`. A card that comes
   * back later today (learning step) is not counted again until it is actually reviewed, so the
   * header stays steady while studying.
   */
  total: number;
}

export interface Session {
  queue: QueueItem[];
  counts: SessionCounts;
}

export function startOfStudyDay(now: Date = new Date()): Date {
  const d = new Date(now);
  if (d.getHours() < DAY_START_HOUR) d.setDate(d.getDate() - 1);
  d.setHours(DAY_START_HOUR, 0, 0, 0);
  return d;
}

export function endOfStudyDay(now: Date = new Date()): Date {
  const d = startOfStudyDay(now);
  d.setDate(d.getDate() + 1);
  return d;
}

const ms = (iso: string) => Date.parse(iso);

/** Live words matching the folder filter. Words whose folder is gone count as «Входящие». */
async function liveWords(filter: SessionFilter): Promise<Map<string, Word>> {
  let match: (w: Word) => boolean = () => true;
  if (filter.folderId === null) {
    const live = new Set((await db.folders.filter((f) => f.deleted_at === null).toArray()).map((f) => f.id));
    match = (w) => w.folder_id === null || !live.has(w.folder_id);
  } else if (filter.folderId !== undefined) {
    match = (w) => w.folder_id === filter.folderId;
  }
  const words = await db.words.filter((w) => w.deleted_at === null && match(w)).toArray();
  return new Map(words.map((w) => [w.id, w]));
}

/** Live review-log rows reviewed in [from, to). */
async function logsBetween(from: Date, to: Date): Promise<ReviewLog[]> {
  const rows = await db.review_log.where("review").between(from.toISOString(), to.toISOString(), true, false).toArray();
  return rows.filter((l) => l.deleted_at === null);
}

/** Cards (word+direction) introduced today: their first review today was from state New. */
function newIntroduced(logs: readonly ReviewLog[]): Set<string> {
  return new Set(logs.filter((l) => l.state === 0).map((l) => reviewStateId(l.word_id, l.direction)));
}

/**
 * Today's queue and header counts in one read (use it inside useLiveQuery).
 *
 * Order: cards due by now (oldest due first, review cards due later today included), then new
 * cards (oldest words first) up to `settings.new_per_day` minus those already introduced today
 * (counted across all folders/directions), then learning cards waiting for their next step.
 * A new ru_fr card is held back until the word's fr_ru card has been learned on an earlier day,
 * unless the session is filtered to ru_fr only.
 */
export async function loadSession(filter: SessionFilter = {}, now: Date = new Date()): Promise<Session> {
  const settings = await getSettings();
  const dayStart = startOfStudyDay(now);
  const dayEnd = endOfStudyDay(now);
  const t = now.getTime();

  const [words, states, todayLogs] = await Promise.all([
    liveWords(filter),
    db.review_state.filter((s) => s.deleted_at === null).toArray(),
    logsBetween(dayStart, dayEnd),
  ]);

  const byKey = new Map(states.map((s) => [s.id, s]));
  const introducedToday = newIntroduced(todayLogs);
  const reviewedToday = new Set(todayLogs.map((l) => reviewStateId(l.word_id, l.direction)));

  const dueNow: QueueItem[] = [];
  const learningLater: QueueItem[] = [];
  const fresh: QueueItem[] = [];

  for (const state of states) {
    const word = words.get(state.word_id);
    if (!word) continue;
    if (filter.direction && state.direction !== filter.direction) continue;
    const item: QueueItem = { key: state.id, word, state, direction: state.direction, isNew: state.state === 0 };
    if (state.state === 0) {
      if (state.direction === "ru_fr" && filter.direction !== "ru_fr") {
        const siblingKey = reviewStateId(state.word_id, "fr_ru");
        const sibling = byKey.get(siblingKey);
        if (sibling && (sibling.state === 0 || reviewedToday.has(siblingKey))) continue;
      }
      fresh.push(item);
      continue;
    }
    const due = ms(state.due);
    if (due <= t || (state.state === 2 && due < dayEnd.getTime())) dueNow.push(item);
    else if (due < dayEnd.getTime()) learningLater.push(item);
  }

  const byDue = (a: QueueItem, b: QueueItem) => ms(a.state.due) - ms(b.state.due);
  dueNow.sort(byDue);
  learningLater.sort(byDue);
  fresh.sort(
    (a, b) =>
      a.word.created_at.localeCompare(b.word.created_at) ||
      a.word.id.localeCompare(b.word.id) ||
      (a.direction === b.direction ? 0 : a.direction === "fr_ru" ? -1 : 1),
  );

  const allowance = Math.max(0, settings.new_per_day - introducedToday.size);
  const newCards = fresh.slice(0, allowance);
  const queue = [...dueNow, ...newCards, ...learningLater];

  const done = todayLogs.filter((l) => {
    const w = words.get(l.word_id);
    return !!w && (!filter.direction || l.direction === filter.direction);
  }).length;
  const due = dueNow.length + learningLater.length;
  const pending = queue.filter((item) => !reviewedToday.has(item.key)).length;
  return { queue, counts: { due, new: newCards.length, done, total: done + pending } };
}

export async function buildQueue(filter: SessionFilter = {}, now: Date = new Date()): Promise<QueueItem[]> {
  return (await loadSession(filter, now)).queue;
}

export async function getSessionCounts(filter: SessionFilter = {}, now: Date = new Date()): Promise<SessionCounts> {
  return (await loadSession(filter, now)).counts;
}

export interface DaySummary {
  /** Reviews today. */
  reviewed: number;
  /** Cards seen for the first time today. */
  newCount: number;
  /** Share (0..1) of reviews that were not «Не знаю»; null when nothing was reviewed. */
  correctRate: number | null;
  /** Words graded «Не знаю» or «Сложно» today, most recent first. */
  hardWords: Word[];
  /** Cards graded «Не знаю» today — the size of «Повторить ошибки (N)». */
  mistakes: number;
  /** Non-new cards due during the next study day («Следующие 18 слов — завтра»). */
  dueTomorrow: number;
}

/** Numbers for the «Готово на сегодня» screen. */
export async function getDaySummary(filter: SessionFilter = {}, now: Date = new Date()): Promise<DaySummary> {
  const dayEnd = endOfStudyDay(now);
  const nextEnd = new Date(dayEnd);
  nextEnd.setDate(nextEnd.getDate() + 1);
  const [words, logs, states] = await Promise.all([
    liveWords(filter),
    logsBetween(startOfStudyDay(now), dayEnd),
    db.review_state.filter((s) => s.deleted_at === null && s.state !== 0).toArray(),
  ]);
  const mine = logs
    .filter((l) => words.has(l.word_id) && (!filter.direction || l.direction === filter.direction))
    .sort((a, b) => b.review.localeCompare(a.review));
  const hardIds: string[] = [];
  for (const l of mine) if (l.rating <= 2 && !hardIds.includes(l.word_id)) hardIds.push(l.word_id);
  const failedCards = new Set(mine.filter((l) => l.rating === 1).map((l) => reviewStateId(l.word_id, l.direction)));
  const dueTomorrow = states.filter((s) => {
    if (!words.has(s.word_id) || (filter.direction && s.direction !== filter.direction)) return false;
    const due = ms(s.due);
    return due >= dayEnd.getTime() && due < nextEnd.getTime();
  }).length;
  return {
    reviewed: mine.length,
    newCount: newIntroduced(mine).size,
    correctRate: mine.length ? mine.filter((l) => l.rating > 1).length / mine.length : null,
    hardWords: hardIds.map((id) => words.get(id)!),
    mistakes: failedCards.size,
    dueTomorrow,
  };
}

export interface PracticeOptions extends SessionFilter {
  /** "today": cards failed today («Повторить ошибки»). "recent": failed/hard in the last `days`, topped up with the weakest cards («Ещё практика»). */
  scope?: "today" | "recent";
  days?: number;
  limit?: number;
}

/**
 * Practice queue. Grading in practice must NOT call gradeCard — keep the queue in memory and
 * advance it with `advancePractice`.
 */
export async function buildPracticeQueue(opts: PracticeOptions = {}, now: Date = new Date()): Promise<QueueItem[]> {
  const scope = opts.scope ?? "recent";
  const limit = opts.limit ?? 20;
  const days = opts.days ?? 7;
  const from = scope === "today" ? startOfStudyDay(now) : new Date(now.getTime() - days * 86_400_000);
  const [words, states, logs] = await Promise.all([
    liveWords(opts),
    db.review_state.filter((s) => s.deleted_at === null).toArray(),
    logsBetween(from, new Date(now.getTime() + 1)),
  ]);
  const byKey = new Map(states.map((s) => [s.id, s]));
  const items: QueueItem[] = [];
  const seen = new Set<string>();
  const push = (state: ReviewState | undefined) => {
    if (!state || seen.has(state.id) || items.length >= limit) return;
    const word = words.get(state.word_id);
    if (!word || (opts.direction && state.direction !== opts.direction)) return;
    seen.add(state.id);
    items.push({ key: state.id, word, state, direction: state.direction, isNew: state.state === 0 });
  };

  const maxRating = scope === "today" ? 1 : 2;
  const misses = logs.filter((l) => l.rating <= maxRating).sort((a, b) => b.review.localeCompare(a.review));
  for (const l of misses) push(byKey.get(reviewStateId(l.word_id, l.direction)));

  if (scope === "recent") {
    const weakest = states
      .filter((s) => s.state !== 0 && !seen.has(s.id))
      .sort((a, b) => b.lapses - a.lapses || a.stability - b.stability || b.difficulty - a.difficulty);
    for (const s of weakest) push(s);
  }
  return items;
}

/**
 * Next practice queue after answering its head. «Не знаю» brings the card back after
 * 3 others, «Сложно» puts it at the end, «Знаю»/Easy drops it. Never writes to the db.
 */
export function advancePractice<T>(queue: readonly T[], rating: Rating): T[] {
  if (queue.length === 0) return [];
  const [head, ...rest] = queue;
  if (rating === 1) {
    const at = Math.min(3, rest.length);
    return [...rest.slice(0, at), head, ...rest.slice(at)];
  }
  if (rating === 2) return [...rest, head];
  return rest;
}
