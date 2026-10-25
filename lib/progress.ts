// «Прогресс» on the device: one synced `progress_days` row per finished study day (written the day
// after by `ensureProgressDays`, older gaps rebuilt from review_log), and the screen's numbers
// (`useProgress`, `useProgressDay`). Pure rules live in lib/core/progress.ts (re-exported here).
//
// Rows are only ever added, never rewritten: a day already stored (live or replay, from this
// device or pulled from another) stays as it is. Today is never stored; the screen computes it live.
import { useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  activityByDay,
  addDays,
  countsFromStates,
  dayEndOf,
  dayKey,
  dayPoint,
  dayStartOf,
  daysBetween,
  emptyActivity,
  monthOf,
  replayCounts,
  retentionSummary,
  streaks,
  weekStartOf,
  type DayActivity,
  type DayCounts,
  type DayPoint,
  type RetentionSummary,
  type Streaks,
} from "./core/progress";
import { parsePlanDayPref, PLAN_DAY_PREF, snapshotForDay, type DayPlanSnapshot } from "./core/plan";
import { parseStudyPlan, STUDY_PLAN_PREF } from "./core/study-plan";
import { pausedFolderIds } from "./core/words";
import { db as defaultDb, liveRows, type KartochkiDB } from "./db";
import { FSRS_ALGO, TARGET_RETENTION } from "./scheduler";
import { isSupabaseConfigured } from "./supabase/config";
import type { ProgressDay, ReviewLog, SlangLevel, Word } from "./types";

export * from "./core/progress";

// ---------------------------------------------------------------------------------------------
// Saving the days

const LOG_PAGE = 200;

/**
 * Words created before this were not added by her: the prototype seed is stamped 2000-01-01
 * (lib/seed.ts SEED_TIMESTAMP, the same on every device), and counting from it would store a row
 * for every day since 2000.
 */
const ADDED_AFTER = "2000-01-02T00:00:00.000Z";

/** The first study day with data: the first live review or the first word added; null when none. */
async function firstDataDay(database: KartochkiDB): Promise<string | null> {
  const firstWord = await database.words.where("created_at").above(ADDED_AFTER).first();
  let firstLog: ReviewLog | undefined;
  for (let offset = 0; ; offset += LOG_PAGE) {
    const page = await database.review_log.orderBy("review").offset(offset).limit(LOG_PAGE).toArray();
    firstLog = page.find((l) => l.deleted_at === null);
    if (firstLog || page.length < LOG_PAGE) break;
  }
  const keys = [firstWord?.created_at, firstLog?.review].filter((v): v is string => !!v && !Number.isNaN(Date.parse(v))).map((v) => dayKey(v));
  return keys.length ? keys.sort()[0] : null;
}

const liveIds = (rows: readonly (ProgressDay | undefined)[]) => rows.filter((r): r is ProgressDay => !!r && r.deleted_at === null).map((r) => r.id);

const toRow = (
  day: string,
  counts: DayCounts,
  activity: DayActivity,
  source: ProgressDay["source"],
  iso: string,
  plan: DayPlanSnapshot | null,
): ProgressDay => ({
  id: day,
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
  added: activity.added,
  source,
  algo: FSRS_ALGO,
  plan,
  updated_at: iso,
  deleted_at: null,
});

/** The kept day plans from the synced `plan_day` pref (lib/session.ts keeps it): `of(day)` is that day's, or null. */
async function keptPlans(database: KartochkiDB): Promise<(day: string) => DayPlanSnapshot | null> {
  const row = await database.user_prefs.get(PLAN_DAY_PREF);
  const pref = row && row.deleted_at === null ? parsePlanDayPref(row.value) : null;
  return (day) => snapshotForDay(pref, day);
}

/** Whether the plan counts new cards of both directions as new words (its "together" mode). */
async function planTogether(database: KartochkiDB): Promise<boolean> {
  const row = await database.user_prefs.get(STUDY_PLAN_PREF);
  return !!row && row.deleted_at === null && parseStudyPlan(row.value).ru_fr === "together";
}

/**
 * Stores every finished study day that has no row yet, from the first day with data up to
 * yesterday; today is never stored. Yesterday gets `source: "live"` (its counts come from the
 * current cards, through the log for the cards reviewed since), older gaps `"replay"` (rebuilt
 * from review_log). An existing row is never overwritten, so this is idempotent; when nothing is
 * missing it costs three small reads. A row also keeps the day's plan (`plan`) when the synced
 * `plan_day` pref still holds that day (yesterday's, or the one before when the app wasn't opened
 * in between), whichever device studied; otherwise null. Returns how many rows it wrote.
 */
