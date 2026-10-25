// «Прогресс» for the connector: study_summary's `history_days`. The stored progress_days rows are
// the app's (written the day after each study day, lib/progress.ts); the rest is computed here with
// the shared pure rules of lib/core/progress.ts. Those key days by the device's local clock, while
// the server runs in UTC, so every day key here comes from MCP_TIMEZONE (lib/mcp/study-day.ts).
import { addDays, countsFromStates, monthOf, retentionOf, streaks, type Retention } from "@/lib/core/progress";
import { pausedFolderIds } from "@/lib/core/words";
import { TARGET_RETENTION } from "@/lib/scheduler";
import type { ExerciseRun, Folder, ProgressDay, ReviewLog, ReviewState, Word } from "@/lib/types";
import { studyDayKey, studyDayKeyer, studyDayStartOf } from "./study-day";

export const HISTORY_DAYS_MAX = 365;

/** The stored fields each history row carries, in this order. */
export const HISTORY_COLUMNS = ["day", "known", "learning", "fresh", "paused", "difficult", "memorized", "reviews", "again", "new_introduced", "added", "source"] as const;

export interface HistoryRange {
  /** Today's study day key. */
  today: string;
  /** First day of the range (today − days + 1). */
  from: string;
  /** Logs are read from here: 04:00 on the 1st of `from`'s month, so its month's «Верно» is whole. */
  logsFrom: Date;
}

export function historyRange(now: Date, days: number, timeZone: string): HistoryRange {
  const today = studyDayKey(now, timeZone);
  const from = addDays(today, -(days - 1));
  return { today, from, logsFrom: studyDayStartOf(`${monthOf(from)}-01`, timeZone) };
}

export interface HistoryInput {
  range: HistoryRange;
  timeZone: string;
  now: Date;
  /** Every progress_days row, tombstones included (older rows feed the best streak). */
  rows: readonly ProgressDay[];
  /** review_log rows since `range.logsFrom`, tombstones included. */
  logs: readonly ReviewLog[];
  /** Every exercise run, tombstones included. */
  runs: readonly Pick<ExerciseRun, "finished_at" | "deleted_at">[];
  /** The library now (for today, which is never stored). */
  words: readonly Word[];
  states: readonly ReviewState[];
  folders: readonly Folder[];
}

const round1 = (x: number) => Math.round(x * 10) / 10;
const round2 = (x: number) => Math.round(x * 100) / 100;
const rateView = (r: Retention) => ({ reviews: r.total, rate: r.rate === null ? null : round2(r.rate) });

export function progressHistory(input: HistoryInput) {
  const { range, timeZone } = input;
  const { today, from } = range;
  const rows = input.rows.filter((r) => r.deleted_at === null && r.id < today).sort((a, b) => a.id.localeCompare(b.id));

  // Live logs in time order, each with its study day in the zone.
  const keyOf = studyDayKeyer(timeZone);
  const logs = input.logs
    .filter((l) => l.deleted_at === null)
    .map((log) => ({ log, at: Date.parse(log.review) }))
    .filter((l) => !Number.isNaN(l.at))
    .sort((a, b) => a.at - b.at)
    .map(({ log, at }) => ({ log, at, day: keyOf(at) }));

  // Active (as on the app's calendar): a live review or a finished exercise run. Before the logs
  // read here, a stored row with reviews stands for its day.
  const active = new Set<string>(rows.filter((r) => r.reviews > 0).map((r) => r.id));
  for (const l of logs) active.add(l.day);
  for (const r of input.runs) {
    const at = r.deleted_at === null && r.finished_at ? Date.parse(r.finished_at) : NaN;
    if (!Number.isNaN(at)) active.add(studyDayKey(at, timeZone));
  }
  const activeKeys = [...active].filter((k) => k <= today);
  const streak = streaks(activeKeys, today);

  // True retention («Верно»): the first live log of each card per study day, when it came as a
  // review card (lib/core/progress.ts firstReviewsPerDay, with the zone's days).
  const first = new Map<string, { log: ReviewLog; day: string }>();
  for (const { log, day } of logs) {
    const key = `${day}|${log.word_id}:${log.direction}`;
    if (!first.has(key)) first.set(key, { log, day });
  }
  const picked = [...first.values()].filter(({ log }) => log.state === 2 || log.state === 3);
  const byMonth = new Map<string, typeof picked>();
  for (const p of picked) {
    const m = monthOf(p.day);
    const list = byMonth.get(m);
    if (list) list.push(p);
    else byMonth.set(m, [p]);
  }
  const months = [...byMonth.keys()]
    .filter((m) => m >= monthOf(from))
    .sort()
    .map((month) => ({ month, ...rateView(retentionOf(byMonth.get(month)!)) }));

  const now = countsFromStates(input.words, input.states, pausedFolderIds(input.folders), input.now);
  return {
    from,
    to: today,
    columns: HISTORY_COLUMNS,
    days: rows
      .filter((r) => r.id >= from)
      .map((r) => [r.id, r.known, r.learning, r.fresh, r.paused, r.difficult, round1(r.memorized), r.reviews, r.again, r.new_introduced, r.added, r.source]),
    today: { known: now.known, learning: now.learning, fresh: now.fresh, paused: now.paused, difficult: now.difficult, memorized: round1(now.memorized) },
    active_days: activeKeys.filter((k) => k >= from).length,
    streak: { current: streak.current, best: streak.best },
    retention: {
      target: TARGET_RETENTION,
      range: rateView(retentionOf(picked.filter((p) => p.day >= from))),
      months,
    },
    note:
      "days: one row per finished study day (columns as named), saved by the app the day after; days without a row are missing, today is never stored (see `today`). known = «знаю» (every card a review card, stability ≥ 21 d); memorized = «помню ≈», the words' mean recall probability summed; paused words count only as paused; difficult («трудных») is part of learning. retention: «Верно», first review of each card per day as a review card, passed = not «Не знаю». active_days / streak: days with a review or a finished exercise.",
  };
}
