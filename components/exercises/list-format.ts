// Pure helpers for the «Упражнения» list (tiles, resume card, waiting line, request summaries).
import { buildRequestText, isVerbSet, parseScope, runSettled, scoreRun } from "@/lib/core/exercises";
import type { StripMark } from "@/components/ui/SessionStrip";
import type { ExerciseItem, ExerciseItemType, ExerciseRun, ExerciseScope, ExerciseSet } from "@/lib/types";
import { attemptMarks } from "./player-state";

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

/** A scoped set's tile line (only the user's difficult and/or due words, from every theme). */
const SCOPE_LINES: Record<ExerciseScope, string> = {
  difficult: "Трудные · все темы",
  due: "К повторению · все темы",
  both: "Трудные и к повторению",
};

/** The tile's second meta line: «Люди, Эмоции», «Своя тема · +3 слова», «Все темы», «Трудные · все темы». */
export function setThemesLine(
  set: Pick<ExerciseSet, "folders" | "topic" | "new_words"> & Partial<Pick<ExerciseSet, "scope">>,
  names: ReadonlyMap<string, string>,
): string {
  const scope = parseScope(set.scope);
  if (scope) return SCOPE_LINES[scope];
  const themes = setFolderNames(set, names).join(", ");
  const topic = set.topic?.trim() ? "Своя тема" : "";
  const base = themes && topic ? `${themes} · своя тема` : themes || topic || "Все темы";
  const fresh = set.new_words.length;
  return fresh > 0 ? `${base} · +${nWords(fresh)}` : base;
}

/** Phones (E1 A): what a set drills when one kind of question makes it up — the verb test, or more than half one type. */
const KIND_NAMES: readonly (readonly [ExerciseItemType, string])[] = [
  ["cloze", "пропуски"],
  ["pairs", "пары"],
  ["register", "регистр"],
];

/** «спряжение», «пропуски», «пары», «регистр»; null for a mixed set (or mostly «choice»). */
export function setKind(items: readonly Pick<ExerciseItem, "type">[]): string | null {
  if (items.length === 0) return null;
  if (isVerbSet(items)) return "спряжение";
  for (const [type, name] of KIND_NAMES) if (items.filter((i) => i.type === type).length * 2 > items.length) return name;
  return null;
}

