// The review page's rules (lib/core/chat-review.ts has the contract): the rows as the user edits
// them, what the page sends to the connector's write tools (set_word_levels, add_words, and their
// undos set_word_levels / delete_words, in the shapes lib/mcp/tools.ts takes), how it reads their
// results back, and the lines it shows and tells Claude; «Настроить упражнение»'s picks and the request
// it sends; «Повторить слова»'s picks and its request (the cards page's wording, cards/requests.ts).
// Pure: views.ts draws it, review-main.ts runs it.
import { CARDS_ROUND_DEFAULT, type ChatPracticeScope } from "@/lib/core/chat-cards";
import type { CardsSetup, CardsSetupChoice, CardsSetupTheme, ExerciseSetup, LevelReviewRow, LevelsReview, ReviewFolder, SetupTheme, WordReviewRow, WordsReview } from "@/lib/core/chat-review";
import { buildChatRequestText, EXERCISE_LEVELS, EXERCISE_TENSES, type ExerciseLevel } from "@/lib/core/exercises";
import { isCefr, type Cefr } from "@/lib/core/level";
import type { ExerciseTense } from "@/lib/types";
import { cardsRequest, practiceRequest, quoted } from "../cards/requests";
import { plural } from "../texts";

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(isObject) : []);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

export const WORDS = ["слово", "слова", "слов"] as const;
const LEVELS = ["уровень", "уровня", "уровней"] as const;

/** Rows shown in the chat before «Показать все» (Chat-Levels-A: 7, Chat-Words-A: 6); one more is shown rather than «ещё 1». */
export const INLINE_LEVELS = 7;
export const INLINE_WORDS = 6;
export const inlineCount = (total: number, limit: number) => (total <= limit + 1 ? total : limit);

// --- «Уровни слов» -------------------------------------------------------------------------------

export interface LevelRow {
  row: LevelReviewRow;
  checked: boolean;
  /** The level picked: Claude's proposal until the user taps another. A locked row shows its current one. */
  level: Cefr;
}

export function levelRows(review: LevelsReview): LevelRow[] {
  return review.rows.map((row) => ({ row, checked: !row.locked, level: row.locked ? (row.current ?? row.proposed) : row.proposed }));
}

/** The rows «Сохранить N» writes: checked and not set by the user. */
export const levelsToSave = (rows: readonly LevelRow[]) => rows.filter((r) => r.checked && !r.row.locked);

/** set_word_levels' arguments (its input: items of word_id + cefr; the user's own levels are never overwritten). */
export function setLevelsArguments(rows: readonly LevelRow[]): { items: { word_id: string; cefr: Cefr }[] } {
  return { items: levelsToSave(rows).map((r) => ({ word_id: r.row.id, cefr: r.level })) };
}

/** What set_word_levels did, as the receipt needs it; `undo` is the call that puts it back. */
export interface LevelsSaved {
  saved: number;
  /** Levels the user set: the locked rows (not sent) and the server's skipped_user. */
  skipped: number;
  /** Not written: not found, changed meanwhile, or a failed write. */
  failed: number;
  undo: { items: unknown[]; overwrite_user: boolean } | null;
}

export function readLevelsResult(data: Record<string, unknown>, lockedNotSent: number): LevelsSaved {
  const undo = isObject(data.undo) && Array.isArray(data.undo.items) ? { items: data.undo.items, overwrite_user: data.undo.overwrite_user === true } : null;
  const count = (key: string) => (Array.isArray(data[key]) ? (data[key] as unknown[]).length : 0);
  return {
    saved: count("updated") + count("unchanged"),
    skipped: lockedNotSent + count("skipped_user"),
    failed: count("not_found") + count("conflicts") + count("changed_since") + count("failed"),
    undo,
  };
}

/** «Сохранено 14 уровней · 1 пропущено (вы указали сами)». */
export function levelsReceipt(s: LevelsSaved): string {
  const parts = [`Сохранено ${s.saved} ${plural(s.saved, LEVELS)}`];
  // «1 пропущено»: the count as a tally, as the mockup has it.
  if (s.skipped > 0) parts.push(`${s.skipped} пропущено (вы указали сами)`);
  if (s.failed > 0) parts.push(`${s.failed} не сохранено`);
  return parts.join(" · ");
}

