// Pure helpers for the «Упражнения» list (tiles, resume card, waiting line, request summaries).
import { buildRequestText, scoreRun } from "@/lib/core/exercises";
import type { ExerciseRun, ExerciseSet } from "@/lib/types";

/** Russian plural: [1, 2–4, 5+]. */
export function plural(n: number, forms: readonly [string, string, string]): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1];
  return forms[2];
}

export const nQuestions = (n: number) => `${n} ${plural(n, ["вопрос", "вопроса", "вопросов"])}`;
export const nSets = (n: number) => `${n} ${plural(n, ["набор", "набора", "наборов"])}`;
export const nNew = (n: number) => `${n} ${plural(n, ["новый", "новых", "новых"])}`;
const nWords = (n: number) => `${n} ${plural(n, ["слово", "слова", "слов"])}`;

/** «22.10» in local time. */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export const INBOX_KEY = "inbox";
export const INBOX_NAME = "Входящие";

/** Theme names of a set («Люди», «Входящие»), skipping themes deleted since. */
export function setFolderNames(set: Pick<ExerciseSet, "folders">, names: ReadonlyMap<string, string>): string[] {
  const out: string[] = [];
  for (const id of set.folders) {
    const name = id === INBOX_KEY ? INBOX_NAME : names.get(id);
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

/** The tile's second meta line: «Люди, Эмоции», «Своя тема · +3 слова», «Все темы». */
export function setThemesLine(set: Pick<ExerciseSet, "folders" | "topic" | "new_words">, names: ReadonlyMap<string, string>): string {
  const themes = setFolderNames(set, names).join(", ");
  const topic = set.topic?.trim() ? "Своя тема" : "";
  const base = themes && topic ? `${themes} · своя тема` : themes || topic || "Все темы";
  const fresh = set.new_words.length;
  return fresh > 0 ? `${base} · +${nWords(fresh)}` : base;
}

export type TileTone = "new" | "ink";

export interface TileState {
  /** «Новый», «Прервано 5/8», «7/10». */
  label: string;
  tone: TileTone;
  /** 0–1, the 2px line at the bottom. */
  progress: number;
  /** Never played: the 3px red band. */
  fresh: boolean;
  /** An unfinished whole-set run to resume. */
  resumeRunId: string | null;
}

/** A set tile's state from its newest whole-set run (lastRunBySet). */
export function tileState(set: Pick<ExerciseSet, "items">, run: ExerciseRun | undefined): TileState {
  if (!run) return { label: "Новый", tone: "new", progress: 0, fresh: true, resumeRunId: null };
  const score = scoreRun(run, set);
  const total = score.total || run.total;
  if (run.finished_at === null) {
    return {
      label: `Прервано ${score.answered}/${total}`,
      tone: "ink",
      progress: total ? score.answered / total : 0,
      fresh: false,
      resumeRunId: run.id,
    };
  }
  return { label: `${score.first_try}/${total}`, tone: "ink", progress: 1, fresh: false, resumeRunId: null };
}

/** «Продолжить · 5 из 8»: answered and total of an unfinished run. */
export function resumeProgress(run: ExerciseRun, set: Pick<ExerciseSet, "items">): { answered: number; total: number; progress: number } {
  const score = scoreRun(run, set);
  const total = score.total || run.total;
  return { answered: score.answered, total, progress: total ? score.answered / total : 0 };
}

export interface RequestChoice {
  /** Theme names in display order. */
  folders: readonly string[];
  topic: string | null;
  size: number;
  allowNew: boolean;
}

/** «вечеринка», 12 вопросов — the waiting line and the offline bar. */
export function requestSummary({ folders, topic, size }: Pick<RequestChoice, "folders" | "topic" | "size">): string {
  const names = [...new Set(folders.map((f) => f.trim()).filter(Boolean))];
  const custom = topic?.replace(/\s+/g, " ").trim();
  const parts = [...names, ...(custom ? [custom] : [])].map((s) => `«${s}»`);
  return `${parts.length ? parts.join(", ") : "все темы"}, ${nQuestions(size)}`;
}

/** «Скопировать запрос на похожий»: the same themes or topic, size and new-word choice. */
export function similarRequest(set: Pick<ExerciseSet, "folders" | "topic" | "items" | "new_words">, names: ReadonlyMap<string, string>): { text: string; summary: string } {
  const choice: RequestChoice = {
    folders: setFolderNames(set, names),
    topic: set.topic,
    size: set.items.length,
    allowNew: set.new_words.length > 0,
  };
  return { text: buildRequestText(choice), summary: requestSummary(choice) };
}

/** A copied request («Ждём набор из чата») stays open this long at most. */
export const WAITING_MAX_MS = 24 * 60 * 60 * 1000;

export interface LastRequest {
  text: string;
  summary: string;
  /** When it was copied (ISO). */
  at: string;
  /** created_at of the newest set on the device at that moment (null: none). A newer set ends the wait. */
  newest: string | null;
}

/** Newest created_at among sets (null: none). */
export function newestCreatedAt(sets: readonly Pick<ExerciseSet, "created_at">[]): string | null {
  let newest: string | null = null;
  for (const s of sets) if (newest === null || s.created_at > newest) newest = s.created_at;
  return newest;
}

/** Still waiting for the set this request asked for: nothing newer has synced and it is not stale. */
export function isWaiting(last: LastRequest | null, sets: readonly Pick<ExerciseSet, "created_at">[], nowMs: number): boolean {
  if (!last) return false;
  const at = Date.parse(last.at);
  if (!Number.isFinite(at) || nowMs - at > WAITING_MAX_MS) return false;
  const newest = newestCreatedAt(sets);
  return newest === null || (last.newest !== null && newest <= last.newest);
}
