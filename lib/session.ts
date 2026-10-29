// Daily review sessions: today's queue and header counts («План дня», planned by the pure
// lib/core/plan.ts `planDay` from the synced «План повторения»), the end-of-session summary and
// practice rounds that never touch scheduling.
import { daySnapshot, folderOrderOf, planDay, type DayPlan, type DayPlanSnapshot, type PlanCounts, type PlanItem } from "./core/plan";
import { PRACTICE_DAYS, practiceQueue, type PracticeScope } from "./core/practice";
import { dayKey } from "./core/progress";
import { isPaused, pausedFolderIds } from "./core/words";
import { db, liveRows } from "./db";
import { loadLevelData } from "./lexique";
import { retrievability, reviewStateId, wordStatus } from "./scheduler";
import type { Direction, ReviewLog, ReviewSetStatus, ReviewState, SlangLevel, Word } from "./types";
import { getStudyPlan, isNewOverrideOn, recordPlanDayAfterPull, type StudyPlan } from "./user-prefs";

/** A study day starts at 04:00 local time, so late-night reviews count for the previous day. */
export const DAY_START_HOUR = 4;

export interface SessionFilter {
  /** undefined = all folders; null = «Входящие»; otherwise a folder id. */
  folderId?: string | null;
  /** undefined = both directions. */
  direction?: Direction;
  /** «Мои наборы»: words in any of these folders (null = «Входящие»). Takes over from folderId. */
  folderIds?: readonly (string | null)[];
  /** Slang levels (OR-ed); "verl" also requires a verlan word. */
  slang?: readonly (SlangLevel | "verl")[];
  /** Word statuses (wordStatus). */
  statuses?: readonly ReviewSetStatus[];
  /** Only words created at or after this instant (ISO). */
  addedSince?: string;
}

/** Stable key of a filter, for live-query dependencies. */
export const sessionFilterKey = (filter: SessionFilter) => JSON.stringify(filter);

/** Selected levels are OR-ed; "verl" additionally requires a verlan word. Empty = any. */
export function matchesSlangKeys(word: Pick<Word, "slang_level" | "verlan">, keys: readonly (SlangLevel | "verl")[]): boolean {
  const levels = keys.filter((k): k is SlangLevel => k !== "verl");
  if (levels.length > 0 && !levels.includes(word.slang_level)) return false;
  return !keys.includes("verl") || word.verlan;
}

/** One card of a session: `key` is the review_state id `${word_id}:${direction}`. */
export type QueueItem = PlanItem;

/**
 * `due` (cards still due today: learning, reviews shown, learning due within 20 min and the
 * waiting ones), `new` (new cards in today's queue), `done` (reviews logged today, undone ones
 * excluded), `total` (done + cards not yet reviewed today — the steady denominator of `07 / 30`: a
 * learning step coming back is not counted again), `deferred` (reviews held for tomorrow by the
 * cap) and `waiting` (learning cards due later today, not in the queue).
 */
export type SessionCounts = PlanCounts;

export interface Session {
  queue: QueueItem[];
  counts: SessionCounts;
  /** The day's plan: budget, ceiling, reason, backlog, forecast… (global, every theme). */
  day: DayPlan;
  /** Learning cards due later today (not in the queue), soonest first: the «через N мин» screen. */
  waiting: QueueItem[];
  /** When the first waiting card is due (ISO); null when none. */
  nextDue: string | null;
  /** The plan the session was built with. */
  plan: StudyPlan;
}

