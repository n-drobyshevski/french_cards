// Small pure helpers for the review screens (labels, plurals, dictionary abbreviations).
import { cardNumber } from "@/components/add/match";
import type { Rating } from "@/lib/scheduler";
import type { Direction, Word } from "@/lib/types";

/** Russian plural form: pluralRu(3, ["слово", "слова", "слов"]) → "слова". */
export function pluralRu(n: number, forms: readonly [one: string, few: string, many: string]): string {
  const abs = Math.abs(Math.trunc(n));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

export const WORD_FORMS = ["слово", "слова", "слов"] as const;
export const CARD_FORMS = ["карточка", "карточки", "карточек"] as const;

/** «18 слов» */
export const countWords = (n: number) => `${n} ${pluralRu(n, WORD_FORMS)}`;

export const GRADE_LABELS: Record<Rating, string> = { 1: "Не знаю", 2: "Сложно", 3: "Знаю", 4: "Легко" };

export const DIRECTION_LABELS: Record<Direction | "both", string> = {
  fr_ru: "FR → RU",
  ru_fr: "RU → FR",
  both: "FR ↔ RU",
};

/** Accessible direction names (screen readers read arrows poorly). */
export const DIRECTION_NAMES: Record<Direction | "both", string> = {
  fr_ru: "с французского на русский",
  ru_fr: "с русского на французский",
  both: "в обе стороны",
};

const PRONOMINAL = /^(se\s|s['’])/i;

/** Dictionary-style part of speech: «n. f.», «v. pron.», «adj.»; null when unknown. */
export function posAbbr(word: Pick<Word, "fr" | "pos" | "gender">): string | null {
  switch (word.pos) {
    case "noun":
      return word.gender === "m" ? "n. m." : word.gender === "f" ? "n. f." : word.gender === "mf" ? "n. m. et f." : "n.";
    case "verb":
      return PRONOMINAL.test(word.fr.trim()) ? "v. pron." : "v.";
    case "adj":
      return "adj.";
    case "adv":
      return "adv.";
    case "expression":
      return "expr.";
    default:
      return null;
  }
}

/** «07 / 30»: zero-padded to two digits like the mockups. */
export function formatProgress(done: number, total: number): string {
  const pad = (n: number) => String(Math.max(0, n)).padStart(2, "0");
  return `${pad(done)} / ${pad(total)}`;
}

/** Share of the progress line that is filled (0..1). */
export function progressRatio(done: number, total: number): number {
  if (total <= 0) return done > 0 ? 1 : 0;
  return Math.max(0, Math.min(1, done / total));
}

/** «92 %» with a no-break space, rounded; «—» when there is nothing to rate. */
export function formatPercent(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) return "—";
  return `${Math.round(rate * 100)} %`;
}

/** «21 октября» in local time. */
export function formatDayMonth(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(date);
}

/** The date stamp on «Готово на сегодня»: «22.10». */
export function formatDateStamp(date: Date): string {
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Parts of the progress row's summary: «27 к повторению», «4 новых», «6 обратных» (RU→FR sides
 * new today, «План дня»). A part at 0 is left out; with nothing at all, «0 к повторению».
 */
export function queueSummaryParts(due: number, fresh: number, reverse = 0): string[] {
  const parts: string[] = [];
  if (due > 0 || fresh + reverse === 0) parts.push(`${due} к повторению`);
  if (fresh > 0) parts.push(`${fresh} ${pluralRu(fresh, ["новая", "новых", "новых"])}`);
  if (reverse > 0) parts.push(`${reverse} ${pluralRu(reverse, ["обратная", "обратных", "обратных"])}`);
  return parts;
}

/** Left part of the progress row: «23 к повторению · 4 новых · 6 обратных». */
export function queueSummary(due: number, fresh: number, reverse = 0): string {
  return queueSummaryParts(due, fresh, reverse).join(" · ");
}

/**
 * Desktop headword size step (DESKTOP-SPEC §3): 1 = 56/64 up to 16 characters, 2 = 44/64 up to 28,
 * 3 = 30/32 longer. Picked once per card from the longer of prompt and headword, so the card does
 * not jump when it flips.
 */
export type HeadwordStep = 1 | 2 | 3;

export function headwordStep(...texts: string[]): HeadwordStep {
  const longest = Math.max(0, ...texts.map((t) => t.trim().length));
  return longest <= 16 ? 1 : longest <= 28 ? 2 : 3;
}

/** Card call number «FR · № 001» (the add sheet's numbering); just «FR» when the number is unknown. */
export function callNumber(direction: Direction, ordinal: number | undefined): string {
  const side = direction === "fr_ru" ? "FR" : "RU";
  return ordinal ? `${side} · ${cardNumber(ordinal)}` : side;
}

/** Leading articles a headword can carry that its example need not repeat («une blague» → «blague»). */
const ARTICLES = new Set(["le", "la", "les", "l", "un", "une", "des", "du", "de", "d"]);
/** Reflexive pronouns a pronominal verb takes in its example («se casser» → «on se casse», «je me casse»). */
const REFLEXIVE = new Set(["se", "s", "me", "m", "te", "t", "nous", "vous"]);

/** Lowercase, accents folded, one char per char (so indices map back to the original). */
const foldChar = (c: string) => {
  const f = c.toLowerCase().normalize("NFD").replace(/\p{M}+/gu, "");
  return f.length === 1 ? f : c.toLowerCase();
};

/**
 * Where the headword stands in its example (the span the answer side underlines in red ink): its
 * words in order, each matched by its stem so a conjugated or plural form counts («se casser» →
 * «se casse», «une blague» → «blagues»). A pronominal verb's «se» matches any reflexive pronoun.
 * Null when the example does not contain it.
 */
export function exampleMatch(example: string, headword: string): [start: number, end: number] | null {
  const tokens: { text: string; start: number; end: number }[] = [];
  for (const m of example.matchAll(/\p{L}+(?:-\p{L}+)*/gu)) {
    tokens.push({ text: Array.from(m[0], foldChar).join(""), start: m.index, end: m.index + m[0].length });
  }
  let words = (headword.match(/\p{L}+(?:-\p{L}+)*/gu) ?? []).map((w) => Array.from(w, foldChar).join(""));
  while (words.length > 1 && ARTICLES.has(words[0])) words = words.slice(1);
  if (words.length === 0) return null;
  const fits = (word: string, token: string) => {
    if (REFLEXIVE.has(word)) return REFLEXIVE.has(token);
    if (word.length <= 4) return token === word || (token.startsWith(word) && token.length <= word.length + 2);
    return token.startsWith(word.slice(0, Math.max(4, word.length - 2)));
  };
  for (let i = 0; i + words.length <= tokens.length; i++) {
    if (words.every((w, k) => fits(w, tokens[i + k].text))) return [tokens[i].start, tokens[i + words.length - 1].end];
  }
  // A pronominal verb used without its pronoun, or a phrase whose last word alone appears: the longest word.
  const longest = words.reduce((a, b) => (b.length > a.length ? b : a));
  if (longest.length < 4) return null;
  const hit = tokens.find((t) => fits(longest, t.text));
  return hit ? [hit.start, hit.end] : null;
}