export async function ensureProgressDays(database: KartochkiDB = defaultDb, now: Date = new Date()): Promise<number> {
  const yesterday = addDays(dayKey(now), -1);
  const first = await firstDataDay(database);
  if (!first || first > yesterday) return 0;
  // A tombstoned day (e.g. an undone backup import) counts as missing and is written again.
  const stored = new Set(liveIds(await database.progress_days.where("id").between(first, yesterday, true, true).toArray()));
  const missing = daysBetween(first, yesterday).filter((k) => !stored.has(k));
  if (missing.length === 0) return 0;

  const [words, states, logs, folders, plan] = await Promise.all([
    database.words.toArray(),
    database.review_state.toArray(),
    database.review_log.toArray(),
    liveRows(database.folders),
    keptPlans(database),
  ]);
  const counts = replayCounts({ days: missing, words, states, logs, pausedFolderIds: pausedFolderIds(folders) });
  const activity = activityByDay({ logs, words });
  const iso = now.toISOString();
  const rows = missing.map((day) =>
    toRow(day, counts.get(day)!, activity.get(day) ?? emptyActivity(), day === yesterday ? "live" : "replay", iso, plan(day)),
  );

  return database.transaction("rw", database.progress_days, async () => {
    // Another call (boot and a sync pull) may have stored some of them meanwhile.
    const taken = new Set(liveIds(await database.progress_days.bulkGet(missing)));
    const fresh = rows.filter((r) => !taken.has(r.id));
    if (fresh.length) await database.progress_days.bulkPut(fresh);
    return fresh.length;
  });
}

let syncing = 0;

/**
 * lib/sync.ts runs each cycle through this: no day is stored meanwhile. A pull may still be
 * bringing the history in, and a row built from half of it is newer than the server's, so it
 * would replace the good one on every device. The cycle stores the days itself once it pulled.
 */
export async function holdingProgressDays<T>(work: () => Promise<T>): Promise<T> {
  syncing++;
  try {
    return await work();
  } finally {
    syncing--;
  }
}

/** With sync on: whether this device has finished a pull (the "sync" row's last_sync_at, as readSyncMeta reads it). */
async function pulledOnce(database: KartochkiDB): Promise<boolean> {
  const meta = await database.table<{ id: string; last_sync_at?: string | null }, string>("settings").get("sync");
  return !!(meta ? meta.last_sync_at : (await database.settings.get("settings"))?.last_sync_at);
}

/**
 * `ensureProgressDays` that never rejects (boot, sync, the screen): a failure is only logged.
 * With sync on it waits for this device's first full pull and skips while a cycle runs
 * (`holdingProgressDays`).
 */
export async function saveProgressDays(database: KartochkiDB = defaultDb, now: Date = new Date()): Promise<number> {
  try {
    if (syncing > 0) return 0;
    if (isSupabaseConfigured() && !(await pulledOnce(database))) return 0;
    return await ensureProgressDays(database, now);
  } catch (error: unknown) {
    console.warn("«Прогресс»: the study days were not saved", error);
    return 0;
  }
}

/**
 * The start-up call (components/providers/AppProviders.tsx): once, a little after boot. With sync
 * on, the first pull usually lands first (it calls `saveProgressDays` too), so yesterday is stored
 * from the synced log rather than from this device's alone. Returns a cleanup.
 */
export function scheduleProgressDays(delayMs = isSupabaseConfigured() ? 15_000 : 2_000): () => void {
  const id = setTimeout(() => void saveProgressDays(), delayMs);
  return () => clearTimeout(id);
}

// ---------------------------------------------------------------------------------------------
// Reading

/** Live review_log rows reviewed in [from, to). */
async function logsBetween(database: KartochkiDB, from: Date, to: Date): Promise<ReviewLog[]> {
  const rows = await database.review_log.where("review").between(from.toISOString(), to.toISOString(), true, false).toArray();
  return rows.filter((l) => l.deleted_at === null);
}

/** Words created in [from, to), deleted ones included. */
const wordsAddedBetween = (database: KartochkiDB, from: Date, to: Date): Promise<Word[]> =>
  database.words.where("created_at").between(from.toISOString(), to.toISOString(), true, false).toArray();

/** Exercise runs finished per study day. */
async function exercisesByDay(database: KartochkiDB): Promise<Map<string, number>> {
  const runs = await liveRows(database.exercise_runs);
  const out = new Map<string, number>();
  for (const [day, a] of activityByDay({ logs: [], runs })) out.set(day, a.exercises);
  return out;
}

/**
 * The active study days before today: a live review_log row or a finished exercise run. A stored
 * row with reviews says so; a day its row calls quiet (or without a row yet) is checked against the
 * log itself, since another device's reviews may have been synced after the row was written. Reads
 * only the `review` index keys, plus the logs of those few days.
 */
