// The review card's small rules, as the app's phone card has them (components/review/ReviewCard.tsx,
// format.ts; mockups L-Review-Q-A, L-Review-Ans-B): the call number, the headword sizes, the span
// of the example underlined in red ink, the fold's summary and the grade buttons' labels. Copied
// rather than imported: ReviewCard is a React module, and format.ts pulls in the dictionary loader
// (components/add/match → lib/lexique).
import { GRADE_LABELS, type ChatCard, type ChatCardRating, type ChatIntervals } from "@/lib/core/chat-cards";
import type { Direction } from "@/lib/types";

/** «№ 007» (components/add/match cardNumber). */
export const cardNumber = (n: number) => `№ ${String(Math.max(1, n)).padStart(3, "0")}`;

/** «FR · № 007» in «По расписанию», «FR · ПРАКТИКА» in «Тренировка» (the phone card's header, SPEC §4); «FR» without a number. */
export function callNumber(direction: Direction, number: number | null, practice: boolean): string {
  const side = direction === "fr_ru" ? "FR" : "RU";
  if (practice) return `${side} · ПРАКТИКА`;
  return number ? `${side} · ${cardNumber(number)}` : side;
}

/** The question side's prompt: the French word (FR → RU) or the translation (RU → FR). */
export const promptOf = (card: Pick<ChatCard, "direction" | "fr" | "ru">) => (card.direction === "fr_ru" ? card.fr : card.ru);

/** The prompt's size class (ReviewCard promptSize): 40 up to 16 characters, 32 up to 28, else 26. */
export function promptSize(text: string): "q40" | "q32" | "q26" {
  const n = text.trim().length;
  return n <= 16 ? "q40" : n <= 28 ? "q32" : "q26";
}

/** The answer side's headword, one step under the prompt (L-Review-Ans-B: 32/40). */
export function answerSize(text: string): "a32" | "a28" | "a24" {
  const n = text.trim().length;
  return n <= 16 ? "a32" : n <= 28 ? "a28" : "a24";
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
 * Where the headword stands in its example (components/review/format exampleMatch): its words in
 * order, each matched by its stem («se casser» → «se casse», «une blague» → «blagues»); a
 * pronominal verb's «se» matches any reflexive pronoun. Null when the example does not contain it.
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
  const longest = words.reduce((a, b) => (b.length > a.length ? b : a));
  if (longest.length < 4) return null;
  const hit = tokens.find((t) => fits(longest, t.text));
  return hit ? [hit.start, hit.end] : null;
}

/** «Ещё · заметка, происхождение»: what the fold at the card's foot holds; null when it holds nothing. */
export function foldSummary(card: Pick<ChatCard, "note" | "origin" | "fields" | "level" | "folder_name">): string | null {
  const parts = [card.note && "заметка", card.origin && "происхождение", card.fields.length > 0 && "свои поля"].filter(Boolean);
  if (parts.length > 0) return parts.join(", ");
  const rest = [card.level && "уровень", card.folder_name && "тема"].filter(Boolean);
  return rest.length > 0 ? rest.join(", ") : null;
}

/** «Знаю, следующий показ через 1 д» (GradeBar's label); just the grade in «Тренировка». */
export function gradeLabel(rating: ChatCardRating, intervals: ChatIntervals | null): string {
  const sub = intervals?.[rating];
  if (!sub) return GRADE_LABELS[rating];
  return `${GRADE_LABELS[rating]}, следующий показ ${sub === "<1 мин" ? "меньше чем через минуту" : `через ${sub}`}`;
}

/** «+2 поля» (ReviewCard fieldsWord). */
export function moreFields(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  const word = m10 === 1 && m100 !== 11 ? "поле" : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? "поля" : "полей";
  return `+${n} ${word}`;
}
