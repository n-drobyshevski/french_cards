// What the dictionary abbreviations on cards mean («n. m.», «v. pron.», «loc.», «arg.», «verl.»…),
// for the hint that opens on a tap. Pure data, shared by every screen that shows them.

export interface AbbrEntry {
  /** The French term the abbreviation stands for. */
  full: string;
  /** Russian explanation. */
  ru: string;
  /** A short example, French then Russian. */
  example?: string;
}

const GLOSSARY: Record<string, AbbrEntry> = {
  "n.": { full: "nom", ru: "Существительное." },
  "n. m.": { full: "nom masculin", ru: "Существительное мужского рода: le, un.", example: "le fric — бабки" },
  "n. f.": { full: "nom féminin", ru: "Существительное женского рода: la, une.", example: "la thune — бабки" },
  "n. m. et f.": { full: "nom masculin et féminin", ru: "Существительное обоих родов: un или une.", example: "un / une pote — кореш" },
  "v.": { full: "verbe", ru: "Глагол, дан в неопределённой форме.", example: "kiffer — тащиться" },
  "v. pron.": {
    full: "verbe pronominal",
    ru: "Возвратный глагол: спрягается с se (me, te, nous…).",
    example: "se casser → je me casse — я сваливаю",
  },
  "adj.": { full: "adjectif", ru: "Прилагательное, дано в мужском роде единственного числа.", example: "chelou — стрёмный" },
  "adv.": { full: "adverbe", ru: "Наречие.", example: "grave — очень, конкретно" },
  "loc.": {
    full: "locution",
    ru: "Устойчивое выражение из нескольких слов или междометие.",
    example: "laisse tomber — забей",
  },
  "нейтр.": { full: "neutre", ru: "Нейтральное слово: уместно и в письме, и с незнакомыми." },
  "fam.": { full: "familier", ru: "Разговорное: так говорят с друзьями, но не в официальном письме.", example: "la bagnole — тачка" },
  "arg.": { full: "argot", ru: "Сленг улицы и молодёжи: понятен не всем и звучит маркированно.", example: "le keuf — мент" },
  "vulg.": { full: "vulgaire", ru: "Грубое или бранное слово: в большинстве компаний шокирует.", example: "putain — бл…" },
  "verl.": { full: "verlan", ru: "Верлан: слово с переставленными слогами.", example: "keuf ← flic, chelou ← louche" },
};

/** Spacing and case do not matter: «n.m.», «N. m.» and «n. m.» are the same entry. */
const keyOf = (abbr: string) => abbr.toLowerCase().replace(/\s+/g, "").trim();
const BY_KEY = new Map(Object.entries(GLOSSARY).map(([abbr, entry]) => [keyOf(abbr), entry]));

export function abbrEntry(abbr: string): AbbrEntry | null {
  return BY_KEY.get(keyOf(abbr)) ?? null;
}

/** Every abbreviation with an explanation, for tests and a legend. */
export const ABBREVIATIONS = Object.keys(GLOSSARY);
