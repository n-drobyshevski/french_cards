// Display helpers for the add sheet's suggestion rows.
import { foldKey } from "@/lib/lexique";
import type { Word } from "@/lib/types";

/**
 * Splits a dictionary form into the part the user typed and the rest, comparing without
 * case or accents: ("se casser", "se cass") → ["se cass", "er"]. No match → ["", display].
 */
export function splitTypedPrefix(display: string, query: string): [typed: string, rest: string] {
  const target = foldKey(query);
  if (!target) return ["", display];
  for (let i = 1; i <= display.length; i++) {
    const key = foldKey(display.slice(0, i));
    if (key === target) return [display.slice(0, i), display.slice(i)];
    if (key.length > target.length) break;
  }
  return ["", display];
}

/** Dictionary abbreviation for the part of speech: «n. f.», «v. pron.», «loc.», or null. */
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

/** Russian plural: plural(5, ["слово", "слова", "слов"]) → "слов". */
export function plural(n: number, forms: readonly [one: string, few: string, many: string]): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

export const nWords = (n: number) => `${n} ${plural(n, ["слово", "слова", "слов"])}`;

/** «№ 047» style catalog number. */
export const cardNumber = (n: number) => `№ ${String(Math.max(1, n)).padStart(3, "0")}`;