async function pastActiveDays(database: KartochkiDB, rows: readonly ProgressDay[], exercises: Map<string, number>, today: string): Promise<Set<string>> {
  const active = new Set(rows.filter((r) => r.id < today && r.reviews > 0).map((r) => r.id));
  for (const [day, n] of exercises) if (n > 0 && day < today) active.add(day);
  const unsure: string[] = [];
  let dayEnd = "";
  for (const key of (await database.review_log.orderBy("review").keys()) as string[]) {
    if (key < dayEnd) continue; // same study day as the previous key
    const day = dayKey(key);
    dayEnd = dayEndOf(day).toISOString();
    if (day >= today) break;
    if (!active.has(day)) unsure.push(day);
  }
  const found = await Promise.all(unsure.map((day) => logsBetween(database, dayStartOf(day), dayEndOf(day))));
  unsure.forEach((day, i) => {
    if (found[i].length > 0) active.add(day);
  });
  return active;
}

/** The library now, as a screen point for today. */
async function todayPoint(database: KartochkiDB, now: Date, together: boolean): Promise<{ point: DayPoint; mistakes: string[] }> {
  const today = dayKey(now);
  const start = dayStartOf(today);
  const end = dayEndOf(today);
  const [words, states, folders, logs, added, runs] = await Promise.all([
    liveRows(database.words),
    liveRows(database.review_state),
    liveRows(database.folders),
    logsBetween(database, start, end),
    wordsAddedBetween(database, start, end),
    liveRows(database.exercise_runs),
  ]);
  const counts = countsFromStates(words, states, pausedFolderIds(folders), now);
  const activity = activityByDay({ logs, words: added, runs, together }).get(today) ?? emptyActivity();
  return { point: dayPoint(today, counts, activity, "today"), mistakes: activity.mistakes };
}

/** A stored day outside the logs read: its activity as stored (`new_words`, never stored, from `newWords` when known). */
function storedPoint(row: ProgressDay, exercises: number, newWords: number): DayPoint {
  return dayPoint(
    row.id,
    row,
    { reviews: row.reviews, again: row.again, new_introduced: row.new_introduced, new_words: newWords, added: row.added, exercises },
    row.source,
  );
}

export type ProgressRange = "month" | "3m" | "year" | "all";

export interface Progress {
  /** The first active study day ("С 3 сентября"); null before any. */
  since: string | null;
  /** How many study days were active (a review or a finished exercise run), today included. */
  activeDays: number;
  /** Those days, ascending (the calendar). */
  activeDayKeys: string[];
  /** «12 дней подряд · лучшая 19». */
  streak: Streaks;
  /** Today, computed now (never stored). */
  today: DayPoint;
  /** The stored day a week ago («+23 за неделю»); null when there is none. */
  weekAgo: DayPoint | null;
  /** First day of the range: the 1st of this month (month), of 2 months back (3m), 11 months back (year), or the first stored day (all). */
  rangeFrom: string;
  /** Stored days of the range, ascending, then today (days without a row are absent). */
  series: DayPoint[];
  /** «Верно»: per month of the range, the last 7 / 30 days, and the target (0.9). */
  retention: RetentionSummary;
  /** Active days this week (Mon–Sun), today included («7 из 7 на этой неделе»). */
  weekCount: number;
  /** Nothing studied yet: the empty state. */
  empty: boolean;
}

