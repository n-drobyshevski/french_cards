// The cards page's rules (lib/core/chat-cards.ts has the contract): one round of cards as the user
// plays it — the question and answer sides, the queue, the cards that come back — and, in «По
// расписанию», the outbox that saves each answer through grade_cards and takes the last one back
// through undo_grades. «Тренировка» advances with the app's advancePractice and writes nothing.
// Then the done screen's numbers and the lines it shows, sends (ui/message) and tells Claude
// (ui/update-model-context). Pure: the clock is passed in (as exam.ts takes it); views.ts draws the
// round, cards-main.ts runs it and makes the calls.
//
// The outbox: an answer is sent at once; while one call is in flight the answers made meanwhile wait
// and go together in the next call (up to GRADE_BATCH_MAX, one answer per card a call), so the host
// asks for fewer Allows. «Too many changes … N s» waits N s and sends again; any other failure, or a
// call that never answers, waits for «Повторить» or the next answer. Each answer is sent with the
// card's `expected` as the page knew it when the answer was first sent, so a resend lands on the same
// review_log row (already_saved). Undo takes back the last answer only: one never sent is dropped
// here; one in flight, or sent without a result, is (re)sent first and then undone with its result's
// undo; one saved is undone at once. The card goes back to the front either way.
import type { StripMark } from "@/components/ui/SessionStrip";
import {
  CARDS_ROUND_DEFAULT,
  CARDS_ROUND_MAX,
  CARDS_ROUND_MIN,
  GRADE_BATCH_MAX,
  LEARN_AHEAD_MS,
  asGradeCardsResult,
  asUndoGradesResult,
  gradeArguments,
  returnsInRound,
  undoArguments,
  type ChatCard,
  type ChatCardRating,
  type ChatCardsSession,
  type ChatIntervals,
  type GradeAnswerResult,
  type GradeArguments,
  type GradeUndo,
  type UndoGradeItem,
  type UndoGradesArguments,
} from "@/lib/core/chat-cards";
import { advancePractice } from "@/lib/core/practice";
import { plural } from "../texts";
import { CARD_NOUN, cardsRequest, mistakesExerciseRequest, type MissedCard } from "./requests";

/** A card to show: the card (with the `expected` and sub-labels of its next answer) and which time it comes. */
export interface Turn {
  card: ChatCard;
  /** 1 the first time; 2+ when it came back (a short step in «По расписанию», a miss in «Тренировка»). */
  attempt: number;
}

/**
 * - practice: «Тренировка» (nothing to save);
 * - queued: waiting to be sent (again); sending: in a call;
 * - saved: written (saved or already_saved); conflict / gone: not written, the card was skipped;
 * - undone: taken back (dropped before it was sent, or undone by undo_grades).
 */
export type AnswerStatus = "practice" | "queued" | "sending" | "saved" | "conflict" | "gone" | "undone";

export interface Answer {
  seq: number;
  key: string;
  /** The card as it was shown (its sub-labels are what the restored card shows again after an undo). */
  card: ChatCard;
  rating: ChatCardRating;
  answered_at: string;
  attempt: number;
  status: AnswerStatus;
  /** Sent at least once: without a result it may be written already, so it is never just dropped. */
  tried: boolean;
  /** The `expected` it was first sent with (a resend keeps it). */
  expected: string | null;
  /** Taken back (Z) while in flight or with its result lost: undone once its result comes. */
  undoWanted: boolean;
  /** Taken back (Z): it no longer counts, and can't be taken back twice. Cleared when the undo could not happen. */
  undoAsked: boolean;
  result: GradeAnswerResult | null;
  undoItem: UndoGradeItem | null;
  /** Came back into the round (due within LEARN_AHEAD_MS). */
  returned: boolean;
}

type Op = { kind: "grade"; seq: number } | { kind: "undo"; seq: number; item: UndoGradeItem };

/** One call the page makes; `id` tells a late result from the current one. */
export type Call = { id: number; kind: "grade"; seqs: number[]; args: GradeArguments } | { id: number; kind: "undo"; seq: number; args: UndoGradesArguments };

/** What callTool returned (bridge.ts ToolOutcome). */
export type CallOutcome = { ok: true; data: Record<string, unknown> } | { ok: false; error: string };

