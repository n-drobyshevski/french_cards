// Pure text helpers shared by the app and the server (no Dexie): accent-insensitive search keys,
// French lemma normalization for duplicates, and slugs. lib/text.ts re-exports them.
import type { Word } from "../types";

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

/** True if every whitespace-separated term of `query` occurs in FR, RU, note, tags or custom fields (accent-insensitive). */
export function matchesSearch(
  word: Pick<Word, "fr" | "ru"> & Partial<Pick<Word, "note" | "tags" | "custom_fields">>,
  query: string,
): boolean {
  const q = searchKey(query);
  if (!q) return true;
  const fields = (word.custom_fields ?? []).map((f) => f.value);
  const hay = searchKey([word.fr, word.ru, word.note ?? "", ...(word.tags ?? []), ...fields].join(" \u0001 "));
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
