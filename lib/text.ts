// Text helpers: accent-insensitive search keys and French lemma normalization for duplicates.
import { db } from "./db";
import type { Word } from "./types";

const APOSTROPHES = /[’‘ʼ`´′]/g;
const SPACES = /[\s  ]+/g;

/**
 * Removes diacritics from Latin letters (é→e, ç→c, œ→oe) and folds ё→е.
 * Cyrillic й is kept: it is a separate letter, not an accented и.
 */
export function foldAccents(input: string): string {
  return input
    .normalize("NFD")
    .replace(/([A-Za-z])\p{M}+/gu, "$1")
    .normalize("NFC")
    .replace(/œ/g, "oe")
    .replace(/Œ/g, "OE")
    .replace(/æ/g, "ae")
    .replace(/Æ/g, "AE")
    .replace(/ё/g, "е")
    .replace(/Ё/g, "Е");
}

/** Lowercase, accent-folded, apostrophe-unified, space-collapsed key for search. */
export function searchKey(input: string): string {
  return foldAccents(input.normalize("NFC").toLowerCase()).replace(APOSTROPHES, "'").replace(SPACES, " ").trim();
}

/**
 * Memo for a pure string → key function. Keyed by the input string, so an edited word simply looks
 * up its new text; cleared when full (a library's strings fit many times over).
 */
function memoString(fn: (s: string) => string, max = 20_000): (s: string) => string {
  const cache = new Map<string, string>();
  return (s) => {
    let out = cache.get(s);
    if (out === undefined) {
      if (cache.size >= max) cache.clear();
      out = fn(s);
      cache.set(s, out);
    }
    return out;
  };
}

type Searchable = Pick<Word, "fr" | "ru"> & Partial<Pick<Word, "note" | "tags">>;

/** The folded terms of a search query ([] matches everything). Fold once per query, not per word. */
export function searchTerms(query: string): string[] {
  const q = searchKey(query);
  return q ? q.split(" ") : [];
}

// Per word object, with the raw text it was folded from, so a row changed in place folds again.
const haystacks = new WeakMap<object, { raw: string; key: string }>();

/** FR, RU, note and tags of a word as one folded string (cached per word object). */
export function searchHaystack(word: Searchable): string {
  const raw = [word.fr, word.ru, word.note ?? "", ...(word.tags ?? [])].join(" \u0001 ");
  const hit = haystacks.get(word);
  if (hit?.raw === raw) return hit.key;
  const key = searchKey(raw);
  haystacks.set(word, { raw, key });
  return key;
}

/** True if every term (from `searchTerms`) occurs in the word's FR, RU, note or tags. */
export function matchesTerms(word: Searchable, terms: readonly string[]): boolean {
  if (terms.length === 0) return true;
  const hay = searchHaystack(word);
  return terms.every((term) => hay.includes(term));
}

/** True if every whitespace-separated term of `query` occurs in FR, RU, note or tags (accent-insensitive). */
export function matchesSearch(word: Searchable, query: string): boolean {
  return matchesTerms(word, searchTerms(query));
}

const LEADING_ARTICLE = /^(?:(?:les|le|la|un|une|des)\s+|l')(?=\S)/;
const TRAILING_PUNCT = /[\s.!?…,;:]+$/;

/**
 * Canonical form of a French entry for duplicate detection:
 * NFC, lowercase, unified apostrophes, leading article (le/la/l'/les/un/une/des) removed,
 * trailing sentence punctuation removed, spaces collapsed. Accents are kept (pâte ≠ pate).
 */
export const normalizeLemma = memoString((fr: string): string => {
  const s = fr
    .normalize("NFC")
    .toLowerCase()
    .replace(APOSTROPHES, "'")
    .replace(SPACES, " ")
    .replace(/\s*'\s*/g, "'")
    .replace(TRAILING_PUNCT, "")
    .trim();
  return s.replace(LEADING_ARTICLE, "") || s;
});

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

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k",
  л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts",
  ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

/** URL/identifier-safe slug: «Повседневное» → "povsednevnoe". */
export function slugify(input: string): string {
  const latin = Array.from(foldAccents(input.toLowerCase()))
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join("");
  return latin
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
