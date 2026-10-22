// Text helpers: dictionary sort order and duplicate detection against the local database.
// The pure search/normalization/slug helpers live in lib/core/text.ts (shared with the server).
import { memoString, normalizeLemma, searchKey } from "./core/text";
import { db } from "./db";
import type { Word } from "./types";

export {
  foldAccents,
  matchesSearch,
  matchesTerms,
  normalizeLemma,
  searchHaystack,
  searchKey,
  searchTerms,
  slugify,
} from "./core/text";

const SORT_PREFIX = /^(?:(?:les|le|la|un|une|des|se)\s+|l'|s')(?=\S)/;

/**
 * Alphabetical key of a French entry, like a dictionary: accent-folded, lowercase, with a leading
 * article (le/la/les/l'/un/une/des) or «se»/«s'» dropped. «la thune» → «thune», «se casser» → «casser».
 */
export const frSortKey = memoString((fr: string): string => {
  const s = searchKey(fr);
  return s.replace(SORT_PREFIX, "") || s;
});

const frCollator = new Intl.Collator("fr", { sensitivity: "base", numeric: true });

/** `compareFr` on keys already made with `frSortKey`, for loops that key each entry once. */
export function compareFrKeyed(aKey: string, a: string, bKey: string, b: string): number {
  return frCollator.compare(aKey, bKey) || frCollator.compare(a, b);
}

/** Sorts French entries alphabetically by `frSortKey` (library «Слово ▲», theme guide words). */
export function compareFr(a: string, b: string): number {
  return compareFrKeyed(frSortKey(a), a, frSortKey(b), b);
}

/** Finds a live word whose French form normalizes to the same lemma. */
export async function findDuplicate(fr: string, opts: { excludeId?: string } = {}): Promise<Word | undefined> {
  const key = normalizeLemma(fr);
  if (!key) return undefined;
  return (await db.words.toArray()).find((w) => w.deleted_at === null && w.id !== opts.excludeId && normalizeLemma(w.fr) === key);
}

/** Batch variant for import lists: maps each input to its existing duplicate (if any). */
export async function findDuplicates(frs: readonly string[]): Promise<Map<string, Word>> {
  const wanted = new Set(frs.map(normalizeLemma).filter(Boolean));
  const found = new Map<string, Word>();
  if (wanted.size === 0) return found;
  for (const w of await db.words.toArray()) {
    if (w.deleted_at !== null) continue;
    const key = normalizeLemma(w.fr);
    if (wanted.has(key) && !found.has(key)) found.set(key, w);
  }
  const out = new Map<string, Word>();
  for (const fr of frs) {
    const hit = found.get(normalizeLemma(fr));
    if (hit) out.set(fr, hit);
  }
  return out;
}
