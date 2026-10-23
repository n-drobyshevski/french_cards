// «Упражнения»: the pure rules of an exercise set, shared by the connector (lib/mcp, which writes
// sets) and the app (lib/exercises.ts, which plays them). No Dexie and no node built-ins, so both
// sides import it. The item contract is documented on ExerciseItem in lib/types.ts.
//
// Server side: `completeSet(input, ctx)` fills the server-written parts (ids, word snapshots, the
// choice/meaning prompt and answer, the register answer, pairs tiles), then `validateSet(set, ctx)`
// refuses a broken set with path-precise errors and `warningsFor(set)` lists what is merely weak.
// App side: `optionsFor`, `clozeParts`, `pairsBoard`, `buildQueue` / `requeue` / `resumeQueue`,
// `scoreRun`, `missedWords`, and the request texts the user copies into Claude.
import { advancePractice } from "./practice";
import { normalizeLemma, searchKey } from "./text";
import {
  SLANG_LABELS,
  type ExerciseAnswer,
  type ExerciseItem,
  type ExerciseItemType,
  type ExerciseNewWord,
  type ExerciseOutcome,
  type ExercisePairTile,
  type ExerciseRun,
  type ExerciseSet,
  type ExerciseSkill,
  type ExerciseWordSnapshot,
  type Gender,
  type PartOfSpeech,
  type SlangLevel,
  type Word,
} from "../types";

/** Set ids are "x-" + sha256(client_ref) (computed on the server with node crypto). */
export const EXERCISE_ID_PREFIX = "x-";

export const EXERCISE_ITEM_TYPES: readonly ExerciseItemType[] = ["choice", "cloze", "register", "pairs"];
export const EXERCISE_SKILLS: readonly ExerciseSkill[] = ["meaning", "form", "neutral", "verlan", "situation"];
/** The register item's four options, in level order: index = slang_level. */
export const REGISTER_LEVELS = SLANG_LABELS;

export const ITEMS_MIN = 6;
export const ITEMS_MAX = 20;
export const NEW_WORDS_MAX = 8;
/** choice and cloze carry exactly this many distractors: 4 options in the 2×2 grid. */
export const DISTRACTORS = 3;
export const PAIRS_MIN = 4;
export const PAIRS_MAX = 6;
export const TITLE_MAX = 60;
export const TOPIC_MAX = 120;
export const TEXT_MAX = 300;
export const ANSWER_MAX = 120;
export const EXPLAIN_MAX = 200;
export const REF_MAX = 20;
/** At least this many other items between two items about the same word, where possible. */
export const MIN_GAP = 2;
/** An item missed this many times leaves the round instead of coming back again. */
export const MAX_ATTEMPTS = 3;
/** The request sizes the app offers. */
export const REQUEST_SIZES = [8, 12, 16] as const;

export const CLOZE_PROMPT = "Какое слово пропущено?";
export const PAIRS_PROMPT = "Соедини слово и перевод";
export const REGISTER_PROMPT = "Насколько это разговорно?";

// ---------------------------------------------------------------------------------------------
// Inputs and the library lookup

/** The fields of a library word an exercise needs. Repo rows and Dexie rows both fit. */
export type ExerciseLibraryWord = Pick<
  Word,
  "id" | "fr" | "ru" | "pos" | "gender" | "slang_level" | "verlan" | "example_fr" | "example_ru" | "deleted_at"
> & { muted?: boolean };

export interface ExerciseContext {
  /** A library word by id. Return deleted and paused words too, so the error can say why. */
  word(id: string): ExerciseLibraryWord | undefined;
  /** The live library word with this French form (normalizeLemma), if any: a new word must not be one. */
  savedWord?(fr: string): { id: string } | undefined;
}

/** A context over a list of library words (the server's `repo.words()`, or Dexie rows). */
export function contextFromWords(words: readonly ExerciseLibraryWord[]): ExerciseContext {
  const byId = new Map(words.map((w) => [w.id, w]));
  const byLemma = new Map<string, ExerciseLibraryWord>();
  for (const w of words) if (w.deleted_at === null && !byLemma.has(normalizeLemma(w.fr))) byLemma.set(normalizeLemma(w.fr), w);
  return { word: (id) => byId.get(id), savedWord: (fr) => byLemma.get(normalizeLemma(fr)) };
}