const normal = (s: string) =>
  s
    .toLowerCase()
    .replace(/[«»"'.,:;!?…()–—-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** «Полиция» under the title «Полиция» (or «Еда» under «Еда и кафе») says nothing new. */
export function repeatsTitle(title: string, text: string): boolean {
  const a = normal(title);
  const b = normal(text);
  return !!a && !!b && (a.includes(b) || b.includes(a));
}

/** «3 новых слова из веба». */
export const nWebWords = (n: number) => `${n} ${plural(n, ["новое слово", "новых слова", "новых слов"])} из веба`;

export interface TileLines {
  /** The italic line: «спряжение, Повседневное», «+ 3 новых слова из веба»; "" when the title says it all. */
  text: string;
  /** The accessible name's middle: «спряжение, Повседневное, 8 вопросов, 3 новых слова из веба». */
  spoken: string;
}

/**
 * Phones (E1 A): a set's italic line under the title — the kind, then the themes or the own topic
 * unless the title already says them («все темы» when it has neither), a scoped set's words, and
 * the web words.
 */
export function tileLines(
  set: Pick<ExerciseSet, "title" | "folders" | "topic" | "items" | "new_words"> & Partial<Pick<ExerciseSet, "scope">>,
  names: ReadonlyMap<string, string>,
): TileLines {
  const scope = parseScope(set.scope);
  let place: string[];
  if (scope) place = [SCOPE_LINES[scope]];
  else {
    const folders = setFolderNames(set, names);
    const topic = set.topic?.replace(/\s+/g, " ").trim() ?? "";
    place = [...folders, ...(topic ? [topic] : [])].filter((s) => !repeatsTitle(set.title, s));
    if (folders.length === 0 && !topic) place = ["все темы"];
  }
  const kind = setKind(set.items);
  const head = [...(kind ? [kind] : []), ...place].join(", ");
  const fresh = set.new_words.length;
  const web = fresh > 0 ? nWebWords(fresh) : "";
  return {
    text: [head, web && `+ ${web}`].filter(Boolean).join(" · "),
    spoken: [head, nQuestions(set.items.length), web].filter(Boolean).join(", "),
  };
}

/**
 * Each question's first answer in a run (ink, or a miss), then the questions not answered yet —
 * the phone tile's and the resume card's ticks.
 */
export function firstTryMarks(run: Pick<ExerciseRun, "answers">, set: Pick<ExerciseSet, "items">, total: number): StripMark[] {
  const ids = new Set(set.items.map((i) => i.id));
  const marks = attemptMarks(run.answers.filter((a) => a.attempt === 1 && ids.has(a.item_id)));
  while (marks.length < total) marks.push("future");
  return marks;
}

export type TileTone = "new" | "ink";

export interface TileState {
  /** «Новый», «Прервано 5/8», «7/10». */
  label: string;
  /** Phones: only a played set shows a score, «5/8» or «7/10», by its ticks; a new one has its red band. */
  short: string | null;
  tone: TileTone;
  /** 0–1, the 2px line at the bottom. */
  progress: number;
  /** Never played: the 3px red band. */
  fresh: boolean;
  /** An unfinished whole-set run to resume. */
  resumeRunId: string | null;
  /** Phones (E1 A): the run's ticks (none before the first play). */
  marks: StripMark[];
  /** Phones (E1 A): the state in the tile's name — «Ещё не играли», «В прошлый раз 7 из 8 с первого раза, ошибка 1». */
  said: string;
}

/**
 * A set tile's state from its newest whole-set run (lastRunBySet); a run with every item settled
 * reads as finished. `own`: the runs started on this device; another device's interrupted run
 * shows as such but is not resumed here (the tile starts a new run).
 */
export function tileState(set: Pick<ExerciseSet, "items">, run: ExerciseRun | undefined, own?: ReadonlySet<string>): TileState {
  if (!run) return { label: "Новый", short: null, tone: "new", progress: 0, fresh: true, resumeRunId: null, marks: [], said: "Ещё не играли" };
  const score = scoreRun(run, set);
  const total = score.total || run.total;
  const marks = firstTryMarks(run, set, total);
  if (run.finished_at === null && !runSettled(set, run)) {
    return {
      label: `Прервано ${score.answered}/${total}`,
      short: `${score.answered}/${total}`,
      tone: "ink",
      progress: total ? score.answered / total : 0,
      fresh: false,
      resumeRunId: !own || own.has(run.id) ? run.id : null,
      marks,
      said: `Прервано, отвечено ${score.answered} из ${total}`,
    };
  }
  const done = `${score.first_try}/${total}`;
  const misses = marks.filter((m) => m === "miss").length;
  const said = `В прошлый раз ${score.first_try} из ${total} с первого раза${misses ? `, ${plural(misses, ["ошибка", "ошибки", "ошибок"])} ${misses}` : ""}`;
  return { label: done, short: done, tone: "ink", progress: 1, fresh: false, resumeRunId: null, marks, said };
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
  /** Only the user's difficult and/or due words, from every theme (themes, topic and allowNew ignored). */
  scope?: ExerciseScope | null;
  /** «Спряжение глаголов»: a short verb test (allowNew ignored). */
  conjugation?: boolean;
}

/** A scoped request in the waiting line: «трудные слова, 12 вопросов». */
const SCOPE_SUMMARIES: Record<ExerciseScope, string> = {
  difficult: "трудные слова",
  due: "слова к повторению",
  both: "трудные и к повторению",
};

/** «вечеринка», 12 вопросов — the waiting line and the offline bar; «спряжение, «Люди», 8 вопросов» for a verb test. */
export function requestSummary({ folders, topic, size, scope, conjugation }: Pick<RequestChoice, "folders" | "topic" | "size" | "scope" | "conjugation">): string {
  const verbs = conjugation ? "спряжение, " : "";
  if (scope) return `${verbs}${SCOPE_SUMMARIES[scope]}, ${nQuestions(size)}`;
  const names = [...new Set(folders.map((f) => f.trim()).filter(Boolean))];
  const custom = topic?.replace(/\s+/g, " ").trim();
  const parts = [...names, ...(custom ? [custom] : [])].map((s) => `«${s}»`);
  return `${verbs}${parts.length ? parts.join(", ") : "все темы"}, ${nQuestions(size)}`;
}

/** «Скопировать запрос на похожий»: the same themes or topic (or scope), size and new-word choice; a verb set stays one. */
export function similarRequest(
  set: Pick<ExerciseSet, "folders" | "topic" | "items" | "new_words"> & Partial<Pick<ExerciseSet, "scope">>,
  names: ReadonlyMap<string, string>,
): { text: string; summary: string } {
  const scope = parseScope(set.scope);
  const conjugation = isVerbSet(set.items);
  const choice: RequestChoice = scope
    ? { folders: [], topic: null, size: set.items.length, allowNew: false, scope, conjugation }
    : {
        folders: setFolderNames(set, names),
        topic: set.topic,
        size: set.items.length,
        allowNew: !conjugation && set.new_words.length > 0,
        conjugation,
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
