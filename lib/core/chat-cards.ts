// «Карточки в чате»: the contract between the connector and the card page it shows inside a Claude
// chat (an MCP App, `ui://` resource; spec io.modelcontextprotocol/ui 2026-01-26). play_cards hands
// the page one round of cards; in «По расписанию» the page grades each card through grade_cards
// (MCP App tools/call, only on the user's tap) and takes the last answer back with undo_grades; in
// «Тренировка» nothing is written. The server grades with the app's own FSRS rules (lib/scheduler.ts)
// and sends each card's interval labels, so the page never needs ts-fsrs: keep this file pure (no
// ts-fsrs, no node:crypto, no Dexie, no React) so the page bundle (scripts/build-chat-player.mjs) can
// import it.
import { LEARN_AHEAD_MS } from "./plan";
import type { Cefr } from "./level";
import type { Direction, Gender, PartOfSpeech, SlangLevel } from "../types";

/** The cards page's UI resource; play_cards points at it with `_meta.ui.resourceUri`. */
export const CHAT_CARDS_URI = "ui://kartochki/cards.html";
/** The tool the page calls after each answer (or a few answers at once) in «По расписанию». */
export const GRADE_TOOL = "grade_cards";
/** The tool the page calls to take back its last answer (the `undo` a grade_cards result carries). */
export const UNDO_GRADES_TOOL = "undo_grades";

/** Cards in one round: play_cards' `limit` is CARDS_ROUND_MIN…CARDS_ROUND_MAX, default CARDS_ROUND_DEFAULT. */
export const CARDS_ROUND_MIN = 5;
export const CARDS_ROUND_MAX = 50;
export const CARDS_ROUND_DEFAULT = 20;
/** Answers in one grade_cards call (the page's outbox sends what piled up while a call was in flight). */
export const GRADE_BATCH_MAX = 20;
/**
 * How far back the server accepts an answer's `answered_at` (an answer that waited for the host's
 * Allow). Older times, and times before the study day began, are clamped; so are future ones.
 */
export const ANSWER_MAX_AGE_MS = 2 * 60 * 60_000;
/** The id prefix of review_log rows the connector writes: "cr-" + sha256(card id, `expected`), so a retried grade lands on the same row. */
export const CARD_LOG_PREFIX = "cr-";
/**
 * A graded card due within this (20 min, as the app's L-ahead) comes back at the end of the round,
 * with the `expected` and `intervals` of its grade result; a later one waits for the done screen.
 */
export { LEARN_AHEAD_MS };

/** «По расписанию» writes real grades (review_state, review_log); «Тренировка» writes nothing. */
export type ChatCardsMode = "schedule" | "practice";
/** «Не знаю» (Again), «Сложно» (Hard), «Знаю» (Good): the app's three buttons; Easy is never offered. */
export type ChatCardRating = 1 | 2 | 3;
/** One side, or both («FR ↔ RU»). */
export type ChatCardsDirection = Direction | "both";
/**
 * What a practice round takes: "today" failed today («Повторить ошибки»), "recent" failed or hard
 * lately plus the weakest («Ещё практика»), "all" every card of the themes («Тренировка всей темы»),
 * "difficult" the words with the most misses, "due" the cards due today, shuffled, nothing written.
 */
export type ChatPracticeScope = "today" | "recent" | "all" | "difficult" | "due";

/** The button labels, as the app's GradeBar shows them. */
export const GRADE_LABELS: Record<ChatCardRating, string> = { 1: "Не знаю", 2: "Сложно", 3: "Знаю" };
export const RATINGS: readonly ChatCardRating[] = [1, 2, 3];

/** The sub-labels under the three buttons («<1 мин», «6 мин», «1 д»): lib/scheduler `previewIntervals` at the time the card was built. */
export type ChatIntervals = Record<ChatCardRating, string>;

/** A custom field («Свои поля») with a value, as the answer side shows it. */
export interface ChatCardField {
  label: string;
  value: string;
}

/** Custom fields a card carries at most; the rest are counted in `fields_more` («+2 поля»). */
export const CARD_FIELDS_MAX = 3;

