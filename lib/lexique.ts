// Instant local suggestions («Словарь» in the add sheet): prefix search over the French lemma
// list built by scripts/build-lexique.mjs (public/lexique/fr-lemmas.json). Fetched once per
// session and kept in memory. "se casser"/"s'en…" input is matched on the verb and the
// pronominal prefix is put back on the result; "la thu…"/"l'oseille" input is matched on nouns
// (of the article's gender) and the article is put back.
// Also the word level («Уровень языка», lib/core/level.ts): `lookup` gives a lemma's frequency rank,
// and `loadLevelData` adds the FLELex levels (public/lexique/fr-cefr.json, a separate file under
// its own licence, built by scripts/build-cefr.mjs).
import {
  createCefrData,
  createLevelResolver,
  type CefrData,
  type CefrFile,
  type LevelResolver,
  type LexFreq,
} from "./core/level";
import type { Gender, PartOfSpeech } from "./types";

export const LEXIQUE_URL = "/lexique/fr-lemmas.json";
export const CEFR_URL = "/lexique/fr-cefr.json";

/** `key` is the folded lemma, written by the build script only when it differs from `lemma`. */
export type LexiqueEntry = readonly [lemma: string, pos: PartOfSpeech, gender: Gender, freq: number, key?: string];

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

/** An exact `lookup` hit: the entry plus its frequency rank in the list (1 = most common). */
export interface LexiqueLookup extends LexFreq {
  lemma: string;
  pos: PartOfSpeech;
  gender: Gender;
}

export interface Lexique {
  readonly size: number;
  search(q: string, limit?: number): LexiqueHit[];
  /**
   * The entry whose folded lemma is exactly `key` (folded here), preferring `pos`, then the most
   * frequent; no article or pronoun stripping (pass `levelKey(fr)`).
   */
  lookup(key: string, pos?: PartOfSpeech): LexiqueLookup | null;
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

interface Row {
  key: string;
  e: LexiqueEntry;
}

function isSorted(rows: readonly Row[]): boolean {
  for (let i = 1; i < rows.length; i++) if (cmp(rows[i - 1].key, rows[i].key) > 0) return false;
  return true;
}

/**
 * Builds a searchable index. Entries need not be pre-sorted (they are when they come from the script).
 * `prefolded`: the entries are the build script's output, which carries the folded keys, so no folding
 * runs here. A list out of key order (a file from before the keys were added) is folded after all.
 */
export function createLexique(entries: readonly LexiqueEntry[], { prefolded = false } = {}): Lexique {
  let rows: Row[] | null = prefolded ? entries.map((e) => ({ key: e[4] ?? e[0], e })) : null;
  if (!rows || !isSorted(rows)) {
    rows = entries.map((e) => ({ key: foldKey(e[0]), e }));
    if (!isSorted(rows)) rows.sort((a, b) => cmp(a.key, b.key));
  }
  const index: readonly Row[] = rows;
  const keys = index.map((r) => r.key);

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

  // Frequencies, most common first, for ranks; sorted on the first lookup only.
  let byFreq: Float64Array | null = null;
  function rankOf(freq: number): number {
    if (!byFreq) {
      byFreq = Float64Array.from(index, (r) => r.e[3]).sort().reverse();
    }
    // 1 + the number of entries strictly more frequent.
    let lo = 0;
    let hi = byFreq.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (byFreq[mid] > freq) lo = mid + 1;
      else hi = mid;
    }
    return lo + 1;
  }

  return {
    size: index.length,
    lookup(q: string, pos?: PartOfSpeech): LexiqueLookup | null {
      const key = foldKey(q);
      if (!key) return null;
      // sur / sûr fold alike: the entry of the word's part of speech, else the more common one.
      const better = (e: LexiqueEntry, than: LexiqueEntry) =>
        e[1] === pos && than[1] !== pos ? true : e[1] !== pos && than[1] === pos ? false : e[3] > than[3];
      let best: LexiqueEntry | null = null;
      for (let i = lowerBound(key); i < keys.length && keys[i] === key; i++) {
        const e = index[i].e;
        if (!best || better(e, best)) best = e;
      }
      if (!best) return null;
      const [lemma, entryPos, gender, freq] = best;
      return { lemma, pos: entryPos, gender, freq, rank: rankOf(freq) };
    },
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

      const matches: { row: Row; exact: boolean }[] = [];
      for (let i = lowerBound(key); i < keys.length && keys[i].startsWith(key); i++) {
        const row = index[i];
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
    loaded = createLexique(data, { prefolded: true });
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
  levelData = null;
}

// --- Word level -------------------------------------------------------------------------------

let cefrLoaded: CefrData | null = null;
let cefrLoading: Promise<CefrData> | null = null;

/** Fetches the FLELex levels once. A failed load is retried on the next call. */
export function loadCefrData(fetchImpl: typeof fetch = fetch): Promise<CefrData> {
  if (cefrLoaded) return Promise.resolve(cefrLoaded);
  cefrLoading ??= (async () => {
    const res = await fetchImpl(CEFR_URL, { cache: "force-cache" });
    if (!res.ok) throw new Error(`cefr: HTTP ${res.status}`);
    cefrLoaded = createCefrData((await res.json()) as CefrFile);
    return cefrLoaded;
  })().catch((error: unknown) => {
    cefrLoading = null;
    throw error;
  });
  return cefrLoading;
}

let levelData: LevelResolver | null = null;
let levelLoading: Promise<LevelResolver> | null = null;

/**
 * The level resolver over FLELex and Lexique, loaded once. Never rejects: with a file missing
 * (offline before the service worker cached it) it resolves over what did load, with `ready`
 * false, and the next call tries again.
 */
export function loadLevelData(fetchImpl: typeof fetch = fetch): Promise<LevelResolver> {
  if (levelData?.ready) return Promise.resolve(levelData);
  levelLoading ??= Promise.allSettled([loadCefrData(fetchImpl), loadLexique(fetchImpl)]).then(([cefr, lex]) => {
    const data = cefr.status === "fulfilled" ? cefr.value : null;
    const lexique = lex.status === "fulfilled" ? lex.value : null;
    levelData = createLevelResolver(data, lexique ? (key, pos) => lexique.lookup(key, pos) : null, !!(data && lexique));
    levelLoading = null;
    return levelData;
  });
  return levelLoading;
}

/** The resolver if `loadLevelData` has finished (possibly not `ready`), else null. */
export const loadedLevelData = (): LevelResolver | null => levelData;

/** Test helper: install the FLELex data (or clear it with null). */
export function setCefrDataForTesting(data: CefrData | null): void {
  cefrLoaded = data;
  cefrLoading = null;
  levelData = null;
  levelLoading = null;
}
