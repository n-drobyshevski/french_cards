// Live-query loaders for the review screen. Each runs as one read inside useLiveQuery.
import { db } from "@/lib/db";
import { endOfStudyDay, getDaySummary, loadSession, type DaySummary, type Session, type SessionFilter } from "@/lib/session";
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

async function wordsMatching(filter: SessionFilter): Promise<{ all: Word[]; matching: Word[] }> {
  const all = await db.words.filter((w) => w.deleted_at === null).toArray();
  if (filter.folderId === undefined) return { all, matching: all };
  if (filter.folderId === null) {
    const live = new Set((await db.folders.filter((f) => f.deleted_at === null).toArray()).map((f) => f.id));
    return { all, matching: all.filter((w) => w.folder_id === null || !live.has(w.folder_id)) };
  }
  return { all, matching: all.filter((w) => w.folder_id === filter.folderId) };
}

export async function loadReviewScreen(filter: SessionFilter, now: Date = new Date()): Promise<ReviewScreenData> {
  const [session, words] = await Promise.all([loadSession(filter, now), wordsMatching(filter)]);
  return {
    session,
    libraryWords: words.all.length,
    filterWords: words.matching.length,
    ordinals: wordOrdinals(words.all),
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
  const [summary, words, states] = await Promise.all([
    getDaySummary(filter, now),
    wordsMatching(filter),
    db.review_state
      .where("due")
      .aboveOrEqual(dayEnd)
      .filter((s) => s.deleted_at === null && s.state !== 0)
      .toArray(),
  ]);
  const ids = new Set(words.matching.map((w) => w.id));
  let nextDue: string | null = null;
  for (const s of states) {
    if (!ids.has(s.word_id) || (filter.direction && s.direction !== filter.direction)) continue;
    if (nextDue === null || s.due < nextDue) nextDue = s.due;
  }
  return { summary, nextDue, at: now.toISOString() };
}