/** Why the outbox is stuck: the rate limit (sent again at `until`), or an error (sent again on «Повторить» or the next answer). */
export type SaveTrouble = { kind: "wait"; until: number; text: string } | { kind: "error"; text: string; call?: number } | null;

/** «chelou — уже повторена»: a card skipped by the server's answer, or an undo that could not happen. */
export interface Notice {
  key: string;
  fr: string;
  text: string;
}

/** A call that gets no answer in this long (the host still asking for Allow, or lost) is given up: «Не сохранилось: нет ответа · Повторить». */
export const CALL_TIMEOUT_MS = 45_000;

/** «Too many changes in a row. Wait 12 s and try again.» → 12; null for any other error. */
export function rateLimitSeconds(error: string): number | null {
  if (!/too many/i.test(error)) return null;
  const m = /(\d+)\s*(?:s|с|сек)(?!\p{L})/iu.exec(error);
  return m ? Math.max(1, Number(m[1])) : 3;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export class CardsRound {
  readonly session: ChatCardsSession;
  readonly practice: boolean;
  queue: Turn[];
  phase: "question" | "answer" = "question";
  answers: Answer[] = [];
  inFlight: Call | null = null;
  trouble: SaveTrouble = null;
  notices: Notice[] = [];
  /** Changes whenever another card (or the same one again) comes on screen: the view's enter animation. */
  step = 0;
  private ops: Op[] = [];
  /** The answer Z takes back (the last one, once). */
  private undoable: number | null = null;
  /** «Тренировка»: the queue before the last answer (its undo). */
  private before: Turn[] | null = null;
  /** Each card's `expected` and sub-labels as last stored (the round's, then its grade or undo results). */
  private known = new Map<string, { expected: string; intervals: ChatIntervals | null }>();
  private nextSeq = 1;
  private nextId = 1;

  constructor(session: ChatCardsSession) {
    this.session = session;
    this.practice = session.mode === "practice";
    this.queue = session.cards.map((card) => ({ card, attempt: 1 }));
    for (const c of session.cards) this.known.set(c.key, { expected: c.expected, intervals: c.intervals });
  }

  get head(): Turn | null {
    return this.queue[0] ?? null;
  }

  /** «По расписанию» after the study day ended (04:00): no more grades in this round («Раунд устарел»). */
  stale(now: number): boolean {
    return !this.practice && this.queue.length > 0 && now >= Date.parse(this.session.day_end);
  }

  flip(): boolean {
    if (!this.head || this.phase !== "question") return false;
    this.phase = "answer";
    return true;
  }

  unflip(): boolean {
    if (!this.head || this.phase !== "answer") return false;
    this.phase = "question";
    return true;
  }

  private answer(seq: number): Answer | undefined {
    return this.answers.find((a) => a.seq === seq);
  }

  /** «Не знаю» / «Сложно» / «Знаю» on the answer side. */
  grade(rating: ChatCardRating, now: number): boolean {
    const head = this.head;
    if (!head || this.phase !== "answer" || this.stale(now)) return false;
    const a: Answer = {
      seq: this.nextSeq++,
      key: head.card.key,
      card: head.card,
      rating,
      answered_at: new Date(now).toISOString(),
      attempt: head.attempt,
      status: this.practice ? "practice" : "queued",
      tried: false,
      expected: null,
      undoWanted: false,
      undoAsked: false,
      result: null,
      undoItem: null,
      returned: false,
    };
    this.answers.push(a);
    this.undoable = a.seq;
    if (this.practice) {
      this.before = this.queue;
      // The card that comes back counts as its next time.
      this.queue = advancePractice([{ ...head, attempt: head.attempt + 1 }, ...this.queue.slice(1)], rating);
    } else {
      this.ops.push({ kind: "grade", seq: a.seq });
      this.queue = this.queue.slice(1);
      // A new answer is a retry of what an error left waiting (the rate limit keeps its wait).
      if (this.trouble?.kind === "error") this.trouble = null;
    }
    this.phase = "question";
    this.step++;
    return true;
  }

  /** Z / «Отменить последний ответ»: possible for the last answer, once. */
  canUndo(): boolean {
    const a = this.undoable === null ? undefined : this.answer(this.undoable);
    if (!a || a.undoAsked) return false;
    if (a.status === "saved") return a.undoItem !== null;
    return a.status === "practice" || a.status === "queued" || a.status === "sending";
  }

  /** The last answer taken back: its card comes back to the front, question side up. */
  undo(): boolean {
    if (!this.canUndo()) return false;
    const a = this.answer(this.undoable!)!;
    this.undoable = null;
    a.undoAsked = true;
    if (this.practice) {
      this.queue = this.before ?? this.queue;
      this.before = null;
      a.status = "undone";
    } else {
      // A card that came back into the round goes back to its place in front instead.
      this.queue = [{ card: a.card, attempt: a.attempt }, ...this.queue.filter((t) => t.card.key !== a.key)];
      if (a.status === "queued" && !a.tried) {
        this.ops = this.ops.filter((op) => !(op.kind === "grade" && op.seq === a.seq));
        a.status = "undone";
      } else if (a.status === "saved") {
        this.ops.push({ kind: "undo", seq: a.seq, item: a.undoItem! });
      } else {
        a.undoWanted = true;
      }
    }
    this.phase = "question";
    this.step++;
    return true;
  }

  /** Something to send or being sent. */
  get saving(): boolean {
    return this.inFlight !== null || this.ops.length > 0;
  }

  /** Answers not written yet (taken-back ones left out). */
  get unsaved(): number {
    return this.answers.filter((a) => (a.status === "queued" || a.status === "sending") && !a.undoAsked).length;
  }

  /** The next call to make now, marked in flight; null while one is in flight, nothing waits, or a wait / an error holds the outbox. */
  nextCall(now: number): Call | null {
    if (this.inFlight || this.ops.length === 0) return null;
    if (this.trouble?.kind === "error" || (this.trouble?.kind === "wait" && now < this.trouble.until)) return null;
    const first = this.ops[0];
    let call: Call;
    if (first.kind === "undo") {
      call = { id: this.nextId++, kind: "undo", seq: first.seq, args: undoArguments([first.item]) };
    } else {
      const batch: Answer[] = [];
      const keys = new Set<string>();
      for (const op of this.ops) {
        if (op.kind !== "grade" || batch.length >= GRADE_BATCH_MAX) break;
        const a = this.answer(op.seq)!;
        // One answer per card a call (the tool refuses two): the next one waits for this one's result.
        if (keys.has(a.key)) break;
        keys.add(a.key);
        batch.push(a);
      }
      for (const a of batch) {
        a.expected ??= this.known.get(a.key)?.expected ?? a.card.expected;
        a.tried = true;
        a.status = "sending";
      }
      call = {
        id: this.nextId++,
        kind: "grade",
        seqs: batch.map((a) => a.seq),
        args: gradeArguments(batch.map((a) => ({ word_id: a.card.word_id, direction: a.card.direction, rating: a.rating, expected: a.expected!, answered_at: a.answered_at }))),
      };
    }
    this.trouble = null;
    this.inFlight = call;
    return call;
  }

  /** «Повторить» after an error: the outbox sends again. */
  retry(): boolean {
    if (!this.trouble) return false;
    this.trouble = null;
    return true;
  }

  /** The call took longer than CALL_TIMEOUT_MS: its answers wait for «Повторить» (a late result still counts). */
  callLost(call: Call): void {
    if (this.inFlight?.id !== call.id) return;
    this.inFlight = null;
    this.requeue(call);
    this.trouble = { kind: "error", text: "нет ответа", call: call.id };
  }

  /** A late result of the call given up on («нет ответа») that settled all it carried: nothing is lost any more. */
  private clearLost(call: Call) {
    if (this.trouble?.kind === "error" && this.trouble.call === call.id) this.trouble = null;
  }

  private requeue(call: Call) {
    if (call.kind !== "grade") return;
    for (const seq of call.seqs) {
      const a = this.answer(seq);
      if (a?.status === "sending") a.status = "queued";
    }
  }

  private dropOp(kind: Op["kind"], seq: number) {
    this.ops = this.ops.filter((op) => !(op.kind === kind && op.seq === seq));
  }

  private skip(a: Answer, text: string) {
    // An undo that could not happen leaves the answer counted.
    a.undoAsked = false;
    this.queue = this.queue.filter((t) => t.card.key !== a.key);
    this.notices.push({ key: a.key, fr: a.card.fr, text });
    if (this.undoable === a.seq) this.undoable = null;
  }

  /** A call's result (or failure). A late result of a call given up on still saves what it saved. */
  callDone(call: Call, outcome: CallOutcome, now: number): void {
    const head = this.head?.card.key;
    this.settle(call, outcome, now);
    // Another card in front (one came back into an empty round, or the one in front was skipped).
    if (this.head?.card.key !== head) {
      this.phase = "question";
      this.step++;
    }
  }

  private settle(call: Call, outcome: CallOutcome, now: number): void {
    const current = this.inFlight?.id === call.id;
    if (current) this.inFlight = null;
    if (!outcome.ok) {
      if (!current) return;
      this.requeue(call);
      const wait = rateLimitSeconds(outcome.error);
      this.trouble = wait !== null ? { kind: "wait", until: now + wait * 1000, text: outcome.error } : { kind: "error", text: outcome.error };
      return;
    }
    if (call.kind === "grade") {
      const parsed = asGradeCardsResult(outcome.data);
      let missing = 0;
      for (const seq of call.seqs) {
        const a = this.answer(seq);
        // Resolved already (by a late result of an earlier call), or not this call's any more.
        if (!a || (a.status !== "sending" && a.status !== "queued")) continue;
        const r = parsed?.results.find((x) => x.key === a.key);
        if (!r) {
          a.status = "queued";
          missing++;
          continue;
        }
        this.dropOp("grade", seq);
        this.applyGrade(a, r, parsed!.undo);
      }
      if (current) this.trouble = missing > 0 ? { kind: "error", text: parsed ? "ответ без этих карточек" : "непонятный ответ" } : null;
      else if (missing === 0 && call.seqs.every((seq) => this.answer(seq)?.status !== "queued")) this.clearLost(call);
      return;
    }
    const r = asUndoGradesResult(outcome.data)?.results[0];
    const a = this.answer(call.seq);
    if (!r || !a) {
      if (current) this.trouble = { kind: "error", text: "непонятный ответ" };
      return;
    }
    this.dropOp("undo", call.seq);
    if (current) this.trouble = null;
    else this.clearLost(call);
    if (r.status === "changed_since") {
      // Graded or changed elsewhere since: the answer stays, the card isn't shown again.
      this.skip(a, "не отменилась: карточку уже изменили");
      return;
    }
    a.status = "undone";
    if (r.expected) {
      const intervals = r.intervals ?? a.card.intervals;
      this.known.set(a.key, { expected: r.expected, intervals });
      this.queue = this.queue.map((t) => (t.card.key === a.key ? { ...t, card: { ...t.card, expected: r.expected!, intervals } } : t));
    }
  }

  private applyGrade(a: Answer, r: GradeAnswerResult, undo: GradeUndo | null) {
    a.result = r;
    if (r.status === "conflict" || r.status === "gone") {
      a.status = r.status;
      a.undoWanted = false;
      this.skip(a, r.status === "conflict" ? "уже повторена" : "слово удалено");
      return;
    }
    a.status = "saved";
    // Only the server's undo: an already_saved answer without one was graded over since (another device).
    a.undoItem = (r.log_id && undo?.items.find((i) => i.log_id === r.log_id)) || null;
    const was = this.known.get(a.key);
    if (r.expected) this.known.set(a.key, { expected: r.expected, intervals: r.intervals ?? was?.intervals ?? null });
    if (a.undoWanted) {
      a.undoWanted = false;
      // Before anything answered after it (the same card again, back in front).
      if (a.undoItem) this.ops.unshift({ kind: "undo", seq: a.seq, item: a.undoItem });
      else this.skip(a, "не отменилась");
      return;
    }
    if (returnsInRound(r) && r.expected) {
      a.returned = true;
      this.queue.push({ card: { ...a.card, expected: r.expected, intervals: r.intervals ?? a.card.intervals, is_new: false }, attempt: a.attempt + 1 });
    }
  }

  // --- What the screens show ---------------------------------------------------------------------

  /** The answers that count: not taken back, not skipped. */
  counted(): Answer[] {
    return this.answers.filter((a) => !a.undoAsked && (a.status === "practice" || a.status === "queued" || a.status === "sending" || a.status === "saved"));
  }

  /** «07 / 20»: the card on screen and the cards of the round (the ones come back included). */
  progress(): { position: number; total: number } {
    const done = this.counted().length;
    return { position: Math.min(done + 1, done + this.queue.length), total: done + this.queue.length };
  }

  /** The strip (sessionMarks): a miss for «Не знаю», a repeat for a card seen before in the round, else first time. */
  marks(): StripMark[] {
    return this.counted().map((a) => (a.rating === 1 ? "miss" : a.attempt > 1 ? "requeued" : "first"));
  }

  /** Words graded «Не знаю» or «Сложно», most recent first, each once. */
  hardWords(): (MissedCard & { ru: string })[] {
    const seen = new Set<string>();
    const out: (MissedCard & { ru: string })[] = [];
    for (const a of [...this.counted()].reverse()) {
      if (a.rating > 2 || seen.has(a.card.word_id)) continue;
      seen.add(a.card.word_id);
      out.push({ word_id: a.card.word_id, fr: a.card.fr, ru: a.card.ru });
    }
    return out;
  }

  /** «20 карточек · 80 % · 4 новых» (counted as the strip is). */
  summary(): { total: number; percent: number; fresh: number } {
    const counted = this.counted();
    const total = counted.length;
    const misses = counted.filter((a) => a.rating === 1).length;
    const fresh = new Set(counted.filter((a) => a.card.is_new && a.attempt === 1).map((a) => a.key)).size;
    return { total, percent: total ? Math.round(((total - misses) / total) * 100) : 0, fresh };
  }

  /** Learning cards due later today: graded in this round (more than LEARN_AHEAD_MS away) and the ones waiting before it. */
  waiting(now: number): { count: number; at: number | null } {
    const end = Date.parse(this.session.day_end);
    let count = this.session.counts.waiting;
    let at = this.session.next_due ? Date.parse(this.session.next_due) : null;
    for (const a of this.counted()) {
      const r = a.result;
      if (a.status !== "saved" || a.returned || !r?.due || (r.state !== 1 && r.state !== 3)) continue;
      const due = Date.parse(r.due);
      if (due > end || due <= now) continue;
      count++;
      at = at === null ? due : Math.min(at, due);
    }
    return { count, at: count > 0 ? at : null };
  }

  /** Cards still in today's queue after this round (the server's count when it built it). */
  get remaining(): number {
    return this.practice ? 0 : this.session.remaining;
  }

  /** The size of the next round: this one's (between CARDS_ROUND_MIN and CARDS_ROUND_MAX). */
  roundSize(): number {
    return clamp(this.session.cards.length || CARDS_ROUND_DEFAULT, CARDS_ROUND_MIN, CARDS_ROUND_MAX);
  }

  /** The themes the round took, as play_cards' request names them (none = every theme). */
  themes(): string[] {
    return this.session.folder_names;
  }

  /** «Ещё 12 к повторению · Продолжить ›»: the next round of the day (never fewer than play_cards takes; it plays what is left). */
  continueMessage(): string {
    return cardsRequest({ size: Math.max(CARDS_ROUND_MIN, Math.min(this.remaining, this.roundSize())), themes: this.themes(), direction: this.session.direction, more: true });
  }

  /** «Раунд устарел · Обновить ›»: a new round for the new day. */
  refreshMessage(): string {
    return cardsRequest({ size: this.roundSize(), themes: this.themes(), direction: this.session.direction });
  }

  /** «Упражнение по ошибкам ›»: the hard words with their ids. */
  mistakesMessage(): string {
    return mistakesExerciseRequest(this.hardWords());
  }

  /** One line for Claude (ui/update-model-context), after every save or undo and at the end. */
  contextLine(): string {
    const s = this.summary();
    const name = this.session.title ? ` «${this.session.title}»` : "";
    const hard = this.hardWords().map((w) => `${w.fr} (${w.ru})`);
    const finished = this.queue.length === 0;
    const score = `${s.total} ${plural(s.total, CARD_NOUN)}, ${s.percent} % верно${s.fresh ? `, ${s.fresh} ${plural(s.fresh, ["новая", "новых", "новых"])}` : ""}`;
    const parts: string[] = [];
    if (this.practice) {
      parts.push(`Тренировка карточек в чате${name} (без расписания, ничего не записано)${finished ? " пройдена" : ""}: ${finished ? score : `отвечено ${s.total} из ${s.total + this.queue.length}`}`);
    } else {
      const saved = this.answers.filter((a) => a.status === "saved" && !a.undoAsked).length;
      const undone = this.answers.filter((a) => a.status === "undone").length;
      const skipped = this.answers.filter((a) => a.status === "conflict" || a.status === "gone").length;
      parts.push(`Карточки в чате${name}${finished ? " пройдены" : ""}: ${finished ? score : `отвечено ${s.total} из ${s.total + this.queue.length}`}`);
      parts.push(`сохранено оценок: ${saved}${this.unsaved ? `, не сохранено: ${this.unsaved}` : ""}${undone ? `, отменено: ${undone}` : ""}${skipped ? `, пропущено: ${skipped} (уже повторены или удалены)` : ""}`);
    }
    if (hard.length) parts.push(`трудные: ${hard.join(", ")}`);
    const tail = this.practice
      ? ""
      : ` Оценки ставит только сама карточка по нажатию пользователя — не ставь и не дублируй их.${finished && this.remaining > 0 ? ` Ещё ${this.remaining} к повторению сегодня.` : ""}`;
    return `${parts.join("; ")}.${tail}`;
  }
}

// --- Lines -----------------------------------------------------------------------------------------

/** «12 мин», «1 ч 10 мин», «2 ч». */
export function minutesText(ms: number): string {
  const m = Math.max(1, Math.ceil(ms / 60_000));
  if (m < 60) return `${m} мин`;
  const hours = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
}

/** «Через 25 мин вернутся 2 карточки» (null when none wait). */
export function waitingLine(waiting: { count: number; at: number | null }, now: number): string | null {
  if (waiting.count === 0 || waiting.at === null) return null;
  const n = waiting.count;
  return `Через ${minutesText(waiting.at - now)} ${plural(n, ["вернётся", "вернутся", "вернутся"])} ${n} ${plural(n, CARD_NOUN)}`;
}

/** «20 карточек · 80 % · 4 новых» (the view sets it in mono capitals). */
export function summaryLine(s: { total: number; percent: number; fresh: number }): string {
  const parts = [`${s.total} ${plural(s.total, CARD_NOUN)}`, `${s.percent} %`];
  if (s.fresh > 0) parts.push(`${s.fresh} ${plural(s.fresh, ["новая", "новых", "новых"])}`);
  return parts.join(" · ");
}

/** The save line under the card: «Сохраняем…», «Не сохранилось: … · Повторить», «Повторим через 12 с». */
export function saveLine(round: CardsRound, now: number): { text: string; retry: boolean; error: boolean } | null {
  if (round.practice) return null;
  const t = round.trouble;
  if (t?.kind === "wait") {
    const s = Math.max(1, Math.ceil((t.until - now) / 1000));
    return { text: `Много оценок подряд — сохраним через ${s} с`, retry: false, error: false };
  }
  if (t?.kind === "error") {
    const n = round.unsaved;
    return { text: `Не сохранилось${n ? ` (${n})` : ""}: ${t.text}`, retry: true, error: true };
  }
  if (round.saving) return { text: "Сохраняем…", retry: false, error: false };
  return null;
}

/** «12 к повт. · 4 новых» over the progress line («План дня» when the round was built); «Тренировка» names what it takes. */
export function planLine(session: ChatCardsSession, practiceScope: string | null): string {
  if (session.mode === "practice") return practiceScope ? `Тренировка · ${practiceScope}` : "Тренировка";
  const { due, new: fresh } = session.counts;
  const parts = [`${due} к повт.`];
  if (fresh > 0) parts.push(`${fresh} ${plural(fresh, ["новая", "новых", "новых"])}`);
  return parts.join(" · ");
}

export { LEARN_AHEAD_MS };
