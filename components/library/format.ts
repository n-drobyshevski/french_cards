// Display helpers shared by the library screens: Russian plurals, dictionary abbreviations,
// row status and «к повт.» / «через 6 д» labels.
import { isDueToday } from "@/lib/folders";
import { formatInterval, wordStatus, type CardStatus } from "@/lib/scheduler";
import type { ReviewState, Word, WordSource } from "@/lib/types";

/** Russian plural form: plural(5, ["слово", "слова", "слов"]) → "слов". */
export function plural(n: number, forms: readonly [one: string, few: string, many: string]): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

export const WORD_FORMS = ["слово", "слова", "слов"] as const;
export const nWords = (n: number) => `${n} ${plural(n, WORD_FORMS)}`;

/** The «Дополнить карточки» row caption: what most of the plan is about. */
export function enrichCaption(c: { total: number; noExample: number; noFields: number }): string {
  if (c.noExample > 0) return `${nWords(c.noExample)} без примера`;
  if (c.noFields === c.total) return `Свои поля для ${nWords(c.total)}`;
  return `Уровень сленга для ${nWords(c.total)}`;
}

/** Dictionary abbreviation for the part of speech: «n. f.», «v. pron.», «loc.». */
export function posAbbr(word: Pick<Word, "pos" | "gender" | "fr">): string | null {
  switch (word.pos) {
    case "noun":
      return word.gender === "m" ? "n. m." : word.gender === "f" ? "n. f." : word.gender === "mf" ? "n. m. et f." : "n.";
    case "verb":
      return /^(se |s'|s’)/i.test(word.fr.trim()) ? "v. pron." : "v.";
    case "adj":
      return "adj.";
    case "adv":
      return "adv.";
    case "expression":
      return "loc.";
    default:
      return null;
  }
}

export const STATUS_LABELS: Record<CardStatus, string> = {
  new: "новое",
  learning: "учится",
  known: "выучено",
  difficult: "трудное",
};

/** Dot color per status: new = outline, learning = amber, known = green, difficult = red. */
export const STATUS_DOT: Record<CardStatus, string> = {
  new: "border border-ink bg-transparent",
  learning: "bg-warn",
  known: "bg-good",
  difficult: "bg-again",
};

export type DueTone = "due" | "new" | "later";

export interface WordSchedule {
  status: CardStatus;
  /** «к повт.», «новое», «через 6 д». */
  dueLabel: string;
  tone: DueTone;
  /** At least one non-new card due today. */
  due: boolean;
  /** Earliest next review (ms) of the cards already seen; null when every card is new. */
  nextDue: number | null;
}

/** Row status for a word from its live review cards. Call inside a live query, not in render. */
export function wordSchedule(states: readonly ReviewState[], now: Date): WordSchedule {
  const status = wordStatus(states);
  const due = states.some((s) => isDueToday(s, now));
  const seen = states.filter((s) => s.state !== 0);
  const nextDue = seen.length ? Math.min(...seen.map((s) => Date.parse(s.due))) : null;
  if (due) return { status, dueLabel: "к повт.", tone: "due", due, nextDue };
  if (nextDue === null) return { status, dueLabel: "новое", tone: "new", due, nextDue };
  return { status, dueLabel: `через ${formatInterval(Math.max(0, nextDue - now.getTime()))}`, tone: "later", due, nextDue };
}

export const SOURCE_LABELS: Record<WordSource, string> = {
  manual: "вручную",
  suggest: "из подсказок",
  screenshot: "со скриншота",
  import: "из импорта",
  chat: "из чата",
};

/** 12.09.2026 */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/** Path of the review screen filtered to a folder (null = «Входящие»). */
export const reviewHref = (folderId: string | null) => `/?folder=${encodeURIComponent(folderId ?? "inbox")}`;
/** «Тренировка всей темы»: review opens straight into a practice round over every card of the theme. */
export const practiceHref = (folderId: string | null) => `${reviewHref(folderId)}&practice=1`;

/** Path of a folder screen (null = «Входящие»). */
export const folderHref = (folderId: string | null) => `/library/${encodeURIComponent(folderId ?? "inbox")}`;
