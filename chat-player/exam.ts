// «Мини-TCF»: the exam mode of the chat player (set.mode "exam", mockups Chat-TCF-Start /
// -Reading-A / -Done). One overall timer from the start screen's «Начать», every question once in
// the set's order, an answer picked then sent with «Ответить», no feedback, no going back, no
// requeue; when the time is up the round ends and the questions left count as wrong. The answers are
// the app's rows (attempt 1, correct / wrong; chosen null when time ran out), so saving works as for
// a practice round. The rules here are pure (the clock is passed in): exam-ui.ts draws them.
import { attemptRandom, answerRow } from "@/components/exercises/player-state";
import { EXAM_SECONDS_PER_ITEM, type ChatPlayerSet, type ChatRunResult } from "@/lib/core/chat-player";
import { optionsFor, runItems, type ExerciseOptions } from "@/lib/core/exercises";
import { CEFR_LEVELS, type Cefr } from "@/lib/core/level";
import type { ExerciseAnswer, ExerciseItem, ExerciseItemType } from "@/lib/types";
import { plural } from "./texts";

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

/** The questions of an exam: the set's played items in its order, without pairs boards (nothing to pick A–D). */
export function examItems(set: Pick<ChatPlayerSet, "items">): ExerciseItem[] {
  return runItems(set).filter((i) => i.type !== "pairs");
}

/** The exam's time in seconds: the set's own limit, else EXAM_SECONDS_PER_ITEM a question. */
export function examSeconds(set: Pick<ChatPlayerSet, "time_limit_s">, count: number): number {
  const own = set.time_limit_s;
  return typeof own === "number" && Number.isFinite(own) && own > 0 ? Math.round(own) : count * EXAM_SECONDS_PER_ITEM;
}

/** «18:00», «1:05:00» past an hour; whole seconds, never negative. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return s >= 3600 ? `${Math.floor(s / 3600)}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** «11 минут 42 секунды» for the timer's label. */
export function clockWords(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  const min = m > 0 ? `${m} ${plural(m, ["минута", "минуты", "минут"])}` : "";
  const sec = r > 0 || m === 0 ? `${r} ${plural(r, ["секунда", "секунды", "секунд"])}` : "";
  return [min, sec].filter(Boolean).join(" ");
}

/** Under this many seconds left the timer turns red. */
export const LOW_TIME_S = 120;

/** The type's word in «Состав» and in the question header: «текст», «значение», «пропуск», «спряжение». */
const TYPE_NOUNS: Partial<Record<ExerciseItemType, readonly [string, string, string]>> = {
  reading: ["текст", "текста", "текстов"],
  choice: ["значение", "значения", "значений"],
  cloze: ["пропуск", "пропуска", "пропусков"],
  conjugate: ["спряжение", "спряжения", "спряжений"],
};

/** «ТЕКСТ» in «07 / 12 · МИНИ-TCF · ТЕКСТ». */
export function examTypeLabel(item: Pick<ExerciseItem, "type">): string {
  return TYPE_NOUNS[item.type]?.[0] ?? "вопрос";
}

/** «6 текстов · 4 значения · 2 пропуска», in the order the types first come. */
export function compositionLine(items: readonly Pick<ExerciseItem, "type">[]): string {
  const counts = new Map<ExerciseItemType, number>();
  for (const i of items) counts.set(i.type, (counts.get(i.type) ?? 0) + 1);
  return [...counts]
    .map(([type, n]) => {
      const forms = TYPE_NOUNS[type] ?? (["вопрос", "вопроса", "вопросов"] as const);
      return `${n} ${plural(n, forms)}`;
    })
    .join(" · ");
}

/** The kinds of texts in Russian, plural («объявления, письма»); an unknown label is shown as it is. */
const PASSAGE_KINDS: Record<string, string> = {
  ANNONCE: "объявления",
  "PETITE ANNONCE": "объявления",
  AVIS: "объявления",
  AFFICHE: "афиши",
  MESSAGE: "сообщения",
  SMS: "сообщения",
  COURRIEL: "письма",
  "E-MAIL": "письма",
  EMAIL: "письма",
  MAIL: "письма",
  LETTRE: "письма",
  NOTE: "заметки",
  ARTICLE: "статьи",
  BLOG: "блоги",
  PUBLICITÉ: "реклама",
  PROGRAMME: "программы",
  INVITATION: "приглашения",
  MENU: "меню",
  RECETTE: "рецепты",
  RÈGLEMENT: "правила",
  FORMULAIRE: "формы",
};

/** «объявления, письма, заметки» from the reading items' labels; null without any. */
export function passageKinds(items: readonly Pick<ExerciseItem, "type" | "passage_label">[]): string | null {
  const kinds = new Set<string>();
  for (const i of items) {
    const label = i.type === "reading" ? i.passage_label?.trim() : null;
    if (label) kinds.add(PASSAGE_KINDS[label.toLocaleUpperCase("fr")] ?? label.toLocaleLowerCase("fr"));
  }
  return kinds.size > 0 ? [...kinds].join(", ") : null;
}

