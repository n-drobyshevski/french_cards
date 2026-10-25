// «Прогресс»: pure rules for the per-day history (no Dexie, no clock: `now`, the rows and the
// study-day hour are passed in). lib/progress.ts reads the tables, stores one `progress_days` row per
// finished study day and builds the screen's numbers from these helpers.
//
// Word scale. Every count is in words, partitioned like the library stats (lib/folders.ts):
//   paused   — «на паузе» (`isPaused`: the word or its live theme muted). Counted only here.
//   known    — wordStatus "known": every card a review card with stability ≥ 21 d («знаю»).
//   fresh    — wordStatus "new": no card reviewed yet («новых»).
//   learning — the rest («учу»), `difficult` (wordStatus "difficult", «трудных») among them.
//   total    = known + learning + fresh + paused.
//   memorized («помню ≈») — Σ over unpaused words of the mean retrievability of their cards (a new
//   card counts 0), so a word learned in one direction of two adds ≈ 0.45.
//
// Replay (`replayCounts`) rebuilds past days from review_log: for each card the last live log
// before the day's end gives the stability and difficulty after that review, and the state after it
// is the next log's `prev` (or the current review_state when there is no later log). Approximation:
// «на паузе» always uses the CURRENT muted flags of words and themes (they keep no history).
import { cardStatus, forgettingCurve, wordStatus } from "../scheduler";
import type { Direction, ExerciseRun, ReviewLog, ReviewState, Word } from "../types";
import { directionsOf, isPaused } from "./words";

/** Same as DAY_START_HOUR in lib/session.ts (which pulls in Dexie, so it can't be imported here). */
export const STUDY_DAY_START_HOUR = 4;

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------------------------
// Study days

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" of the study day `date` falls in (local time; before 04:00 = the previous day). */
export function dayKey(date: Date | string | number, startHour = STUDY_DAY_START_HOUR): string {
  const d = new Date(date);
  if (d.getHours() < startHour) d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseKey(key: string): [number, number, number] {
  const [y, m, d] = key.split("-").map(Number);
  return [y, m, d];
}

/** When the study day `key` starts: 04:00 local on that date (DST-safe: built from the wall clock). */
export function dayStartOf(key: string, startHour = STUDY_DAY_START_HOUR): Date {
  const [y, m, d] = parseKey(key);
  return new Date(y, m - 1, d, startHour, 0, 0, 0);
}

/** When the study day `key` ends: 04:00 local the next calendar day (23 or 25 h on DST days). */
export function dayEndOf(key: string, startHour = STUDY_DAY_START_HOUR): Date {
  const end = dayStartOf(key, startHour);
  end.setDate(end.getDate() + 1);
  end.setHours(startHour, 0, 0, 0);
  return end;
}

/** The day key `n` calendar days after `key` (calendar arithmetic, no clock or zone involved). */
export function addDays(key: string, n: number): string {
  const [y, m, d] = parseKey(key);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Every day key from `from` to `to`, both included, ascending ([] when from > to). */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let k = from; k <= to; k = addDays(k, 1)) out.push(k);
  return out;
}

/** Monday of the week (Mon–Sun) holding `key`. */
export function weekStartOf(key: string): string {
  const [y, m, d] = parseKey(key);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(key, -((dow + 6) % 7));
}

/** "YYYY-MM" of a day key. */
export const monthOf = (key: string) => key.slice(0, 7);

// ---------------------------------------------------------------------------------------------
// Retrievability

/**
 * FSRS probability of recall at `at` for a card last reviewed at `lastReview` with `stability`
 * (days, after that review), with fractional days. 0 without a review or stability.
 */
export function retrievabilityAt(stability: number, lastReview: string | Date | number | null, at: Date | number): number {
  if (lastReview === null || !(stability > 0)) return 0;
  const last = lastReview instanceof Date ? lastReview.getTime() : typeof lastReview === "number" ? lastReview : Date.parse(lastReview);
  if (Number.isNaN(last)) return 0;
  const t = (typeof at === "number" ? at : at.getTime()) - last;
  return forgettingCurve(Math.max(0, t) / DAY_MS, stability);
}

// ---------------------------------------------------------------------------------------------
// Counts

export interface DayCounts {
  known: number;
  learning: number;
  fresh: number;
  difficult: number;
  paused: number;
  total: number;
  /** «помню ≈»: a float, see the file header. */
  memorized: number;
}

