// Carries Anki scheduling over to FSRS review states, so imported words keep their progress.
// FSRS collections bring their memory state; SM-2 ones are approximated from interval and ease.
import { fromCard, newReviewState, reviewStateId, toCard } from "@/lib/scheduler";
import type { Direction, ReviewState } from "@/lib/types";
import type { AnkiCard, AnkiNote } from "./types";

const DAY_SEC = 86_400;
const DAY_MS = DAY_SEC * 1000;
/** Unix seconds after 2001: smaller learning `due` values are day numbers, not timestamps. */
const MIN_TIMESTAMP_SEC = 1_000_000_000;

const finite = (n: number, fallback: number) => (Number.isFinite(n) ? n : fallback);
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const count = (n: number) => Math.max(0, Math.round(finite(n, 0)));
/** A time a Date can hold (±8.64e15 ms), else null. */
const validMs = (ms: number) => (Number.isFinite(ms) && Math.abs(ms) <= 8.64e15 ? ms : null);

/**
 * When the card is due (ms). Review cards and day-based learning (queue 3) count days from the
 * collection's creation day `crt` (already the start of that day); intraday learning uses unix seconds.
 */
function dueMs(card: AnkiCard, crt: number): number {
  const dayBased = card.type === 2 || card.queue === 2 || card.queue === 3 || (card.queue !== 1 && card.due < MIN_TIMESTAMP_SEC);
  return dayBased ? (crt + card.due * DAY_SEC) * 1000 : card.due * 1000;
}

/** FSRS review state for one Anki card, for the word `wordId` in `direction`. */
export function ankiCardState(card: AnkiCard, crt: number, wordId: string, direction: Direction, now: Date): ReviewState {
  if (card.type === 0) return newReviewState(wordId, direction, now);
  const nowMs = now.getTime();
  const state = card.type;
  const ivl = finite(card.ivl, 0);
  const due = validMs(dueMs(card, crt)) ?? nowMs;

  const stability = card.fsrs && card.fsrs.stability > 0 ? card.fsrs.stability : Math.max(ivl, 0.1);
  const sm2Difficulty = card.factor > 0 ? 5 + (2500 - card.factor) / 200 : 5;
  const difficulty = clamp(finite(card.fsrs?.difficulty ?? sm2Difficulty, 5), 1, 10);

  let lastReview = validMs(card.lastReviewMs ?? (state === 2 && ivl > 0 ? due - ivl * DAY_MS : NaN));
  // A review «in the future» (clock skew, rescheduled card) counts as happening now.
  if (lastReview !== null) lastReview = Math.min(lastReview, nowMs);
  const elapsedDays = lastReview === null ? 0 : Math.max(0, Math.floor((nowMs - lastReview) / DAY_MS));

  const fsrsCard = toCard({
    id: reviewStateId(wordId, direction),
    word_id: wordId,
    direction,
    due: new Date(due).toISOString(),
    stability: finite(stability, 0.1),
    difficulty,
    elapsed_days: elapsedDays,
    // Negative ivl = seconds (learning): nothing scheduled in days yet.
    scheduled_days: Math.max(0, Math.round(ivl)),
    learning_steps: 0,
    reps: count(card.reps),
    lapses: count(card.lapses),
    state,
    last_review: lastReview === null ? null : new Date(lastReview).toISOString(),
  });
  return fromCard(fsrsCard, wordId, direction, now);
}

/**
 * Review states for both directions of a word imported from `note`. Card ord 0 is the note's forward
 * template: it studies the French side first when `frFirst`, so it maps to fr_ru, ord 1 to ru_fr (and the
 * other way round). A direction without a card starts new. Cloze (0 templates), 3+ templates or a text
 * export (no `crt`) give [] — the caller creates fresh states.
 */
export function noteStates(note: AnkiNote, crt: number | null, wordId: string, frFirst: boolean, now: Date): ReviewState[] {
  if (crt === null || (note.templates !== 1 && note.templates !== 2)) return [];
  const byOrd: Direction[] = frFirst ? ["fr_ru", "ru_fr"] : ["ru_fr", "fr_ru"];
  return (["fr_ru", "ru_fr"] as const).map((direction) => {
    const card = note.cards.find((c) => c.ord === byOrd.indexOf(direction));
    return card ? ankiCardState(card, crt, wordId, direction, now) : newReviewState(wordId, direction, now);
  });
}
