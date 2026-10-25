// Shared domain types. Dexie (local) and Supabase (remote) store the same shapes;
// remote rows add `user_id`. Timestamps are ISO strings, ids are client UUIDs.

export type Direction = "fr_ru" | "ru_fr";

/** Detected slang level: 0 нейтр. · 1 fam. · 2 arg. · 3 vulg. */
export type SlangLevel = 0 | 1 | 2 | 3;
export const SLANG_LABELS = ["нейтр.", "fam.", "arg.", "vulg."] as const;

/** «Уровень языка» (CEFR A1…C2) and who stored it; defined with the level rules in lib/core/level.ts. */
export type { Cefr, StoredLevelSource } from "./core/level";
import type { Cefr, StoredLevelSource } from "./core/level";
import type { DayPlanSnapshot } from "./core/plan";

export type PartOfSpeech = "noun" | "verb" | "adj" | "adv" | "expression" | "other";
export type Gender = "m" | "f" | "mf" | "none";
export type Confidence = "high" | "med" | "low";
/** Where a word came from; "chat" = added through the Claude connector (lib/mcp). */
export type WordSource = "manual" | "suggest" | "screenshot" | "import" | "chat";

export interface Syncable {
  id: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Folder extends Syncable {
  slug: string;
  name: string; // Russian display name, e.g. «Деньги»
  description: string | null; // what belongs here; used when sorting automatically
  color: string; // theme ink color, e.g. "#2f6b4f"
  created_by: "user" | "auto";
  locked: boolean; // auto-sort never renames/deletes/moves words out
  sort: number;
  /** «На паузе»: every word of the theme stays out of review and practice. Missing on older rows (= false). */
  muted?: boolean;
}

/** One example sentence and its translation. */
export interface WordExample {
  fr: string;
  ru: string | null;
}

/**
 * A value of a custom field («Свои поля») on one word. `field_id` points to a shared FieldDef;
 * null = a one-off field of this word. The label is kept so a value outlives its deleted definition.
 */
export interface CustomFieldValue {
  field_id: string | null;
  label: string;
  value: string;
}

/** A shared custom field shown on every card (Settings «Свои поля»). Synced. */
export interface FieldDef extends Syncable {
  /** Label on the card, e.g. «Синонимы». */
  name: string;
  /** What to write there, for the automatic fill, e.g. «2–3 синонима на французском». */
  hint: string | null;
  /** Filled automatically when a word is added and by «Дополнить карточки». */
  ai_fill: boolean;
  sort: number;
}

/** A verb's four tenses (six forms each, je → ils, with pronouns) as «Контекст» shows them. */
export interface Conjugation {
  auxiliary: "avoir" | "être";
  remark: string | null;
  tenses: { present: string[]; passe_compose: string[]; imparfait: string[]; futur: string[] };
}

export interface Word extends Syncable {
  fr: string;
  ru: string;
  note: string | null;
  /** The first example (also on the review card's answer side). */
  example_fr: string | null;
  example_ru: string | null;
  /** Further examples after the first («+ Ещё пример»). Missing on rows written before them. */
  extra_examples?: WordExample[];
  /** «Свои поля». Missing on rows written before them. */
  custom_fields?: CustomFieldValue[];
  /** «Происхождение»: one Russian line («верлан от lourd»), written from the chat or by hand. Missing on older rows. */
  origin?: string | null;
  /** «Спряжение» saved on the word (from the chat); wins over the one built on the device. Missing on older rows. */
  conjugation?: Conjugation | null;
  /** «На паузе»: kept in the library but left out of every review and practice round. Missing on older rows (= false). */
  muted?: boolean;
  /**
   * «Уровень языка» stored on the word: null = none (the app estimates one, lib/core/level.ts; the
   * estimate is never stored). Missing on older rows (= null).
   */
  cefr?: Cefr | null;
  /** Who stored `cefr`: the user, Claude in the chat, or the app's AI. Null with no stored level. */
  cefr_source?: StoredLevelSource | null;
  pos: PartOfSpeech;
  gender: Gender;
  slang_level: SlangLevel;
  verlan: boolean;
  tags: string[];
  folder_id: string | null; // null = «Входящие»
  folder_source: "auto" | "user";
  folder_confidence: Confidence | null;
  source: WordSource;
  both_directions: boolean; // create ru_fr cards too
  created_at: string;
}

/** FSRS card state per (word, direction). Mirrors ts-fsrs Card with dates as ISO strings. */
export interface ReviewState {
  id: string; // `${word_id}:${direction}`
  word_id: string;
  direction: Direction;
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: 0 | 1 | 2 | 3; // New, Learning, Review, Relearning
  last_review: string | null;
  updated_at: string;
  deleted_at: string | null;
}

/** Append-only review log (never updated, so it syncs by insert). */
export interface ReviewLog {
  id: string;
  word_id: string;
  direction: Direction;
  rating: 1 | 2 | 3 | 4; // Again, Hard, Good, Easy
  state: 0 | 1 | 2 | 3;
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  review: string; // when the review happened
  /** Snapshot of ReviewState before this review, so the last review can be undone. */
  prev: Omit<ReviewState, "updated_at" | "deleted_at"> | null;
  updated_at: string;
  deleted_at: string | null;
}

/** An automatic re-sort that was applied; keeps what is needed to undo it. */
export interface ReorgRun extends Syncable {
  created_at: string;
  applied_at: string | null;
  moves: {
    word_id: string;
    from: string | null;
    to: string | null;
    /** How the word was placed before the run, so undo restores it exactly. */
    from_source?: Word["folder_source"];
    from_confidence?: Confidence | null;
  }[];
  created_folders: string[];
}

export interface Settings {
  id: "settings";
  default_direction: Direction;
  new_per_day: number;
  grade_buttons: 2 | 3;
  swipe_grading: boolean;
  /** Vibrate on card swipes (Android; system haptic on iOS 18+). */
  haptics: boolean;
  theme: "system" | "light" | "dark";
  /** «Подсказки при вводе»: the «Варианты» list in the add sheet. */
  suggestions_enabled: boolean;
  /** Detect the slang level (and verlan) of new words. */
  slang_detect_enabled: boolean;
  /** Add an example sentence to new words. */
  examples_enabled: boolean;
  auto_sort_enabled: boolean;
  /** Single-key shortcuts on desktop (N, /, ?, G…, [, library J/K/X/M…). Off for screen-reader users (WCAG 2.1.4). */
  shortcuts: boolean;
  /** Desktop review: the hint line of keys under the card («Пробел вопрос · Z отменить»). */
  key_hints: boolean;
  /** How many «Варианты» to show (1–3). */
  suggest_count: 1 | 2 | 3;
  /** Which register «Варианты» put first. */
  suggest_register: "slang" | "any" | "neutral";
  /** Short usage notes in suggestions and screenshot rows. */
  notes_enabled: boolean;
  /** Model for suggestions, slang level, examples and themes: fast = Haiku, accurate = Sonnet. */
  ai_model: "fast" | "accurate";
  /** Model for screenshots. */
  ai_model_extract: "fast" | "accurate";
  /** Библиотека opens on the theme tiles or on the list of all words. */
  library_view: "themes" | "words";
  /** «Происхождение» (word.origin) in library rows and on the review card's answer side. */
  origin_visible: boolean;
  /**
   * «Мои наборы» as the first version kept them, device-local. Moved into the synced
   * `review_sets` table on upgrade (lib/db.ts) and in old backups; not written any more.
   */
  review_sets?: unknown[];
  /**
   * Sync bookkeeping as the first version kept it. lib/sync.ts now keeps both in its own "sync"
   * row (SyncMeta) and reads these only until that row exists; not written any more.
   */
  last_sync_at: string | null;
  sync_cursors?: Partial<Record<SyncTable, string>>;
}

/** A word's learning status, as lib/scheduler `wordStatus` reports it. */
export type ReviewSetStatus = "new" | "learning" | "difficult" | "known";

/** «Мои наборы»: a named card set for Повторение, built from filters (lib/review-sets.ts). Synced. */
export interface ReviewSet extends Syncable {
  name: string;
  /** Folder ids, "inbox" for «Входящие». Empty = every theme. */
  folders: string[];
  /** Word statuses. Empty = any. */
  statuses: ReviewSetStatus[];
  /** Slang levels and "verl" (OR-ed levels; "verl" also requires a verlan word). Empty = any. */
  slang: (SlangLevel | "verl")[];
  /** Words added in the last week or month, or any time. */
  added: "all" | "week" | "month";
  /** schedule: only cards that are due, graded as usual. practice: every card, the schedule untouched. */
  mode: "schedule" | "practice";
  created_at: string;
}

export const DEFAULT_SETTINGS: Settings = {
  id: "settings",
  default_direction: "fr_ru",
  new_per_day: 15,
  grade_buttons: 3,
  swipe_grading: true,
  haptics: true,
  theme: "system",
  suggestions_enabled: true,
  slang_detect_enabled: true,
  examples_enabled: true,
  auto_sort_enabled: true,
  shortcuts: true,
  key_hints: true,
  suggest_count: 3,
  suggest_register: "any",
  notes_enabled: true,
  ai_model: "fast",
  ai_model_extract: "fast",
  library_view: "themes",
  origin_visible: true,
  last_sync_at: null,
};

/*
 * «Упражнения»: exercise sets that Claude writes through the connector (create_exercise_set in
 * lib/mcp/tools.ts) and the app plays offline (lib/exercises.ts, pure rules in lib/core/exercises.ts).
 * Rows of the synced `exercise_sets` / `exercise_runs` tables (migration 0011_exercises.sql).
 *
 * ITEM CONTRACT. An item is one flat JSON object (a `type` enum, not a discriminated union). Every
 * field is always present in a stored row: absent text is `null` and absent lists are `[]`, so rows
 * round-trip through Postgres jsonb unchanged. `completeSet` (lib/core/exercises.ts) fills the
 * server-written parts and the defaults; `validateSet` then checks the rules below.
 *
 *   id           "q1".."qN", unique in the set (the server assigns them in order).
 *   type         "choice" | "cloze" | "register" | "pairs" | "conjugate". Later: typed, cloze_typed,
 *                order, odd_one_out, listen.
 *   skill        choice only, the card header label: meaning | form | neutral | verlan | situation.
 *                null for the other types.
 *   ask          choice + meaning only: "fr" = the prompt is the French word and the options are
 *                Russian; "ru" = the reverse. The server fills prompt and answer from the word.
 *                null otherwise.
 *   tense        conjugate only: present | passe_compose | imparfait | futur. null otherwise.
 *   person       conjugate only: je | tu | il | nous | vous | ils (il = il / elle / on). null otherwise.
 *                Older rows have neither: read as null.
 *   word_id      the library word the item is about (live, not paused). Exactly one of word_id /
 *   new_ref      new_ref (→ new_words[].ref) is set for choice, cloze, register and conjugate; both
 *                null for pairs.
 *                Word ids are UUIDs and refs are short ("n1"), so the two never collide.
 *   prompt       the stem on the card (≤300). Required for choice. cloze: an optional instruction
 *                (null → «Какое слово пропущено?»). register: an optional instruction (null →
 *                «Насколько это разговорно?»; the card shows word.fr). conjugate: the infinitive
 *                (server-filled from word.fr). pairs: null (→ «Соедини слово и перевод»).
 *   sentence     cloze only (≤300): a French sentence with exactly one [[answer]] span, e.g.
 *                "J'ai trop [[kiffé]] ce concert." The span equals `answer` under normalizeLemma.
 *                conjugate: server-built from the verb's conjugation, the pronouns and the verb part
 *                as the span: "tu [[as kiffé]]", "j'[[ai kiffé]]", "je me [[suis cassé]]".
 *   sentence_ru  cloze only, optional (≤300): the Russian hint. It must not translate the gap.
 *   answer       choice / cloze: the right option (≤120). register: the word's level label
 *                (REGISTER_LEVELS[slang_level], server-filled). conjugate: the verb part of the form
 *                (server-filled). pairs: null.
 *   distractors  choice / cloze / conjugate: exactly 3 wrong options (4 options in the 2×2 grid),
 *                distinct after searchKey and never equal to the answer (conjugate: other forms of the
 *                same verb without pronouns, server-built when left out). register (the 4 levels are
 *                the options) and pairs: [].
 *   pairs        pairs only: 4–6 unique word_ids or new_refs. [] otherwise.
 *   tiles        pairs only, server-built from the words: [{key, fr, ru}] in the order of `pairs`
 *                (key = the word_id or new_ref). [] otherwise.
 *   explain_ru   optional (≤200), shown after the answer.
 *   word         server-written snapshot of the item's word (choice, cloze, register, conjugate);
 *                null for pairs.
 *
 * Options are shuffled at play time (`optionsFor(item, random)`); nothing stores the answer's index.
 */
export type ExerciseItemType = "choice" | "cloze" | "register" | "pairs" | "conjugate";
/** What a choice item tests; shown in the card header. */
export type ExerciseSkill = "meaning" | "form" | "neutral" | "verlan" | "situation";
/** The tense a conjugate item asks (the four of a Conjugation). */
export type ExerciseTense = keyof Conjugation["tenses"];
/** The person a conjugate item asks, in table order (il stands for il / elle / on). */
export type ExercisePerson = "je" | "tu" | "il" | "nous" | "vous" | "ils";

/** The word an item is about, copied into the set by the server (the set plays without the library). */
export interface ExerciseWordSnapshot {
  fr: string;
  ru: string;
  pos: PartOfSpeech;
  gender: Gender;
  slang_level: SlangLevel;
  verlan: boolean;
  example_fr: string | null;
  example_ru: string | null;
}

/** One pairs tile: `key` is the word_id or new_ref it stands for. */
export interface ExercisePairTile {
  key: string;
  fr: string;
  ru: string;
}

export interface ExerciseItem {
  id: string;
  type: ExerciseItemType;
  skill: ExerciseSkill | null;
  ask: "fr" | "ru" | null;
  tense: ExerciseTense | null;
  person: ExercisePerson | null;
  word_id: string | null;
  new_ref: string | null;
  prompt: string | null;
  sentence: string | null;
  sentence_ru: string | null;
  answer: string | null;
  distractors: string[];
  pairs: string[];
  tiles: ExercisePairTile[];
  explain_ru: string | null;
  word: ExerciseWordSnapshot | null;
}

/**
 * A word that is not in the library yet (found by Claude's web search), travelling inside the set:
 * the add_words word shape plus `ref` (≤20, what items point at with `new_ref`) and the page it
 * came from. It gets an intro card before its first item and can be added from the done screen.
 */
export interface ExerciseNewWord {
  ref: string;
  fr: string;
  ru: string;
  note: string | null;
  example_fr: string | null;
  example_ru: string | null;
  pos: PartOfSpeech;
  gender: Gender;
  slang_level: SlangLevel;
  verlan: boolean;
  origin: string | null;
  source_url: string | null;
}

/** An exercise set. Content is written only by the connector; the app only sets `deleted_at`. Synced. */
export interface ExerciseSet extends Syncable {
  /** «Еда · 12 вопросов» style title, ≤60. */
  title: string;
  /** The free-text topic («вечеринка») when there was one. */
  topic: string | null;
  /** Theme ids the set was built from, "inbox" for «Входящие». New words are added to the first live one. */
  folders: string[];
  items: ExerciseItem[];
  new_words: ExerciseNewWord[];
  /** Who wrote it: "chat" (the connector). Later "quick" for sets built on the device. */
  source: string;
  /**
   * A set made only of the user's difficult and/or due words from every theme («по трудным словам»,
   * migration 0013), null for a set built from themes or a topic. Older rows have no value: read as null.
   */
  scope: ExerciseScope | null;
  created_at: string;
}

/** How one answer went. "near" (accent only) is reserved for typed items. */
export type ExerciseOutcome = "correct" | "wrong" | "dont_know";

/**
 * One answer in a run. `attempt` is 1 for the first try and grows each time the item comes back.
 * `chosen` is the option text picked (null for «Не знаю»); for pairs, the Russian tile matched with
 * the wrong word, with word_id / new_ref naming that word. A pairs board writes its mismatches as
 * they happen, then one 'correct' row (no word) when every pair is found, or on «Не знаю» one
 * 'dont_know' row per pair still open, each naming its word. `ms` is the time to answer.
 */
export interface ExerciseAnswer {
  item_id: string;
  word_id: string | null;
  new_ref: string | null;
  attempt: number;
  outcome: ExerciseOutcome;
  chosen: string | null;
  ms: number | null;
  at: string;
}

/**
 * One playthrough of a set, upserted after every answer by the playing device only (a run is
 * resumed only on the device that started it: lib/db.ts `own_runs`). Synced.
 */
export interface ExerciseRun extends Syncable {
  set_id: string | null;
  /** set: the whole set; mistakes: «Повторить ошибки»; quick: later, a set built on the device. */
  kind: "set" | "mistakes" | "quick";
  /** The items this run plays; [] = every item of the set. */
  item_ids: string[];
  started_at: string;
  /** null while unfinished («Продолжить»). */
  finished_at: string | null;
  answers: ExerciseAnswer[];
  /** Questions in the run. */
  total: number;
  /** Questions answered right on the first try. */
  first_try: number;
}

/** «Чаще в упражнениях»: which of the user's words Claude should favour in exercise sets. */
export type ExerciseFocusTarget = "normal" | "difficult" | "due" | "both";
/** A set drawn only from these words, across every theme: difficult, due today, or both. */
export type ExerciseScope = Exclude<ExerciseFocusTarget, "normal">;
/** How much of a set they should take: some ≈ a quarter, half ≥ half, most ≈ nearly all. */
export type ExerciseFocusShare = "some" | "half" | "most";
export interface ExerciseFocus {
  target: ExerciseFocusTarget;
  share: ExerciseFocusShare;
}

/**
 * A preference that follows the account (synced table `user_prefs`, migration 0012), so the
 * Claude connector can read it too. One row per key: `exercise_focus` → ExerciseFocus.
 */
export interface UserPref extends Syncable {
  value: unknown;
}

/**
 * «Прогресс»: the library at the end of one study day (from 04:00 local, lib/session.ts), saved
 * automatically the day after (lib/progress.ts `ensureProgressDays`). Synced table `progress_days`
 * (migration 0016_progress_days.sql). Counts are words: `known` + `learning` + `fresh` + `paused` =
 * `total` (paused words count only as paused), `difficult` ⊂ `learning`, `memorized` = «помню ≈».
 * Pure rules in lib/core/progress.ts.
 */
export interface ProgressDay extends Syncable {
  /** The study day, "YYYY-MM-DD". */
  id: string;
  known: number;
  learning: number;
  fresh: number;
  difficult: number;
  paused: number;
  total: number;
  /** Sum over words of their cards' mean retrievability at the day's end (a float). */
  memorized: number;
  /** Live review_log rows of the day. */
  reviews: number;
  /** Of those, «Не знаю» (rating 1). */
  again: number;
  /** Cards seen for the first time (a log from state New). */
  new_introduced: number;
  /** Words created that day (later-deleted ones included). */
  added: number;
  /** live: written the day after from the current data; replay: rebuilt later from review_log. */
  source: "live" | "replay";
  /** The FSRS version the numbers came from (lib/scheduler.ts FSRS_ALGO). */
  algo: string;
  /**
   * What the plan allowed that day (migration 0017): copied from the synced `plan_day` pref when the
   * row is written the day after; null when it wasn't kept (replay rows, days before 0017). Missing
   * on rows from before the column.
   */
  plan?: DayPlanSnapshot | null;
}

export const SYNC_TABLES = [
  "folders",
  "words",
  "review_state",
  "review_log",
  "reorg_runs",
  "review_sets",
  "field_defs",
  "exercise_sets",
  "exercise_runs",
  "user_prefs",
  "progress_days",
] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];
