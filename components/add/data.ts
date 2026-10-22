// Reads for the add sheet (used inside useLiveQuery).
import { db, liveRows } from "@/lib/db";
import { getFolder, listFolders } from "@/lib/folders";
import { startOfStudyDay } from "@/lib/session";
import { findDuplicate, findDuplicates, normalizeLemma } from "@/lib/text";
import type { Word } from "@/lib/types";

export interface AddContext {
  /** Latest added words, newest first (Недавние). */
  recent: Word[];
  /** Words added since the study day began. */
  today: number;
  /** Live words in the library; the new card is № total + 1. */
  total: number;
}

export async function loadAddContext(now: Date = new Date(), limit = 3): Promise<AddContext> {
  const since = startOfStudyDay(now).toISOString();
  let total = 0;
  let today = 0;
  for (const w of await db.words.toArray()) {
    if (w.deleted_at !== null) continue;
    total++;
    if (w.created_at >= since) today++;
  }
  const recent = await db.words
    .orderBy("created_at")
    .reverse()
    .filter((w) => w.deleted_at === null)
    .limit(limit)
    .toArray();
  return { recent, today, total };
}

export interface DuplicateInfo {
  word: Word;
  /** Catalog number: position by creation among live words. */
  ordinal: number;
  /** null = «Входящие». */
  folderName: string | null;
}

/** The live word with the same French lemma, if any. */
export async function loadDuplicate(fr: string): Promise<DuplicateInfo | null> {
  if (!normalizeLemma(fr)) return null;
  const word = await findDuplicate(fr);
  if (!word) return null;
  // Words created before it, through the created_at index (a filtered count would walk a cursor).
  const [earlier, folder] = await Promise.all([
    db.words.where("created_at").below(word.created_at).toArray(),
    word.folder_id ? getFolder(word.folder_id) : undefined,
  ]);
  const before = earlier.filter((w) => w.deleted_at === null).length;
  return { word, ordinal: before + 1, folderName: folder?.name ?? null };
}

/** How many entries of an ascending created_at list are strictly before `createdAt` (binary search). */
export function countBefore(sortedCreatedAt: readonly string[], createdAt: string): number {
  let lo = 0;
  let hi = sortedCreatedAt.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sortedCreatedAt[mid] < createdAt) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** For «Список»: lemma key → the existing word (with its theme and number), for the given French entries. */
export async function loadListDuplicates(frs: readonly string[]): Promise<Map<string, DuplicateInfo>> {
  const found = await findDuplicates(frs);
  const byKey = new Map<string, DuplicateInfo>();
  if (found.size === 0) return byKey;
  // One read for every hit's number and theme instead of a scan per hit.
  const [words, folders] = await Promise.all([liveRows(db.words), listFolders()]);
  const created = words.map((w) => w.created_at).sort();
  const names = new Map(folders.map((f) => [f.id, f.name]));
  for (const [fr, word] of found) {
    const key = normalizeLemma(fr);
    if (byKey.has(key)) continue;
    const folderName = word.folder_id ? (names.get(word.folder_id) ?? null) : null;
    byKey.set(key, { word, ordinal: countBefore(created, word.created_at) + 1, folderName });
  }
  return byKey;
}