/** The levels the questions are at (CEFR order); the set's own levels when no item has one. */
export function examLevels(set: Pick<ChatPlayerSet, "levels">, items: readonly Pick<ExerciseItem, "level">[]): Cefr[] {
  const own = new Set(items.map((i) => i.level).filter((l): l is Cefr => !!l));
  const levels = own.size > 0 ? own : new Set(set.levels);
  return CEFR_LEVELS.filter((l) => levels.has(l));
}

/** «le logement, le bail, la démarche…»: the words the questions are about, the first few. */
export function examWords(items: readonly Pick<ExerciseItem, "word">[], max = 4): string | null {
  const words = [...new Set(items.map((i) => i.word?.fr).filter((w): w is string => !!w))];
  if (words.length === 0) return null;
  return words.slice(0, max).join(", ") + (words.length > max ? "…" : "");
}

/** ✓ most right (≥ 80 %), ✗ less than half, ~ between. */
export type LevelVerdict = "ok" | "mid" | "no";

export interface LevelScore {
  level: Cefr;
  correct: number;
  total: number;
  verdict: LevelVerdict;
}

export function levelVerdict(correct: number, total: number): LevelVerdict {
  if (total === 0) return "mid";
  const share = correct / total;
  return share >= 0.8 ? "ok" : share < 0.5 ? "no" : "mid";
}

/** One wrong or unanswered question, for «Ошибки» and «Разобрать ошибки». */
export interface ExamMiss {
  item: ExerciseItem;
  /** The option picked; null when the time ran out first. */
  chosen: string | null;
  right: string;
}

export interface ExamScore {
  correct: number;
  total: number;
  /** By level, in CEFR order; items without a level are only in the total. */
  levels: LevelScore[];
  misses: ExamMiss[];
}

/** The exam's result from its answer rows: one row per question (attempt 1), a missing row counts as wrong. */
export function scoreExam(items: readonly ExerciseItem[], answers: readonly ExerciseAnswer[]): ExamScore {
  const byItem = new Map(answers.filter((a) => a.attempt === 1).map((a) => [a.item_id, a]));
  const perLevel = new Map<Cefr, { correct: number; total: number }>();
  const misses: ExamMiss[] = [];
  let correct = 0;
  for (const item of items) {
    const a = byItem.get(item.id);
    const right = a?.outcome === "correct";
    if (right) correct++;
    else misses.push({ item, chosen: a?.chosen ?? null, right: item.answer ?? "" });
    if (item.level) {
      const l = perLevel.get(item.level) ?? { correct: 0, total: 0 };
      l.total++;
      if (right) l.correct++;
      perLevel.set(item.level, l);
    }
  }
  const levels = CEFR_LEVELS.filter((l) => perLevel.has(l)).map((level) => {
    const { correct: c, total } = perLevel.get(level)!;
    return { level, correct: c, total, verdict: levelVerdict(c, total) };
  });
  return { correct, total: items.length, levels, misses };
}

/** «A2 4/4, B1 3/5, B2 1/3». */
export const levelsLine = (levels: readonly LevelScore[]) => levels.map((l) => `${l.level} ${l.correct}/${l.total}`).join(", ");

/** The question as one line: a reading item's question, a cloze sentence with its gap, a prompt. */
export function questionLine(item: ExerciseItem): string {
  if (item.type === "cloze" || item.type === "conjugate") {
    const sentence = (item.sentence ?? "").replace(/\[\[[^[\]]*\]\]/g, "…");
    return item.type === "conjugate" && item.prompt ? `${item.prompt}: ${sentence}` : sentence;
  }
  return item.prompt ?? item.word?.fr ?? "";
}

/**
 * «Мини-TCF «Жильё» в чате: 8 из 12 за 14:05 из 18:00; по уровням: A2 4/4, B1 3/5; ошибки: …»: the
 * line for Claude (ui/update-model-context) when the exam ends or is saved.
 */
export function examSummary(title: string, score: ExamScore, usedS: number, limitS: number, timedOut: boolean, saved: boolean): string {
  const time = `за ${clock(usedS)} из ${clock(limitS)}${timedOut ? " (время вышло)" : ""}`;
  const levels = score.levels.length > 0 ? `; по уровням: ${levelsLine(score.levels)}` : "";
  const errors =
    score.misses.length > 0
      ? `; ошибки: ${score.misses.map((m) => `«${questionLine(m.item)}» — ${m.chosen === null ? "без ответа" : `ответ «${m.chosen}»`}, верно «${m.right}»`).join("; ")}`
      : "; без ошибок";
  const tail = saved ? " Результат сохранён в Карточки." : " Результат не сохранён в Карточки (сохраняется только по кнопке в плеере).";
  return `Мини-TCF «${title}» в чате: ${score.correct} из ${score.total} ${time}${levels}${errors}. Это ориентир, не балл TCF.${tail}`;
}