/** The 1st of the month `n` months before the month of `key`. */
function monthStartBack(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 - n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** Everything the «Прогресс» screen shows for a range (use inside useLiveQuery). */
export async function loadProgress(range: ProgressRange, now: Date = new Date(), database: KartochkiDB = defaultDb): Promise<Progress> {
  const today = dayKey(now);
  const together = await planTogether(database);
  const [rows, exercises, current] = await Promise.all([
    liveRows(database.progress_days).then((r) => r.filter((row) => row.id < today).sort((a, b) => a.id.localeCompare(b.id))),
    exercisesByDay(database),
    todayPoint(database, now, together),
  ]);
  const rangeFrom =
    range === "month" ? monthStartBack(today, 0) : range === "3m" ? monthStartBack(today, 2) : range === "year" ? monthStartBack(today, 11) : (rows[0]?.id ?? today);

  const active = await pastActiveDays(database, rows, exercises, today);
  if (current.point.active) active.add(today);
  const activeDayKeys = [...active].sort();

  const logsFrom = [rangeFrom, addDays(today, -29)].sort()[0];
  const [logs, added] = await Promise.all([
    logsBetween(database, dayStartOf(logsFrom), dayEndOf(today)),
    wordsAddedBetween(database, dayStartOf(rangeFrom), dayEndOf(today)),
  ]);
  const retention = retentionSummary(logs, today, TARGET_RETENTION);
  // A stored row keeps its end-of-day counts, but its activity is re-read from the log: reviews
  // synced in after the row was written (another device, offline) still show on the chart.
  const activity = activityByDay({ logs: logs.filter((l) => l.review >= dayStartOf(rangeFrom).toISOString()), words: added, together });
  // New words in plan units are never stored: days before the range (a week ago) take them from the logs read.
  const older = activityByDay({ logs, together });
  const points = rows.map((row) => {
    const live = row.id >= rangeFrom ? (activity.get(row.id) ?? emptyActivity()) : undefined;
    const exercisesDone = exercises.get(row.id) ?? 0;
    return live
      ? dayPoint(row.id, row, { ...live, exercises: exercisesDone }, row.source)
      : storedPoint(row, exercisesDone, older.get(row.id)?.new_words ?? 0);
  });
  const fromMonth = monthOf(rangeFrom);
  retention.month = retention.month.filter((m) => m.month >= fromMonth);

  const weekAgoKey = addDays(today, -7);
  const weekFrom = weekStartOf(today);
  return {
    since: activeDayKeys[0] ?? null,
    activeDays: activeDayKeys.length,
    activeDayKeys,
    streak: streaks(activeDayKeys, today),
    today: current.point,
    weekAgo: points.find((p) => p.day === weekAgoKey) ?? null,
    rangeFrom,
    series: [...points.filter((p) => p.day >= rangeFrom), current.point],
    retention,
    weekCount: activeDayKeys.filter((k) => k >= weekFrom && k <= today).length,
    empty: activeDayKeys.length === 0,
  };
}

/**
 * The «Прогресс» screen's numbers, live; undefined while loading. On mount it also stores any
 * finished day still missing (`saveProgressDays`), e.g. when the app stayed open past 04:00.
 */
export function useProgress(range: ProgressRange): Progress | undefined {
  useEffect(() => void saveProgressDays(), []);
  return useLiveQuery(() => loadProgress(range), [range]);
}

export interface ProgressMistake {
  word_id: string;
  fr: string;
  ru: string;
  slang_level: SlangLevel;
  verlan: boolean;
}

export interface ProgressDayDetail {
  /** The day's numbers: end-of-day counts (stored, rebuilt when missing, live for today) and its activity. */
  point: DayPoint;
  /** Words graded «Не знаю» that day, the latest first; deleted words are left out. */
  mistakes: ProgressMistake[];
  /** «День № 44»: its place among the active days (1 = the first); null when the day was not active. */
  ordinal: number | null;
}

/**
 * One day opened under the calendar (use inside useLiveQuery); null for a day after today or
 * before any data. Activity and mistakes come from the day's log; counts from its stored row.
 */
export async function loadProgressDay(day: string, now: Date = new Date(), database: KartochkiDB = defaultDb): Promise<ProgressDayDetail | null> {
  const today = dayKey(now);
  if (day > today) return null;
  const [row, exercises, rows, together] = await Promise.all([
    database.progress_days.get(day),
    exercisesByDay(database),
    liveRows(database.progress_days),
    planTogether(database),
  ]);
  let point: DayPoint;
  let mistakeIds: string[];
  if (day === today) {
    ({ point, mistakes: mistakeIds } = await todayPoint(database, now, together));
  } else {
    const start = dayStartOf(day);
    const end = dayEndOf(day);
    const [logs, added] = await Promise.all([logsBetween(database, start, end), wordsAddedBetween(database, start, end)]);
    const activity = activityByDay({ logs, words: added, together }).get(day) ?? emptyActivity();
    activity.exercises = exercises.get(day) ?? 0;
    mistakeIds = activity.mistakes;
    let counts: DayCounts | undefined = row && row.deleted_at === null ? row : undefined;
    if (!counts) {
      const first = await firstDataDay(database);
      if (!first || day < first) return null;
      const [words, states, allLogs, folders] = await Promise.all([
        database.words.toArray(),
        database.review_state.toArray(),
        database.review_log.toArray(),
        liveRows(database.folders),
      ]);
      counts = replayCounts({ days: [day], words, states, logs: allLogs, pausedFolderIds: pausedFolderIds(folders) }).get(day)!;
    }
    point = dayPoint(day, counts, activity, row && row.deleted_at === null ? row.source : "replay");
  }

  const words = await database.words.bulkGet(mistakeIds);
  const mistakes: ProgressMistake[] = words
    .filter((w): w is Word => !!w && w.deleted_at === null)
    .map((w) => ({ word_id: w.id, fr: w.fr, ru: w.ru, slang_level: w.slang_level, verlan: w.verlan }));

  const active = await pastActiveDays(database, rows, exercises, today);
  if (point.active) active.add(day);
  const ordinal = point.active ? [...active].filter((k) => k <= day).length : null;
  return { point, mistakes, ordinal };
}

/** One day's numbers and mistakes, live; undefined while loading, null for no such day. */
export function useProgressDay(day: string | null): ProgressDayDetail | null | undefined {
  return useLiveQuery(() => (day ? loadProgressDay(day) : null), [day]);
}
