// The question card's small rules, as components/exercises/QuestionCard.tsx has them for phones
// (X-Player-B): the header label, where the slang meter may show, the question line, the headword
// size and where the stamp lands. Copied rather than imported: QuestionCard is a React module.
import { TENSE_NAMES } from "@/lib/core/conj-display";
import { isRussian } from "@/lib/core/text";
import type { ExerciseItem, ExerciseSkill, Gender, PartOfSpeech } from "@/lib/types";

const SKILL_LABEL: Record<ExerciseSkill, string> = {
  meaning: "Значение",
  form: "Форма",
  neutral: "Нейтрально",
  verlan: "Верлан",
  situation: "Ситуация",
};

/** «ЗНАЧЕНИЕ», «СПРЯЖЕНИЕ · PASSÉ COMPOSÉ»: phones show the skill word only, a conjugate item keeps its tense. */
export function cardLabel(item: ExerciseItem): { label: string; detail: string | null } {
  switch (item.type) {
    case "conjugate":
      return { label: "Спряжение", detail: item.tense ? (TENSE_NAMES[item.tense] ?? null) : null };
    case "cloze":
      return { label: "Пропуск", detail: null };
    case "pairs":
      return { label: "Пары", detail: null };
    case "reading":
      return { label: "Текст", detail: null };
    default:
      return { label: SKILL_LABEL[item.skill ?? "meaning"] ?? SKILL_LABEL.meaning, detail: null };
  }
}

/** The meter only where it gives nothing away: meaning, form and verlan choices. */
export function showsMeter(item: ExerciseItem): boolean {
  if (!item.word || item.type !== "choice") return false;
  const skill = item.skill ?? "meaning";
  return skill === "meaning" || skill === "form" || skill === "verlan";
}

/** A French word asked for its meaning: the hero word and the Russian slips say it, the question is for screen readers. */
export function selfEvident(item: ExerciseItem): boolean {
  const skill = item.skill ?? "meaning";
  const prompt = item.prompt ?? item.word?.fr ?? "";
  return (skill === "verlan" || (skill === "meaning" && item.ask !== "ru")) && !isRussian(prompt);
}

/** The question under a choice prompt, unless the prompt asks it itself. */
export function skillQuestion(item: ExerciseItem): string | null {
  if (item.prompt?.trim().endsWith("?")) return null;
  switch (item.skill ?? "meaning") {
    case "meaning":
      return item.ask === "ru" ? "Как сказать по-французски?" : "Что это значит?";
    case "form":
      return "Как сказать по-французски?";
    case "neutral":
      return "Как сказать нейтрально?";
    case "verlan":
      return "Что это значит?";
    case "situation":
      return "Что ответить?";
  }
}

/** A Russian prompt that reads as a paragraph (a situation), not a headword. */
export function isParagraph(text: string): boolean {
  return isRussian(text) && (text.length > 24 || /[.:!?…»]$/.test(text.trim()));
}

/** The French headword's size class: the hero for a short one (unless a word in it is too long), then 32 / 26. */
export function frSize(text: string): string {
  const longest = Math.max(0, ...text.split(/\s+/).map((w) => w.length));
  if (text.length <= 16) return longest <= 13 ? "hero" : "fr40";
  if (text.length <= 28) return "fr32";
  return "fr26";
}

/** The conjugate infinitive, one step below the hero (the pronoun line must fit beside the stamp). */
export function conjSize(text: string): string {
  return text.length <= 28 ? "fr32" : frSize(text);
}

/**
 * Where the stamp lands: beside a short headword, on the second line of a two-line cloze, beside a
 * reading item's question (under its text, Ex-Reading-App), else over the header's end.
 */
export function stampPlace(item: ExerciseItem): "line1" | "line2" | "head" | "question" {
  const text = item.prompt ?? item.word?.fr ?? "";
  switch (item.type) {
    case "pairs":
      return "head";
    case "reading":
      return "question";
    case "cloze": {
      const n = (item.sentence ?? "").replace(/\[\[|\]\]/g, "").length;
      return n >= 20 && n <= 30 ? "line2" : "head";
    }
    case "conjugate":
      return text.length <= 14 ? "line1" : "head";
    default:
      if (isParagraph(text)) return "head";
      return text.length <= (isRussian(text) ? 11 : 9) ? "line1" : "head";
  }
}

/** «flic — разговорное «полицейский»»: the French term before the dash is set in italic serif. */
export function explainParts(text: string): { term: string | null; rest: string } {
  const m = /^(.{1,40}?) — ([\s\S]+)$/.exec(text.trim());
  if (m && !isRussian(m[1])) return { term: m[1], rest: m[2] };
  return { term: null, rest: text.trim() };
}

const PRONOMINAL = /^(se\s|s['’])/i;

/** «n. f.», «v. pron.» (components/review/format posAbbr). */
export function posAbbr(word: { fr: string; pos: PartOfSpeech; gender: Gender }): string | null {
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

/** «lalanguefrancaise.com» from the page a web word came from. */
export function sourceDomain(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/** Deck edges under the card by the questions left (components/review/swipe deckEdges). */
export function deckEdges(left: number): number {
  return left >= 10 ? 3 : left >= 2 ? 2 : left >= 1 ? 1 : 0;
}

/** Long options read better as rows (A–D) than as 2×2 slips: any option over this many characters. */
export const ROW_OPTIONS_OVER = 22;

export const optionRows = (options: readonly string[]) => options.some((o) => o.length > ROW_OPTIONS_OVER);