export const emptyCounts = (): DayCounts => ({ known: 0, learning: 0, fresh: 0, difficult: 0, paused: 0, total: 0, memorized: 0 });

type StatusInput = Parameters<typeof cardStatus>[0];

function tally(counts: DayCounts, paused: boolean, cards: readonly StatusInput[], memory: number): void {
  counts.total++;
  if (paused) {
    counts.paused++;
    return;
  }
  const status = wordStatus(cards);
  if (status === "known") counts.known++;
  else if (status === "new") counts.fresh++;
  else {
    counts.learning++;
    if (status === "difficult") counts.difficult++;
  }
  counts.memorized += memory;
}

/**
 * Counts of the library as it is now: live `words`, live `states`, the live themes «на паузе»;
 * retrievability at `at`.
 */
export function countsFromStates(
  words: readonly Word[],
  states: readonly ReviewState[],
  pausedFolderIds: ReadonlySet<string>,
  at: Date,
): DayCounts {
  const byWord = new Map<string, ReviewState[]>();
  for (const s of states) {
    if (s.deleted_at !== null) continue;
    const list = byWord.get(s.word_id);
    if (list) list.push(s);
    else byWord.set(s.word_id, [s]);
  }
  const counts = emptyCounts();
  for (const w of words) {
    if (w.deleted_at !== null) continue;
    const cards = byWord.get(w.id) ?? [];
    let r = 0;
    for (const c of cards) if (c.state !== 0) r += retrievabilityAt(c.stability, c.last_review, at);
    tally(counts, isPaused(w, pausedFolderIds), cards, cards.length ? r / cards.length : 0);
  }
  return counts;
}

export interface ReplayInput {
  /** Day keys to rebuild, any order. */
  days: readonly string[];
  /** Every word, deleted ones included (created_at / deleted_at decide which days they count on). */
  words: readonly Word[];
  /** Every review card, deleted ones included (the state after a card's last log). */
  states: readonly ReviewState[];
  /** review_log rows; tombstones are ignored. */
  logs: readonly ReviewLog[];
  /** The live themes «на паузе» now (see the file header). */
  pausedFolderIds: ReadonlySet<string>;
  startHour?: number;
}

const cardKey = (wordId: string, direction: Direction) => `${wordId}:${direction}`;

interface TimedLog {
  log: ReviewLog;
  at: number;
}

type CardSnapshot = Pick<ReviewState, "state" | "reps" | "lapses">;

/** The state after `last` when nothing later says it (no next log, and the card was reset since). */
function derivedAfter(last: ReviewLog, logsSoFar: number, lapsesSoFar: number): CardSnapshot {
  const lapsed = last.rating === 1 && (last.state === 2 || last.state === 3);
  const state: ReviewState["state"] = lapsed ? 3 : last.rating === 1 ? 1 : last.scheduled_days >= 1 ? 2 : 1;
  return { state, reps: logsSoFar, lapses: lapsesSoFar };
}

