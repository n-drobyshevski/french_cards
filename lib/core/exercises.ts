// «Упражнения»: the pure rules of an exercise set, shared by the connector (lib/mcp, which writes
// sets) and the app (lib/exercises.ts, which plays them). No Dexie and no node built-ins, so both
// sides import it. The item contract is documented on ExerciseItem in lib/types.ts.
//
// Server side: `completeSet(input, ctx)` fills the server-written parts (ids, word snapshots, the
// choice/meaning prompt and answer, pairs tiles, the conjugate answer, gap and distractors from the
// verb's conjugation), then `validateSet(set, ctx)`
// refuses a broken set with path-precise errors and `warningsFor(set)` lists what is merely weak.
// App side: `optionsFor`, `clozeParts`, `pairsBoard`, `buildQueue` / `requeue` / `resumeQueue`,
// `scoreRun`, `missedWords`, and the request texts the user copies into Claude.
import { CONJ_TENSE_ORDER, splitForm } from "./conj-display";
import { cleanConjugation, conjugate, type ConjData } from "./conjugate";
import { CEFR_LEVELS, isCefr, type Cefr } from "./level";
import { isRussian, normalizeLemma, searchKey } from "./text";
import {
  type Conjugation,
  type ExerciseAnswer,
  type ExerciseItem,
  type ExerciseItemType,
  type ExerciseNewWord,
  type ExerciseOutcome,
  type ExercisePairTile,
  type ExercisePerson,
  type ExerciseRun,
  type ExerciseScope,
  type ExerciseSet,
  type ExerciseSkill,
  type ExerciseTense,
  type ExerciseWordSnapshot,
  type Gender,
  type PartOfSpeech,
  type SlangLevel,
  type Word,
} from "../types";

/** Set ids are "x-" + sha256(client_ref) (computed on the server with node crypto). */
export const EXERCISE_ID_PREFIX = "x-";

/**
 * Every item type a stored set can hold: what old rows and backups are read with. «register» (pick
 * нейтр. / fam. / arg. / vulg.) is no longer made or played; its items stay in old sets only.
 */
export const EXERCISE_ITEM_TYPES: readonly ExerciseItemType[] = ["choice", "cloze", "register", "pairs", "conjugate"];
/**
 * The item types still made and played. Anything else in a stored set (an old register item, a type
 * a newer connector invents) is left out of the round, its score and its count, as if it were not there.
 */
export const PLAYED_ITEM_TYPES: readonly ExerciseItemType[] = ["choice", "cloze", "pairs", "conjugate"];
/** An item of a type the player plays (PLAYED_ITEM_TYPES). */
export const isPlayedItem = (item: Pick<ExerciseItem, "type">): boolean => PLAYED_ITEM_TYPES.includes(item.type);
/** The items of a set that count: its played ones, in set order («8 вопросов», the round, the score). */
export const playedItems = <I extends Pick<ExerciseItem, "type">>(items: readonly I[]): I[] => items.filter(isPlayedItem);
export const EXERCISE_SKILLS: readonly ExerciseSkill[] = ["meaning", "form", "neutral", "verlan", "situation"];
/** A conjugate item's tense and person, in the conjugation table's order (person index = form index). */
export const EXERCISE_TENSES: readonly ExerciseTense[] = CONJ_TENSE_ORDER;
export const EXERCISE_PERSONS: readonly ExercisePerson[] = ["je", "tu", "il", "nous", "vous", "ils"];

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
/** «Спряжение глаголов»: a short test (8 by default), and never more than this many conjugate items. */
export const CONJ_REQUEST_SIZES = [6, 8, 10] as const;
export const CONJUGATE_MAX = 10;

export const CLOZE_PROMPT = "Какое слово пропущено?";
export const PAIRS_PROMPT = "Соедини слово и перевод";
export const CONJ_PROMPT = "Какая форма?";

// ---------------------------------------------------------------------------------------------
// Inputs and the library lookup

/** The fields of a library word an exercise needs. Repo rows and Dexie rows both fit. */
export type ExerciseLibraryWord = Pick<
  Word,
  "id" | "fr" | "ru" | "pos" | "gender" | "slang_level" | "verlan" | "example_fr" | "example_ru" | "deleted_at" | "conjugation"
> & { muted?: boolean };

export interface ExerciseContext {
  /** A library word by id. Return deleted and paused words too, so the error can say why. */
  word(id: string): ExerciseLibraryWord | undefined;
  /**
   * The saved (not deleted) library word with this French form (normalizeLemma), if any: a new word
   * must not be one. Paused words are included, with `muted`, so the refusal can say why.
   */
  savedWord?(fr: string): { id: string; muted?: boolean } | undefined;
  /**
   * A verb's conjugation for conjugate items: the one saved on the library word, else the one built
   * from Lexique (a new word has only that one); null when there is none.
   */
  conjugationOf?(wordId: string | null, fr: string): Conjugation | null;
}

/**
 * A context over a list of library words (the server's `repo.words()`, or Dexie rows). `conjData` is
 * the Lexique table (public/lexique/fr-conj.json); without it only the rules conjugate.
 */
export function contextFromWords(words: readonly ExerciseLibraryWord[], conjData: ConjData | null = null): ExerciseContext {
  const byId = new Map(words.map((w) => [w.id, w]));
  const byLemma = new Map<string, ExerciseLibraryWord>();
  for (const w of words) if (w.deleted_at === null && !byLemma.has(normalizeLemma(w.fr))) byLemma.set(normalizeLemma(w.fr), w);
  return {
    word: (id) => byId.get(id),
    savedWord: (fr) => byLemma.get(normalizeLemma(fr)),
    // The same rule as the word card and the connector's search_words: the saved one wins.
    conjugationOf: (wordId, fr) => cleanConjugation(wordId ? byId.get(wordId)?.conjugation : null) ?? conjugate(fr, conjData),
  };
}

