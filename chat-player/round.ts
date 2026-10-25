// One round of the chat player: the app's own reducer (components/exercises/player-state) over the
// core queue (buildQueue / requeue), with the answer rows the app would save. Nothing is written
// while playing: the round is kept here, and only «Сохранить в Карточки» sends it.
import {
  EMPTY_PAIRS,
  EMPTY_PLAYER,
  answerRow,
  attemptMarks,
  attemptRandom,
  pairsTap,
  playerMarks,
  playerReducer,
  progressOf,
  tileWord,
  type PairsState,
  type PlayerState,
} from "@/components/exercises/player-state";
import type { ChatPlayerSet, ChatRunResult } from "@/lib/core/chat-player";
import { buildQueue, missedItemIds, missedWords, optionsFor, pairsBoard, runItems, scoreRun, type ExerciseOptions } from "@/lib/core/exercises";
import type { ExerciseAnswer, ExerciseOutcome } from "@/lib/types";
import type { ExamMiss } from "./exam";

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

export class Round {
  /** Seeds the option order of each attempt (attemptRandom), new for every round. */
  readonly runId = newId();
  readonly startedAt = new Date().toISOString();
  finishedAt: string | null = null;
  state: PlayerState;
  answers: ExerciseAnswer[] = [];
  pairs: { step: number; state: PairsState } = { step: -1, state: EMPTY_PAIRS };
  private shownAt = performance.now();

  /** `itemIds`: a «Повторить ошибки» round (no intro cards); none = the whole set. */
  constructor(
    readonly set: ChatPlayerSet,
    readonly itemIds: readonly string[] = [],
  ) {
    const queue = buildQueue(set, { itemIds, intros: itemIds.length === 0 });
    this.state = playerReducer(EMPTY_PLAYER, { type: "load", queue, total: runItems(set, itemIds).length });
  }

  get kind(): "set" | "mistakes" {
    return this.itemIds.length > 0 ? "mistakes" : "set";
  }

  get head() {
    return this.state.queue[0];
  }

  get item() {
    const head = this.head;
    return head?.kind === "item" ? this.set.items.find((i) => i.id === head.item_id) : undefined;
  }

  get intro() {
    const head = this.head;
    return head?.kind === "intro" ? this.set.new_words.find((w) => w.ref === head.new_ref) : undefined;
  }

  get done(): boolean {
    return this.state.queue.length === 0;
  }

  private random() {
    const head = this.head;
    const item = this.item;
    return head?.kind === "item" && item ? attemptRandom(this.runId, item.id, head.attempt) : null;
  }

  options(): ExerciseOptions | null {
    const item = this.item;
    const random = this.random();
    return item && random && item.type !== "pairs" ? optionsFor(item, random) : null;
  }

  board() {
    const item = this.item;
    const random = this.random();
    return item && random && item.type === "pairs" ? pairsBoard(item, random) : null;
  }

  pairsState(): PairsState {
    return this.pairs.step === this.state.step ? this.pairs.state : EMPTY_PAIRS;
  }

  progress() {
    return progressOf(this.state);
  }

  ticks() {
    return playerMarks(this.answers, this.state.queue);
  }

  /** Commits the current card's answer, once per card; `words`: a row per word (a pairs «Не знаю»). */
  private commit(outcome: ExerciseOutcome, pick: number | null, chosen: string | null, misses?: number, words?: { word_id: string | null; new_ref: string | null }[]): boolean {
    const item = this.item;
    const head = this.head;
    if (!item || head?.kind !== "item" || this.state.result) return false;
    this.state = playerReducer(this.state, { type: "answer", outcome, pick, misses });
    const ms = performance.now() - this.shownAt;
    const at = new Date();
    if (words?.length) for (const word of words) this.answers.push(answerRow(item, head.attempt, outcome, chosen, ms, at, word));
    else this.answers.push(answerRow(item, head.attempt, outcome, chosen, ms, at));
    return true;
  }

  pick(index: number): boolean {
    const options = this.options();
    if (!options || index < 0 || index >= options.options.length) return false;
    return this.commit(index === options.correct ? "correct" : "wrong", index, options.options[index]);
  }

  dontKnow(): boolean {
    const item = this.item;
    const matched = this.pairsState().matched;
    const open = item?.type === "pairs" ? item.tiles.filter((t) => !matched.includes(t.key)).map((t) => tileWord(this.set, t.key)) : undefined;
    return this.commit("dont_know", null, null, undefined, open);
  }

  /** A tap on the pairs board; `row`: the Russian slip goes into the active row when none was picked. */
  pairTap(side: "fr" | "ru", key: string, row: string | null): boolean {
    const item = this.item;
    const head = this.head;
    if (!item || head?.kind !== "item" || this.state.result) return false;
    const current = this.pairsState();
    const from = side === "ru" && current.selected === null && row ? { ...current, selected: row } : current;
    const step = pairsTap(from, side, key, item.tiles.length);
    this.pairs = { step: this.state.step, state: step.state };
    const event = step.event;
    if (event?.type === "miss") {
      const ru = item.tiles.find((t) => t.key === event.ru)?.ru ?? null;
      this.answers.push(answerRow(item, head.attempt, "wrong", ru, performance.now() - this.shownAt, new Date(), tileWord(this.set, event.fr)));
    } else if (event?.type === "match" && event.complete) {
      this.commit("correct", null, null, step.state.misses);
    }
    return true;
  }

  /** «Дальше» / «Понятно»: false while the card still waits for its answer. */
  next(): boolean {
    const head = this.head;
    if (!head || (head.kind === "item" && !this.state.result)) return false;
    this.state = playerReducer(this.state, { type: "next" });
    this.shownAt = performance.now();
    if (this.done) this.finishedAt ??= new Date().toISOString();
    return true;
  }

  private run() {
    return { item_ids: [...this.itemIds], answers: this.answers };
  }

  score() {
    return scoreRun(this.run(), this.set);
  }

  /** The done screen's strip: one cell per attempt, in the order answered. */
  marks() {
    return attemptMarks(this.answers);
  }

  missedWords() {
    return missedWords(this.run(), this.set);
  }

  missedItemIds() {
    return missedItemIds(this.run());
  }

  /**
   * Reading questions missed that are about no word (missedWords can't list them): the question,
   * the first wrong pick (null for «Не знаю») and the answer, for «Ошибки» and «Обсудить ошибки».
   */
  missedQuestions(): ExamMiss[] {
    const out: ExamMiss[] = [];
    for (const id of this.missedItemIds()) {
      const item = this.set.items.find((i) => i.id === id);
      if (!item || item.type !== "reading" || item.word_id || item.new_ref) continue;
      const chosen = this.answers.find((a) => a.item_id === id && a.outcome !== "correct" && a.chosen !== null)?.chosen ?? null;
      out.push({ item, chosen, right: item.answer ?? "" });
    }
    return out;
  }

  result(): ChatRunResult {
    return { client_ref: this.set.client_ref, started_at: this.startedAt, finished_at: this.finishedAt, answers: [...this.answers] };
  }
}
