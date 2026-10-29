// Practice rounds that never write the schedule: which cards a round takes (`practiceQueue`, used
// by lib/session.ts on the device and by the connector's cards page) and the queue arithmetic
// shared by review practice (lib/session.ts re-exports it) and «Упражнения» (lib/core/exercises.ts).
// Pure: no Dexie, no ts-fsrs, no clock.
import type { Direction, ReviewLog, ReviewState, Word } from "../types";
import type { PlanItem } from "./plan";

/** Again, Hard, Good, Easy (the same numbers as lib/scheduler `Rating`). */
export type PracticeRating = 1 | 2 | 3 | 4;

/**
 * Next practice queue after answering its head. «Не знаю» brings the card back after
 * 3 others, «Сложно» puts it at the end, «Знаю»/Easy drops it. Never writes to the db.
 */
export function advancePractice<T>(queue: readonly T[], rating: PracticeRating): T[] {
  if (queue.length === 0) return [];
  const [head, ...rest] = queue;
  if (rating === 1) {
    const at = Math.min(3, rest.length);
    return [...rest.slice(0, at), head, ...rest.slice(at)];
  }
  if (rating === 2) return [...rest, head];
  return rest;
}

/**
 * "today": cards failed today («Повторить ошибки»). "recent": failed/hard in the last
 * `PRACTICE_DAYS`, topped up with the weakest cards («Ещё практика»). "all": every card of the
 * words in random order, new ones included («Тренировка всей темы»).
 */
export type PracticeScope = "today" | "recent" | "all";

/** Default round size for "today" and "recent". */
export const PRACTICE_LIMIT = 20;
/** Cap for «Тренировка всей темы»: a round should stay finishable. */
export const PRACTICE_ALL_MAX = 200;
/** How far back "recent" looks for misses, in days. */
export const PRACTICE_DAYS = 7;

export interface PracticeQueueInput {
  scope: PracticeScope;
  /** The words of the round (matching the filter, not «на паузе»), by id. Cards of other words are skipped. */
  words: ReadonlyMap<string, Word>;
  /** Cards; tombstones are skipped. */
  states: readonly ReviewState[];
  /** Review logs of the window; tombstones (undone reviews) are skipped. Unused by "all". */
  logs: readonly ReviewLog[];
  /** Start of the window (the study day's start for "today"): logs reviewed before it are skipped. */
  from?: Date;
  /** Default PRACTICE_LIMIT; "all" defaults to PRACTICE_ALL_MAX. */
  limit?: number;
  /** One side only; undefined = both. */
  direction?: Direction;
  /** "all" shuffles with it: Math.random by default. */
  random?: () => number;
}

const item = (word: Word, state: ReviewState): PlanItem => ({ key: state.id, word, state, direction: state.direction, isNew: state.state === 0 });

/**
 * The cards of a practice round, in the order they are shown. "today" and "recent" take the most
 * recent misses first (rating 1 today; 1 or 2 in the window), "recent" then tops up with the
 * weakest learned cards (lapses, then low stability, then high difficulty); "all" shuffles every
 * card (Fisher–Yates). Grading the round must not write anything: advance it with `advancePractice`.
 */
export function practiceQueue(input: PracticeQueueInput): PlanItem[] {
  const { scope, words, direction } = input;
  const states = input.states.filter((s) => s.deleted_at === null);
  if (scope === "all") {
    const items = states.filter((s) => words.has(s.word_id) && (!direction || s.direction === direction)).map((s) => item(words.get(s.word_id)!, s));
    const random = input.random ?? Math.random;
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items.slice(0, input.limit ?? PRACTICE_ALL_MAX);
  }
  const limit = input.limit ?? PRACTICE_LIMIT;
  const from = input.from?.getTime() ?? -Infinity;
  const byKey = new Map(states.map((s) => [s.id, s]));
  const items: PlanItem[] = [];
  const seen = new Set<string>();
  const push = (state: ReviewState | undefined) => {
    if (!state || seen.has(state.id) || items.length >= limit) return;
    const word = words.get(state.word_id);
    if (!word || (direction && state.direction !== direction)) return;
    seen.add(state.id);
    items.push(item(word, state));
  };

  const maxRating = scope === "today" ? 1 : 2;
  const misses = input.logs
    .filter((l) => l.deleted_at === null && l.rating <= maxRating && Date.parse(l.review) >= from)
    .sort((a, b) => b.review.localeCompare(a.review));
  for (const l of misses) push(byKey.get(`${l.word_id}:${l.direction}`));

  if (scope === "recent") {
    const weakest = states
      .filter((s) => s.state !== 0 && !seen.has(s.id))
      .sort((a, b) => b.lapses - a.lapses || a.stability - b.stability || b.difficulty - a.difficulty);
    for (const s of weakest) push(s);
  }
  return items;
}
