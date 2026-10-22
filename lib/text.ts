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

/** True if every whitespace-separated term of `query` occurs in FR, RU, note or tags (accent-insensitive). */
export function matchesSearch(word: Pick<Word, "fr" | "ru"> & Partial<Pick<Word, "note" | "tags">>, query: string): boolean {
  const q = searchKey(query);
  if (!q) return true;
  const hay = searchKey([word.fr, word.ru, word.note ?? "", ...(word.tags ?? [])].join(" \u0001 "));
  return q.split(" ").every((term) => hay.includes(term));
}

const LEADING_ARTICLE = /^(?:(?:les|le|la|un|une|des)\s+|l')(?=\S)/;
const TRAILING_PUNCT = /[\s.!?…,;:]+$/;

/**
 * Canonical form of a French entry for duplicate detection:
 * NFC, lowercase, unified apostrophes, leading article (le/la/l'/les/un/une/des) removed,
 * trailing sentence punctuation removed, spaces collapsed. Accents are kept (pâte ≠ pate).
 */
export function normalizeLemma(fr: string): string {
  const s = fr
    .normalize("NFC")
    .toLowerCase()
    .replace(APOSTROPHES, "'")
    .replace(SPACES, " ")
    .replace(/\s*'\s*/g, "'")
    .replace(TRAILING_PUNCT, "")
    .trim();
  return s.replace(LEADING_ARTICLE, "") || s;
}

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
