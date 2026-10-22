// /api/ai/lookup and /api/ai/context: tidying the model's answers. The web examples are checked
// against what the search really returned: a sentence is kept only when it is a verbatim part of
// a snippet cited from a page, and its link is that page's (the model never writes a URL).
import { cleanText, detectDirection, dedupeKey, slangLevelFromCode } from "./normalize";
import type { ContextSnippet } from "./prompts";
import {
  CONTEXT_EXAMPLES_MAX,
  LOOKUP_SYNONYMS_MAX,
  LOOKUP_TRANSLATIONS_MAX,
  type ContextExample,
  type ContextModel,
  type ContextResponse,
  type LookupModel,
  type LookupResponse,
} from "./schemas";

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae");

/** Letters and digits only, single spaces: punctuation, quotes and accents never decide a match. */
export const textKey = (s: string) => fold(s).replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Shares as whole percents that add up to 100 (equal when the model gave none). */
export function normalizeShares(raw: readonly number[]): number[] {
  if (raw.length === 0) return [];
  const clean = raw.map((n) => (Number.isFinite(n) && n > 0 ? n : 0));
  const total = clean.reduce((a, b) => a + b, 0);
  const parts = total > 0 ? clean.map((n) => (n / total) * 100) : clean.map(() => 100 / raw.length);
  const out = parts.map((p) => Math.max(1, Math.round(p)));
  // Put the rounding error on the largest share so the list still adds up to 100.
  const diff = 100 - out.reduce((a, b) => a + b, 0);
  const top = out.indexOf(Math.max(...out));
  out[top] = Math.max(1, out[top] + diff);
  return out;
}

export function finalizeLookup(raw: LookupModel, q: string): LookupResponse {
  const direction = detectDirection(q);
  const fr = cleanText(raw.fr, 120) ?? "";
  const empty: LookupResponse = {
    found: false,
    q,
    direction,
    fr,
    pos: "other",
    gender: "none",
    slang_level: 0,
    verlan: false,
    note: null,
    translations: [],
    synonyms: [],
    conjugation: null,
  };
  if (!raw.found || !fr) return empty;

  const seenRu = new Set<string>();
  const translations = (raw.translations ?? [])
    .map((t) => ({ ru: cleanText(t.ru, 60) ?? "", share: t.share }))
    .filter((t) => {
      const key = textKey(t.ru);
      if (!key || seenRu.has(key)) return false;
      seenRu.add(key);
      return true;
    })
    .slice(0, LOOKUP_TRANSLATIONS_MAX);
  const shares = normalizeShares(translations.map((t) => t.share));

  const head = dedupeKey(fr);
  const seenFr = new Set<string>([head]);
  const synonyms = (raw.synonyms ?? [])
    .map((s) => ({ fr: cleanText(s.fr, 80) ?? "", ru: cleanText(s.ru, 60) ?? "", slang_level: slangLevelFromCode(s.slang_level) }))
    .filter((s) => {
      const key = dedupeKey(s.fr);
      if (!s.fr || !s.ru || seenFr.has(key)) return false;
      seenFr.add(key);
      return true;
    })
    .slice(0, LOOKUP_SYNONYMS_MAX);

  return {
    found: true,
    q,
    direction,
    fr,
    pos: raw.pos,
    gender: raw.pos === "noun" ? raw.gender : "none",
    slang_level: slangLevelFromCode(raw.slang_level),
    verlan: raw.verlan === true,
    note: cleanText(raw.note, 160),
    translations: translations.map((t, i) => ({ ru: t.ru, share: shares[i] })),
    synonyms,
    // Filled on the device from Lexique (lib/conjugation.ts).
    conjugation: null,
  };
}

/** A web source as the AI SDK reports it (result.sources); citations carry the quoted text. */
export interface WebSource {
  sourceType: string;
  url?: string;
  title?: string;
  providerMetadata?: { anthropic?: { citedText?: unknown } & Record<string, unknown> } & Record<string, unknown>;
}

export const SNIPPETS_MAX = 24;