/** For Claude (ui/update-model-context): what was saved, and where the user changed the proposal. */
export function levelsContext(rows: readonly LevelRow[], s: LevelsSaved): string {
  const sent = levelsToSave(rows);
  const changed = sent.filter((r) => r.level !== r.row.proposed).map((r) => `${r.row.fr} ${r.row.proposed}→${r.level}`);
  const unchecked = rows.filter((r) => !r.checked && !r.row.locked).map((r) => r.row.fr);
  return [
    `В окне «Уровни слов» пользователь сохранил ${s.saved} ${plural(s.saved, LEVELS)}: ${sent.map((r) => `${r.row.fr} ${r.level}`).join(", ")}.`,
    changed.length > 0 && `Поправил предложенное: ${changed.join(", ")}.`,
    unchecked.length > 0 && `Снял галочку (не сохранено): ${unchecked.join(", ")}.`,
    s.skipped > 0 && `Пропущено ${s.skipped} (уровень указал сам пользователь).`,
    s.failed > 0 && `Не сохранено ${s.failed}: проверь их через search_words.`,
  ]
    .filter(Boolean)
    .join(" ");
}

/** «Предложи уровни для следующих 15 слов без уровня» (`remaining`: words still without one, when known). */
export function nextLevelsMessage(remaining: number | null, batch = 15): string {
  const n = remaining === null ? batch : Math.min(batch, remaining);
  // «для следующих 4 слов»: after «следующих» the noun is genitive plural whatever the number.
  return n === 1 ? "Предложи уровень для следующего слова без уровня" : `Предложи уровни для следующих ${n} слов без уровня`;
}

// --- «Новые слова» -------------------------------------------------------------------------------

export interface WordRow {
  row: WordReviewRow;
  checked: boolean;
  folder: ReviewFolder;
  /** The theme was named by the user, or picked here: folder_chosen_by_user. */
  chosen: boolean;
}

export function wordRows(review: WordsReview): WordRow[] {
  return review.rows.map((row) => ({ row, checked: row.checked && !row.duplicate, folder: row.folder, chosen: row.folder_chosen_by_user }));
}

export const wordsToAdd = (rows: readonly WordRow[]) => rows.filter((r) => r.checked && !r.row.duplicate);

export const sameFolder = (a: ReviewFolder, b: ReviewFolder) => a.id === b.id;

/** «Тема для всех»: the theme every word that can be added shares; null when they differ. */
export function commonFolder(rows: readonly WordRow[]): ReviewFolder | null {
  const open = rows.filter((r) => !r.row.duplicate);
  if (open.length === 0) return null;
  return open.every((r) => sameFolder(r.folder, open[0].folder)) ? open[0].folder : null;
}

/** add_words' theme selector: the theme's id, or "inbox" for «Входящие». */
const folderSelector = (f: ReviewFolder) => f.id ?? "inbox";

/**
 * add_words' arguments: each checked word with its own theme and folder_chosen_by_user (true when
 * the user named the theme or picked it here); the call's flag is true only when it is for all.
 */
export function addWordsArguments(rows: readonly WordRow[]): { words: Record<string, unknown>[]; folder_chosen_by_user: boolean } {
  const add = wordsToAdd(rows);
  const words = add.map(({ row, folder, chosen }) => {
    // What the card doesn't show (tags, custom_fields, conjugation, both_directions) goes back as Claude gave it.
    const w: Record<string, unknown> = { ...row.extra, fr: row.fr, ru: row.ru, pos: row.pos, slang_level: row.slang_level, verlan: row.verlan };
    if (row.pos === "noun") w.gender = row.gender;
    for (const key of ["note", "example_fr", "example_ru", "origin"] as const) if (row[key]) w[key] = row[key];
    // Claude's own level, sent back as it came; without it the app estimates one.
    if (row.cefr) w.cefr = row.cefr;
    w.folder = folderSelector(folder);
    w.folder_chosen_by_user = chosen;
    return w;
  });
  return { words, folder_chosen_by_user: add.length > 0 && add.every((r) => r.chosen) };
}

export interface AddedWord {
  id: string;
  fr: string;
  ru: string;
  folder: ReviewFolder;
  level: Cefr | null;
}

export interface WordsAdded {
  added: AddedWord[];
  /** Words the server found saved already (the page's own duplicates are listed apart). */
  duplicates: { fr: string; folder_name: string }[];
  /** delete_words' ids: the undo. */
  undoIds: string[];
}

const folderOf = (v: unknown): ReviewFolder => {
  const f = isObject(v) ? v : {};
  return { id: str(f.id), name: str(f.name) ?? "Входящие", count: 0 };
};

export function readWordsResult(data: Record<string, unknown>): WordsAdded {
  const added = list(data.added)
    .map((w) => ({ id: str(w.id) ?? "", fr: str(w.fr) ?? "", ru: str(w.ru) ?? "", folder: folderOf(w.folder), level: isCefr(w.level) ? w.level : null }))
    .filter((w) => w.id);
  const duplicates = list(data.duplicates).map((d) => ({ fr: str(d.fr) ?? "", folder_name: folderOf(isObject(d.existing) ? d.existing.folder : null).name }));
  const undo = isObject(data.undo) && Array.isArray(data.undo.ids) ? data.undo.ids.filter((id): id is string => typeof id === "string") : added.map((w) => w.id);
  return { added, duplicates, undoIds: undo };
}

