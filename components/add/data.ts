// Reads for the add sheet (used inside useLiveQuery).
import { db } from "@/lib/db";
import { getFolder } from "@/lib/folders";
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
  await db.words.each((w) => {
    if (w.deleted_at !== null) return;
    total++;
    if (w.created_at >= since) today++;
  });
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
  return word ? duplicateInfo(word) : null;
}

async function duplicateInfo(word: Word): Promise<DuplicateInfo> {
  const before = await db.words.filter((w) => w.deleted_at === null && w.created_at < word.created_at).count();
  const folder = word.folder_id ? await getFolder(word.folder_id) : undefined;
  return { word, ordinal: before + 1, folderName: folder?.name ?? null };
}

/** For «Список»: lemma key → the existing word (with its theme and number), for the given French entries. */
export async function loadListDuplicates(frs: readonly string[]): Promise<Map<string, DuplicateInfo>> {
  const found = await findDuplicates(frs);
  const byKey = new Map<string, DuplicateInfo>();
  for (const [fr, word] of found) {
    const key = normalizeLemma(fr);
    if (!byKey.has(key)) byKey.set(key, await duplicateInfo(word));
  }
  return byKey;
}