/** One card of the round: which card it is, what the grade is based on, and both faces. */
export interface ChatCard {
  /** review_state id: `${word_id}:${direction}` (unique in the round). */
  key: string;
  word_id: string;
  direction: Direction;
  /** Never reviewed: the question side shows «НОВОЕ». */
  is_new: boolean;
  /** The card's updated_at when the round was built: grade_cards writes only while it is still stored (compare-and-set). */
  expected: string;
  /** «По расписанию»: the three sub-labels; null in «Тренировка» (nothing is scheduled). */
  intervals: ChatIntervals | null;
  /** The word's catalog number («FR · № 007», oldest word first, as the app numbers it); null when unknown. */
  number: number | null;
  fr: string;
  ru: string;
  pos: PartOfSpeech;
  gender: Gender;
  slang_level: SlangLevel;
  verlan: boolean;
  example_fr: string | null;
  example_ru: string | null;
  note: string | null;
  /** «Происхождение». */
  origin: string | null;
  /** «Свои поля» with a value, at most CARD_FIELDS_MAX. */
  fields: ChatCardField[];
  /** Further filled custom fields not sent. */
  fields_more: number;
  /** «Уровень языка»: stored, or the app's estimate (`level_estimated`, shown «≈B1»); null when none. */
  level: Cefr | null;
  level_estimated: boolean;
  /** The word's theme («Входящие» for none). */
  folder_name: string;
}

/** Today's numbers, as study_summary and the app's header count them («План дня»). */
export interface ChatCardsCounts {
  /** Review and learning cards due today, waiting ones included. */
  due: number;
  /** New cards still allowed today. */
  new: number;
  /** Learning cards due later today (more than LEARN_AHEAD_MS away). */
  waiting: number;
  /** Review cards held for tomorrow by the cap or by burying. */
  deferred: number;
}

/** One round, as play_cards' `structuredContent` hands it to the page. */
export interface ChatCardsSession {
  kind: "kartochki-cards";
  version: 1;
  mode: ChatCardsMode;
  /** The server's handle for this round: the page uses it to tell a host's re-sent result from a new round. */
  round_id: string;
  /** When the server built the round (ISO). */
  built_at: string;
  /** The end of the study day (04:00 in MCP_TIMEZONE, ISO): after it the round is stale («Раунд устарел»). */
  day_end: string;
  /** The round's heading («Повторение», «Тренировка · Еда»). */
  title: string;
  /** Which themes: «Все темы», a theme's name, or «Еда, Жильё». */
  folder_label: string;
  /** The themes' names, as play_cards' `folders` takes them back (a name may hold a comma); none = every theme. */
  folder_names: string[];
  direction: ChatCardsDirection;
  /** «FR → RU», «RU → FR», «FR ↔ RU». */
  direction_label: string;
  /** «Тренировка»: what the round takes; null in «По расписанию». */
  scope: ChatPracticeScope | null;
  cards: ChatCard[];
  /** «По расписанию»: today's numbers when the round was built; all zero in «Тренировка». */
  counts: ChatCardsCounts;
  /** Cards still in today's queue after this round («Ещё 12 к повторению · Продолжить ›»); 0 in «Тренировка». */
  remaining: number;
  /** The earliest learning card waiting later today (ISO), for «через 25 мин — ещё 3»; null when none. */
  next_due: string | null;
  /** What the done screen offers first: «Упражнение по ошибкам ›» when "exercise" (the user chose «Карточки, потом упражнение»). */
  next: "exercise" | null;
  /** The app's address (origin, no trailing slash), for hosts without apps and for «Открыть в Карточках ↗»; null when unknown. */
  app_url: string | null;
}

const DIRECTION_LABELS: Record<ChatCardsDirection, string> = { fr_ru: "FR → RU", ru_fr: "RU → FR", both: "FR ↔ RU" };

/** «FR → RU», «RU → FR», «FR ↔ RU». */
export const directionLabel = (direction: ChatCardsDirection): string => DIRECTION_LABELS[direction];

const ZERO_COUNTS: ChatCardsCounts = { due: 0, new: 0, waiting: 0, deferred: 0 };
const text = (v: unknown): string | null => (typeof v === "string" ? v : null);
const count = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

function asIntervals(value: unknown): ChatIntervals | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  return RATINGS.every((r) => typeof v[r] === "string") ? { 1: v[1] as string, 2: v[2] as string, 3: v[3] as string } : null;
}

function asCard(value: unknown): ChatCard | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<ChatCard>;
  if (typeof v.word_id !== "string" || (v.direction !== "fr_ru" && v.direction !== "ru_fr") || typeof v.expected !== "string") return null;
  if (typeof v.fr !== "string" || typeof v.ru !== "string") return null;
  const fields = Array.isArray(v.fields) ? v.fields.filter((f): f is ChatCardField => !!f && typeof f.label === "string" && typeof f.value === "string") : [];
  return {
    ...(v as ChatCard),
    key: typeof v.key === "string" ? v.key : `${v.word_id}:${v.direction}`,
    is_new: v.is_new === true,
    intervals: asIntervals(v.intervals),
    number: typeof v.number === "number" && v.number > 0 ? v.number : null,
    pos: v.pos ?? "other",
    gender: v.gender ?? "none",
    slang_level: v.slang_level ?? 0,
    verlan: v.verlan === true,
    example_fr: text(v.example_fr),
    example_ru: text(v.example_ru),
    note: text(v.note),
    origin: text(v.origin),
    fields: fields.slice(0, CARD_FIELDS_MAX),
    fields_more: count(v.fields_more) + Math.max(0, fields.length - CARD_FIELDS_MAX),
    level: v.level ?? null,
    level_estimated: v.level_estimated === true,
    folder_name: typeof v.folder_name === "string" ? v.folder_name : "",
  };
}