/** «Добавлено 9 слов в «Жильё»»; «Добавлено 9 слов: 7 в «Жильё», 2 во «Входящие»» across themes. */
export function addedHeadline(added: readonly AddedWord[]): string {
  const n = added.length;
  const groups = new Map<string, { name: string; n: number }>();
  for (const w of added) {
    const key = w.folder.id ?? "";
    groups.set(key, { name: w.folder.name, n: (groups.get(key)?.n ?? 0) + 1 });
  }
  const into = (name: string) => `${/^[Вв][^аеёиоуыэюяАЕЁИОУЫЭЮЯ]/.test(name) ? "во" : "в"} «${name}»`;
  const head = `Добавлено ${n} ${plural(n, WORDS)}`;
  if (groups.size === 1) return `${head} ${into([...groups.values()][0].name)}`;
  return `${head}: ${[...groups.values()].map((g) => `${g.n} ${into(g.name)}`).join(", ")}`;
}

/** The one theme the words went to (for «Открыть «Жильё» в Карточках»); null across themes. */
export function addedFolder(added: readonly AddedWord[]): ReviewFolder | null {
  if (added.length === 0) return null;
  return added.every((w) => sameFolder(w.folder, added[0].folder)) ? added[0].folder : null;
}

/** For Claude: what was added where, and what was skipped. */
export function wordsContext(result: WordsAdded, skipped: readonly string[]): string {
  return [
    `В окне «Новые слова» пользователь добавил ${result.added.length} ${plural(result.added.length, WORDS)}: ${result.added.map((w) => `${w.fr} → «${w.folder.name}»`).join(", ")}.`,
    skipped.length > 0 && `Не добавлены (уже есть или сняты): ${skipped.join(", ")}.`,
  ]
    .filter(Boolean)
    .join(" ");
}

// --- «Настроить упражнение» ----------------------------------------------------------------------

export interface SetupState {
  /** Picked theme ids (null = «Входящие»); none = every theme. */
  folders: (string | null)[];
  verbs: boolean;
  /** none = all four. */
  tenses: ExerciseTense[];
  /** The ordinary set's size and the verb test's, kept apart as in the app. */
  size: number;
  verbSize: number;
  /** none = «Авто». */
  levels: ExerciseLevel[];
  /** «Начать ›» was sent to the chat. */
  sent: boolean;
}

const nearest = (sizes: readonly number[], want: number | null, fallback: number) =>
  sizes.length === 0 ? fallback : want === null ? (sizes.includes(fallback) ? fallback : sizes[Math.floor(sizes.length / 2)]) : sizes.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a));

export function setupState(setup: ExerciseSetup): SetupState {
  const p = setup.preset;
  return {
    folders: p.folders.filter((id) => setup.themes.some((t) => t.id === id)),
    verbs: p.verbs,
    tenses: EXERCISE_TENSES.filter((t) => p.tenses.includes(t)),
    size: nearest(setup.sizes, p.verbs ? null : p.size, 12),
    verbSize: nearest(setup.verb_sizes, p.verbs ? p.size : null, 8),
    levels: EXERCISE_LEVELS.filter((l) => p.levels.includes(l)),
    sent: false,
  };
}

/** A theme, tense or level tapped on or off, kept in the card's order. */
export function toggled<T>(order: readonly T[], picked: readonly T[], value: T): T[] {
  return order.filter((x) => (x === value ? !picked.includes(x) : picked.includes(x)));
}

/** The themes the request names (none = every theme), in the card's order. */
export const setupThemes = (setup: ExerciseSetup, state: SetupState): SetupTheme[] => setup.themes.filter((t) => state.folders.includes(t.id));

/** The words (a verb test: the verbs) the request can use: of the picked themes, else of all. */
export function setupAvailable(setup: ExerciseSetup, state: SetupState): number {
  const themes = state.folders.length ? setupThemes(setup, state) : setup.themes;
  return themes.reduce((n, t) => n + (state.verbs ? t.verbs : t.count), 0);
}

/** «Начать ›»'s message: the app's request sentence, played here in the chat. */
export function setupRequest(setup: ExerciseSetup, state: SetupState): string {
  return buildChatRequestText({
    folders: setupThemes(setup, state).map((t) => t.name),
    topic: null,
    size: state.verbs ? state.verbSize : state.size,
    allowNew: false,
    conjugation: state.verbs,
    levels: state.levels,
    tenses: state.verbs ? state.tenses : null,
  });
}

// --- «Повторить слова» ---------------------------------------------------------------------------

