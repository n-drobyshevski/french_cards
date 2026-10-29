// «Проверка» in the chat: the second MCP App of the connector (ui://kartochki/review.html), where the
// user checks what Claude proposes before it is written — levels for a batch of words
// (propose_levels → set_word_levels, mockup Chat-Levels-A) and new words before add_words
// (propose_words → add_words, mockup Chat-Words-A). The page calls those write tools itself
// (MCP App tools/call) only on the user's tap, then offers «Отменить» with the tool's own undo.
// The same page shows «Настроить упражнение» (setup_exercise): themes, «Спряжение глаголов» with its
// «Времена», the size and the level; «Начать ›» sends the request to Claude in the chat.
// And «Повторить слова» (setup_review): today's numbers, the themes with cards due, and a choice of
// «Карточки» / «Карточки, потом упражнение» / «Упражнение» / «Тренировка»; «Начать ›» sends that
// request too, and the cards themselves play on their own page (lib/core/chat-cards.ts).
// Pure types and helpers, shared by the server (lib/mcp/tools.ts) and the page (chat-player/).
import type { ChatCardsCounts, ChatPracticeScope } from "./chat-cards";
import type { Cefr } from "./level";
import type { ExerciseLevel } from "./exercises";
import type { ExerciseTense, Gender, PartOfSpeech, SlangLevel } from "../types";

/** The review page's UI resource; propose_levels and propose_words point at it. */
export const CHAT_REVIEW_URI = "ui://kartochki/review.html";

/** One word in «Уровни слов». */
export interface LevelReviewRow {
  id: string;
  fr: string;
  ru: string;
  pos: PartOfSpeech;
  /** Claude's proposal (preselected). */
  proposed: Cefr;
  /** The level the word shows now (stored or estimated) and where it comes from (user / chat / ai / flelex / freq). */
  current: Cefr | null;
  current_source: string | null;
  /** The app's dictionary estimate, shown as «≈C1 по словарю» when it differs from the proposal. */
  dictionary: Cefr | null;
  /** A level the user set: shown greyed «ВЫ УКАЗАЛИ», never saved over. */
  locked: boolean;
}

export interface LevelsReview {
  kind: "kartochki-levels";
  version: 1;
  rows: LevelReviewRow[];
  /** Words still without a level in the library after this batch (for «Следующие 15 ›»); null when unknown. */
  remaining: number | null;
}

/** A theme the user can pick for a new word; id null = «Входящие». */
export interface ReviewFolder {
  id: string | null;
  name: string;
  count: number;
}

/** One proposed new word in «Новые слова» (the add_words word fields plus what the server found). */
export interface WordReviewRow {
  /** Stable key for the row inside this review (its index as a string). */
  key: string;
  fr: string;
  ru: string;
  pos: PartOfSpeech;
  gender: Gender;
  slang_level: SlangLevel;
  verlan: boolean;
  note: string | null;
  example_fr: string | null;
  example_ru: string | null;
  origin: string | null;
  /** The level the app would show (≈, estimated) or the one Claude gave. */
  level: Cefr | null;
  /** The level Claude gave (add_words `cefr`, sent back as is); null = the app estimates `level` itself. */
  cefr?: Cefr | null;
  /**
   * The add_words word fields the card doesn't show (tags, custom_fields, conjugation,
   * both_directions), as Claude gave them: sent back unchanged with the word. Missing when none.
   */
  extra?: Record<string, unknown>;
  /** The theme it would go to. */
  folder: ReviewFolder;
  /** The theme was named by the user (folder_chosen_by_user); a theme the user picks in the page counts too. */
  folder_chosen_by_user: boolean;
  /** Already saved: unchecked and struck («уже есть в «Жильё»»). */
  duplicate: { id: string; fr: string; folder_name: string } | null;
  /** Preselected: true unless a duplicate. */
  checked: boolean;
}

export interface WordsReview {
  kind: "kartochki-words";
  version: 1;
  rows: WordReviewRow[];
  /** The user's themes for the picker, «Входящие» first. */
  folders: ReviewFolder[];
  /** Where the words came from, as a mono label («ИЗ СКРИНШОТА», «ИЗ ПЕСНИ»); null when not said. */
  source_label: string | null;
  /**
   * The app's address (origin, no trailing slash) for «Открыть «Жильё» в Карточках ↗» after adding
   * (reviewFolderUrl); null / missing when the server doesn't know it, and the link is left out.
   */
  app_url?: string | null;
}

/** A theme in «Настроить упражнение»: id null = «Входящие»; its live words, and the verbs a verb test can use. */
export interface SetupTheme {
  id: string | null;
  name: string;
  count: number;
  verbs: number;
}

/** «Настроить упражнение» (setup_exercise): what the card offers, and what Claude preselected from the request. */
export interface ExerciseSetup {
  kind: "kartochki-setup";
  version: 1;
  /** Themes with words, «Входящие» first; themes «на паузе» left out. */
  themes: SetupTheme[];
  preset: {
    verbs: boolean;
    /** Theme ids (null = «Входящие»); none = every theme. */
    folders: (string | null)[];
    /** none = all four. */
    tenses: ExerciseTense[];
    /** null = the default size. */
    size: number | null;
    /** none = «Авто». */
    levels: ExerciseLevel[];
  };
  /** The «Вопросов» choices of an ordinary set and of a verb test. */
  sizes: number[];
  verb_sizes: number[];
}

