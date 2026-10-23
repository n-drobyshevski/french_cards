// The exercise player's round, as a pure reducer (ExercisePlayer keeps it in useReducer). The
// queue rules (intro cards, requeue after a miss, MAX_ATTEMPTS) live in lib/core/exercises; this
// file adds what the screen needs on top: the answer shown on the current card, the counter
// «07 / 12 +1», the option tiles' verdicts, a stable random per attempt, and the pairs board.
// Nothing here writes: the player saves each answer with recordAnswer.
import { requeue, seededRandom, type QueueEntry } from "@/lib/core/exercises";
import type { ExerciseAnswer, ExerciseItem, ExerciseOutcome, ExerciseSet } from "@/lib/types";

/** How the current card was answered: the outcome and the option tapped (null for «Не знаю» and pairs). */
export interface PlayerResult {
  outcome: ExerciseOutcome;
  pick: number | null;
  /** A pairs board: the mismatches before every pair was found. */
  misses?: number;
}

export interface PlayerState {
  queue: QueueEntry[];
  /** Questions in the run. */
  total: number;
  /** The head's answer once given; null while it is asked (and on an intro card). */
  result: PlayerResult | null;
  /** Grows by one for every card shown: keys the card (its enter motion) and the answer timer. */
  step: number;
}

export type PlayerAction =
  | { type: "load"; queue: QueueEntry[]; total: number }
  | { type: "answer"; outcome: ExerciseOutcome; pick: number | null; misses?: number }
  | { type: "next" };

export const EMPTY_PLAYER: PlayerState = { queue: [], total: 0, result: null, step: 0 };

export function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case "load":
      return { queue: [...action.queue], total: action.total, result: null, step: state.step + 1 };
    case "answer": {
      const head = state.queue[0];
      // One answer per card: a second tap (or a key during the result) is ignored, never queued.
      if (!head || head.kind !== "item" || state.result) return state;
      const result: PlayerResult = { outcome: action.outcome, pick: action.pick };
      if (action.misses !== undefined) result.misses = action.misses;
      return { ...state, result };
    }
    case "next": {
      const head = state.queue[0];
      if (!head) return state;
      if (head.kind === "item" && !state.result) return state;
      const queue = requeue(state.queue, head.kind === "intro" ? "seen" : state.result!.outcome);
      return { ...state, queue, result: null, step: state.step + 1 };
    }
  }
}

export interface PlayerProgress {
  /** The current question's place, «07» of «07 / 12». */
  position: number;
  total: number;
  /** Missed questions waiting to come back, the muted «+1». */
  repeats: number;
  /** Share of the run's questions settled (the progress hairline), 0..1. */
  ratio: number;
}

/**
 * «07 / 12 +1»: the position is the questions met so far (the current one included), so a miss does
 * not hold the counter back; «+N» counts the missed questions queued to come back (the current
 * card included when it is one). The hairline fills with the questions met before this card.
 */
export function progressOf(state: Pick<PlayerState, "queue" | "total">): PlayerProgress {
  const fresh = new Set<string>();
  const items = new Set<string>();
  let repeats = 0;
  for (const e of state.queue) {
    if (e.kind !== "item") continue;
    items.add(e.item_id);
    if (e.attempt > 1) repeats++;
    else fresh.add(e.item_id);
  }
  const total = Math.max(state.total, items.size);
  // The next question (after a new word's card) counts as met once it is the one coming up.
  const upcoming = state.queue.find((e) => e.kind === "item");
  const current = upcoming?.kind === "item" && upcoming.attempt === 1 ? 1 : 0;
  const met = total - fresh.size;
  return {
    position: Math.min(total, met + current),
    total,
    repeats,
    ratio: total === 0 ? 0 : met / total,
  };
}

/** «07 / 12» with two-digit padding, as the review counter. */
export function formatCounter(position: number, total: number): string {
  const pad = (n: number) => String(Math.max(0, n)).padStart(2, "0");
  return `${pad(position)} / ${pad(total)}`;
}

const plural = (n: number, forms: readonly [string, string, string]) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1];
  return forms[2];
};

/** The counter for screen readers: «Вопрос 7 из 12, плюс 2 повтора». */
export function counterLabel({ position, total, repeats }: Pick<PlayerProgress, "position" | "total" | "repeats">): string {
  const extra = repeats > 0 ? `, плюс ${repeats} ${plural(repeats, ["повтор", "повтора", "повторов"])}` : "";
  return `Вопрос ${position} из ${total}${extra}`;
}