/** «Разобрать ошибки»: the misses as the user's message, the questions and answers in French. */
export function examMistakesMessage(title: string, misses: readonly ExamMiss[]): string {
  const lines = misses.map((m, i) => {
    const tags = [m.item.level, m.item.type === "reading" ? m.item.passage_label : null].filter(Boolean).join(", ");
    const mine = m.chosen === null ? "не успел ответить" : `мой ответ «${m.chosen}»`;
    return `${i + 1}. ${tags ? `[${tags}] ` : ""}${questionLine(m.item)} — ${mine}, верно «${m.right}».`;
  });
  return `Разбери мои ошибки в мини-TCF «${title}»: почему верен этот ответ и где я ошибся.\n${lines.join("\n")}`;
}

/**
 * One exam round. `now` is the wall clock in ms (Date.now): the time left is always the deadline
 * minus now, so a frame put to sleep or a throttled timer never stretches the exam.
 */
export class ExamRound {
  readonly runId = newId();
  readonly items: ExerciseItem[];
  readonly limitS: number;
  /** Wall-clock ms of «Начать»; null on the start screen. */
  startMs: number | null = null;
  endMs: number | null = null;
  startedAt: string | null = null;
  finishedAt: string | null = null;
  index = 0;
  /** The option picked on the current question, not sent yet. */
  picked: number | null = null;
  answers: ExerciseAnswer[] = [];
  timedOut = false;
  private shownMs = 0;

  constructor(readonly set: ChatPlayerSet) {
    this.items = examItems(set);
    this.limitS = examSeconds(set, this.items.length);
  }

  get started(): boolean {
    return this.startMs !== null;
  }

  get done(): boolean {
    return this.endMs !== null;
  }

  get item(): ExerciseItem | undefined {
    return this.done ? undefined : this.items[this.index];
  }

  /** The current question's options, shuffled once per run (the same order on every redraw). */
  options(): ExerciseOptions | null {
    const item = this.item;
    return item ? optionsFor(item, attemptRandom(this.runId, item.id, 1)) : null;
  }

  start(now: number): void {
    if (this.started) return;
    this.startMs = now;
    this.shownMs = now;
    this.startedAt = new Date(now).toISOString();
  }

  /** Seconds left (fractional), the whole limit before the start, 0 once over. */
  remaining(now: number): number {
    if (this.startMs === null) return this.limitS;
    const end = this.endMs ?? now;
    return Math.max(0, this.limitS - (end - this.startMs) / 1000);
  }

  /** Seconds the exam took (to its end, or until now), at most the limit. */
  used(now: number): number {
    return this.startMs === null ? 0 : Math.min(this.limitS, ((this.endMs ?? now) - this.startMs) / 1000);
  }

  expired(now: number): boolean {
    return this.started && !this.done && this.remaining(now) <= 0;
  }

  select(index: number): boolean {
    const options = this.options();
    if (!this.started || !options || index < 0 || index >= options.options.length) return false;
    this.picked = index;
    return true;
  }

  /** «Ответить»: records the picked option and moves on; the last answer ends the exam. False when nothing is picked. */
  submit(now: number): boolean {
    if (this.expired(now)) {
      this.timeout(now);
      return true;
    }
    const item = this.item;
    const options = this.options();
    if (!item || !options || this.picked === null || !this.started) return false;
    const pick = this.picked;
    const outcome = pick === options.correct ? "correct" : "wrong";
    this.answers.push(answerRow(item, 1, outcome, options.options[pick], now - this.shownMs, new Date(now)));
    this.picked = null;
    this.index++;
    this.shownMs = now;
    if (this.index >= this.items.length) this.finish(now);
    return true;
  }

  /** Time is up: every question not sent counts as wrong, with nothing chosen. */
  timeout(now: number): void {
    if (!this.started || this.done) return;
    // The end is the deadline itself, not the moment the page noticed it (a sleeping tab, a late tick).
    const end = Math.min(now, this.startMs! + this.limitS * 1000);
    const at = new Date(end);
    for (const item of this.items.slice(this.index)) this.answers.push(answerRow(item, 1, "wrong", null, null, at));
    this.index = this.items.length;
    this.picked = null;
    this.timedOut = true;
    this.finish(end);
  }

  private finish(now: number): void {
    this.endMs = now;
    this.finishedAt = new Date(now).toISOString();
  }

  score(): ExamScore {
    return scoreExam(this.items, this.answers);
  }

  result(): ChatRunResult {
    return { client_ref: this.set.client_ref, started_at: this.startedAt ?? new Date().toISOString(), finished_at: this.finishedAt, answers: [...this.answers] };
  }
}
