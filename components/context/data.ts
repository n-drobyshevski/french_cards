// «Контекст»: pure helpers for the screen (no Dexie, no React), unit-tested in data.test.ts.
import type { DraftPrefill } from "@/components/add/draft";
import type { ExampleKind } from "@/lib/ai/constants";
import type { ContextExample, LookupResponse, LookupSynonym, LookupTranslation } from "@/lib/ai/schemas";
import { examplesPatch, MAX_EXAMPLES, wordExamples } from "@/lib/examples";
import type { SlangLevel, Word, WordExample } from "@/lib/types";

/** The screen for a query: «/context?q=kiffer». */
export const contextHref = (q: string) => {
  const clean = q.replace(/\s+/g, " ").trim();
  return clean ? `/context?q=${encodeURIComponent(clean)}` : "/context";
};

/** Russian plural: plural(5, ["пример", "примера", "примеров"]) → "примеров". */
export function plural(n: number, forms: readonly [one: string, few: string, many: string]): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

const EXAMPLE_FORMS = ["пример", "примера", "примеров"] as const;
export const nExamples = (n: number) => `${n} ${plural(n, EXAMPLE_FORMS)}`;

/** The source kind as the mono source line names it: «ФОРУМ · forum.exemple.fr ↗». */
export const KIND_LABELS: Record<ExampleKind | "tatoeba", string> = {
  tatoeba: "Tatoeba",
  forum: "Форум",
  song: "Песня",
  article: "Статья",
  subtitles: "Субтитры",
  social: "Соцсети",
  book: "Книга",
  other: "Сайт",
};

/**
 * The sentence around its headword form, for the underline: «je kiffe trop» + «kiffe» →
 * ["je ", "kiffe", " trop"]. Case-insensitive; the first match wins. No match → [fr, "", ""].
 */
export function splitHit(fr: string, hit: string): [before: string, hit: string, after: string] {
  const needle = hit.trim();
  if (!needle) return [fr, "", ""];
  let at = fr.indexOf(needle);
  if (at < 0) at = fr.toLocaleLowerCase("fr").indexOf(needle.toLocaleLowerCase("fr"));
  if (at < 0) return [fr, "", ""];
  return [fr.slice(0, at), fr.slice(at, at + needle.length), fr.slice(at + needle.length)];
}

export interface MeaningChip {
  /** The translation (also the filter value). */
  ru: string;
  share: number;
  /** Examples that show this sense. */
  count: number;
}

/** One chip per translation, in the lookup's order, with how many examples show it. */
export function meaningChips(translations: readonly LookupTranslation[], examples: readonly Pick<ContextExample, "meaning">[]): MeaningChip[] {
  return translations.map((t) => ({ ru: t.ru, share: t.share, count: examples.filter((e) => e.meaning === t.ru).length }));
}

/** Examples for the chosen sense; null = «Все». */
export function filterByMeaning<T extends Pick<ContextExample, "meaning">>(examples: readonly T[], meaning: string | null): T[] {
  return meaning === null ? [...examples] : examples.filter((e) => e.meaning === meaning);
}

/** Bar length for a share, relative to the most frequent sense (that one fills the track). */
export function shareWidth(share: number, translations: readonly Pick<LookupTranslation, "share">[]): number {
  const max = Math.max(1, ...translations.map((t) => t.share));
  return Math.max(0, Math.min(100, Math.round((share / max) * 100)));
}

export interface SynonymCell {
  fr: string;
  ru: string;
  slang_level: SlangLevel;
  /** The looked-up word itself, marked «это слово». */
  self: boolean;
}

export interface SynonymColumn {
  level: SlangLevel;
  words: SynonymCell[];
}

const lemmaKey = (s: string) => s.replace(/\s+/g, " ").trim().toLocaleLowerCase("fr");

/**
 * The register scale: one column per level that has words (нейтр. → vulg.), the headword placed
 * in its own column, synonyms without repeats (and never the headword again).
 */
export function synonymColumns(headword: Pick<LookupResponse, "fr" | "slang_level"> & { ru: string }, synonyms: readonly LookupSynonym[]): SynonymColumn[] {
  const seen = new Set<string>([lemmaKey(headword.fr)]);
  const cells: SynonymCell[] = [{ fr: headword.fr, ru: headword.ru, slang_level: headword.slang_level, self: true }];
  for (const s of synonyms) {
    const key = lemmaKey(s.fr);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    cells.push({ fr: s.fr.trim(), ru: s.ru.trim(), slang_level: s.slang_level, self: false });
  }
  const columns: SynonymColumn[] = [];
  for (const level of [0, 1, 2, 3] as const) {
    const words = cells.filter((c) => c.slang_level === level);
    if (words.length > 0) columns.push({ level, words });
  }
  return columns;
}