/** A 32-bit FNV-1a hash of a string. */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The random an item's options (or pairs board) are shuffled with: stable for one attempt of one
 * item in one run, so a re-render or «Продолжить» shows the same order, and new on the next attempt.
 */
export function attemptRandom(runId: string, itemId: string, attempt: number): () => number {
  return seededRandom(hashString(`${runId}:${itemId}:${attempt}`));
}

/** An option tile's look: asked, the right answer, the wrong pick, or dimmed after the answer. */
export type TileVerdict = "idle" | "right" | "wrong" | "dim";

export function tileVerdict(index: number, correct: number, result: PlayerResult | null): TileVerdict {
  if (!result) return "idle";
  if (index === correct) return "right";
  if (result.pick === index) return "wrong";
  return "dim";
}

/** How the result reads: right (auto-advance), wrong / «Не знаю», or a pairs board finished with misses. */
export type ResultTone = "right" | "wrong" | "pairs";

/** The result's tone for the current card: a pairs board with misses is neither a stamp nor a miss. */
export function resultTone(result: PlayerResult | null): ResultTone | null {
  if (!result) return null;
  if (result.outcome !== "correct") return "wrong";
  return result.misses ? "pairs" : "right";
}

/**
 * What the player's live region says when a card is answered (the stamp is decorative, and a
 * region mounted together with its text is not reliably announced, so the player keeps one region
 * mounted and swaps its text). `answer`: the right answer, said on a miss.
 */
export function resultAnnouncement(tone: ResultTone | null, misses = 0, answer: string | null = null): string {
  if (tone === null) return "";
  if (tone === "right") return "Верно.";
  if (tone === "pairs") return `Все пары найдены, ошибок: ${misses}.`;
  return answer ? `Неверно. Ответ: ${answer}.` : "Неверно.";
}

/** Text for screen readers and options: Cyrillic means Russian, anything else is French. */
export { isRussian } from "@/lib/core/text";

/** The answer row saved for one answer (the run row is upserted with it). */
export function answerRow(
  item: Pick<ExerciseItem, "id" | "word_id" | "new_ref">,
  attempt: number,
  outcome: ExerciseOutcome,
  chosen: string | null,
  ms: number | null,
  at: Date,
  word?: { word_id: string | null; new_ref: string | null },
): ExerciseAnswer {
  return {
    item_id: item.id,
    word_id: word ? word.word_id : item.word_id,
    new_ref: word ? word.new_ref : item.new_ref,
    attempt,
    outcome,
    chosen,
    ms: ms === null ? null : Math.max(0, Math.round(ms)),
    at: at.toISOString(),
  };
}

/** A pairs tile key is a word_id or a new_ref (the set's new words); which one, for the answer row. */
export function tileWord(set: Pick<ExerciseSet, "new_words">, key: string): { word_id: string | null; new_ref: string | null } {
  return set.new_words.some((w) => w.ref === key) ? { word_id: null, new_ref: key } : { word_id: key, new_ref: null };
}

// ---------------------------------------------------------------------------------------------
// Pairs: tap a French tile, then its Russian tile.

export interface PairsState {
  /** The French tile picked and waiting for its Russian tile. */
  selected: string | null;
  /** Keys matched so far, in order. */
  matched: string[];
  /** Mismatches on this board. */
  misses: number;
  /** The last mismatch, flashed in the again colour; `seq` restarts the flash. */
  flash: { fr: string; ru: string; seq: number } | null;
}

export const EMPTY_PAIRS: PairsState = { selected: null, matched: [], misses: 0, flash: null };

export type PairsEvent = { type: "miss"; fr: string; ru: string } | { type: "match"; key: string; complete: boolean } | null;

/**
 * One tap on the pairs board. French tiles select (a second tap on the same one unselects); a
 * Russian tile with a French one selected is a match (same key) or a miss. Matched tiles and taps
 * with nothing selected do nothing. `total` is the number of pairs on the board.
 */
export function pairsTap(state: PairsState, side: "fr" | "ru", key: string, total: number): { state: PairsState; event: PairsEvent } {
  if (state.matched.includes(key)) return { state, event: null };
  if (side === "fr") return { state: { ...state, selected: state.selected === key ? null : key }, event: null };
  const fr = state.selected;
  if (fr === null) return { state, event: null };
  if (fr === key) {
    const matched = [...state.matched, key];
    return { state: { ...state, selected: null, matched, flash: null }, event: { type: "match", key, complete: matched.length >= total } };
  }
  return {
    state: { ...state, selected: null, misses: state.misses + 1, flash: { fr, ru: key, seq: (state.flash?.seq ?? 0) + 1 } },
    event: { type: "miss", fr, ru: key },
  };
}
