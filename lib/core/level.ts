// «Уровень языка»: a CEFR level per word (A1…C2). Pure and Dexie-free, shared by the app and the
// Claude connector. The level is resolved in this order:
//   1. a stored level (`cefr` + `cefr_source`: user, then chat / ai);
//   2. FLELex-Beacco on the lemma (+ part of speech), from public/lexique/fr-cefr.json;
//   3. an exact match among the FLELex CRF expressions (same file);
//   4. the Lexique frequency band: rank ≤800 A1, ≤2000 A2, ≤4000 B1, ≤7000 B2, ≤12000 C1, else C2;
//   5. nothing: null, «без уровня».
// Steps 2–4 are estimates: computed on the fly, never stored, and skipped for argot / vulgar words
// and verlan (textbook corpora have no argot, so their levels are noise). A multi-word expression
// with no CRF hit stays null: no guessing from its content words. FLELex is about half right on
// A1–B2, so the level only orders new words; it never gates anything.
import type { PartOfSpeech, SlangLevel } from "../types";

export type Cefr = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export const CEFR_LEVELS: readonly Cefr[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

/** Who set a stored level: the user, Claude in the chat, or the app's AI. */
export type StoredLevelSource = "user" | "chat" | "ai";
export const STORED_LEVEL_SOURCES: readonly StoredLevelSource[] = ["user", "chat", "ai"];
/** Where an effective level comes from: stored ones, then the FLELex and frequency estimates. */
export type LevelSource = StoredLevelSource | "flelex" | "freq";

export interface LevelInfo {
  level: Cefr;
  source: LevelSource;
  /** Not set by the user: the UI shows «≈B1». */
  estimated: boolean;
}

/** The word fields a level needs. `cefr` / `cefr_source` are optional, so older rows fit. */
export interface LevelWord {
  fr: string;
  pos: PartOfSpeech;
  slang_level: SlangLevel;
  verlan: boolean;
  cefr?: Cefr | null;
  cefr_source?: StoredLevelSource | null;
}

/** A word's Lexique frequency: its rank (1 = most common) and frequency per million. */
export interface LexFreq {
  rank: number;
  freq: number;
}

export const isCefr = (v: unknown): v is Cefr => typeof v === "string" && (CEFR_LEVELS as readonly string[]).includes(v);
export const isStoredLevelSource = (v: unknown): v is StoredLevelSource =>
  typeof v === "string" && (STORED_LEVEL_SOURCES as readonly string[]).includes(v);

// ---------------------------------------------------------------------------------------------
// Keys

const APOSTROPHES = /[’‘ʼ`´′]/g;
/** «(qqn)», «(f)», «(fonctionner)», «ami(e)». */
const PARENS = /\s*[([][^)\]]*[)\]]/g;
/** Placeholders for an object: «dire qqch à qqn». */
const PLACEHOLDERS = /(^|\s)(?:qqn|qqch|qqc|qch|qn|qc|quelqu'un|quelque chose)(?=\s|$)/g;
const TRAILING_PUNCT = /[\s.!?…,;:]+$/;
const LEAD_ARTICLE = /^(?:(?:les|le|la|un|une|des|du|de la)\s+|(?:de )?l')(?=\S)/;
/** «se tromper», «s'en aller», «s'y prendre»: the verb after the pronoun. */
const LEAD_PRONOUN = /^(?:se\s+|s')(?:(?:en|y)\s+)?(?=\S)/;
const TRAIL_PREP = /\s+(?:à|de|d'|du|des|au|aux)$/;

/**
 * Text as FLELex writes it: NFC, lowercase, one apostrophe, œ → oe (FLELex spells «oeuvre»),
 * no spaces around «-» and «'» (the CRF file tokenises «chef - d' oeuvre»), spaces collapsed.
 * Accents are kept (sur ≠ sûr). The build script runs FLELex entries through it as well.
 */
export function cleanLevelText(s: string): string {
  return s
    .normalize("NFC")
    .toLowerCase()
    .replace(APOSTROPHES, "'")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s*'\s*/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** The entry without glosses, gender markers, placeholders, a second form («beau, belle») or end punctuation. */
function baseText(fr: string): string {
  const s = fr.normalize("NFC").replace(APOSTROPHES, "'").replace(PARENS, " ");
  const first = s.split(/[,/]/)[0];
  const text = cleanLevelText(first.trim() ? first : s)
    .replace(PLACEHOLDERS, "$1")
    .replace(TRAILING_PUNCT, "");
  return cleanLevelText(text);
}

const stripLead = (s: string) => s.replace(LEAD_PRONOUN, "").replace(LEAD_ARTICLE, "") || s;
/** «tenir à», «se moquer de», «au fur et à mesure du»: the entry without its trailing preposition. */
export const stripTrailingPrep = (s: string) => s.replace(TRAIL_PREP, "") || s;
const PLURAL_ARTICLE = /^(?:les|des)\s/;

/**
 * The keys to try for a word, the bare lemma first: without the leading article or «se / s'»
 * and a trailing «à / de»; then without only one of them; then as written (cleaned). After a
 * plural article, also the singular of a single word («les flics» → flic).
 */
export function levelKeys(fr: string): string[] {
  const raw = baseText(fr);
  if (!raw) return [];
  const bare = stripTrailingPrep(stripLead(raw));
  const keys = [bare, stripLead(raw), stripTrailingPrep(raw), raw];
  if (PLURAL_ARTICLE.test(raw) && /^[^ '-]{3,}s$/.test(bare)) keys.push(bare.slice(0, -1));
  return [...new Set(keys)];
}

/**
 * The lemma key of a word: «se tromper» → «tromper», «l'annonce (f)» → «annonce», «marcher
 * (fonctionner)» → «marcher», «tenir à qqn» → «tenir», «le titre de séjour» → «titre de séjour».
 */
export function levelKey(fr: string): string {
  return levelKeys(fr)[0] ?? "";
}

// ---------------------------------------------------------------------------------------------
// The FLELex file (scripts/build-cefr.mjs → public/lexique/fr-cefr.json)

/**
 * `beacco[i]` and `crf[i]` hold the keys of level `CEFR_LEVELS[i]`, joined with «|». A Beacco key
 * whose level depends on the part of speech appears once per part of speech as `key~p`
 * (p: n noun, v verb, a adj, r adv, o other).
 */
export interface CefrFile {
  v: number;
  beacco: string[];
  crf: string[];
}

export const CEFR_POS_CODE: Record<PartOfSpeech, string> = {
  noun: "n",
  verb: "v",
  adj: "a",
  adv: "r",
  expression: "o",
  other: "o",
};

/** The parsed file: lookups by key. Build it once with `createCefrData`. */
export interface CefrData {
  readonly size: number;
  /** FLELex-Beacco: the level for that part of speech, else the lowest one for the lemma. */
  beacco(key: string, pos?: PartOfSpeech): Cefr | null;
  /** FLELex CRF: exact match. */
  crf(key: string): Cefr | null;
}

export function createCefrData(file: CefrFile): CefrData {
  // Plain key → level index; `key~p` → level index; and the lowest level per key with `~`.
  const beacco = new Map<string, number>();
  const crf = new Map<string, number>();
  let size = 0;
  (file.beacco ?? []).forEach((joined, level) => {
    if (!joined) return;
    for (const token of joined.split("|")) {
      size++;
      beacco.set(token, level);
      const tilde = token.lastIndexOf("~");
      if (tilde > 0) {
        const lemma = `${token.slice(0, tilde)}~`;
        const prev = beacco.get(lemma);
        if (prev === undefined || level < prev) beacco.set(lemma, level);
      }
    }
  });
  (file.crf ?? []).forEach((joined, level) => {
    if (!joined) return;
    for (const key of joined.split("|")) {
      size++;
      const prev = crf.get(key);
      if (prev === undefined || level < prev) crf.set(key, level);
    }
  });
  const at = (i: number | undefined): Cefr | null => (i === undefined ? null : (CEFR_LEVELS[i] ?? null));
  return {
    size,
    beacco(key, pos) {
      const plain = beacco.get(key);
      if (plain !== undefined) return at(plain);
      if (pos) {
        const exact = beacco.get(`${key}~${CEFR_POS_CODE[pos]}`);
        if (exact !== undefined) return at(exact);
      }
      return at(beacco.get(`${key}~`));
    },
    crf: (key) => at(crf.get(key)),
  };
}

// ---------------------------------------------------------------------------------------------
// Resolving

/** Rank → level, the bands of the plan (research1 §2: 34% exact, 80% within one level vs Beacco). */
export const FREQ_BANDS: readonly [maxRank: number, level: Cefr][] = [
  [800, "A1"],
  [2000, "A2"],
  [4000, "B1"],
  [7000, "B2"],
  [12000, "C1"],
];

/** scripts/lexique-slang.mjs adds missing slang to fr-lemmas.json with this made-up frequency. */
export const FAKE_SLANG_FREQ = 3;

export function freqBand(rank: number): Cefr {
  for (const [max, level] of FREQ_BANDS) if (rank <= max) return level;
  return "C2";
}

/** Argot, vulgar words and verlan get no estimate (FLELex and Lexique levels are noise for them). */
export const hasNoEstimate = (w: Pick<LevelWord, "slang_level" | "verlan">): boolean => w.slang_level >= 2 || w.verlan;

/**
 * The computed level (steps 2–4), ignoring any stored one. `lex` is the word's Lexique entry, the
 * first of `levelKeys(word.fr)` that `Lexique.lookup` (lib/lexique.ts) finds, when there is one.
 */
export function estimateLevel(word: LevelWord, data: CefrData | null, lex?: LexFreq | null): LevelInfo | null {
  if (hasNoEstimate(word)) return null;
  const keys = levelKeys(word.fr);
  if (keys.length === 0) return null;
  if (data) {
    // Beacco: the bare lemma first; CRF: the expression as written first.
    for (const key of keys) {
      const level = data.beacco(key, word.pos);
      if (level) return { level, source: "flelex", estimated: true };
    }
    for (let i = keys.length - 1; i >= 0; i--) {
      const level = data.crf(keys[i]);
      if (level) return { level, source: "flelex", estimated: true };
    }
  }
  if (lex && lex.rank > 0 && lex.freq !== FAKE_SLANG_FREQ) {
    return { level: freqBand(lex.rank), source: "freq", estimated: true };
  }
  return null;
}

/** The stored level, if valid. A stored level without a source counts as the user's. */
export function storedLevel(word: Pick<LevelWord, "cefr" | "cefr_source">): LevelInfo | null {
  if (!isCefr(word.cefr)) return null;
  const source: StoredLevelSource = isStoredLevelSource(word.cefr_source) ? word.cefr_source : "user";
  return { level: word.cefr, source, estimated: source !== "user" };
}

/** The level to show and sort by: the stored one, else the estimate, else null («без уровня»). */
export function effectiveLevel(word: LevelWord, data: CefrData | null, lex?: LexFreq | null): LevelInfo | null {
  return storedLevel(word) ?? estimateLevel(word, data, lex);
}

/** «≈B1» for an estimate (and a level from Claude / the AI), «B1» for the user's own. */
export const levelLabel = (info: LevelInfo): string => (info.estimated ? `≈${info.level}` : info.level);

// ---------------------------------------------------------------------------------------------
// Ordering new words (plan.new_order "level")

const REG_WEIGHT: Record<SlangLevel, number> = { 0: 0, 1: 0.5, 2: 2, 3: 3 };

/**
 * The first sort key of `new_order: "level"`, ascending: band + register. Band: the level's index
 * (A1 = 0 …) up to the target, 10 + index above it, 5 with no level. Register: slang 0 → 0,
 * 1 → 0.5, 2 → 2, 3 → 3, +1 for verlan. Ties go to Lexique frequency (descending), then
 * `created_at` and id, in the planner.
 */
export function levelSortKey(
  info: LevelInfo | null,
  word: Pick<LevelWord, "slang_level" | "verlan">,
  target: Cefr = "B2",
): number {
  const i = info ? CEFR_LEVELS.indexOf(info.level) : -1;
  const band = i < 0 ? 5 : i <= CEFR_LEVELS.indexOf(target) ? i : 10 + i;
  return band + (REG_WEIGHT[word.slang_level] ?? 0) + (word.verlan ? 1 : 0);
}

/** Looks a key up in Lexique (lib/lexique.ts `Lexique.lookup`). */
export type LexLookup = (key: string, pos?: PartOfSpeech) => LexFreq | null;

export interface LevelResolver {
  /** False until the FLELex file and the Lexique list are in (only stored levels before that). */
  readonly ready: boolean;
  level(word: LevelWord): LevelInfo | null;
  /** Lexique frequency per million of the word's lemma (the planner's second key); null when unknown. */
  freq(word: Pick<LevelWord, "fr" | "pos">): number | null;
}

/** One object for the planner, the UI and the connector, over whatever data is loaded. */
export function createLevelResolver(data: CefrData | null, lookup: LexLookup | null, ready = true): LevelResolver {
  const lexOf = (w: Pick<LevelWord, "fr" | "pos">): LexFreq | null => {
    if (!lookup) return null;
    for (const key of levelKeys(w.fr)) {
      const hit = lookup(key, w.pos);
      if (hit) return hit;
    }
    return null;
  };
  return {
    ready,
    level: (w) => storedLevel(w) ?? (hasNoEstimate(w) ? null : estimateLevel(w, data, lexOf(w))),
    freq: (w) => lexOf(w)?.freq ?? null,
  };
}