/** An older connector's round names its themes only in the label («Еда, Жильё»; «Все темы» = every theme). */
const namesOfLabel = (label: unknown): string[] => (typeof label !== "string" || !label.trim() || label.trim() === "Все темы" ? [] : label.trim().split(", "));

/**
 * A round from a tool result's structuredContent; null when it isn't one. Fields an older
 * connector left out are filled; a card the page could not show or grade is dropped, and a card
 * that comes twice is kept once.
 */
export function asChatCardsSession(value: unknown): ChatCardsSession | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<ChatCardsSession>;
  if (v.kind !== "kartochki-cards" || !Array.isArray(v.cards)) return null;
  if (typeof v.round_id !== "string" || typeof v.built_at !== "string" || typeof v.day_end !== "string") return null;
  const mode: ChatCardsMode = v.mode === "practice" ? "practice" : "schedule";
  const seen = new Set<string>();
  const cards: ChatCard[] = [];
  for (const raw of v.cards) {
    const card = asCard(raw);
    if (!card || seen.has(card.key)) continue;
    // «По расписанию» grades every card: one without its interval labels is not playable there.
    if (mode === "schedule" && !card.intervals) continue;
    seen.add(card.key);
    cards.push(card);
  }
  const direction: ChatCardsDirection = v.direction === "fr_ru" || v.direction === "ru_fr" ? v.direction : "both";
  const c = (v.counts ?? {}) as Partial<ChatCardsCounts>;
  return {
    ...(v as ChatCardsSession),
    version: 1,
    mode,
    title: typeof v.title === "string" ? v.title : "",
    folder_label: typeof v.folder_label === "string" ? v.folder_label : "Все темы",
    folder_names: Array.isArray(v.folder_names) ? v.folder_names.filter((n): n is string => typeof n === "string" && n.trim() !== "") : namesOfLabel(v.folder_label),
    direction,
    direction_label: typeof v.direction_label === "string" ? v.direction_label : directionLabel(direction),
    scope: mode === "practice" ? (v.scope ?? "recent") : null,
    cards,
    counts: mode === "schedule" ? { due: count(c.due), new: count(c.new), waiting: count(c.waiting), deferred: count(c.deferred) } : { ...ZERO_COUNTS },
    remaining: mode === "schedule" ? count(v.remaining) : 0,
    next_due: text(v.next_due),
    next: v.next === "exercise" ? "exercise" : null,
    app_url: text(v.app_url),
  };
}

/** One answer the page sends (grade_cards `answers[]`). */
export interface GradeAnswer {
  word_id: string;
  direction: Direction;
  rating: ChatCardRating;
  /** The card's `expected` (from the round, or from this card's last grade or undo result). */
  expected: string;
  /** When the user tapped (ISO); the server clamps it (ANSWER_MAX_AGE_MS, the study day, its own clock). */
  answered_at: string;
}

export interface GradeArguments {
  answers: GradeAnswer[];
}

/**
 * What the page sends with `tools/call grade_cards`: the answers in the order given, only the
 * fields the tool takes. Sending the same answers again is safe (already_saved).
 */
export function gradeArguments(answers: readonly GradeAnswer[]): GradeArguments {
  return { answers: answers.map(({ word_id, direction, rating, expected, answered_at }) => ({ word_id, direction, rating, expected, answered_at })) };
}

/**
 * How one answer went:
 * - saved: graded and written now;
 * - already_saved: this very answer was written before (a retry or a remount);
 * - conflict: the card changed elsewhere since `expected` (another device, another answer), or was
 *   graded with another rating: nothing written, the page skips the card («уже повторена»);
 * - gone: the word or the card was deleted: nothing written.
 */
export type GradeStatus = "saved" | "already_saved" | "conflict" | "gone";