export function domainOf(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export interface Snippet extends ContextSnippet {
  url: string;
}

/** Numbered, de-duplicated cited snippets (1-based), and how many distinct pages the search saw. */
export function snippetsFromSources(sources: readonly WebSource[]): { snippets: Snippet[]; pages: number } {
  const pages = new Set<string>();
  const seen = new Set<string>();
  const snippets: Snippet[] = [];
  for (const s of sources) {
    if (s.sourceType !== "url" || !s.url) continue;
    const domain = domainOf(s.url);
    if (!domain) continue;
    pages.add(s.url);
    const cited = s.providerMetadata?.anthropic?.citedText;
    if (typeof cited !== "string") continue;
    const text = cited.replace(/\s+/g, " ").trim();
    const key = textKey(text);
    if (key.length < 8 || seen.has(key) || snippets.length >= SNIPPETS_MAX) continue;
    seen.add(key);
    snippets.push({ n: snippets.length + 1, url: s.url, domain, title: cleanText(s.title, 120), text });
  }
  return { snippets, pages: pages.size };
}

const FUNCTION_WORDS = new Set(["le", "la", "les", "l", "un", "une", "des", "de", "du", "d", "se", "s", "en", "y", "a", "au", "aux", "et", "ou", "qn", "qqn", "qch", "quelqu", "un", "chose"]);

/** First letters of the headword's content words: «se casser la tête» → cas, tet. */
export function headwordStems(fr: string): string[] {
  return textKey(fr.replace(/['’]/g, " "))
    .split(" ")
    .filter((w) => w.length > 1 && !FUNCTION_WORDS.has(w))
    .map((w) => w.slice(0, 3));
}

/** The sentence uses the headword: some content word of it starts like the headword's (irregular short verbs pass on `hit`). */
export function usesHeadword(sentence: string, hit: string, fr: string): boolean {
  const words = textKey(sentence.replace(/['’]/g, " ")).split(" ");
  const stems = headwordStems(fr);
  if (stems.some((stem) => words.some((w) => w.startsWith(stem)))) return true;
  // être, aller, faire…: forms share nothing with the infinitive; trust a short hit found in the sentence.
  return stems.length === 1 && textKey(fr).length <= 5 && textKey(hit).length > 0;
}

/** The examples the model picked, kept only when they really come from a cited snippet. */
export function finalizeContext(
  raw: ContextModel,
  snippets: readonly Snippet[],
  input: { fr: string; meanings: readonly string[] },
  pages: number,
): ContextResponse {
  const bySnippet = new Map(snippets.map((s) => [s.n, s]));
  const meanings = new Map(input.meanings.map((m) => [textKey(m), m]));
  const seen = new Set<string>();
  const examples: ContextExample[] = [];
  for (const e of raw.examples ?? []) {
    const snippet = bySnippet.get(e.snippet);
    const fr = cleanText(e.fr, 300);
    const ru = cleanText(e.ru, 400);
    if (!snippet || !fr || !ru) continue;
    const key = textKey(fr);
    // Verbatim: the sentence (ignoring punctuation, case and accents) is part of the cited text.
    if (key.split(" ").length < 3 || !textKey(snippet.text).includes(key) || seen.has(key)) continue;
    const hit = findHit(fr, e.hit);
    if (!hit || !usesHeadword(fr, hit, input.fr)) continue;
    seen.add(key);
    examples.push({
      fr,
      ru,
      hit,
      meaning: (e.meaning && meanings.get(textKey(e.meaning))) || null,
      kind: e.kind,
      url: snippet.url,
      domain: snippet.domain,
      title: snippet.title,
    });
    if (examples.length === CONTEXT_EXAMPLES_MAX) break;
  }
  return { examples, sources: pages };
}

/** `hit` as it is spelled inside `fr` (case-insensitive), or null when it is not there. */
export function findHit(fr: string, hit: string | null | undefined): string | null {
  const h = (hit ?? "").trim();
  if (!h) return null;
  const at = fr.toLocaleLowerCase("fr").indexOf(h.toLocaleLowerCase("fr"));
  return at < 0 ? null : fr.slice(at, at + h.length);
}