/** An item as Claude sends it: everything but `type` is optional; completeSet fills the rest. */
export interface ExerciseItemInput {
  id?: string | null;
  type: ExerciseItemType;
  skill?: ExerciseSkill | null;
  ask?: "fr" | "ru" | null;
  word_id?: string | null;
  new_ref?: string | null;
  prompt?: string | null;
  sentence?: string | null;
  sentence_ru?: string | null;
  answer?: string | null;
  distractors?: readonly string[] | null;
  pairs?: readonly string[] | null;
  explain_ru?: string | null;
}

export interface ExerciseNewWordInput {
  ref: string;
  fr: string;
  ru: string;
  note?: string | null;
  example_fr?: string | null;
  example_ru?: string | null;
  pos?: PartOfSpeech | null;
  gender?: Gender | null;
  slang_level?: SlangLevel | null;
  verlan?: boolean | null;
  origin?: string | null;
  source_url?: string | null;
}

export interface ExerciseSetInput {
  title: string;
  topic?: string | null;
  folders?: readonly string[] | null;
  items: readonly ExerciseItemInput[];
  new_words?: readonly ExerciseNewWordInput[] | null;
}

/** The content columns of a set (what the connector writes, without id and timestamps). */
export type ExerciseSetContent = Pick<ExerciseSet, "title" | "topic" | "folders" | "items" | "new_words">;

const clean = (s: unknown): string | null => {
  if (typeof s !== "string") return null;
  const t = s.replace(/\s+/g, " ").trim();
  return t ? t : null;
};

const cleanList = (list: unknown): string[] =>
  Array.isArray(list) ? list.map((x) => (typeof x === "string" ? x.replace(/\s+/g, " ").trim() : "")) : [];

const isLevel = (n: unknown): n is SlangLevel => n === 0 || n === 1 || n === 2 || n === 3;

/** The snapshot an item carries of its word. */
export function wordSnapshot(word: Pick<Word, "fr" | "ru" | "pos" | "gender" | "slang_level" | "verlan" | "example_fr" | "example_ru">): ExerciseWordSnapshot {
  return {
    fr: word.fr,
    ru: word.ru,
    pos: word.pos,
    gender: word.gender,
    slang_level: word.slang_level,
    verlan: word.verlan,
    example_fr: word.example_fr ?? null,
    example_ru: word.example_ru ?? null,
  };
}

const usable = (w: ExerciseLibraryWord | undefined): w is ExerciseLibraryWord => !!w && w.deleted_at === null && !w.muted;

/**
 * The set as it is stored: ids "q1".."qN" where missing, defaults (choice → skill "meaning",
 * meaning → ask "fr"), `null` / `[]` for absent fields, word snapshots, the choice/meaning prompt
 * and answer when left out, the register answer from the word's level, the cloze answer from its
 * span when left out, and the pairs tiles. Unknown refs stay unresolved for `validateSet` to report.
 */
export function completeSet(input: ExerciseSetInput, ctx: ExerciseContext): ExerciseSetContent {
  const newWords: ExerciseNewWord[] = (input.new_words ?? []).map((w) => ({
    ref: clean(w.ref) ?? "",
    fr: clean(w.fr) ?? "",
    ru: clean(w.ru) ?? "",
    note: clean(w.note),
    example_fr: clean(w.example_fr),
    example_ru: clean(w.example_fr) ? clean(w.example_ru) : null,
    pos: w.pos ?? "other",
    gender: w.gender ?? "none",
    slang_level: isLevel(w.slang_level) ? w.slang_level : 0,
    verlan: w.verlan ?? false,
    origin: clean(w.origin),
    source_url: clean(w.source_url),
  }));
  const byRef = new Map(newWords.map((w) => [w.ref, w]));
  const snapshotOf = (wordId: string | null, newRef: string | null): ExerciseWordSnapshot | null => {
    if (wordId) {
      const w = ctx.word(wordId);
      return usable(w) ? wordSnapshot(w) : null;
    }
    const n = newRef ? byRef.get(newRef) : undefined;
    return n ? wordSnapshot(n) : null;
  };
  const tileOf = (ref: string): ExercisePairTile | null => {
    const n = byRef.get(ref);
    if (n) return { key: ref, fr: n.fr, ru: n.ru };
    const w = ctx.word(ref);
    return usable(w) ? { key: ref, fr: w.fr, ru: w.ru } : null;
  };

  const items = input.items.map((raw, i): ExerciseItem => {
    const type = raw.type;
    const pairs = type === "pairs";
    const skill = type === "choice" ? (raw.skill ?? "meaning") : null;
    const ask = skill === "meaning" ? (raw.ask ?? "fr") : null;
    const word_id = pairs ? null : clean(raw.word_id);
    const new_ref = pairs ? null : clean(raw.new_ref);
    const word = pairs ? null : snapshotOf(word_id, new_ref);
    let prompt = clean(raw.prompt);
    let answer = clean(raw.answer);
    const sentence = type === "cloze" ? clean(raw.sentence) : null;
    if (skill === "meaning" && word) {
      prompt ??= ask === "ru" ? word.ru : word.fr;
      answer ??= ask === "ru" ? word.fr : word.ru;
    }
    if (type === "cloze" && !answer && sentence) answer = clozeParts(sentence)?.answer ?? null;
    if (type === "register") answer = word ? REGISTER_LEVELS[word.slang_level] : null;
    const refs = pairs ? cleanList(raw.pairs) : [];
    return {
      id: clean(raw.id) ?? `q${i + 1}`,
      type,
      skill,
      ask,
      word_id,
      new_ref,
      prompt: pairs ? null : prompt,
      sentence,
      sentence_ru: type === "cloze" ? clean(raw.sentence_ru) : null,
      answer: pairs ? null : answer,
      distractors: type === "choice" || type === "cloze" ? cleanList(raw.distractors) : [],
      pairs: refs,
      tiles: refs.map(tileOf).filter((t): t is ExercisePairTile => t !== null),
      explain_ru: clean(raw.explain_ru),
      word,
    };
  });

  return {
    title: clean(input.title) ?? "",
    topic: clean(input.topic),
    folders: [...new Set(cleanList(input.folders).filter(Boolean))],
    items,
    new_words: newWords,
  };
}

