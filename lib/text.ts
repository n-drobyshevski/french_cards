// Text helpers: dictionary sort order and duplicate detection against the local database.
// The pure search/normalization/slug helpers live in lib/core/text.ts (shared with the server).
import { normalizeLemma, searchKey } from "./core/text";
import { db } from "./db";
import type { Word } from "./types";

export { foldAccents, matchesSearch, normalizeLemma, searchKey, slugify } from "./core/text";

const SORT_PREFIX = /^(?:(?:les|le|la|un|une|des|se)\s+|l'|s')(?=\S)/;

/**
 * Alphabetical key of a French entry, like a dictionary: accent-folded, lowercase, with a leading
 * article (le/la/les/l'/un/une/des) or «se»/«s'» dropped. «la thune» → «thune», «se casser» → «casser».
 */
export function frSortKey(fr: string): string {
  const s = searchKey(fr);
  return s.replace(SORT_PREFIX, "") || s;
}

const frCollator = new Intl.Collator("fr", { sensitivity: "base", numeric: true });

/** Sorts French entries alphabetically by `frSortKey` (library «Слово ▲», theme guide words). */
export function compareFr(a: string, b: string): number {
  return frCollator.compare(frSortKey(a), frSortKey(b)) || frCollator.compare(a, b);
}

/** Finds a live word whose French form normalizes to the same lemma. */
export async function findDuplicate(fr: string, opts: { excludeId?: string } = {}): Promise<Word | undefined> {
  const key = normalizeLemma(fr);
  if (!key) return undefined;
  return db.words
    .filter((w) => w.deleted_at === null && w.id !== opts.excludeId && normalizeLemma(w.fr) === key)
    .first();
}

/** Batch variant for import lists: maps each input to its existing duplicate (if any). */
export async function findDuplicates(frs: readonly string[]): Promise<Map<string, Word>> {
  const wanted = new Set(frs.map(normalizeLemma).filter(Boolean));
  const found = new Map<string, Word>();
  if (wanted.size === 0) return found;
  await db.words.each((w) => {
    if (w.deleted_at !== null) return;
    const key = normalizeLemma(w.fr);
    if (wanted.has(key) && !found.has(key)) found.set(key, w);
  });
  const out = new Map<string, Word>();
  for (const fr of frs) {
    const hit = found.get(normalizeLemma(fr));
    if (hit) out.set(fr, hit);
  }
  return out;
}
