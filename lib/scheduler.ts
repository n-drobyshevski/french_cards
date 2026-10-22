// The only place that talks to ts-fsrs. Everything else works with ReviewState / ReviewLog
// (ISO-string dates) from lib/types.ts.
import { createEmptyCard, fsrs, type Card, type Grade, State } from "ts-fsrs";
import { newId } from "./id";
import type { Direction, ReviewLog, ReviewState } from "./types";

/** 1 Again (Не знаю) · 2 Hard (Сложно) · 3 Good (Знаю) · 4 Easy. */
export type Rating = 1 | 2 | 3 | 4;
export const RATINGS: readonly Rating[] = [1, 2, 3, 4];

export const scheduler = fsrs({ request_retention: 0.9, enable_fuzz: true, enable_short_term: true });

export type ReviewSnapshot = NonNullable<ReviewLog["prev"]>;

export interface GradeResult {
  state: ReviewState;
  log: ReviewLog;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Stability (days) at which a card counts as fully learned. */
export const MASTERY_STABILITY_DAYS = 21;

export const reviewStateId = (wordId: string, direction: Direction) => `${wordId}:${direction}`;

const toDate = (d: Date | string | number) => (d instanceof Date ? d : new Date(d));

/** A brand-new card (FSRS state New), due immediately. */
export function newReviewState(wordId: string, direction: Direction, now: Date = new Date()): ReviewState {
  return fromCard(createEmptyCard(now), wordId, direction, now);
}

export function toCard(rs: Pick<ReviewState, keyof ReviewSnapshot>): Card {
  return {
    due: new Date(rs.due),
    stability: rs.stability,
    difficulty: rs.difficulty,
    elapsed_days: rs.elapsed_days,
    scheduled_days: rs.scheduled_days,
    learning_steps: rs.learning_steps,
    reps: rs.reps,
    lapses: rs.lapses,
    state: rs.state as State,
    last_review: rs.last_review ? new Date(rs.last_review) : undefined,
  };
}

export function fromCard(card: Card, wordId: string, direction: Direction, now: Date = new Date()): ReviewState {
  return {
    id: reviewStateId(wordId, direction),
    word_id: wordId,
    direction,
    due: toDate(card.due).toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as ReviewState["state"],
    last_review: card.last_review ? toDate(card.last_review).toISOString() : null,
    updated_at: now.toISOString(),
    deleted_at: null,
  };
}

export function snapshot(rs: ReviewState): ReviewSnapshot {
  return {
    id: rs.id,
    word_id: rs.word_id,
    direction: rs.direction,
    due: rs.due,
    stability: rs.stability,
    difficulty: rs.difficulty,
    elapsed_days: rs.elapsed_days,
    scheduled_days: rs.scheduled_days,
    learning_steps: rs.learning_steps,
    reps: rs.reps,
    lapses: rs.lapses,
    state: rs.state,
    last_review: rs.last_review,
  };
}

/** Restores a full ReviewState from a log's `prev` snapshot (used by undo). */
export function fromSnapshot(prev: ReviewSnapshot, now: Date = new Date()): ReviewState {
  return { ...prev, updated_at: now.toISOString(), deleted_at: null };
}

/**
 * ts-fsrs rejects a review dated before the card's last review (negative elapsed days), which
 * happens when a state synced from a device whose clock runs ahead. Such reviews count as
 * happening at last_review.
 */
function reviewTime(current: Pick<ReviewState, "last_review">, now: Date): Date {
  const last = current.last_review ? Date.parse(current.last_review) : NaN;
  return !Number.isNaN(last) && last > now.getTime() ? new Date(last) : now;
}

/**
 * Pure FSRS step: grades `current` at `now`. Returns the next state and an append-only
 * log row whose `prev` holds the state before this review, so it can be undone.
 */
export function grade(current: ReviewState, rating: Rating, now: Date = new Date()): GradeResult {
  const { card, log } = scheduler.next(toCard(current), reviewTime(current, now), rating as Grade);
  const state = fromCard(card, current.word_id, current.direction, now);
  const iso = now.toISOString();
  return {
    state,
    log: {
      id: newId(),
      word_id: current.word_id,
      direction: current.direction,
      rating,
      state: current.state,
      due: toDate(log.due).toISOString(),
      stability: card.stability,
      difficulty: card.difficulty,
      elapsed_days: log.elapsed_days,
      scheduled_days: card.scheduled_days,
      review: iso,
      prev: snapshot(current),
      updated_at: iso,
      deleted_at: null,
    },
  };
}

/** Next due date for each rating if the card were graded at `now`. */
export function previewDue(current: ReviewState, now: Date = new Date()): Record<Rating, Date> {
  const preview = scheduler.repeat(toCard(current), reviewTime(current, now));
  return {
    1: preview[1].card.due,
    2: preview[2].card.due,
    3: preview[3].card.due,
    4: preview[4].card.due,
  };
}

/** Grade-button sub-labels, e.g. {1:"<1 мин", 2:"6 мин", 3:"10 мин", 4:"7 д"}. */
export function previewIntervals(current: ReviewState, now: Date = new Date()): Record<Rating, string> {
  const due = previewDue(current, now);
  const out = {} as Record<Rating, string>;
  for (const r of RATINGS) out[r] = formatInterval(due[r].getTime() - now.getTime());
  return out;
}

const trimNumber = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ","));

