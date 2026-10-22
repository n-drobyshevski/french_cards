// Shared domain types. Dexie (local) and Supabase (remote) store the same shapes;
// remote rows add `user_id`. Timestamps are ISO strings, ids are client UUIDs.

export type Direction = "fr_ru" | "ru_fr";

/** Detected slang level: 0 нейтр. · 1 fam. · 2 arg. · 3 vulg. */
export type SlangLevel = 0 | 1 | 2 | 3;
export const SLANG_LABELS = ["нейтр.", "fam.", "arg.", "vulg."] as const;

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
}

export interface Word extends Syncable {
  fr: string;
  ru: string;
  note: string | null;
  example_fr: string | null;
  example_ru: string | null;
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
  suggestions_enabled: boolean;
  auto_sort_enabled: boolean;
  /** Single-key shortcuts on desktop (N, /, ?, G…, [, library J/K/X/M…). Off for screen-reader users (WCAG 2.1.4). */
  shortcuts: boolean;
  /** Desktop review: the hint line of keys under the card («Пробел вопрос · Z отменить»). */
  key_hints: boolean;
  last_sync_at: string | null;
  /** Pull cursors per synced table: the server `synced_at` of the last row received. Owned by lib/sync.ts. */
  sync_cursors?: Partial<Record<SyncTable, string>>;
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
  auto_sort_enabled: true,
  shortcuts: true,
  key_hints: true,
  last_sync_at: null,
};

export const SYNC_TABLES = ["folders", "words", "review_state", "review_log", "reorg_runs"] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];