/** «Упражнение»'s «Вопросов» choices (the app's set sizes; the setup card names none for it). */
export const DUE_EXERCISE_SIZES: readonly number[] = [8, 12, 16];

export interface CardsSetupState {
  choice: CardsSetupChoice;
  /** Theme ids (null = «Входящие»); none = every theme. */
  folders: (string | null)[];
  /** Cards in the round («Карточки», «Тренировка») and questions in «Упражнение», kept apart. */
  size: number;
  exerciseSize: number;
  /** «Тренировка»: what the round takes. */
  scope: ChatPracticeScope;
  /** «Начать ›» was sent to the chat. */
  sent: boolean;
}

export function cardsSetupState(setup: CardsSetup): CardsSetupState {
  const p = setup.preset;
  const scopes = setup.scopes.map((s) => s.scope);
  return {
    choice: p.choice,
    folders: p.folders.filter((id) => setup.themes.some((t) => t.id === id)),
    size: nearest(setup.sizes, p.choice === "exercise" ? null : p.size, CARDS_ROUND_DEFAULT),
    exerciseSize: nearest(DUE_EXERCISE_SIZES, p.choice === "exercise" ? p.size : null, 12),
    scope: p.scope && (scopes.length === 0 || scopes.includes(p.scope)) ? p.scope : (scopes[0] ?? "recent"),
    sent: false,
  };
}

/** The themes the request names (none = every theme), in the card's order. */
export const cardsSetupThemes = (setup: CardsSetup, state: CardsSetupState): CardsSetupTheme[] => setup.themes.filter((t) => state.folders.includes(t.id));

/** «Тренировка»'s count of `scope` («Ошибки сегодня · 4»): over the picked themes, else every theme. */
export function cardsScopeCount(setup: CardsSetup, state: CardsSetupState, scope: ChatPracticeScope): number {
  const all = setup.scopes.find((s) => s.scope === scope)?.count ?? 0;
  if (state.folders.length === 0) return all;
  return Math.min(all, cardsSetupThemes(setup, state).reduce((n, t) => n + (t.practice[scope] ?? 0), 0));
}

/** A theme's number on its chip: its cards due and new for a round by the schedule, due for «Упражнение», the option's count for «Тренировка». */
export function cardsThemeCount(theme: CardsSetupTheme, state: CardsSetupState): number {
  if (state.choice === "practice") return theme.practice[state.scope] ?? 0;
  return state.choice === "exercise" ? theme.due : theme.due + theme.new;
}

/**
 * What the pick has to play now: the cards due and new of the themes (every theme: today's
 * numbers), the words due for «Упражнение», the chosen option's count for «Тренировка».
 */
export function cardsSetupAvailable(setup: CardsSetup, state: CardsSetupState): number {
  const themes = state.folders.length ? cardsSetupThemes(setup, state) : null;
  switch (state.choice) {
    case "practice":
      return cardsScopeCount(setup, state, state.scope);
    case "exercise":
      return themes ? themes.reduce((n, t) => n + t.due, 0) : setup.today.due;
    default:
      return themes ? themes.reduce((n, t) => n + t.due + t.new, 0) : setup.today.due + setup.today.new;
  }
}

/**
 * «Начать ›»'s message: «Повтори карточки здесь в чате, 20 карточек[, по темам …][, потом упражнение
 * по ошибкам].», the app's due-words exercise played here («Сделай упражнение здесь в чате по словам
 * к повторению из всех тем, 12 вопросов.»), or «Потренируй карточки здесь в чате без расписания: …».
 */
export function cardsSetupRequest(setup: CardsSetup, state: CardsSetupState): string {
  const names = cardsSetupThemes(setup, state).map((t) => t.name);
  switch (state.choice) {
    case "practice":
      return practiceRequest({ scope: state.scope, size: state.size, themes: names });
    case "exercise": {
      const all = buildChatRequestText({ folders: [], topic: null, size: state.exerciseSize, allowNew: false, scope: "due" });
      if (names.length === 0) return all;
      return all.replace("из всех тем", names.length === 1 ? `из темы ${quoted(names[0])}` : `из тем ${names.map(quoted).join(", ")}`);
    }
    default:
      return cardsRequest({ size: state.size, themes: names, thenExercise: state.choice === "cards_then_exercise" });
  }
}

/** «12 к повторению · 4 новых · 1 ждёт» (a part at 0 left out; nothing at all: «Сегодня повторять нечего»). */
export function todayLine(today: CardsSetup["today"]): string {
  const parts = [
    today.due > 0 && `${today.due} к повторению`,
    today.new > 0 && `${today.new} ${plural(today.new, ["новая", "новых", "новых"])}`,
    today.waiting > 0 && `${today.waiting} ${plural(today.waiting, ["ждёт", "ждут", "ждут"])}`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Сегодня повторять нечего";
}
