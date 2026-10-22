// «Контекст» → «Слово по частям», on the device: how a word is made (volontaire = volonté + -aire)
// and the words built on the same root, from public/lexique/fr-morpho.json (scripts/build-
// morpho.mjs, Lexique 3.83). Fetched once per session; no model is asked.
import { affixGloss } from "./core/affixes";

export const MORPHO_URL = "/lexique/fr-morpho.json";
export const FAMILY_MAX = 8;

export interface WordPart {
  /** As shown: «in-», «croire», «-able». */
  text: string;
  kind: "prefix" | "root" | "suffix";
  /** Russian gloss of an affix («не-, без-»), null for a root or an unknown affix. */
  gloss: string | null;
}

export interface Morpho {
  /** The parts, or null when Lexique does not split the word. */
  parts: WordPart[] | null;
  /** Words on the same root, most common first (the roots themselves included), without the word. */
  family: string[];
}

interface Index {
  parts: Map<string, string[]>;
  freq: Map<string, number>;
  /** root → words built on it. */
  derived: Map<string, string[]>;
}

type MorphoFile = { v: 1; words: [lemma: string, parts: string, freq: number][] };

let loading: Promise<Index | null> | null = null;

export function buildIndex(file: MorphoFile): Index {
  const parts = new Map<string, string[]>();
  const freq = new Map<string, number>();
  const derived = new Map<string, string[]>();
  for (const [lemma, raw, f] of file.words) {
    const list = raw.split("|");
    parts.set(lemma, list);
    freq.set(lemma, f);
    for (const p of list) {
      if (p.startsWith("-") || p.endsWith("-")) continue;
      const bucket = derived.get(p) ?? [];
      bucket.push(lemma);
      derived.set(p, bucket);
    }
  }
  return { parts, freq, derived };
}

export function loadMorpho(fetchImpl: typeof fetch = fetch): Promise<Index | null> {
  loading ??= fetchImpl(MORPHO_URL)
    .then((res) => (res.ok ? (res.json() as Promise<MorphoFile>) : null))
    .then((file) => (file ? buildIndex(file) : null))
    .catch(() => null)
    .then((index) => {
      if (!index) loading = null;
      return index;
    });
  return loading;
}

/** «la thune» → «thune», «se casser» → «casser». */
export function morphoKey(fr: string): string {
  return fr
    .toLowerCase()
    .replace(/’/g, "'")
    .trim()
    .replace(/^(?:se\s+|s')/, "")
    .replace(/^(?:le|la|les|un|une|des)\s+|^l'/, "");
}

export function morphoOf(fr: string, index: Index): Morpho {
  const word = morphoKey(fr);
  const raw = index.parts.get(word);
  const parts: WordPart[] | null = raw
    ? raw.map((p) => ({
        text: p,
        kind: p.endsWith("-") ? "prefix" : p.startsWith("-") ? "suffix" : "root",
        gloss: affixGloss(p),
      }))
    : null;
  const roots = (raw ?? []).filter((p) => !p.startsWith("-") && !p.endsWith("-"));
  const family = new Set<string>();
  for (const r of roots) {
    family.add(r);
    for (const d of index.derived.get(r) ?? []) family.add(d);
  }
  for (const d of index.derived.get(word) ?? []) family.add(d);
  family.delete(word);
  const ranked = [...family].sort((a, b) => (index.freq.get(b) ?? 0) - (index.freq.get(a) ?? 0) || a.localeCompare(b, "fr"));
  return { parts, family: ranked.slice(0, FAMILY_MAX) };
}

/** The word's parts and family, or null when the data cannot be loaded or there is nothing to show. */
export async function loadWordMorpho(fr: string, fetchImpl?: typeof fetch): Promise<Morpho | null> {
  const index = await loadMorpho(fetchImpl);
  if (!index) return null;
  const m = morphoOf(fr, index);
  return m.parts || m.family.length > 0 ? m : null;
}
