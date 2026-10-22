// Live-query loaders for the review screen. Each runs as one read inside useLiveQuery.
import {
  endOfStudyDay,
  getDaySummary,
  loadSession,
  loadSessionData,
  matchWords,
  type DaySummary,
  type Session,
  type SessionData,
  type SessionFilter,
} from "@/lib/session";
import type { Word } from "@/lib/types";

export interface ReviewScreenData {
  session: Session;
  /** Live words in the whole library (0 → «Пока нет слов»). */
  libraryWords: number;
  /** Live words matching the theme filter (0 → «В этой теме пока нет слов»). */
  filterWords: number;
  /** Catalog number per live word id (creation order, as the add sheet's «Карточка № 159»). */
  ordinals: ReadonlyMap<string, number>;
}

/**
 * Catalog numbers: position by `created_at` among live words, 1-based. The add sheet counts the
 * same way (components/add/data.ts: words created before + 1), so «FR · № 001» on the review card
 * matches «Карточка № 001» and the duplicate notice.
 */
export function wordOrdinals(words: readonly Pick<Word, "id" | "created_at">[]): Map<string, number> {
  const sorted = [...words].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
  const map = new Map<string, number>();
  let rank = 0;
  let previous: string | null = null;
  sorted.forEach((w, i) => {
    // Same timestamp → same number (the add sheet counts words created strictly before).
    if (w.created_at !== previous) rank = i + 1;
    previous = w.created_at;
    map.set(w.id, rank);
  });
  return map;
}

function wordsMatching(filter: SessionFilter, pre: SessionData): readonly Word[] {
  const narrowed = filter.folderId !== undefined || !!filter.folderIds || !!filter.slang || !!filter.statuses || !!filter.addedSince;
  return narrowed ? [...matchWords(pre.words, pre.states, pre.liveFolderIds, filter).values()] : pre.words;
}

// The library is read once per run (grades re-run this), and the session and counts derive from it.
export async function loadReviewScreen(filter: SessionFilter, now: Date = new Date()): Promise<ReviewScreenData> {
  const loading = loadSessionData();
  const [pre, session] = await Promise.all([loading, loadSession(filter, now, loading)]);
  return {
    session,
    libraryWords: pre.words.length,
    filterWords: wordsMatching(filter, pre).length,
    ordinals: wordOrdinals(pre.words),
  };
}

export interface DoneScreenData {
  summary: DaySummary;
  /** Earliest due date (ISO) of a card in the filter after today, for «Следующий показ — через 4 д». */
  nextDue: string | null;
  /** When the data was read (ISO), so the view formats relative to the same instant. */
  at: string;
}

export async function loadDoneScreen(filter: SessionFilter, now: Date = new Date()): Promise<DoneScreenData> {
  const dayEnd = endOfStudyDay(now).toISOString();
  const loading = loadSessionData();
  const [pre, summary] = await Promise.all([loading, getDaySummary(filter, now, loading)]);
  const ids = new Set(wordsMatching(filter, pre).filter((w) => !w.muted).map((w) => w.id));
  let nextDue: string | null = null;
  for (const s of pre.states) {
    if (s.state === 0 || s.due < dayEnd) continue;
    if (!ids.has(s.word_id) || (filter.direction && s.direction !== filter.direction)) continue;
    if (nextDue === null || s.due < nextDue) nextDue = s.due;
  }
  return { summary, nextDue, at: now.toISOString() };
}
