// Instant local suggestions («Словарь» in the add sheet): prefix search over the French lemma
// list built by scripts/build-lexique.mjs (public/lexique/fr-lemmas.json). Fetched once per
// session and kept in memory. "se casser"/"s'en…" input is matched on the verb and the
// pronominal prefix is put back on the result; "la thu…"/"l'oseille" input is matched on nouns
// (of the article's gender) and the article is put back.
import type { Gender, PartOfSpeech } from "./types";

export const LEXIQUE_URL = "/lexique/fr-lemmas.json";

export type LexiqueEntry = readonly [lemma: string, pos: PartOfSpeech, gender: Gender, freq: number];

export interface LexiqueHit {
  /** What to show and insert: the lemma with the typed pronominal prefix or article restored ("se casser", "la thune"). */
  fr: string;
  /** The bare lemma from the list ("casser"). */
  lemma: string;
  pos: PartOfSpeech;
  gender: Gender;
  /** Frequency per million words (higher = more common). */
  freq: number;
}

/** Must stay identical to `foldKey` in scripts/build-lexique.mjs. */
export function foldKey(s: string): string {
  return s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[’‘ʼ`´′]/g, "'")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .normalize("NFC")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/\s+/g, " ")
    .trim();
}

const PRONOMINAL = /^(se\s+|s')/;
const ARTICLE = /^(l'|le\s+|la\s+|les\s+|un\s+|une\s+|des\s+)/;
const VOWEL_OR_H = /^[aeiouyh]/;
const VOWEL = /^[aeiouy]/;
/** Verbs with an aspirated h keep "se": se hâter, se heurter. */
const ASPIRATED_H = new Set([
  "hacher", "haïr", "haler", "hâler", "hanter", "harceler", "harnacher", "hasarder", "hâter", "hausser", "hennir",
  "hérisser", "heurter", "hisser", "hocher", "huer", "hurler",
]);
const elides = (lemma: string, key: string) => VOWEL_OR_H.test(key) && !ASPIRATED_H.has(lemma);

/** Whether a noun of `gender` (folded key `key`) fits the typed article. */
function fitsArticle(article: string, gender: Gender, key: string): boolean {
  if (article === "l'") return VOWEL_OR_H.test(key);
  if (article === "le" || article === "un") return gender === "m" || gender === "mf";
  if (article === "la" || article === "une") return gender === "f" || gender === "mf";
  return true; // les, des
}

/**
 * The article put back in front of a noun: le/la elide before a vowel ("l'œuvre"); les/des give
 * the singular dictionary form, since the lemma is singular ("les flic…" → "le flic").
 */
function withArticle(article: string, lemma: string, gender: Gender, key: string): string {
  const singular = article === "les" || article === "des" ? (gender === "f" ? "la" : "le") : article;
  if (singular === "l'" || ((singular === "le" || singular === "la") && VOWEL.test(key))) return `l'${lemma}`;
  return `${singular} ${lemma}`;
}

export interface Lexique {
  readonly size: number;
  search(q: string, limit?: number): LexiqueHit[];
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Builds a searchable index. Entries need not be pre-sorted (they are when they come from the script). */
export function createLexique(entries: readonly LexiqueEntry[]): Lexique {
  const rows = entries.map((e) => ({ key: foldKey(e[0]), e }));
  let sorted = true;
  for (let i = 1; i < rows.length; i++) {
    if (cmp(rows[i - 1].key, rows[i].key) > 0) {
      sorted = false;
      break;
    }
  }
  if (!sorted) rows.sort((a, b) => cmp(a.key, b.key));
  const keys = rows.map((r) => r.key);

  function lowerBound(prefix: string): number {
    let lo = 0;
    let hi = keys.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (keys[mid] < prefix) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  return {
    size: rows.length,
    search(q: string, limit = 5): LexiqueHit[] {
      if (limit <= 0) return [];
      // Detect the prefix before trimming, so "se " (typed space) already means pronominal.
      const lead = q.normalize("NFC").toLowerCase().replace(/[’‘ʼ`´′]/g, "'").trimStart();
      const pronominal = PRONOMINAL.exec(lead);
      const articleMatch = pronominal ? null : ARTICLE.exec(lead);
      const article = articleMatch ? articleMatch[0].trim() : null;
      const prefix = pronominal ?? articleMatch;
      const key = foldKey(prefix ? lead.slice(prefix[0].length) : lead);
      if (!key) return [];

      const matches: { row: (typeof rows)[number]; exact: boolean }[] = [];
      for (let i = lowerBound(key); i < keys.length && keys[i].startsWith(key); i++) {
        const row = rows[i];
        if (pronominal && row.e[1] !== "verb") continue;
        if (article && (row.e[1] !== "noun" || !fitsArticle(article, row.e[2], row.key))) continue;
        matches.push({ row, exact: row.key === key });
      }
      matches.sort((a, b) => Number(b.exact) - Number(a.exact) || b.row.e[3] - a.row.e[3] || cmp(a.row.key, b.row.key));

      const seen = new Set<string>();
      const hits: LexiqueHit[] = [];
      for (const { row } of matches) {
        const [lemma, pos, gender, freq] = row.e;
        const fr = pronominal
          ? elides(lemma, row.key)
            ? `s'${lemma}`
            : `se ${lemma}`
          : article
            ? withArticle(article, lemma, gender, row.key)
            : lemma;
        if (seen.has(fr)) continue;
        seen.add(fr);
        hits.push({ fr, lemma, pos, gender, freq });
        if (hits.length >= limit) break;
      }
      return hits;
    },
  };
}

let loaded: Lexique | null = null;
let loading: Promise<Lexique> | null = null;

/** Fetches the lemma list once. A failed load is retried on the next call. */
export function loadLexique(fetchImpl: typeof fetch = fetch): Promise<Lexique> {
  if (loaded) return Promise.resolve(loaded);
  loading ??= (async () => {
    const res = await fetchImpl(LEXIQUE_URL, { cache: "force-cache" });
    if (!res.ok) throw new Error(`lexique: HTTP ${res.status}`);
    const data = (await res.json()) as LexiqueEntry[];
    loaded = createLexique(data);
    return loaded;
  })().catch((error: unknown) => {
    loading = null;
    throw error;
  });
  return loading;
}

export const isLexiqueLoaded = (): boolean => loaded !== null;

/**
 * Synchronous search for the add sheet. Returns [] until the list has loaded (and starts
 * loading it), so call `loadLexique()` when the sheet opens.
 */
export function prefixSearch(q: string, limit = 5): LexiqueHit[] {
  if (!loaded) {
    if (typeof window !== "undefined") void loadLexique().catch(() => {});
    return [];
  }
  return loaded.search(q, limit);
}

/** Awaits the list, then searches. */
export async function searchLexique(q: string, limit = 5): Promise<LexiqueHit[]> {
  return (await loadLexique()).search(q, limit);
}

/** Test helper: install a preloaded index (or clear it with null). */
export function setLexiqueForTesting(lexique: Lexique | null): void {
  loaded = lexique;
  loading = null;
}