/**
 * Short Russian interval: «<1 мин», «6 мин», «3 ч», «1 д», «3 нед», «2 мес», «1,5 г».
 * Like Anki, a one-minute learning step reads «<1 мин».
 */
export function formatInterval(ms: number): string {
  const minutes = Math.round(ms / MINUTE);
  if (minutes <= 1) return "<1 мин";
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.round(ms / HOUR);
  if (hours < 24) return `${hours} ч`;
  const days = Math.max(1, Math.round(ms / DAY));
  if (days < 14) return `${days} д`;
  if (days < 60) return `${Math.round(days / 7)} нед`;
  if (days < 365) return `${Math.min(11, Math.round(days / 30))} мес`;
  const years = Math.round((days / 365) * 10) / 10;
  return `${trimNumber(years)} г`;
}

/** «через 4 д» / «сейчас» — for Word-Detail progress rows. */
export function formatDueIn(state: Pick<ReviewState, "due" | "state">, now: Date = new Date()): string {
  if (state.state === 0) return "новая";
  const ms = new Date(state.due).getTime() - now.getTime();
  if (ms <= 0) return "сейчас";
  return `через ${formatInterval(ms)}`;
}

/** Current stability as a short interval («9 д»); null for new cards. */
export function formatStability(state: Pick<ReviewState, "stability" | "state">): string | null {
  if (state.state === 0) return null;
  return formatInterval(state.stability * DAY);
}

/** Probability (0..1) of recalling the card at `now`; 0 for new cards. */
export function retrievability(state: ReviewState, now: Date = new Date()): number {
  if (state.state === 0) return 0;
  return scheduler.get_retrievability(toCard(state), reviewTime(state, now), false);
}

/** 0..1 — how settled a card is; 0 for new, 1 at MASTERY_STABILITY_DAYS of stability. */
export function cardMastery(state: Pick<ReviewState, "state" | "stability">): number {
  if (state.state === 0) return 0;
  return Math.max(0, Math.min(1, state.stability / MASTERY_STABILITY_DAYS));
}

export type CardStatus = "new" | "learning" | "known" | "difficult";

export function cardStatus(s: Pick<ReviewState, "state" | "stability" | "lapses" | "difficulty" | "reps">): CardStatus {
  if (s.state === 0) return "new";
  if (s.lapses >= 2 || s.state === 3 || (s.reps >= 3 && s.difficulty >= 8)) return "difficult";
  if (s.state === 2 && s.stability >= MASTERY_STABILITY_DAYS) return "known";
  return "learning";
}

/** Folder-row status dot for a word: worst signal across its directions. */
export function wordStatus(states: readonly Parameters<typeof cardStatus>[0][]): CardStatus {
  if (states.length === 0) return "new";
  const all = states.map(cardStatus);
  if (all.includes("difficult")) return "difficult";
  if (all.every((s) => s === "new")) return "new";
  if (all.every((s) => s === "known")) return "known";
  return "learning";
}

/** Card reset to New at `now`, keeping its id. */
export function resetState(current: ReviewState, now: Date = new Date()): ReviewState {
  return newReviewState(current.word_id, current.direction, now);
}