/** End-of-day counts for each of `days`, rebuilt from the log (see the file header). */
export function replayCounts(input: ReplayInput): Map<string, DayCounts> {
  const hour = input.startHour ?? STUDY_DAY_START_HOUR;
  const byCard = new Map<string, TimedLog[]>();
  const loggedDirs = new Map<string, Set<Direction>>();
  for (const log of input.logs) {
    if (log.deleted_at !== null) continue;
    const at = Date.parse(log.review);
    if (Number.isNaN(at)) continue;
    const key = cardKey(log.word_id, log.direction);
    const list = byCard.get(key);
    if (list) list.push({ log, at });
    else byCard.set(key, [{ log, at }]);
    let dirs = loggedDirs.get(log.word_id);
    if (!dirs) loggedDirs.set(log.word_id, (dirs = new Set()));
    dirs.add(log.direction);
  }
  for (const list of byCard.values()) list.sort((a, b) => a.at - b.at);

  // Current card rows: a live one wins over a tombstone with the same id.
  const current = new Map<string, ReviewState>();
  for (const s of input.states) {
    const seen = current.get(s.id);
    if (!seen || (seen.deleted_at !== null && s.deleted_at === null)) current.set(s.id, s);
  }

  interface Card {
    key: string;
    logs: TimedLog[];
    /** Logs before the current day's end. */
    p: number;
    lapses: number;
  }
  const words = input.words
    .map((w) => {
      const created = Date.parse(w.created_at);
      const deleted = w.deleted_at === null ? Infinity : Date.parse(w.deleted_at);
      const dirs = new Set<Direction>([...directionsOf(w), ...(loggedDirs.get(w.id) ?? [])]);
      const cards: Card[] = [...dirs].map((d) => {
        const key = cardKey(w.id, d);
        return { key, logs: byCard.get(key) ?? [], p: 0, lapses: 0 };
      });
      return { word: w, created, deleted, paused: isPaused(w, input.pausedFolderIds), cards };
    })
    .filter((w) => !Number.isNaN(w.created));

  const out = new Map<string, DayCounts>();
  const days = [...new Set(input.days)].sort();
  for (const day of days) {
    const end = dayEndOf(day, hour).getTime();
    const counts = emptyCounts();
    for (const w of words) {
      if (!(w.created < end) || !(w.deleted >= end)) continue;
      const cards: StatusInput[] = [];
      let r = 0;
      for (const c of w.cards) {
        while (c.p < c.logs.length && c.logs[c.p].at < end) {
          const l = c.logs[c.p].log;
          if (l.rating === 1 && (l.state === 2 || l.state === 3)) c.lapses++;
          c.p++;
        }
        const now = current.get(c.key);
        // A card retired while its word stayed (its direction turned off): gone from then on.
        if (now && now.deleted_at !== null && Date.parse(now.deleted_at) < end) continue;
        if (c.p === 0) {
          // Before its first log the card is as it came: new, or carried over with no log (Anki import).
          const base = c.logs.length ? c.logs[0].log.prev : now;
          if (base && base.state !== 0) {
            cards.push(base);
            r += retrievabilityAt(base.stability, base.last_review, end);
          } else cards.push({ state: 0, stability: 0, difficulty: 0, lapses: 0, reps: 0 });
          continue;
        }
        const last = c.logs[c.p - 1];
        // The state after `last`: the next log's snapshot, else the current card. A New one there
        // means the card was reset since (its `due` is the reset time): New from then on, before
        // that only the log itself to go by.
        const known = c.p < c.logs.length ? c.logs[c.p].log.prev : now;
        if (known && known.state === 0 && Date.parse(known.due) < end) {
          cards.push({ state: 0, stability: 0, difficulty: 0, lapses: 0, reps: 0 });
          continue;
        }
        const after: CardSnapshot = known && known.state !== 0 ? known : derivedAfter(last.log, c.p, c.lapses);
        cards.push({ state: after.state, stability: last.log.stability, difficulty: last.log.difficulty, lapses: after.lapses, reps: after.reps });
        if (after.state !== 0) r += retrievabilityAt(last.log.stability, last.at, end);
      }
      tally(counts, w.paused, cards, cards.length ? r / cards.length : 0);
    }
    out.set(day, counts);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Activity

export interface DayActivity {
  /** Live review_log rows. */
  reviews: number;
  /** Of those, «Не знаю». */
  again: number;
  /** Cards seen for the first time (a log from state New), as on the done screen. */
  new_introduced: number;
  /**
   * New words in plan units («Новых слов в день»): FR→RU words seen for the first time; in the
   * plan's "together" mode new cards of both directions, as the plan counts them (`newWordKey`).
   * Derived from the log, never stored.
   */
  new_words: number;
  /** Words created that day, later-deleted ones included. */
  added: number;
  /** Exercise runs finished that day. */
  exercises: number;
  /** Words graded «Не знаю» that day, the latest first, each once. */
  mistakes: string[];
}

export const emptyActivity = (): DayActivity => ({ reviews: 0, again: 0, new_introduced: 0, new_words: 0, added: 0, exercises: 0, mistakes: [] });

/**
 * What a log counts as in the plan's units of new words (lib/core/plan.ts `planDay`: `newToday`):
 * a log from state New of a FR→RU card is that word; in "together" mode (`together`) any new card
 * counts, by card. null for any other log.
 */
export function newWordKey(log: Pick<ReviewLog, "word_id" | "direction" | "state">, together: boolean): string | null {
  if (log.state !== 0) return null;
  if (together) return cardKey(log.word_id, log.direction);
  return log.direction === "fr_ru" ? log.word_id : null;
}

/** A day counts for the streak and the calendar with a review or a finished exercise run. */
export const isActive = (a: Pick<DayActivity, "reviews" | "exercises">) => a.reviews > 0 || a.exercises > 0;

export interface ActivityInput {
  logs: readonly ReviewLog[];
  words?: readonly Pick<Word, "created_at">[];
  runs?: readonly Pick<ExerciseRun, "finished_at" | "deleted_at">[];
  startHour?: number;
  /** The plan's RU→FR mode is "together": `new_words` counts new cards of both directions. */
  together?: boolean;
}

/** What happened on each study day, keyed by day; days without anything are absent. */
export function activityByDay({ logs, words = [], runs = [], startHour = STUDY_DAY_START_HOUR, together = false }: ActivityInput): Map<string, DayActivity> {
  const out = new Map<string, DayActivity>();
  const of = (key: string) => {
    let a = out.get(key);
    if (!a) out.set(key, (a = emptyActivity()));
    return a;
  };
  const live = logs.filter((l) => l.deleted_at === null && !Number.isNaN(Date.parse(l.review)));
  const newCards = new Map<string, Set<string>>();
  const newWords = new Map<string, Set<string>>();
  const misses = new Map<string, ReviewLog[]>();
  for (const l of live) {
    const key = dayKey(l.review, startHour);
    const a = of(key);
    a.reviews++;
    if (l.rating === 1) {
      a.again++;
      const list = misses.get(key);
      if (list) list.push(l);
      else misses.set(key, [l]);
    }
    if (l.state === 0) {
      let set = newCards.get(key);
      if (!set) newCards.set(key, (set = new Set()));
      set.add(cardKey(l.word_id, l.direction));
    }
    const nw = newWordKey(l, together);
    if (nw !== null) {
      let set = newWords.get(key);
      if (!set) newWords.set(key, (set = new Set()));
      set.add(nw);
    }
  }
  for (const [key, set] of newCards) of(key).new_introduced = set.size;
  for (const [key, set] of newWords) of(key).new_words = set.size;
  for (const [key, list] of misses) {
    list.sort((a, b) => b.review.localeCompare(a.review));
    of(key).mistakes = [...new Set(list.map((l) => l.word_id))];
  }
  for (const w of words) if (!Number.isNaN(Date.parse(w.created_at))) of(dayKey(w.created_at, startHour)).added++;
  for (const r of runs) {
    if (r.deleted_at !== null || !r.finished_at || Number.isNaN(Date.parse(r.finished_at))) continue;
    of(dayKey(r.finished_at, startHour)).exercises++;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Retention («Верно»)

export interface RetentionCount {
  /** Reviews counted. */
  total: number;
  /** Of those, not «Не знаю». */
  passed: number;
}

export interface Retention extends RetentionCount {
  /** passed / total; null when nothing was counted. */
  rate: number | null;
  /** Cards whose stability before the review was under 21 days … */
  young: RetentionCount;
  /** … and at least 21 days. */
  mature: RetentionCount;
}

export interface MonthRetention extends Retention {
  /** "YYYY-MM". */
  month: string;
}

const MATURE_DAYS = 21;

/**
 * True retention: the first live log of each card on each study day, kept when the card came to
 * it as a review card (log state 2 Review or 3 Relearning). Learning steps and same-day repeats
 * after a miss never count. Returns the kept logs with their day keys.
 */
export function firstReviewsPerDay(logs: readonly ReviewLog[], startHour = STUDY_DAY_START_HOUR): { log: ReviewLog; day: string }[] {
  const first = new Map<string, { log: ReviewLog; day: string }>();
  for (const log of logs) {
    if (log.deleted_at !== null || Number.isNaN(Date.parse(log.review))) continue;
    const day = dayKey(log.review, startHour);
    const key = `${day}|${cardKey(log.word_id, log.direction)}`;
    const seen = first.get(key);
    if (!seen || log.review < seen.log.review) first.set(key, { log, day });
  }
  return [...first.values()].filter(({ log }) => log.state === 2 || log.state === 3);
}

/** Retention of logs already picked by `firstReviewsPerDay`. */
export function retentionOf(picked: readonly { log: ReviewLog }[]): Retention {
  const young: RetentionCount = { total: 0, passed: 0 };
  const mature: RetentionCount = { total: 0, passed: 0 };
  for (const { log } of picked) {
    const bucket = (log.prev?.stability ?? 0) >= MATURE_DAYS ? mature : young;
    bucket.total++;
    if (log.rating > 1) bucket.passed++;
  }
  const total = young.total + mature.total;
  const passed = young.passed + mature.passed;
  return { total, passed, rate: total ? passed / total : null, young, mature };
}

export interface RetentionSummary {
  /** Per calendar month of the study days, ascending; months without counted reviews are left out. */
  month: MonthRetention[];
  /** The 7 / 30 study days up to and including today. */
  last7: Retention;
  last30: Retention;
  /** The scheduler's request_retention (0.9). */
  target: number;
}

/** «Верно» per month and for the last 7 / 30 days. */
export function retentionSummary(logs: readonly ReviewLog[], todayKey: string, target: number, startHour = STUDY_DAY_START_HOUR): RetentionSummary {
  const picked = firstReviewsPerDay(logs, startHour);
  const months = new Map<string, { log: ReviewLog }[]>();
  for (const p of picked) {
    const m = monthOf(p.day);
    const list = months.get(m);
    if (list) list.push(p);
    else months.set(m, [p]);
  }
  const since = (n: number) => {
    const from = addDays(todayKey, -(n - 1));
    return retentionOf(picked.filter((p) => p.day >= from && p.day <= todayKey));
  };
  return {
    month: [...months.keys()].sort().map((month) => ({ month, ...retentionOf(months.get(month)!) })),
    last7: since(7),
    last30: since(30),
    target,
  };
}

// ---------------------------------------------------------------------------------------------
// Streaks

export interface Streaks {
  /** Active days in a row up to today (or up to yesterday while today has not been studied yet). */
  current: number;
  /** First day of the current streak; null when it is 0. */
  currentFrom: string | null;
  /** The longest run of active days ever (≥ current). */
  best: number;
  bestFrom: string | null;
  bestTo: string | null;
}

/** A day not yet studied today does not break the streak: it then counts on from yesterday. */
export function streaks(activeDayKeys: Iterable<string>, todayKey: string): Streaks {
  const set = new Set([...activeDayKeys].filter((k) => k <= todayKey));
  let current = 0;
  let d = set.has(todayKey) ? todayKey : addDays(todayKey, -1);
  while (set.has(d)) {
    current++;
    d = addDays(d, -1);
  }
  const currentFrom = current ? addDays(d, 1) : null;
  let best = 0;
  let bestFrom: string | null = null;
  let bestTo: string | null = null;
  let run = 0;
  let runFrom = "";
  let prev = "";
  for (const k of [...set].sort()) {
    if (run && addDays(prev, 1) === k) run++;
    else {
      run = 1;
      runFrom = k;
    }
    if (run > best) {
      best = run;
      bestFrom = runFrom;
      bestTo = k;
    }
    prev = k;
  }
  return { current, currentFrom, best, bestFrom, bestTo };
}

// ---------------------------------------------------------------------------------------------
// One day on the screen

export interface DayPoint extends DayCounts, Omit<DayActivity, "mistakes"> {
  /** "YYYY-MM-DD". */
  day: string;
  /** A review or a finished exercise run (`isActive`). */
  active: boolean;
  /** Share (0..1) of the day's reviews that were not «Не знаю»; null without reviews. */
  correct: number | null;
  /** today: computed now, not stored; live / replay: a stored row (ProgressDay.source). */
  source: "today" | "live" | "replay";
}

/** A screen point from end-of-day counts and the day's activity. */
export function dayPoint(day: string, counts: DayCounts, activity: Omit<DayActivity, "mistakes">, source: DayPoint["source"]): DayPoint {
  return {
    day,
    known: counts.known,
    learning: counts.learning,
    fresh: counts.fresh,
    difficult: counts.difficult,
    paused: counts.paused,
    total: counts.total,
    memorized: counts.memorized,
    reviews: activity.reviews,
    again: activity.again,
    new_introduced: activity.new_introduced,
    new_words: activity.new_words,
    added: activity.added,
    exercises: activity.exercises,
    active: isActive(activity),
    correct: activity.reviews ? (activity.reviews - activity.again) / activity.reviews : null,
    source,
  };
}