/** An item as Claude sends it: everything but `type` is optional; completeSet fills the rest. */
export interface ExerciseItemInput {
  id?: string | null;
  type: ExerciseItemType;
  skill?: ExerciseSkill | null;
  ask?: "fr" | "ru" | null;
  tense?: ExerciseTense | null;
  person?: ExercisePerson | null;
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
  /** A set made only of the user's difficult and/or due words, from every theme (null: an ordinary set). */
  scope?: ExerciseScope | null;
  /** The levels the questions were written for (exercise_material's `level.targets`). */
  levels?: readonly Cefr[] | null;
  /** True when they came from «Авто» (exercise_material's `level.from` "auto"). */
  level_auto?: boolean | null;
}

/** The content columns of a set (what the connector writes, without id and timestamps). */
export type ExerciseSetContent = Pick<ExerciseSet, "title" | "topic" | "folders" | "items" | "new_words" | "scope" | "levels" | "level_auto">;

/** The levels a set can be asked at («Уровень набора»): the TCF range; A1 and C2 fold into A2 / C1. */
export const EXERCISE_LEVELS = ["A2", "B1", "B2", "C1"] as const;
export type ExerciseLevel = (typeof EXERCISE_LEVELS)[number];

/** A level folded into the request's range: A1 → A2, C2 → C1. */
export function toExerciseLevel(level: Cefr): ExerciseLevel {
  return level === "A1" ? "A2" : level === "C2" ? "C1" : level;
}

/**
 * «Авто»: the level of the words a set will use — the median of their levels (the lower one of an
 * even count), folded into A2…C1; null when none of them has a level.
 */
export function autoExerciseLevel(levels: readonly (Cefr | null | undefined)[]): ExerciseLevel | null {
  const ranks = levels.filter(isCefr).map((l) => CEFR_LEVELS.indexOf(l)).sort((a, b) => a - b);
  if (ranks.length === 0) return null;
  return toExerciseLevel(CEFR_LEVELS[ranks[(ranks.length - 1) >> 1]]);
}

/** Levels read back safely: the valid ones, folded into A2…C1, each once, in order. */
export function cleanLevels(levels: unknown): ExerciseLevel[] {
  if (!Array.isArray(levels)) return [];
  const set = new Set(levels.filter(isCefr).map(toExerciseLevel));
  return EXERCISE_LEVELS.filter((l) => set.has(l));
}

/** «B1», «B1–B2» (neighbours run together), «A2, B2»; "" for none. */
export function levelsText(levels: readonly ExerciseLevel[]): string {
  const clean = cleanLevels(levels);
  const at = (l: ExerciseLevel) => EXERCISE_LEVELS.indexOf(l);
  const runs: ExerciseLevel[][] = [];
  for (const l of clean) {
    const last = runs[runs.length - 1];
    if (last && at(l) === at(last[last.length - 1]) + 1) last.push(l);
    else runs.push([l]);
  }
  return runs.map((r) => (r.length === 1 ? r[0] : `${r[0]}–${r[r.length - 1]}`)).join(", ");
}

/** The levels the user picked for a set (not «Авто»); [] otherwise. */
export function pickedLevels(set: Partial<Pick<ExerciseSet, "levels" | "level_auto">>): ExerciseLevel[] {
  return set.level_auto ? [] : cleanLevels(set.levels);
}

/**
 * «Авто» over words: the median level of the neutral ones. Slang and verlan words are left out:
 * their estimate (a rare corpus frequency) says how informal they are, not how hard the set
 * should be. Null when no neutral word has a level.
 */
export function autoLevelOf<W extends { slang_level: number; verlan: boolean }>(words: readonly W[], level: (word: W) => Cefr | null): ExerciseLevel | null {
  return autoExerciseLevel(words.filter((w) => w.slang_level === 0 && !w.verlan).map(level));
}

/** A set's levels as the app shows them: «B1», «B1–B2», «≈B1» when they came from «Авто»; null without any. */
export function setLevelLabel(set: Partial<Pick<ExerciseSet, "levels" | "level_auto">>): string | null {
  const text = levelsText(cleanLevels(set.levels));
  if (!text) return null;
  return set.level_auto ? `≈${text}` : text;
}

/** The scopes of a set made only of the user's own words, across every theme. */
export const EXERCISE_SCOPES: readonly ExerciseScope[] = ["difficult", "due", "both"];

/** Short labels of the scopes («Откуда слова», the quick tiles). */
export const SCOPE_LABELS: Record<ExerciseScope, string> = {
  difficult: "Трудные",
  due: "К повторению",
  both: "Трудные и к повторению",
};

/** A stored scope read back safely: anything unknown (an old row without the column) is null. */
export function parseScope(value: unknown): ExerciseScope | null {
  return EXERCISE_SCOPES.includes(value as ExerciseScope) ? (value as ExerciseScope) : null;
}

const clean = (s: unknown): string | null => {
  if (typeof s !== "string") return null;
  const t = s.replace(/\s+/g, " ").trim();
  return t ? t : null;
};

const cleanList = (list: unknown): string[] =>
  Array.isArray(list) ? list.map((x) => (typeof x === "string" ? x.replace(/\s+/g, " ").trim() : "")) : [];

const isLevel = (n: unknown): n is SlangLevel => n === 0 || n === 1 || n === 2 || n === 3;