/**
 * What «Повторить слова» offers: «Карточки» (a round by the schedule, grades saved), «Карточки,
 * потом упражнение» (the same, then an exercise on the misses), «Упражнение» (an exercise on the
 * words due, nothing graded), «Тренировка» (cards that change nothing).
 */
export type CardsSetupChoice = "cards" | "cards_then_exercise" | "exercise" | "practice";
export const CARDS_SETUP_CHOICES: readonly CardsSetupChoice[] = ["cards", "cards_then_exercise", "exercise", "practice"];

/** A theme in «Повторить слова»: id null = «Входящие»; its cards due today and the new ones it would bring. */
export interface CardsSetupTheme {
  id: string | null;
  name: string;
  due: number;
  new: number;
  /** «Тренировка»'s count in this theme, by scope (a scope left out: none), so the card adds up the picked themes. */
  practice: Partial<Record<ChatPracticeScope, number>>;
}

/** A «Тренировка» option («Ошибки сегодня · 4»): what the round takes and how many cards that is now. */
export interface CardsSetupScope {
  scope: ChatPracticeScope;
  label: string;
  count: number;
}

/** «Повторить слова» (setup_review): today's numbers, what the card offers, and what Claude preselected from the request. */
export interface CardsSetup {
  kind: "kartochki-cards-setup";
  version: 1;
  /** Today's numbers («12 к повторению · 4 новых · 1 ждёт»), as study_summary counts them. */
  today: ChatCardsCounts;
  /** Themes with cards due or new today, or something to practise, «Входящие» first; themes «на паузе» left out. */
  themes: CardsSetupTheme[];
  preset: {
    choice: CardsSetupChoice;
    /** Cards in the round; null = the default (CARDS_ROUND_DEFAULT). */
    size: number | null;
    /** Theme ids (null = «Входящие»); none = every theme. */
    folders: (string | null)[];
    /** «Тренировка»: what the round takes; null = the first of `scopes`. */
    scope: ChatPracticeScope | null;
  };
  /** The «Карточек» choices. */
  sizes: number[];
  /** «Тренировка»'s options, in order, counted over every theme; empty when there is nothing to practise. */
  scopes: CardsSetupScope[];
}

export type ChatReview = LevelsReview | WordsReview | ExerciseSetup | CardsSetup;

/** A theme's «Тренировка» counts, the positive numbers only. */
function practiceCounts(v: unknown): Partial<Record<ChatPracticeScope, number>> {
  if (!v || typeof v !== "object") return {};
  return Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === "number" && Number.isFinite(x) && x > 0)) as Partial<Record<ChatPracticeScope, number>>;
}

/** «Повторить слова» from structuredContent, with what an older connector left out filled; null when it isn't one. */
function asCardsSetup(v: Partial<CardsSetup>): CardsSetup | null {
  const today = v.today as Partial<ChatCardsCounts> | undefined;
  if (!today || typeof today !== "object" || !Array.isArray(v.themes) || !v.preset || typeof v.preset !== "object" || !Array.isArray(v.sizes)) return null;
  const preset = v.preset as Partial<CardsSetup["preset"]>;
  if (!CARDS_SETUP_CHOICES.includes(preset.choice as CardsSetupChoice)) return null;
  const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : 0);
  return {
    ...(v as CardsSetup),
    today: { due: n(today.due), new: n(today.new), waiting: n(today.waiting), deferred: n(today.deferred) },
    themes: v.themes.filter((t): t is CardsSetupTheme => !!t && typeof t === "object" && (t.id === null || typeof t.id === "string") && typeof t.name === "string").map((t) => ({ ...t, due: n(t.due), new: n(t.new), practice: practiceCounts(t.practice) })),
    preset: {
      choice: preset.choice as CardsSetupChoice,
      size: typeof preset.size === "number" && preset.size > 0 ? preset.size : null,
      folders: Array.isArray(preset.folders) ? preset.folders.filter((f) => f === null || typeof f === "string") : [],
      scope: preset.scope ?? null,
    },
    sizes: v.sizes.filter((x) => typeof x === "number" && x > 0),
    scopes: Array.isArray(v.scopes) ? v.scopes.filter((s) => !!s && typeof s.scope === "string" && typeof s.label === "string").map((s) => ({ ...s, count: n(s.count) })) : [],
  };
}

/** A review from a tool result's structuredContent; null when it isn't one. */
export function asChatReview(value: unknown): ChatReview | null {
  if (!value || typeof value !== "object") return null;
  if ((value as { kind?: unknown }).kind === "kartochki-cards-setup") return asCardsSetup(value as Partial<CardsSetup>);
  const v = value as Partial<LevelsReview | WordsReview> & Partial<ExerciseSetup>;
  if (v.kind === "kartochki-setup") return Array.isArray(v.themes) && v.preset && Array.isArray(v.sizes) ? (v as ExerciseSetup) : null;
  if (v.kind !== "kartochki-levels" && v.kind !== "kartochki-words") return null;
  if (!Array.isArray(v.rows)) return null;
  return v as ChatReview;
}

/** The app's page of a theme («Входящие» for null), as the app routes it (/library/[id], /library/inbox). */
export function reviewFolderUrl(appUrl: string, folderId: string | null): string {
  return `${appUrl.replace(/\/+$/, "")}/library/${encodeURIComponent(folderId ?? "inbox")}`;
}