// ---------------------------------------------------------------------------------------------
// Validation

export interface ExerciseError {
  /** Where: "items[7].word_id", "new_words[0].ref", "title". */
  path: string;
  message: string;
}

export interface ExerciseValidation {
  ok: boolean;
  errors: ExerciseError[];
}

const CLOZE_SPAN = /\[\[([^[\]]*)\]\]/g;

/** A cloze sentence split at its one [[answer]] span; null unless there is exactly one non-empty span. */
export function clozeParts(sentence: string): { before: string; after: string; answer: string } | null {
  const spans = [...sentence.matchAll(CLOZE_SPAN)];
  if (spans.length !== 1) return null;
  const [m] = spans;
  const answer = m[1].trim();
  if (!answer) return null;
  return { before: sentence.slice(0, m.index), after: sentence.slice(m.index + m[0].length), answer };
}

/**
 * Checks a completed set against the rules (see ExerciseItem in lib/types.ts). Every problem is
 * reported with its path, so Claude can fix them all in one retry.
 */
export function validateSet(set: ExerciseSetContent, ctx: ExerciseContext): ExerciseValidation {
  const errors: ExerciseError[] = [];
  const err = (path: string, message: string) => errors.push({ path, message });
  const text = (path: string, value: unknown, max: number, required: boolean) => {
    if (value === null || value === undefined || value === "") {
      if (required) err(path, "required");
      return;
    }
    if (typeof value !== "string") err(path, "must be a string");
    else if (value.length > max) err(path, `too long (${value.length} > ${max} characters)`);
  };

  text("title", set.title, TITLE_MAX, true);
  text("topic", set.topic, TOPIC_MAX, false);

  const newWords = Array.isArray(set.new_words) ? set.new_words : [];
  if (newWords.length > NEW_WORDS_MAX) err("new_words", `at most ${NEW_WORDS_MAX} new words (got ${newWords.length})`);
  const refs = new Set<string>();
  const newLemmas = new Set<string>();
  newWords.forEach((w, i) => {
    const p = `new_words[${i}]`;
    if (!w.ref) err(`${p}.ref`, "required");
    else if (w.ref.length > REF_MAX) err(`${p}.ref`, `too long (> ${REF_MAX} characters)`);
    else if (refs.has(w.ref)) err(`${p}.ref`, `duplicate ref "${w.ref}"`);
    else refs.add(w.ref);
    text(`${p}.fr`, w.fr, 200, true);
    text(`${p}.ru`, w.ru, TEXT_MAX, true);
    if (!isLevel(w.slang_level)) err(`${p}.slang_level`, "must be 0, 1, 2 or 3");
    if (w.fr) {
      const lemma = normalizeLemma(w.fr);
      if (newLemmas.has(lemma)) err(`${p}.fr`, `«${w.fr}» is listed twice`);
      newLemmas.add(lemma);
      const saved = ctx.savedWord?.(w.fr);
      if (saved) err(`${p}.fr`, `«${w.fr}» is already saved: use word_id ${saved.id}`);
    }
  });

  const items = Array.isArray(set.items) ? set.items : [];
  if (items.length < ITEMS_MIN || items.length > ITEMS_MAX) err("items", `${ITEMS_MIN}–${ITEMS_MAX} items (got ${items.length})`);

  const checkWordRef = (path: string, id: string) => {
    const w = ctx.word(id);
    if (!w || w.deleted_at !== null) err(path, `no such word "${id}"`);
    else if (w.muted) err(path, `«${w.fr}» is paused (muted): pick another word`);
  };
  const checkRef = (p: string, item: ExerciseItem) => {
    if (item.word_id && item.new_ref) err(`${p}.word_id`, "set word_id or new_ref, not both");
    else if (item.word_id) checkWordRef(`${p}.word_id`, item.word_id);
    else if (item.new_ref) {
      if (!refs.has(item.new_ref)) err(`${p}.new_ref`, `no new word with ref "${item.new_ref}"`);
    } else err(`${p}.word_id`, "required (or new_ref)");
  };
  const checkOptions = (p: string, item: ExerciseItem) => {
    text(`${p}.answer`, item.answer, ANSWER_MAX, true);
    const list = Array.isArray(item.distractors) ? item.distractors : [];
    if (list.length !== DISTRACTORS) {
      err(`${p}.distractors`, `exactly ${DISTRACTORS} distractors (got ${list.length})`);
    }
    const answerKey = item.answer ? searchKey(item.answer) : null;
    const seen = new Set<string>();
    list.forEach((d, j) => {
      const dp = `${p}.distractors[${j}]`;
      if (typeof d !== "string" || !d.trim()) return err(dp, "empty");
      if (d.length > ANSWER_MAX) return err(dp, `too long (> ${ANSWER_MAX} characters)`);
      const key = searchKey(d);
      if (key === answerKey) err(dp, `equals the answer «${item.answer}»`);
      else if (seen.has(key)) err(dp, `duplicate distractor «${d}»`);
      seen.add(key);
    });
  };
  const checkEmpty = (p: string, item: ExerciseItem, why: string) => {
    if (Array.isArray(item.distractors) && item.distractors.length > 0) err(`${p}.distractors`, why);
  };

  const ids = new Set<string>();
  items.forEach((item, i) => {
    const p = `items[${i}]`;
    if (!item.id) err(`${p}.id`, "required");
    else if (item.id.length > REF_MAX) err(`${p}.id`, `too long (> ${REF_MAX} characters)`);
    else if (ids.has(item.id)) err(`${p}.id`, `duplicate id "${item.id}"`);
    else ids.add(item.id);
    text(`${p}.explain_ru`, item.explain_ru, EXPLAIN_MAX, false);
    text(`${p}.prompt`, item.prompt, TEXT_MAX, item.type === "choice");

    switch (item.type) {
      case "choice":
        checkRef(p, item);
        if (!item.skill || !EXERCISE_SKILLS.includes(item.skill)) err(`${p}.skill`, `one of ${EXERCISE_SKILLS.join(", ")}`);
        if (item.skill === "meaning" && item.ask !== "fr" && item.ask !== "ru") err(`${p}.ask`, 'meaning items ask "fr" or "ru"');
        checkOptions(p, item);
        break;
      case "cloze": {
        checkRef(p, item);
        text(`${p}.sentence`, item.sentence, TEXT_MAX, true);
        text(`${p}.sentence_ru`, item.sentence_ru, TEXT_MAX, false);
        if (item.sentence) {
          const spans = [...item.sentence.matchAll(CLOZE_SPAN)].length;
          const parts = clozeParts(item.sentence);
          if (spans !== 1) err(`${p}.sentence`, `exactly one [[…]] span (got ${spans})`);
          else if (!parts) err(`${p}.sentence`, "the [[…]] span is empty");
          else if (item.answer && normalizeLemma(parts.answer) !== normalizeLemma(item.answer)) {
            err(`${p}.sentence`, `the span «${parts.answer}» differs from the answer «${item.answer}»`);
          }
        }
        checkOptions(p, item);
        break;
      }
      case "register":
        checkRef(p, item);
        if (!item.word || !isLevel(item.word.slang_level)) err(`${p}.word`, "a register item needs a word with a slang_level");
        else if (item.answer !== REGISTER_LEVELS[item.word.slang_level]) err(`${p}.answer`, `must be «${REGISTER_LEVELS[item.word.slang_level]}»`);
        checkEmpty(p, item, "register items use the four levels as options; leave distractors empty");
        break;
      case "pairs": {
        const list = Array.isArray(item.pairs) ? item.pairs : [];
        if (list.length < PAIRS_MIN || list.length > PAIRS_MAX) err(`${p}.pairs`, `${PAIRS_MIN}–${PAIRS_MAX} words (got ${list.length})`);
        const seen = new Set<string>();
        list.forEach((ref, j) => {
          const rp = `${p}.pairs[${j}]`;
          if (!ref) return err(rp, "empty");
          if (seen.has(ref)) return err(rp, `duplicate "${ref}"`);
          seen.add(ref);
          if (!refs.has(ref)) checkWordRef(rp, ref);
        });
        const tiles = Array.isArray(item.tiles) ? item.tiles : [];
        const resolved = list.filter((ref) => refs.has(ref) || usable(ctx.word(ref))).length;
        if (resolved === list.length && tiles.length !== list.length) err(`${p}.tiles`, "must match pairs (built by the server)");
        if (tiles.length === list.length) {
          const ru = new Set<string>();
          const fr = new Set<string>();
          tiles.forEach((t, j) => {
            if (ru.has(searchKey(t.ru))) err(`${p}.pairs[${j}]`, `two words share the translation «${t.ru}»`);
            if (fr.has(searchKey(t.fr))) err(`${p}.pairs[${j}]`, `«${t.fr}» is listed twice`);
            ru.add(searchKey(t.ru));
            fr.add(searchKey(t.fr));
          });
        }
        checkEmpty(p, item, "pairs items have no distractors");
        break;
      }
      default:
        err(`${p}.type`, `one of ${EXERCISE_ITEM_TYPES.join(", ")}`);
    }
  });

  return { ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------------------------
// Warnings (the set is still saved)

export type ExerciseWarningCode = "few_types" | "longest_answer" | "stem_leak" | "consecutive_word" | "many_new_words";

export interface ExerciseWarning {
  code: ExerciseWarningCode;
  message: string;
  path?: string;
}

/** The words an item is about: its word_id or new_ref, or every word of a pairs item. */
export function itemWordKeys(item: Pick<ExerciseItem, "type" | "word_id" | "new_ref" | "pairs">): string[] {
  if (item.type === "pairs") return [...item.pairs];
  const key = item.word_id ?? item.new_ref;
  return key ? [key] : [];
}

/** Folded text split into words, padded with spaces, for whole-word containment. */
const words = (s: string) => ` ${searchKey(s).replace(/[^\p{L}\p{N}']+/gu, " ").trim()} `;
const containsWord = (hay: string, needle: string) => {
  const n = words(needle).trim();
  return n.length >= 3 && words(hay).includes(` ${n} `);
};

/** What an item shows before it is answered (its own cloze span removed). */
const stemsOf = (item: ExerciseItem): string[] =>
  [item.prompt, item.sentence?.replace(CLOZE_SPAN, " "), item.sentence_ru].filter((s): s is string => !!s);

/**
 * What makes a set weak, without blocking it: fewer than 3 item types; the answer is the longest
 * option in more than 60% of choice/cloze items; an answer shows in a stem (its own, or another
 * item's about a different word); the same word in two consecutive items; more than 30% of the
 * set's words are new.
 */
export function warningsFor(set: Pick<ExerciseSet, "items" | "new_words">): ExerciseWarning[] {
  const out: ExerciseWarning[] = [];
  const items = set.items;

  const types = new Set(items.map((i) => i.type));
  if (types.size < 3) out.push({ code: "few_types", message: `only ${types.size} item type(s); use at least 3 (choice, cloze, register, pairs)` });

  const optioned = items.filter((i) => (i.type === "choice" || i.type === "cloze") && i.answer && i.distractors.length > 0);
  const longest = optioned.filter((i) => i.answer!.length > Math.max(...i.distractors.map((d) => d.length))).length;
  if (optioned.length >= 3 && longest / optioned.length > 0.6) {
    out.push({
      code: "longest_answer",
      message: `the answer is the longest option in ${longest} of ${optioned.length} items; match the distractors' length`,
    });
  }

  items.forEach((item, i) => {
    if (!item.answer || item.type === "register" || item.type === "pairs") return;
    const own = item.type === "cloze" ? stemsOf(item) : item.prompt ? [item.prompt] : [];
    if (own.some((s) => containsWord(s, item.answer!))) {
      out.push({ code: "stem_leak", path: `items[${i}]`, message: `the answer «${item.answer}» shows in the item's own stem` });
      return;
    }
    const mine = new Set(itemWordKeys(item));
    const leak = items.findIndex(
      (other, j) => j !== i && !itemWordKeys(other).some((k) => mine.has(k)) && stemsOf(other).some((s) => containsWord(s, item.answer!)),
    );
    if (leak >= 0) out.push({ code: "stem_leak", path: `items[${i}]`, message: `the answer «${item.answer}» shows in the stem of items[${leak}]` });
  });

  for (let i = 1; i < items.length; i++) {
    const prev = new Set(itemWordKeys(items[i - 1]));
    if (itemWordKeys(items[i]).some((k) => prev.has(k))) {
      out.push({ code: "consecutive_word", path: `items[${i}]`, message: `items[${i - 1}] and items[${i}] are about the same word; space them out` });
    }
  }

  const all = new Set(items.flatMap(itemWordKeys));
  const refs = new Set(set.new_words.map((w) => w.ref));
  const fresh = [...all].filter((k) => refs.has(k)).length;
  if (all.size > 0 && fresh / all.size > 0.3) {
    out.push({ code: "many_new_words", message: `${fresh} of ${all.size} words are new (over 30%); mix in more library words` });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Playing

/** A small seeded PRNG (mulberry32): the same seed gives the same shuffle. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates on a copy. */
export function shuffled<T>(list: readonly T[], random: () => number = Math.random): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface ExerciseOptions {
  options: string[];
  /** Index of the right option; -1 for pairs (no options). */
  correct: number;
}

/**
 * The options of an item as the grid shows them: choice / cloze shuffle the answer among its
 * distractors (reshuffle on each attempt with a new `random`); register lists the four levels in
 * order (index = slang_level); pairs has none (see `pairsBoard`).
 */
export function optionsFor(item: ExerciseItem, random: () => number = Math.random): ExerciseOptions {
  if (item.type === "register") {
    const level = item.word && isLevel(item.word.slang_level) ? item.word.slang_level : REGISTER_LEVELS.indexOf(item.answer as (typeof REGISTER_LEVELS)[number]);
    return { options: [...REGISTER_LEVELS], correct: level };
  }
  if (item.type === "pairs" || !item.answer) return { options: [], correct: -1 };
  const order = shuffled([0, ...item.distractors.map((_, i) => i + 1)], random);
  const all = [item.answer, ...item.distractors];
  return { options: order.map((i) => all[i]), correct: order.indexOf(0) };
}

/** A pairs item's two columns, each shuffled on its own: French tiles and Russian tiles. */
export function pairsBoard(item: ExerciseItem, random: () => number = Math.random): { fr: ExercisePairTile[]; ru: ExercisePairTile[] } {
  return { fr: shuffled(item.tiles, random), ru: shuffled(item.tiles, random) };
}

/** One step of a round: a new word's intro card, or an item (attempt 1 the first time). */
export type QueueEntry = { kind: "intro"; new_ref: string } | { kind: "item"; item_id: string; attempt: number };

export interface QueueOptions {
  /** Only these items (a «Повторить ошибки» round); default every item. */
  itemIds?: readonly string[];
  /** Intro cards before the first item of each new word (default true). */
  intros?: boolean;
  /** When given, the items are shuffled before spacing (the set's own order is kept otherwise). */
  random?: () => number;
}

/** The items a run plays, in set order. */
export function runItems(set: Pick<ExerciseSet, "items">, itemIds?: readonly string[]): ExerciseItem[] {
  if (!itemIds || itemIds.length === 0) return [...set.items];
  const wanted = new Set(itemIds);
  return set.items.filter((i) => wanted.has(i.id));
}

/**
 * The round's queue. Items keep the set's order (Claude orders them: recognise before produce,
 * weak words late), except that an item moves later when its word was in one of the previous
 * MIN_GAP items and another item can go first. A new word's intro card comes right before the
 * first item that uses it.
 */
export function buildQueue(set: Pick<ExerciseSet, "items" | "new_words">, opts: QueueOptions = {}): QueueEntry[] {
  const base = runItems(set, opts.itemIds);
  const remaining = opts.random ? shuffled(base, opts.random) : base;
  const placed: ExerciseItem[] = [];
  while (remaining.length > 0) {
    const recent = (back: number) => new Set(placed.slice(-back).flatMap(itemWordKeys));
    const clashes = (item: ExerciseItem, keys: Set<string>) => itemWordKeys(item).some((k) => keys.has(k));
    let pick = remaining.findIndex((it) => !clashes(it, recent(MIN_GAP)));
    if (pick < 0) pick = remaining.findIndex((it) => !clashes(it, recent(1)));
    if (pick < 0) pick = 0;
    placed.push(remaining.splice(pick, 1)[0]);
  }
  const refs = new Set(set.new_words.map((w) => w.ref));
  const introduced = new Set<string>();
  const out: QueueEntry[] = [];
  for (const item of placed) {
    if (opts.intros !== false) {
      for (const key of itemWordKeys(item)) {
        if (!refs.has(key) || introduced.has(key)) continue;
        introduced.add(key);
        out.push({ kind: "intro", new_ref: key });
      }
    }
    out.push({ kind: "item", item_id: item.id, attempt: 1 });
  }
  return out;
}

/**
 * The queue after its head was answered. A right answer (or a seen intro card) drops it; a wrong
 * answer or «Не знаю» brings the item back after 3 others (`advancePractice`, rating Again) with
 * the next attempt number, until MAX_ATTEMPTS misses. Never touches the schedule.
 */
export function requeue(queue: readonly QueueEntry[], outcome: ExerciseOutcome | "seen"): QueueEntry[] {
  if (queue.length === 0) return [];
  const [head, ...rest] = queue;
  if (head.kind === "intro" || outcome === "correct" || outcome === "seen" || head.attempt >= MAX_ATTEMPTS) return rest;
  return advancePractice([{ ...head, attempt: head.attempt + 1 }, ...rest], 1);
}

/** Per item of the run: its last attempt and whether it is settled (answered right, or out of attempts). */
function attemptsOf(answers: readonly ExerciseAnswer[]): Map<string, { last: number; settled: boolean }> {
  const out = new Map<string, { last: number; settled: boolean }>();
  for (const a of answers) {
    const prev = out.get(a.item_id);
    const last = Math.max(prev?.last ?? 0, a.attempt);
    out.set(a.item_id, { last, settled: !!prev?.settled || a.outcome === "correct" || a.attempt >= MAX_ATTEMPTS });
  }
  return out;
}

/** The queue to continue an unfinished run («Продолжить»): unsettled items, intros only for words not met yet. */
export function resumeQueue(set: Pick<ExerciseSet, "items" | "new_words">, run: Pick<ExerciseRun, "item_ids" | "answers" | "kind">): QueueEntry[] {
  const attempts = attemptsOf(run.answers);
  const items = runItems(set, run.item_ids);
  const open = items.filter((i) => !attempts.get(i.id)?.settled).map((i) => i.id);
  if (open.length === 0) return [];
  const met = new Set(items.filter((i) => attempts.has(i.id)).flatMap(itemWordKeys));
  return buildQueue(set, { itemIds: open, intros: run.kind !== "mistakes" })
    .filter((e) => e.kind === "item" || !met.has(e.new_ref))
    .map((e) => (e.kind === "item" ? { ...e, attempt: (attempts.get(e.item_id)?.last ?? 0) + 1 } : e));
}

/** Items answered right on the first attempt with no miss in it (a pairs board can log misses before its last match). */
export function countFirstTry(answers: readonly ExerciseAnswer[]): number {
  const first = answers.filter((a) => a.attempt === 1);
  const missed = new Set(first.filter((a) => a.outcome !== "correct").map((a) => a.item_id));
  return new Set(first.filter((a) => a.outcome === "correct" && !missed.has(a.item_id)).map((a) => a.item_id)).size;
}

export interface RunScore {
  /** Questions in the run. */
  total: number;
  /** Questions answered at least once. */
  answered: number;
  first_try: number;
  /** first_try / total, a whole percent. */
  accuracy: number;
}

/** The done screen's receipt: «Вопросов 12 / С первого раза 9 / 75 %». */
export function scoreRun(run: Pick<ExerciseRun, "item_ids" | "answers">, set: Pick<ExerciseSet, "items">): RunScore {
  const ids = new Set(runItems(set, run.item_ids).map((i) => i.id));
  const answers = run.answers.filter((a) => ids.has(a.item_id));
  const total = ids.size;
  const first_try = countFirstTry(answers);
  return {
    total,
    answered: new Set(answers.map((a) => a.item_id)).size,
    first_try,
    accuracy: total === 0 ? 0 : Math.round((first_try / total) * 100),
  };
}

/** Items missed at least once («Не знаю» included), in the order of their first miss. */
export function missedItemIds(run: Pick<ExerciseRun, "answers">): string[] {
  return [...new Set(run.answers.filter((a) => a.outcome !== "correct").map((a) => a.item_id))];
}

export interface MissedWord {
  /** The word_id or new_ref. */
  key: string;
  word_id: string | null;
  new_ref: string | null;
  fr: string;
  ru: string;
  /** The full snapshot when the set has one (not for a word met only in pairs). */
  word: ExerciseWordSnapshot | null;
  item_ids: string[];
  /** Wrong options picked, for the confusions Claude reads («keuf» instead of «meuf»). */
  chosen: string[];
}

/** The words behind the misses, in the order of their first miss, one entry per word. */
export function missedWords(run: Pick<ExerciseRun, "answers">, set: Pick<ExerciseSet, "items" | "new_words">): MissedWord[] {
  const items = new Map(set.items.map((i) => [i.id, i]));
  const fresh = new Map(set.new_words.map((w) => [w.ref, w]));
  const out = new Map<string, MissedWord>();
  for (const a of run.answers) {
    if (a.outcome === "correct") continue;
    const item = items.get(a.item_id);
    const word_id = a.word_id ?? (a.new_ref ? null : (item?.word_id ?? null));
    const new_ref = word_id ? null : (a.new_ref ?? item?.new_ref ?? null);
    const key = word_id ?? new_ref;
    if (!key) continue;
    let entry = out.get(key);
    if (!entry) {
      const n = new_ref ? fresh.get(new_ref) : undefined;
      const snapshot =
        (n ? wordSnapshot(n) : null) ??
        set.items.find((i) => (i.word_id ?? i.new_ref) === key && i.word)?.word ??
        null;
      const tile = snapshot ? null : set.items.flatMap((i) => i.tiles).find((t) => t.key === key);
      const fr = snapshot?.fr ?? tile?.fr;
      const ru = snapshot?.ru ?? tile?.ru;
      if (fr === undefined || ru === undefined) continue;
      entry = { key, word_id, new_ref, fr, ru, word: snapshot, item_ids: [], chosen: [] };
      out.set(key, entry);
    }
    if (!entry.item_ids.includes(a.item_id)) entry.item_ids.push(a.item_id);
    if (a.chosen && !entry.chosen.includes(a.chosen)) entry.chosen.push(a.chosen);
  }
  return [...out.values()];
}

// ---------------------------------------------------------------------------------------------
// Request texts (copied into a Claude chat)

const plural = (n: number, forms: readonly [string, string, string]) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1];
  return forms[2];
};
const questions = (n: number) => `${n} ${plural(n, ["вопрос", "вопроса", "вопросов"])}`;
const quoted = (s: string) => `«${s}»`;

export interface RequestSpec {
  /** Theme names («Люди», «Входящие»). */
  folders: readonly string[];
  /** A free-text topic («вечеринка»), or null. */
  topic: string | null;
  size: number;
  /** «можно новые слова»: Claude may bring words that are not in the library. */
  allowNew: boolean;
}

/**
 * «Сделай упражнение в Карточках по теме «Люди», 12 вопросов.»,
 * «Сделай упражнение в Карточках: темы «Люди», «Эмоции», 12 вопросов, можно новые слова.»,
 * «Сделай упражнение в Карточках на тему «вечеринка», 12 вопросов, можно новые слова.»,
 * «Сделай упражнение в Карточках по всем темам, 12 вопросов.»
 */
export function buildRequestText({ folders, topic, size, allowNew }: RequestSpec): string {
  const names = [...new Set(folders.map((f) => f.trim()).filter(Boolean))];
  const custom = topic?.replace(/\s+/g, " ").trim() || null;
  let where: string;
  if (names.length === 0) where = custom ? ` на тему ${quoted(custom)}` : " по всем темам";
  else if (names.length === 1) where = ` по теме ${quoted(names[0])}${custom ? ` и на тему ${quoted(custom)}` : ""}`;
  else where = `: темы ${names.map(quoted).join(", ")}${custom ? ` и тема ${quoted(custom)}` : ""}`;
  return `Сделай упражнение в Карточках${where}, ${questions(size)}${allowNew ? ", можно новые слова" : ""}.`;
}

/**
 * «Попросить следующий набор»: «Сделай следующее упражнение в Карточках после «Вечеринка»,
 * 12 вопросов, с упором на ошибки: relou, keuf, ouf.»
 */
export function buildFollowUpText(
  set: Pick<ExerciseSet, "title" | "items" | "new_words">,
  missed: readonly Pick<MissedWord, "fr">[],
): string {
  const frs = [...new Set(missed.map((m) => m.fr))];
  const focus = frs.length ? `, с упором на ошибки: ${frs.join(", ")}` : "";
  const fresh = set.new_words.length > 0 ? ", можно новые слова" : "";
  return `Сделай следующее упражнение в Карточках после ${quoted(set.title)}, ${questions(set.items.length)}${focus}${fresh}.`;
}