/** A word's Russian equivalents: «девушка, тёлка» → ["девушка", "тёлка"] (ru holds one to three, comma-separated). */
export function ruEquivalents(ru: string): string[] {
  return ru
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

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

/** Parts of speech a conjugate item may be about ("other" too: a new word defaults to it). */
const CONJUGATE_POS: readonly string[] = ["verb", "expression", "other"];

const AVOIR = ["ai", "as", "a", "avons", "avez", "ont"];
const ETRE = ["suis", "es", "est", "sommes", "êtes", "sont"];
const STARTS_VOWEL = /^[aeiouyàâäéèêëîïôöûüœæ]/i;

/**
 * Whether a verb part reads right after the item's pronouns: an elided «j'» / «t'» wants a vowel,
 * an unelided «je» / «me» / «te» / «se» a consonant (h either way). So «je ___» never offers «irai».
 */
function fitsPronoun(pro: string, verb: string): boolean {
  if (/^h/i.test(verb)) return true;
  if (/['’]$/.test(pro.trim())) return STARTS_VOWEL.test(verb);
  if (/(?:^|\s)(?:je|me|te|se)\s*$/i.test(pro)) return !STARTS_VOWEL.test(verb);
  return true;
}

/**
 * Three wrong options for a conjugate item: other forms of the same verb without their pronouns,
 * deterministic (a retried create gives the same set). First the passé composé with the other
 * auxiliary (avoir ↔ être, the singular participle), then the same person in the other tenses,
 * then the same tense in the other persons (the paired one first: tu ↔ vous). Forms that would not
 * read after the item's pronouns come last; every option is distinct under searchKey.
 */
export function conjugateDistractors(conj: Conjugation, tense: ExerciseTense, idx: number): string[] {
  const { pro, verb: answer } = splitForm(conj.tenses[tense][idx]);
  const candidates: string[] = [];
  if (tense === "passe_compose") {
    const words = answer.split(" ");
    const swap = AVOIR.includes(words[0]) ? ETRE[idx] : ETRE.includes(words[0]) ? AVOIR[idx] : null;
    // The participle (and the rest of an expression) of the singular person: «allés» → «allé».
    const rest = splitForm(conj.tenses.passe_compose[idx % 3]).verb.split(" ").slice(1).join(" ");
    if (swap && rest) candidates.push(`${swap} ${rest}`);
  }
  for (const t of EXERCISE_TENSES) if (t !== tense) candidates.push(splitForm(conj.tenses[t][idx]).verb);
  const paired = (idx + 3) % 6;
  for (const i of [paired, ...[0, 1, 2, 3, 4, 5].filter((i) => i !== idx && i !== paired)]) candidates.push(splitForm(conj.tenses[tense][i]).verb);
  const seen = new Set([searchKey(answer)]);
  const out: string[] = [];
  for (const c of [...candidates.filter((c) => fitsPronoun(pro, c)), ...candidates.filter((c) => !fitsPronoun(pro, c))]) {
    const key = searchKey(c);
    if (!c || seen.has(key)) continue;
    seen.add(key);
    out.push(c);
    if (out.length === DISTRACTORS) break;
  }
  return out;
}

/**
 * The set as it is stored: ids "q1".."qN" where missing, defaults (choice → skill "meaning",
 * meaning → ask "fr"), `null` / `[]` for absent fields, word snapshots, the choice/meaning prompt
 * and answer when left out, the cloze answer from its span when left out, and the pairs tiles.
 * Unknown refs stay unresolved for `validateSet` to report.
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
    const conjugateItem = type === "conjugate";
    const skill = type === "choice" ? (raw.skill ?? "meaning") : null;
    const ask = skill === "meaning" ? (raw.ask ?? "fr") : null;
    const tense = conjugateItem ? (raw.tense ?? null) : null;
    const person = conjugateItem ? (raw.person ?? null) : null;
    const word_id = pairs ? null : clean(raw.word_id);
    const new_ref = pairs ? null : clean(raw.new_ref);
    const word = pairs ? null : snapshotOf(word_id, new_ref);
    let prompt = clean(raw.prompt);
    let answer = clean(raw.answer);
    let sentence = type === "cloze" ? clean(raw.sentence) : null;
    let distractors = type === "choice" || type === "cloze" ? cleanList(raw.distractors) : [];
    if (skill === "meaning" && word) {
      prompt ??= ask === "ru" ? word.ru : word.fr;
      // One equivalent, the shape of a distractor (a whole «девушка, тёлка» list would stand out).
      answer ??= ask === "ru" ? word.fr : (ruEquivalents(word.ru)[0] ?? word.ru);
    }
    if (type === "cloze" && !answer && sentence) answer = clozeParts(sentence)?.answer ?? null;
    if (conjugateItem) {
      // The form comes from the verb's conjugation, whatever answer or sentence was sent.
      answer = null;
      const conj = word ? (ctx.conjugationOf?.(word_id, word.fr) ?? null) : null;
      const at = person ? EXERCISE_PERSONS.indexOf(person) : -1;
      // The infinitive is the stem, whatever prompt was sent.
      if (word) prompt = word.fr;
      if (conj && tense && EXERCISE_TENSES.includes(tense) && at >= 0) {
        const { pro, verb } = splitForm(conj.tenses[tense][at]);
        answer = verb;
        // A saved form written without its pronoun still says who: «tu [[kiffes]]», «j'[[aime]]».
        const fallback = person === "je" && /^[aeiouyhàâäéèêëîïôöûüœæ]/i.test(verb) ? "j'" : `${person} `;
        sentence = `${pro || fallback}[[${verb}]]`;
        // Options sent with their pronouns («tu kiffais») keep only the verb part.
        distractors = cleanList(raw.distractors).map((d) => splitForm(d).verb);
        if (distractors.length === 0) distractors = conjugateDistractors(conj, tense, at);
      }
    }
    const refs = pairs ? cleanList(raw.pairs) : [];
    return {
      id: clean(raw.id) ?? `q${i + 1}`,
      type,
      skill,
      ask,
      tense,
      person,
      word_id,
      new_ref,
      prompt: pairs ? null : prompt,
      sentence,
      sentence_ru: type === "cloze" ? clean(raw.sentence_ru) : null,
      answer: pairs ? null : answer,
      distractors,
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
    scope: parseScope(input.scope),
    levels: cleanLevels(input.levels),
    level_auto: cleanLevels(input.levels).length > 0 && input.level_auto === true,
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
      if (saved?.muted) err(`${p}.fr`, `«${w.fr}» is already saved but paused (muted): it can't be used in exercises, pick another word`);
      else if (saved) err(`${p}.fr`, `«${w.fr}» is already saved: use word_id ${saved.id}`);
    }
  });

  const items = Array.isArray(set.items) ? set.items : [];
  if (items.length < ITEMS_MIN || items.length > ITEMS_MAX) err("items", `${ITEMS_MIN}–${ITEMS_MAX} items (got ${items.length})`);
  const conjugateCount = items.filter((i) => i.type === "conjugate").length;
  if (conjugateCount > CONJUGATE_MAX) err("items", `at most ${CONJUGATE_MAX} conjugate items in a set, a short test (got ${conjugateCount})`);

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
  const checkOptions = (p: string, item: ExerciseItem, answerRequired = true) => {
    text(`${p}.answer`, item.answer, ANSWER_MAX, answerRequired);
    const list = Array.isArray(item.distractors) ? item.distractors : [];
    if (list.length !== DISTRACTORS) {
      err(`${p}.distractors`, `exactly ${DISTRACTORS} distractors (got ${list.length})`);
    }
    const answerKey = item.answer ? searchKey(item.answer) : null;
    // choice/meaning fr→ru: every equivalent of the word is a right answer, so none may be a distractor.
    const meaning = item.type === "choice" && item.skill === "meaning";
    const synonyms = new Set(meaning && item.ask === "fr" && item.word ? ruEquivalents(item.word.ru).map(searchKey) : []);
    // choice/meaning: all four options in one language (ask "fr" → Russian options, "ru" → French).
    const russian = meaning && item.answer ? isRussian(item.answer) : null;
    const seen = new Set<string>();
    list.forEach((d, j) => {
      const dp = `${p}.distractors[${j}]`;
      if (typeof d !== "string" || !d.trim()) return err(dp, "empty");
      if (d.length > ANSWER_MAX) return err(dp, `too long (> ${ANSWER_MAX} characters)`);
      const key = searchKey(d);
      if (key === answerKey) err(dp, `equals the answer «${item.answer}»`);
      else if (synonyms.has(key)) err(dp, `«${d}» is a translation of the word itself (its ru is «${item.word!.ru}»)`);
      else if (seen.has(key)) err(dp, `duplicate distractor «${d}»`);
      else if (russian !== null && isRussian(d) !== russian) {
        err(dp, russian ? 'must be Russian like the answer (ask "fr" shows the French word, the options are Russian)' : 'must be French like the answer (ask "ru" shows the Russian, the options are French)');
      }
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
    // choice/meaning: the server writes the prompt and answer from the word; when the word does not
    // resolve, only the word_id / new_ref error is reported (never «prompt: required»).
    const unresolved = item.type === "choice" && item.skill === "meaning" && !item.word;
    text(`${p}.prompt`, item.prompt, TEXT_MAX, item.type === "choice" && !unresolved);

    switch (item.type) {
      case "choice":
        checkRef(p, item);
        if (!item.skill || !EXERCISE_SKILLS.includes(item.skill)) err(`${p}.skill`, `one of ${EXERCISE_SKILLS.join(", ")}`);
        if (item.skill === "meaning" && item.ask !== "fr" && item.ask !== "ru") err(`${p}.ask`, 'meaning items ask "fr" or "ru"');
        checkOptions(p, item, !unresolved);
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
        // Old sets keep theirs (left out of play); a new one is refused.
        err(`${p}.type`, `register items are no longer made; use one of ${PLAYED_ITEM_TYPES.join(", ")}`);
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
      case "conjugate": {
        checkRef(p, item);
        const tenseOk = !!item.tense && EXERCISE_TENSES.includes(item.tense);
        const personOk = !!item.person && EXERCISE_PERSONS.includes(item.person);
        if (!tenseOk) err(`${p}.tense`, `one of ${EXERCISE_TENSES.join(", ")}`);
        if (!personOk) err(`${p}.person`, `one of ${EXERCISE_PERSONS.join(", ")}`);
        // An unresolved word is reported by checkRef alone.
        if (!item.word) break;
        // A new word defaults to "other"; adjectives in -er («léger») would otherwise conjugate.
        if (!CONJUGATE_POS.includes(item.word.pos)) {
          err(item.word_id ? `${p}.word_id` : `${p}.new_ref`, `«${item.word.fr}» is not a verb; conjugate items need a verb`);
          break;
        }
        if (!ctx.conjugationOf?.(item.word_id, item.word.fr)) {
          err(
            item.word_id ? `${p}.word_id` : `${p}.new_ref`,
            `«${item.word.fr}» has no conjugation the app can build; pick another verb${item.word_id ? " or save its conjugation with update_word first" : ""}`,
          );
          break;
        }
        if (!tenseOk || !personOk) break;
        if (!item.sentence || !clozeParts(item.sentence)) err(`${p}.sentence`, "must be built by the server from the verb's conjugation");
        checkOptions(p, item);
        break;
      }
      default:
        err(`${p}.type`, `one of ${PLAYED_ITEM_TYPES.join(", ")}`);
    }
  });

  return { ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------------------------
// Warnings (the set is still saved)

export type ExerciseWarningCode = "few_types" | "longest_answer" | "stem_leak" | "consecutive_word" | "many_new_words" | "level_words";

export interface ExerciseWarning {
  code: ExerciseWarningCode;
  message: string;
  path?: string;
}

/** An elided article or pronoun at the start of a token: «l'enjeu» → «enjeu», «qu'il» → «il». */
const ELIDED = /^(?:[cdjlmnst]|qu|jusqu|lorsqu|puisqu)['’]/;

/** The words of a French text, lower-cased, elisions dropped; capitalised words after the first (names) are left out. */
function frenchTokens(text: string): string[] {
  return (text.match(/[\p{L}'’-]+/gu) ?? [])
    .filter((t, i) => i === 0 || t[0] === t[0].toLowerCase())
    .map((t) => t.toLowerCase().replace(ELIDED, "").replace(/^['’-]+|['’-]+$/g, ""))
    .filter((t) => t.length >= 3 && !HOMOGRAPHS.has(t));
}

/** Verb forms that are also rarer lemmas («je vis» ≠ «une vis»): never named. */
const HOMOGRAPHS = new Set(["vis", "mis", "pris", "sus", "vint", "tins"]);

/** How far above a set's (highest) level a word may sit before `levelWarnings` names it: B1 lets B2 pass, flags C1. */
export const LEVEL_GAP = 2;

/**
 * create_exercise_set's `level_words` warnings (never blocking): words in a set's French sentences
 * and French options, and new words, that `rate` puts two or more levels (LEVEL_GAP) above the set's
 * highest level. The words the set is about (each item's word, every library and new word of the set, the
 * gap) are left out: the level is about the context around them. `rate` gives a lemma's level or
 * null (inflected forms are mostly unknown and skipped, so it never guesses).
 */
export function levelWarnings(
  set: Pick<ExerciseSet, "items" | "new_words" | "levels">,
  rate: (word: string) => Cefr | null,
): ExerciseWarning[] {
  const levels = cleanLevels(set.levels);
  if (levels.length === 0) return [];
  const named = levelsText(levels);
  const top = CEFR_LEVELS.indexOf(levels[levels.length - 1]) + LEVEL_GAP;
  if (top >= CEFR_LEVELS.length) return [];
  const own = new Set(
    [...set.items.flatMap((i) => (i.word ? [i.word.fr] : [])), ...set.new_words.map((w) => w.fr)].flatMap((fr) => frenchTokens(fr)),
  );
  const above = (word: string) => {
    const level = rate(word);
    return level && CEFR_LEVELS.indexOf(level) >= top ? level : null;
  };
  const out: ExerciseWarning[] = [];
  set.items.forEach((item, i) => {
    const texts: string[] = [];
    const parts = item.type === "cloze" && item.sentence ? clozeParts(item.sentence) : null;
    if (parts) texts.push(parts.before, parts.after);
    if (item.type === "choice" || item.type === "cloze") {
      texts.push(...[item.answer ?? "", ...(item.distractors ?? [])].filter((o) => o && !isRussian(o)));
    }
    const found = new Map<string, Cefr>();
    for (const token of texts.flatMap(frenchTokens)) {
      if (own.has(token) || found.has(token)) continue;
      const level = above(token);
      if (level) found.set(token, level);
    }
    if (found.size > 0) {
      const list = [...found].slice(0, 6).map(([w, l]) => `«${w}» ≈${l}`).join(", ");
      out.push({ code: "level_words", path: `items[${i}]`, message: `${list}: above the set's level ${named} by the app's dictionary; keep the words around the asked word at ${levels[levels.length - 1]} or below` });
    }
  });
  set.new_words.forEach((w, i) => {
    // Argot, vulgar and verlan words have no estimate in the app either.
    const level = w.slang_level >= 2 || w.verlan ? null : above(w.fr);
    if (level) out.push({ code: "level_words", path: `new_words[${i}]`, message: `«${w.fr}» ≈${level} is above the set's level ${named}; bring new words up to one level above it` });
  });
  return out;
}

/** The words an item is about: its word_id or new_ref, or every word of a pairs item. */
export function itemWordKeys(item: Pick<ExerciseItem, "type" | "word_id" | "new_ref" | "pairs">): string[] {
  // Tolerant of rows written by older code (or a hand-edited backup) without the arrays.
  if (item.type === "pairs") return [...(item.pairs ?? [])];
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

/** At least half conjugate items: a «Спряжение глаголов» set (conjugate plus a few cloze, by design; 3 + 3 counts). */
export const isVerbSet = (items: readonly Pick<ExerciseItem, "type">[]): boolean => items.filter((i) => i.type === "conjugate").length * 2 >= items.length;

/**
 * What makes a set weak, without blocking it: fewer than 3 item types (not in a verb set); the answer is the longest
 * option in more than 60% of choice/cloze items; an answer shows in a stem (its own, or another
 * item's about a different word); the same word in two consecutive items; more than 30% of the
 * set's words are new.
 */
export function warningsFor(set: Pick<ExerciseSet, "items" | "new_words">): ExerciseWarning[] {
  const out: ExerciseWarning[] = [];
  const items = set.items;

  // Only the types still played count: an old register item adds no variety the user sees.
  const types = new Set(playedItems(items).map((i) => i.type));
  if (types.size < 3 && !isVerbSet(playedItems(items))) {
    out.push({ code: "few_types", message: `only ${types.size} item type(s); use at least 3 (${PLAYED_ITEM_TYPES.join(", ")})` });
  }

  const optioned = items.filter((i) => (i.type === "choice" || i.type === "cloze") && i.answer && (i.distractors ?? []).length > 0);
  const longest = optioned.filter((i) => i.answer!.length > Math.max(...i.distractors.map((d) => d.length))).length;
  if (optioned.length >= 3 && longest / optioned.length > 0.6) {
    out.push({
      code: "longest_answer",
      message: `the answer is the longest option in ${longest} of ${optioned.length} items; match the distractors' length`,
    });
  }

  items.forEach((item, i) => {
    if (!item.answer || !isPlayedItem(item) || item.type === "pairs") return;
    // A fr→ru meaning item is answered by any of the word's equivalents: look for each one.
    const forms =
      item.type === "choice" && item.skill === "meaning" && item.ask === "fr" && item.word
        ? [...new Set([item.answer, ...ruEquivalents(item.word.ru)])]
        : [item.answer];
    const leaks = (s: string) => forms.find((f) => containsWord(s, f));
    const own = item.type === "cloze" ? stemsOf(item) : item.prompt ? [item.prompt] : [];
    const ownLeak = own.map(leaks).find(Boolean);
    if (ownLeak) {
      out.push({ code: "stem_leak", path: `items[${i}]`, message: `the answer «${ownLeak}» shows in the item's own stem` });
      return;
    }
    const mine = new Set(itemWordKeys(item));
    for (let j = 0; j < items.length; j++) {
      const other = items[j];
      if (j === i || itemWordKeys(other).some((k) => mine.has(k))) continue;
      const hit = stemsOf(other).map(leaks).find(Boolean);
      if (hit) {
        out.push({ code: "stem_leak", path: `items[${i}]`, message: `the answer «${hit}» shows in the stem of items[${j}]` });
        break;
      }
    }
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
 * distractors (reshuffle on each attempt with a new `random`); pairs (and a type no longer played)
 * has none (see `pairsBoard`).
 */
export function optionsFor(item: ExerciseItem, random: () => number = Math.random): ExerciseOptions {
  if (item.type === "pairs" || !isPlayedItem(item) || !item.answer) return { options: [], correct: -1 };
  const distractors = item.distractors ?? [];
  const order = shuffled([0, ...distractors.map((_, i) => i + 1)], random);
  const all = [item.answer, ...distractors];
  return { options: order.map((i) => all[i]), correct: order.indexOf(0) };
}

/** A pairs item's two columns, each shuffled on its own: French tiles and Russian tiles. */
export function pairsBoard(item: ExerciseItem, random: () => number = Math.random): { fr: ExercisePairTile[]; ru: ExercisePairTile[] } {
  const tiles = item.tiles ?? [];
  return { fr: shuffled(tiles, random), ru: shuffled(tiles, random) };
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
  /** New words already saved to the library (refs): no intro card for them. */
  savedRefs?: ReadonlySet<string>;
  /** Library words deleted or paused since the set was made: their items are left out (playableItemIds). */
  blocked?: ReadonlySet<string>;
}

/**
 * The items a run plays, in set order. Only played types: an old run that listed a register item
 * neither waits for it (runSettled) nor counts it (scoreRun, `total`).
 */
export function runItems(set: Pick<ExerciseSet, "items">, itemIds?: readonly string[]): ExerciseItem[] {
  const items = playedItems(set.items);
  if (!itemIds || itemIds.length === 0) return items;
  const wanted = new Set(itemIds);
  return items.filter((i) => wanted.has(i.id));
}

/**
 * The round's queue. Items keep the set's order (Claude orders them: recognise before produce,
 * weak words late), except that an item moves later when its word was in one of the previous
 * MIN_GAP items and another item can go first. A new word's intro card comes right before the
 * first item that uses it.
 */
export function buildQueue(set: Pick<ExerciseSet, "items" | "new_words">, opts: QueueOptions = {}): QueueEntry[] {
  const blocked = opts.blocked;
  const base = runItems(set, opts.itemIds).filter((i) => !blocked || !itemWordKeys(i).some((k) => blocked.has(k)));
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
        if (!refs.has(key) || introduced.has(key) || opts.savedRefs?.has(key)) continue;
        introduced.add(key);
        out.push({ kind: "intro", new_ref: key });
      }
    }
    out.push({ kind: "item", item_id: item.id, attempt: 1 });
  }
  return out;
}

/** Other questions a missed item waits behind before it comes back (practice's Again step). */
const REQUEUE_AFTER = 3;

/**
 * The queue after its head was answered. A right answer (or a seen intro card) drops it; a wrong
 * answer or «Не знаю» brings the item back after 3 other questions (as practice's Again step) with
 * the next attempt number, until MAX_ATTEMPTS misses. Intro cards are not counted, and the item
 * never lands between an intro card and the question it introduces. Never touches the schedule.
 */
export function requeue(queue: readonly QueueEntry[], outcome: ExerciseOutcome | "seen"): QueueEntry[] {
  if (queue.length === 0) return [];
  const [head, ...rest] = queue;
  if (head.kind === "intro" || outcome === "correct" || outcome === "seen" || head.attempt >= MAX_ATTEMPTS) return rest;
  let at = rest.length;
  for (let i = 0, passed = 0; i < rest.length; i++) {
    if (rest[i].kind === "item" && ++passed === REQUEUE_AFTER) {
      at = i + 1;
      break;
    }
  }
  // Defensive: a queue ending on an intro card keeps it next to nothing but its own question.
  while (at > 0 && rest[at - 1].kind === "intro") at--;
  return [...rest.slice(0, at), { ...head, attempt: head.attempt + 1 }, ...rest.slice(at)];
}

/**
 * Per item of the run: its last finished attempt and whether it is settled (answered right, or out
 * of attempts). Every item writes one row per attempt, except a pairs board: its mismatches are
 * logged as they happen ('wrong'), and the attempt ends only with 'correct' (every pair found) or
 * 'dont_know'. So a board left half-played resumes at the same attempt, and its 'wrong' rows never
 * settle it.
 */
function attemptsOf(answers: readonly ExerciseAnswer[], pairsIds: ReadonlySet<string>): Map<string, { last: number; settled: boolean }> {
  const out = new Map<string, { last: number; settled: boolean }>();
  for (const a of answers) {
    const prev = out.get(a.item_id) ?? { last: 0, settled: false };
    const final = !pairsIds.has(a.item_id) || a.outcome !== "wrong";
    out.set(a.item_id, {
      last: final ? Math.max(prev.last, a.attempt) : prev.last,
      settled: prev.settled || a.outcome === "correct" || (final && a.attempt >= MAX_ATTEMPTS),
    });
  }
  return out;
}

const pairsIdsOf = (set: Pick<ExerciseSet, "items">) => new Set(set.items.filter((i) => i.type === "pairs").map((i) => i.id));

/** Every item of the run is settled: nothing is left to play (the run can be marked finished). */
export function runSettled(set: Pick<ExerciseSet, "items">, run: Pick<ExerciseRun, "item_ids" | "answers">): boolean {
  const attempts = attemptsOf(run.answers, pairsIdsOf(set));
  return runItems(set, run.item_ids).every((i) => attempts.get(i.id)?.settled);
}

export type ResumeOptions = Pick<QueueOptions, "savedRefs" | "blocked">;

/** The queue to continue an unfinished run («Продолжить»): unsettled items, intros only for words not met yet. */
export function resumeQueue(
  set: Pick<ExerciseSet, "items" | "new_words">,
  run: Pick<ExerciseRun, "item_ids" | "answers" | "kind">,
  opts: ResumeOptions = {},
): QueueEntry[] {
  const attempts = attemptsOf(run.answers, pairsIdsOf(set));
  const items = runItems(set, run.item_ids);
  const open = items.filter((i) => !attempts.get(i.id)?.settled).map((i) => i.id);
  if (open.length === 0) return [];
  const answered = new Set(run.answers.map((a) => a.item_id));
  const met = new Set(items.filter((i) => answered.has(i.id)).flatMap(itemWordKeys));
  return buildQueue(set, { itemIds: open, intros: run.kind !== "mistakes", savedRefs: opts.savedRefs, blocked: opts.blocked })
    .filter((e) => e.kind === "item" || !met.has(e.new_ref))
    .map((e) => (e.kind === "item" ? { ...e, attempt: Math.min(MAX_ATTEMPTS, (attempts.get(e.item_id)?.last ?? 0) + 1) } : e));
}

/**
 * The items of a set that can still be played: choice / cloze / conjugate items about a word in
 * `blocked` (deleted or paused in the library since the set was made) and pairs boards with such a
 * word are left out, and so are items of a type no longer played (PLAYED_ITEM_TYPES: an old
 * register item, or a type a newer connector writes). Every played item when nothing is blocked.
 */
export function playableItemIds(set: Pick<ExerciseSet, "items">, blocked: ReadonlySet<string>): string[] {
  return playedItems(set.items).filter((i) => !itemWordKeys(i).some((k) => blocked.has(k))).map((i) => i.id);
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

/**
 * Items missed at least once («Не знаю» included), in the order of their first miss. With the set,
 * only its played items: an old run's miss on a register item is not replayed («Повторить ошибки»).
 */
export function missedItemIds(run: Pick<ExerciseRun, "answers">, set?: Pick<ExerciseSet, "items">): string[] {
  const played = set ? new Set(playedItems(set.items).map((i) => i.id)) : null;
  return [...new Set(run.answers.filter((a) => a.outcome !== "correct" && (!played || played.has(a.item_id))).map((a) => a.item_id))];
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

/**
 * The words an answer row is about: its own word_id / new_ref, else its item's. A pairs row that
 * names no word (an older «Не знаю» on the board) stands for every word of the board.
 */
export function answerWords(
  a: Pick<ExerciseAnswer, "word_id" | "new_ref">,
  item: Pick<ExerciseItem, "type" | "word_id" | "new_ref" | "pairs"> | undefined,
  newRefs: ReadonlySet<string>,
): { word_id: string | null; new_ref: string | null }[] {
  if (a.word_id) return [{ word_id: a.word_id, new_ref: null }];
  if (a.new_ref) return [{ word_id: null, new_ref: a.new_ref }];
  if (!item) return [];
  if (item.type === "pairs") return (item.pairs ?? []).map((k) => (newRefs.has(k) ? { word_id: null, new_ref: k } : { word_id: k, new_ref: null }));
  if (item.word_id) return [{ word_id: item.word_id, new_ref: null }];
  return item.new_ref ? [{ word_id: null, new_ref: item.new_ref }] : [];
}

/**
 * The words behind the misses, in the order of their first miss, one entry per word. A miss on an
 * item no longer played (an old register item) is left out, as its question is.
 */
export function missedWords(run: Pick<ExerciseRun, "answers">, set: Pick<ExerciseSet, "items" | "new_words">): MissedWord[] {
  const items = new Map(set.items.map((i) => [i.id, i]));
  const fresh = new Map(set.new_words.map((w) => [w.ref, w]));
  const refs = new Set(fresh.keys());
  const out = new Map<string, MissedWord>();
  for (const a of run.answers) {
    if (a.outcome === "correct") continue;
    const item = items.get(a.item_id);
    if (item && !isPlayedItem(item)) continue;
    for (const { word_id, new_ref } of answerWords(a, item, refs)) {
      const key = (word_id ?? new_ref)!;
      let entry = out.get(key);
      if (!entry) {
        const n = new_ref ? fresh.get(new_ref) : undefined;
        const snapshot =
          (n ? wordSnapshot(n) : null) ??
          set.items.find((i) => (i.word_id ?? i.new_ref) === key && i.word)?.word ??
          null;
        const tile = snapshot ? null : set.items.flatMap((i) => i.tiles ?? []).find((t) => t.key === key);
        const fr = snapshot?.fr ?? tile?.fr;
        const ru = snapshot?.ru ?? tile?.ru;
        if (fr === undefined || ru === undefined) continue;
        entry = { key, word_id, new_ref, fr, ru, word: snapshot, item_ids: [], chosen: [] };
        out.set(key, entry);
      }
      if (!entry.item_ids.includes(a.item_id)) entry.item_ids.push(a.item_id);
      if (a.chosen && !entry.chosen.includes(a.chosen)) entry.chosen.push(a.chosen);
    }
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
  /** Only the user's difficult and/or due words, from every theme: themes, topic and new words are ignored. */
  scope?: ExerciseScope | null;
  /** «Спряжение глаголов»: a short test on the verbs of those words; never new words. */
  conjugation?: boolean;
  /** «Уровень набора»: the levels the questions are written for, one or several; none = «Авто» (Claude takes the words' level). */
  levels?: readonly ExerciseLevel[];
  /** «Авто»'s level as the app sees it now (the phone slot shows «уровня ≈B1»); never copied. */
  autoLevel?: ExerciseLevel | null;
}

/** «, уровень B1» in the classic text; nothing for «Авто». */
const levelPart = (levels: readonly ExerciseLevel[] | undefined) => (levels?.length ? `, уровень ${levelsText(levels)}` : "");

/** «по трудным словам из всех тем»: where a scoped request takes its words from. */
const SCOPE_WHERE: Record<ExerciseScope, string> = {
  difficult: "по трудным словам из всех тем",
  due: "по словам к повторению из всех тем",
  both: "по трудным словам и словам к повторению из всех тем",
};

/**
 * «Сделай упражнение в Карточках по теме «Люди», 12 вопросов.»,
 * «Сделай упражнение в Карточках: темы «Люди», «Эмоции», 12 вопросов, можно новые слова.»,
 * «Сделай упражнение в Карточках на тему «вечеринка», 12 вопросов, можно новые слова.»,
 * «Сделай упражнение в Карточках по всем темам, 12 вопросов.»,
 * «Сделай упражнение в Карточках по трудным словам из всех тем, 12 вопросов.» (a scope: never new words),
 * «Сделай упражнение на спряжение глаголов в Карточках по теме «Люди», 8 вопросов.» (never new words).
 * Levels add «, уровень B1» («B1–B2», «A2, B2») after the size: «… 12 вопросов, уровень B1, можно новые слова.»
 */
export function buildRequestText({ folders, topic, size, allowNew, scope, conjugation, levels }: RequestSpec): string {
  const what = conjugation ? "упражнение на спряжение глаголов" : "упражнение";
  if (scope) return `Сделай ${what} в Карточках ${SCOPE_WHERE[scope]}, ${questions(size)}${levelPart(levels)}.`;
  const names = [...new Set(folders.map((f) => f.trim()).filter(Boolean))];
  const custom = topic?.replace(/\s+/g, " ").trim() || null;
  let where: string;
  if (names.length === 0) where = custom ? ` на тему ${quoted(custom)}` : " по всем темам";
  else if (names.length === 1) where = ` по теме ${quoted(names[0])}${custom ? ` и на тему ${quoted(custom)}` : ""}`;
  else where = `: темы ${names.map(quoted).join(", ")}${custom ? ` и тема ${quoted(custom)}` : ""}`;
  return `Сделай ${what} в Карточках${where}, ${questions(size)}${levelPart(levels)}${allowNew && !conjugation ? ", можно новые слова" : ""}.`;
}

/**
 * The phone request as one sentence (X-Request-B): «Сделай в Карточках [12 вопросов] по темам
 * [Еда, Полиция] — [можно новые слова].» The bracketed parts are the slots that open in place;
 * `text` is what gets copied (theme names in «»).
 */
export interface RequestSentence {
  /** «12 вопросов» (the count slot). */
  size: string;
  /** The level slot after the count: «уровня B1» («B1–B2»), «уровня ≈B1» for «Авто» with a known level, else «уровня авто». */
  level: string;
  /** «на спряжение глаголов» for a verb test, else null. */
  what: string | null;
  /** The words before the themes slot («по темам», «по теме», «на тему», «по»), or a scope's whole phrase («по трудным словам из всех тем»). */
  where: string;
  /** The themes slot as shown («Еда, Полиция», «всем темам», «вечеринка»); null for a scope (no slot). */
  themes: string | null;
  /** «можно новые слова» / «без новых слов» (the new-words slot); null for a scope or a verb test. */
  fresh: string | null;
  /** The request copied into the chat. */
  text: string;
}

/**
 * «Сделай в Карточках 12 вопросов по темам «Еда», «Полиция» — можно новые слова.»,
 * «Сделай в Карточках 8 вопросов по теме «Люди» — без новых слов.»,
 * «Сделай в Карточках 12 вопросов по всем темам — можно новые слова.»,
 * «Сделай в Карточках 12 вопросов на тему «вечеринка» — можно новые слова.»,
 * «Сделай в Карточках 12 вопросов по трудным словам из всех тем.» (a scope: never new words),
 * «Сделай в Карточках 8 вопросов на спряжение глаголов по теме «Люди».» (never new words).
 * The level slot follows the count (X-Level-A, pick L1 A; several levels since 2026-10-25): «Сделай
 * в Карточках 12 вопросов уровня B1–B2 по темам …»; «Авто» shows «уровня ≈B1» but copies nothing
 * (Claude takes the words' level).
 * The desktop builder keeps `buildRequestText`.
 */
export function requestSentence({ folders, topic, size, allowNew, scope, conjugation, levels, autoLevel }: RequestSpec): RequestSentence {
  const count = questions(size);
  const what = conjugation ? "на спряжение глаголов" : null;
  const picked = levelsText(levels ?? []);
  const shownLevel = picked ? `уровня ${picked}` : autoLevel ? `уровня ≈${autoLevel}` : "уровня авто";
  const lead = `Сделай в Карточках ${count}${picked ? ` уровня ${picked}` : ""}${what ? ` ${what}` : ""}`;
  if (scope) {
    const where = SCOPE_WHERE[scope];
    return { size: count, level: shownLevel, what, where, themes: null, fresh: null, text: `${lead} ${where}.` };
  }
  const names = [...new Set(folders.map((f) => f.trim()).filter(Boolean))];
  const custom = topic?.replace(/\s+/g, " ").trim() || null;
  let where: string;
  let shown: string;
  let copied: string;
  if (names.length === 0) {
    where = custom ? "на тему" : "по";
    shown = custom ?? "всем темам";
    copied = custom ? quoted(custom) : "всем темам";
  } else {
    where = names.length === 1 ? "по теме" : "по темам";
    const extra = custom ? ` и на тему ${quoted(custom)}` : "";
    shown = names.join(", ") + extra;
    copied = names.map(quoted).join(", ") + extra;
  }
  const fresh = conjugation ? null : allowNew ? "можно новые слова" : "без новых слов";
  return { size: count, level: shownLevel, what, where, themes: shown, fresh, text: `${lead} ${where} ${copied}${fresh ? ` — ${fresh}` : ""}.` };
}

/** The copied text of `requestSentence`. */
export function buildRequestSentence(spec: RequestSpec): string {
  return requestSentence(spec).text;
}

/**
 * «Попросить следующий набор»: «Сделай следующее упражнение в Карточках после «Вечеринка»,
 * 12 вопросов, с упором на ошибки: relou, keuf, ouf.» A scoped set keeps its scope: «… в Карточках
 * по трудным словам из всех тем после «Трудные слова», …». A verb set (mostly conjugate) stays one:
 * «Сделай следующее упражнение на спряжение глаголов в Карточках после «Глаголы · passé composé», …».
 * Levels the user picked stay («…, 12 вопросов, уровень B1–B2, …»); «Авто» stays «Авто».
 */
export function buildFollowUpText(
  set: Pick<ExerciseSet, "title" | "items" | "new_words"> & Partial<Pick<ExerciseSet, "scope" | "levels" | "level_auto">>,
  missed: readonly Pick<MissedWord, "fr">[],
): string {
  const scope = parseScope(set.scope);
  const verbs = isVerbSet(playedItems(set.items));
  const frs = [...new Set(missed.map((m) => m.fr))];
  const focus = frs.length ? `, с упором на ошибки: ${frs.join(", ")}` : "";
  const fresh = !scope && !verbs && set.new_words.length > 0 ? ", можно новые слова" : "";
  const where = scope ? ` ${SCOPE_WHERE[scope]}` : "";
  const what = verbs ? "упражнение на спряжение глаголов" : "упражнение";
  return `Сделай следующее ${what} в Карточках${where} после ${quoted(set.title)}, ${questions(set.items.length)}${levelPart(pickedLevels(set))}${focus}${fresh}.`;
}