const PRONOUN = /^(je |j['’]|tu |(?:il|elle|on)(?:\/(?:il|elle|on))* |nous |vous |(?:ils|elles)(?:\/(?:ils|elles))* )/i;

/** «j'ai kiffé» → ["j'", "ai kiffé"]; «nous nous cassons» → ["nous ", "nous cassons"]; no pronoun → ["", form]. */
export function splitPronoun(form: string): [pronoun: string, verb: string] {
  const clean = form.replace(/\s+/g, " ").trim();
  const m = PRONOUN.exec(clean);
  return m ? [m[1], clean.slice(m[1].length)] : ["", clean];
}

/** The collapsed «Спряжение» line: «je kiffe · tu kiffes · il kiffe…». */
export function conjugationPreview(present: readonly string[], count = 3): string {
  const forms = present.map((f) => f.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (forms.length === 0) return "";
  const shown = forms.slice(0, count).join(" · ");
  return forms.length > count ? `${shown}…` : shown;
}

/** The card's translation: the first one to three senses, «тащиться, нравиться». */
export function translationLine(translations: readonly Pick<LookupTranslation, "ru">[], max = 3): string {
  return translations
    .slice(0, max)
    .map((t) => t.ru.trim())
    .filter(Boolean)
    .join(", ");
}

/** What the add form is prefilled with for a looked-up word (and the example chosen, if any). */
export function prefillFromLookup(lookup: LookupResponse, example?: { fr: string; ru: string | null } | null): DraftPrefill {
  return {
    fr: lookup.fr,
    ru: translationLine(lookup.translations),
    note: lookup.note ?? "",
    pos: lookup.pos,
    gender: lookup.gender,
    slang_level: lookup.slang_level,
    verlan: lookup.verlan,
    example_fr: example?.fr ?? "",
    example_ru: example?.ru ?? "",
    origin: lookup.origin ?? null,
  };
}

/** A synonym's prefill: what the lookup knows about it. */
export const prefillFromSynonym = (s: Pick<LookupSynonym, "fr" | "ru" | "slang_level">): DraftPrefill => ({
  fr: s.fr,
  ru: s.ru,
  slang_level: s.slang_level,
  verlan: false,
});

const sameSentence = (a: string, b: string) => a.replace(/\s+/g, " ").trim().toLocaleLowerCase("fr") === b.replace(/\s+/g, " ").trim().toLocaleLowerCase("fr");

export type ExamplePlacement =
  | { ok: true; patch: Pick<Word, "example_fr" | "example_ru"> & { extra_examples: WordExample[] } }
  | { ok: false; reason: "full" | "present" };

/** Whether the word already has this sentence among its examples. */
export function hasExample(word: Pick<Word, "example_fr" | "example_ru" | "extra_examples">, fr: string): boolean {
  return wordExamples(word).some((e) => sameSentence(e.fr, fr));
}

/**
 * The word's examples with this one added: appended (`main` = false) or put first (`main`, the
 * example on the review card). A sentence the word already has is moved first by `main`, refused
 * otherwise; a full word (MAX_EXAMPLES) refuses a new sentence.
 */
export function placeExample(
  word: Pick<Word, "example_fr" | "example_ru" | "extra_examples">,
  example: { fr: string; ru: string | null },
  { main = false }: { main?: boolean } = {},
): ExamplePlacement {
  const list = wordExamples(word);
  const at = list.findIndex((e) => sameSentence(e.fr, example.fr));
  if (at >= 0) {
    if (!main || at === 0) return { ok: false, reason: "present" };
    const moved = [list[at], ...list.filter((_, i) => i !== at)];
    return { ok: true, patch: examplesPatch(moved) };
  }
  if (list.length >= MAX_EXAMPLES) return { ok: false, reason: "full" };
  const entry = { fr: example.fr, ru: example.ru };
  return { ok: true, patch: examplesPatch(main ? [entry, ...list] : [...list, entry]) };
}

/** History row meta: «5 прим.», «без прим.», or «ищем…» while the web search never finished. */
export function historyMeta(entry: { context: { examples: readonly unknown[] } | null; lookup: { found: boolean } }): string {
  if (!entry.lookup.found) return "не нашли";
  if (!entry.context) return "без прим.";
  const n = entry.context.examples.length;
  return n > 0 ? `${n} прим.` : "без прим.";
}