/** Optional per-word signals for the `level` order of new words (P2: lib/core/level.ts, Lexique). */
export interface PlanSignals {
  level?: (w: Word) => string | null;
  freq?: (w: Word) => number | null;
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

/** The whole library as read once, so one live query can derive several sessions from it. */
export interface SessionData {
  /** Live words. */
  words: readonly Word[];
  /** Live review cards. */
  states: readonly ReviewState[];
  /** Live folder ids (a word in any other folder counts as «Входящие»). */
  liveFolderIds: ReadonlySet<string>;
  /** Live themes «на паузе»: their words never reach a session. */
  pausedFolderIds: ReadonlySet<string>;
  /** Theme order for new words (folder id → index, «Входящие» last); read again when missing. */
  folderOrder?: ReadonlyMap<string | null, number>;
}

/** Live folder ids, the ones «на паузе», and their order. */
async function folderSets(): Promise<{ live: Set<string>; paused: Set<string>; order: Map<string | null, number> }> {
  const folders = await liveRows(db.folders);
  return { live: new Set(folders.map((f) => f.id)), paused: pausedFolderIds(folders), order: folderOrderOf(folders) };
}

/** Reads every live word, card and folder once (pass it to loadSession and friends). */
export async function loadSessionData(): Promise<SessionData> {
  const [words, states, folders] = await Promise.all([liveRows(db.words), liveRows(db.review_state), folderSets()]);
  return { words, states, liveFolderIds: folders.live, pausedFolderIds: folders.paused, folderOrder: folders.order };
}

const NO_IDS: ReadonlySet<string> = new Set();

/**
 * Words among `all` (live words) matching the filter: folder (or a set's folders), slang, statuses
 * and age. Words whose folder is not in `liveFolderIds` count as «Входящие». `states` (live cards)
 * is only read for a statuses filter. Words «на паузе», or in a theme in `pausedFolderIds`, never match.
 */
export function matchWords(
  all: readonly Word[],
  states: readonly ReviewState[],
  liveFolderIds: ReadonlySet<string> | null,
  filter: SessionFilter,
  pausedFolderIds: ReadonlySet<string> = NO_IDS,
): Map<string, Word> {
  const inInbox = (w: Word) => w.folder_id === null || !liveFolderIds!.has(w.folder_id);
  let inFolder: (w: Word) => boolean = () => true;
  if (filter.folderIds && filter.folderIds.length > 0) {
    const ids = new Set(filter.folderIds.filter((id): id is string => id !== null));
    const inbox = filter.folderIds.includes(null);
    inFolder = (w) => (w.folder_id !== null && ids.has(w.folder_id)) || (inbox && inInbox(w));
  } else if (filter.folderId === null) {
    inFolder = inInbox;
  } else if (filter.folderId !== undefined) {
    inFolder = (w) => w.folder_id === filter.folderId;
  }
  const slang = filter.slang ?? [];
  const since = filter.addedSince;
  // Words «на паузе» (or in a theme on pause) never reach a session, a practice round or the counts.
  let words = all.filter((w) => w.deleted_at === null && !isPaused(w, pausedFolderIds) && inFolder(w) && matchesSlangKeys(w, slang) && (!since || w.created_at >= since));
  if (filter.statuses && filter.statuses.length > 0) {
    const wanted = new Set(filter.statuses);
    const ids = new Set(words.map((w) => w.id));
    const byWord = new Map<string, ReviewState[]>();
    for (const st of states) {
      if (st.deleted_at !== null || !ids.has(st.word_id)) continue;
      const list = byWord.get(st.word_id);
      if (list) list.push(st);
      else byWord.set(st.word_id, [st]);
    }
    words = words.filter((w) => wanted.has(wordStatus(byWord.get(w.id) ?? [])));
  }
  return new Map(words.map((w) => [w.id, w]));
}

/** Words a filter can match: a single theme from its folder_id index (still a plain range), else all. */
function candidateWords(filter: SessionFilter): Promise<Word[]> {
  const one = typeof filter.folderId === "string" && !filter.folderIds?.length ? filter.folderId : null;
  return one !== null ? db.words.where("folder_id").equals(one).toArray() : liveRows(db.words);
}

/** Live words matching the filter (see `matchWords`); derived from `pre` when given. */
export async function liveWords(filter: SessionFilter, pre?: SessionData): Promise<Map<string, Word>> {
  if (pre) return matchWords(pre.words, pre.states, pre.liveFolderIds, filter, pre.pausedFolderIds);
  const [words, states, folders] = await Promise.all([
    candidateWords(filter),
    filter.statuses && filter.statuses.length > 0 ? liveRows(db.review_state) : [],
    folderSets(),
  ]);
  return matchWords(words, states, folders.live, filter, folders.paused);
}

/** Matching words plus every live card, reading each table once. */
async function wordsWithStates(
  filter: SessionFilter,
  pending?: SessionData | Promise<SessionData>,
): Promise<{ words: Map<string, Word>; states: readonly ReviewState[] }> {
  const pre = await pending;
  if (pre) return { words: matchWords(pre.words, pre.states, pre.liveFolderIds, filter, pre.pausedFolderIds), states: pre.states };
  const [words, states, folders] = await Promise.all([candidateWords(filter), liveRows(db.review_state), folderSets()]);
  return { words: matchWords(words, states, folders.live, filter, folders.paused), states };
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

/** The whole library (every live word, card and theme), from `pre` when given. */
async function wholeLibrary(pending?: SessionData | Promise<SessionData>): Promise<Required<SessionData>> {
  const pre = await pending;
  if (pre) return { ...pre, folderOrder: pre.folderOrder ?? (await folderSets()).order };
  const [words, states, folders] = await Promise.all([liveRows(db.words), liveRows(db.review_state), folderSets()]);
  return { words, states, liveFolderIds: folders.live, pausedFolderIds: folders.paused, folderOrder: folders.order };
}

/** A filter narrowed to one theme: new words then come from it alone, without the per-theme limit. */
const isOneTheme = (filter: SessionFilter) =>
  filter.folderIds && filter.folderIds.length > 0 ? filter.folderIds.length === 1 : filter.folderId !== undefined;

/**
 * Today's queue and header counts in one read (use it inside useLiveQuery), planned by
 * lib/core/plan.ts `planDay` from the «План повторения» (`getStudyPlan`):
 * `[...learning due now, ...reviews and new cards (mixed or reviews first), ...learning due within
 * 20 min]`. The new-word budget, the review cap and the backlog are global (every theme, from the
 * start-of-day snapshot); the filter only narrows which cards are picked. `pre` may still be
 * loading: the plan and today's log are read meanwhile.
 */
export async function loadSession(
  filter: SessionFilter = {},
  now: Date = new Date(),
  pre?: SessionData | Promise<SessionData>,
  signals: PlanSignals = {},
): Promise<Session> {
  const dayStart = startOfStudyDay(now);
  const dayEnd = endOfStudyDay(now);
  const weekAgo = new Date(dayStart);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const [plan, override, lib, todayLogs, logs7d] = await Promise.all([
    getStudyPlan(),
    isNewOverrideOn(dayStart),
    wholeLibrary(pre),
    logsBetween(dayStart, dayEnd),
    logsBetween(weekAgo, dayStart),
  ]);
  const words = matchWords(lib.words, lib.states, lib.liveFolderIds, {}, lib.pausedFolderIds);
  const matched = matchWords(lib.words, lib.states, lib.liveFolderIds, filter, lib.pausedFolderIds);
  // «По уровню языка» / «По темам» order by level and Lexique frequency (loaded once, never rejects).
  const levels = signals.level || signals.freq || plan.new_order === "added" ? null : await loadLevelData();
  const result = planDay({
    now,
    dayStart,
    dayEnd,
    states: lib.states,
    words,
    match: (w) => matched.has(w.id),
    direction: filter.direction,
    todayLogs,
    logs7d,
    plan,
    overrideNewToday: override,
    r: retrievability,
    level: signals.level ?? (levels ? (w) => levels.level(w)?.level ?? null : undefined),
    freq: signals.freq ?? (levels ? (w) => levels.freq(w) : undefined),
    folderOrder: lib.folderOrder,
    spreadThemes: !isOneTheme(filter),
  });
  keepPlanDay(dayKey(dayStart), daySnapshot(result.day));
  return { queue: result.queue, counts: result.counts, day: result.day, waiting: result.waiting, nextDue: result.nextDue, plan };
}

/** The last snapshot handed to `recordPlanDay` by this page, so a re-run of the same plan costs nothing. */
let keptPlanDay = "";
/** Writes of `plan_day` one after the other, so a later snapshot never lands before an earlier one. */
let planDayWrites: Promise<unknown> = Promise.resolve();

/**
 * Keeps the day's plan in the synced `plan_day` pref («План и прогресс»: the first plan of a study
 * day, and again when the plan or the override changes it). `loadSession` runs inside live queries,
 * where Dexie refuses writes, so the write runs on its own a moment later; in the browser only
 * (tests call `recordPlanDay` themselves). A new day's first write waits for a sync pull
 * (`recordPlanDayAfterPull`), so another device's yesterday is not overwritten unseen.
 */
function keepPlanDay(day: string, snap: DayPlanSnapshot): void {
  const key = `${day}|${JSON.stringify(snap)}`;
  if (key === keptPlanDay || typeof window === "undefined") return;
  keptPlanDay = key;
  const pull = () => import("./sync").then((sync) => sync.syncNow());
  planDayWrites = planDayWrites
    .then(() => new Promise((resolve) => setTimeout(resolve, 0)))
    .then(() => recordPlanDayAfterPull(day, snap, pull))
    .catch((error: unknown) => {
      if (keptPlanDay === key) keptPlanDay = "";
      console.warn("«План дня» was not kept", error);
    });
}

export async function buildQueue(filter: SessionFilter = {}, now: Date = new Date()): Promise<QueueItem[]> {
  return (await loadSession(filter, now)).queue;
}

export async function getSessionCounts(filter: SessionFilter = {}, now: Date = new Date(), pre?: SessionData): Promise<SessionCounts> {
  return (await loadSession(filter, now, pre)).counts;
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
  /** Words with a non-new card due during the next study day, or held for it («Следующие 18 слов — завтра»). */
  dueTomorrow: number;
}

/** Numbers for the «Готово на сегодня» screen. */
export async function getDaySummary(
  filter: SessionFilter = {},
  now: Date = new Date(),
  pre?: SessionData | Promise<SessionData>,
): Promise<DaySummary> {
  const dayEnd = endOfStudyDay(now);
  const nextEnd = new Date(dayEnd);
  nextEnd.setDate(nextEnd.getDate() + 1);
  const [{ words, states: live }, logs] = await Promise.all([wordsWithStates(filter, pre), logsBetween(startOfStudyDay(now), dayEnd)]);
  const states = live.filter((s) => s.state !== 0);
  const mine = logs
    .filter((l) => words.has(l.word_id) && (!filter.direction || l.direction === filter.direction))
    .sort((a, b) => b.review.localeCompare(a.review));
  const hardIds: string[] = [];
  for (const l of mine) if (l.rating <= 2 && !hardIds.includes(l.word_id)) hardIds.push(l.word_id);
  const failedCards = new Set(mine.filter((l) => l.rating === 1).map((l) => reviewStateId(l.word_id, l.direction)));
  const dueTomorrow = new Set(
    states
      .filter((s) => {
        if (!words.has(s.word_id) || (filter.direction && s.direction !== filter.direction)) return false;
        const due = ms(s.due);
        // A review card still due today at the end of the session was held for tomorrow: deferred
        // by the cap or buried behind its FR→RU side (lib/core/plan.ts).
        return due < nextEnd.getTime() && (due >= dayEnd.getTime() || s.state === 2);
      })
      .map((s) => s.word_id),
  ).size;
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
  /**
   * "today": cards failed today («Повторить ошибки»). "recent": failed/hard in the last `days`,
   * topped up with the weakest cards («Ещё практика»). "all": every card of the filtered words in
   * random order, new ones included («Тренировка всей темы»).
   */
  scope?: PracticeScope;
  days?: number;
  /** Default 20; "all" defaults to PRACTICE_ALL_MAX. */
  limit?: number;
  /** Injected for tests: Math.random by default. */
  random?: () => number;
}

/** Cap for «Тренировка всей темы» (lib/core/practice.ts). */
export { PRACTICE_ALL_MAX } from "./core/practice";

/**
 * Practice queue (the pure lib/core/practice.ts `practiceQueue` over the device's data). Grading
 * in practice must NOT call gradeCard — keep the queue in memory and advance it with `advancePractice`.
 */
export async function buildPracticeQueue(opts: PracticeOptions = {}, now: Date = new Date(), pre?: SessionData): Promise<QueueItem[]> {
  const scope = opts.scope ?? "recent";
  const base = { scope, limit: opts.limit, direction: opts.direction, random: opts.random };
  if (scope === "all") return practiceQueue({ ...base, ...(await wordsWithStates(opts, pre)), logs: [] });
  const from = scope === "today" ? startOfStudyDay(now) : new Date(now.getTime() - (opts.days ?? PRACTICE_DAYS) * 86_400_000);
  const [{ words, states }, logs] = await Promise.all([wordsWithStates(opts, pre), logsBetween(from, new Date(now.getTime() + 1))]);
  return practiceQueue({ ...base, words, states, logs, from });
}

/** Next practice queue after answering its head (lib/core/practice.ts). */
export { advancePractice } from "./core/practice";