export interface GradeAnswerResult {
  word_id: string;
  direction: Direction;
  /** review_state id. */
  key: string;
  status: GradeStatus;
  /** saved / already_saved: the review_log row of this answer ("cr-…"); null otherwise. */
  log_id: string | null;
  /** The card's updated_at as stored now: the `expected` of its next answer, or of its undo; null when gone. */
  expected: string | null;
  /** The card's next due date (ISO) and FSRS state as stored now; null when gone. */
  due: string | null;
  state: 0 | 1 | 2 | 3 | null;
  /** Fresh sub-labels for the card's next answer (when it comes back in the round); null when gone. */
  intervals: ChatIntervals | null;
  /** due − the server's now, in ms (≤ 0 = due already); null when gone. */
  returns_in_ms: number | null;
}

/** The answers' `undo`: what undo_grades takes to restore the cards as they were before them. */
export interface GradeUndo {
  tool: typeof UNDO_GRADES_TOOL;
  items: UndoGradeItem[];
}

export interface UndoGradeItem {
  log_id: string;
  /** The card's updated_at after the grade: the undo writes only while it is still stored. */
  expected: string;
}

/** grade_cards' `structuredContent`: one result per answer, in order, and the undo of the saved ones (null when none). */
export interface GradeCardsResult {
  results: GradeAnswerResult[];
  undo: GradeUndo | null;
}

export interface UndoGradesArguments {
  items: UndoGradeItem[];
}

/** What the page sends with `tools/call undo_grades` (a GradeUndo's items, unchanged). */
export const undoArguments = (items: readonly UndoGradeItem[]): UndoGradesArguments => ({ items: items.map(({ log_id, expected }) => ({ log_id, expected })) });

/**
 * How one undo went:
 * - undone: the card is back as it was before the answer, the log row is soft-deleted;
 * - already_undone: it was undone before (a retry);
 * - changed_since: the card was graded or changed again since: nothing changed, the log stays;
 * - missing: no such log row.
 */
export type UndoStatus = "undone" | "already_undone" | "changed_since" | "missing";

export interface UndoGradeResult {
  log_id: string;
  status: UndoStatus;
  /** The card (null when missing). */
  word_id: string | null;
  direction: Direction | null;
  key: string | null;
  /** The card as stored now (restored when undone): the `expected` and sub-labels of its next answer; null when missing. */
  expected: string | null;
  intervals: ChatIntervals | null;
  due: string | null;
  state: 0 | 1 | 2 | 3 | null;
}

/** undo_grades' `structuredContent`. */
export interface UndoGradesResult {
  results: UndoGradeResult[];
}

/** A grade_cards result from `structuredContent`; null when it isn't one (results the page can't read are dropped). */
export function asGradeCardsResult(value: unknown): GradeCardsResult | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<GradeCardsResult>;
  if (!Array.isArray(v.results)) return null;
  const statuses: readonly GradeStatus[] = ["saved", "already_saved", "conflict", "gone"];
  const results = v.results.filter(
    (r): r is GradeAnswerResult => !!r && typeof r === "object" && typeof r.word_id === "string" && (r.direction === "fr_ru" || r.direction === "ru_fr") && statuses.includes(r.status),
  );
  const items = v.undo && Array.isArray(v.undo.items) ? v.undo.items.filter((i): i is UndoGradeItem => !!i && typeof i.log_id === "string" && typeof i.expected === "string") : [];
  return {
    results: results.map((r) => ({ ...r, key: typeof r.key === "string" ? r.key : `${r.word_id}:${r.direction}`, intervals: asIntervals(r.intervals) })),
    undo: items.length ? { tool: UNDO_GRADES_TOOL, items } : null,
  };
}

/** An undo_grades result from `structuredContent`; null when it isn't one. */
export function asUndoGradesResult(value: unknown): UndoGradesResult | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<UndoGradesResult>;
  if (!Array.isArray(v.results)) return null;
  const statuses: readonly UndoStatus[] = ["undone", "already_undone", "changed_since", "missing"];
  return {
    results: v.results
      .filter((r): r is UndoGradeResult => !!r && typeof r === "object" && typeof r.log_id === "string" && statuses.includes(r.status))
      .map((r) => ({ ...r, intervals: asIntervals(r.intervals) })),
  };
}

/** A written answer whose card is due again within LEARN_AHEAD_MS: it comes back at the end of the round. */
export function returnsInRound(result: Pick<GradeAnswerResult, "status" | "returns_in_ms">): boolean {
  return (result.status === "saved" || result.status === "already_saved") && result.returns_in_ms !== null && result.returns_in_ms <= LEARN_AHEAD_MS;
}

/** A rating the page may send (1, 2 or 3). */
export const isCardRating = (r: unknown): r is ChatCardRating => r === 1 || r === 2 || r === 3;
