// «Контекст» → «Спряжение» without a model: regular -er verbs (spelling changes included) and
// second-group -ir verbs by rule, everything else from a table built out of Lexique 3.83
// (scripts/build-conjugation.mjs → public/lexique/fr-conj.json). Pure and Dexie-free: the build
// script imports it too, so the table only holds verbs the rules get wrong.
import type { Conjugation } from "../types";

/** Six forms each, je → ils, without pronouns. */
export interface VerbForms {
  present: string[];
  imparfait: string[];
  futur: string[];
  /** Past participle, masculine singular. */
  participle: string;
}

export interface ConjData {
  /** inf → "p1|…|p6", "i1|…|i6", "f1|…|f6", participle. */
  irregular: Record<string, [string, string, string, string]>;
  /** Second-group -ir verbs Lexique confirms (finir, choisir): conjugated by rule. */
  second: string[];
}

const PERSONS = ["je", "tu", "il", "nous", "vous", "ils"] as const;
const IMP = ["ais", "ais", "ait", "ions", "iez", "aient"];
const FUT = ["ai", "as", "a", "ons", "ez", "ont"];

/** Verbs whose passé composé takes être (pronominal verbs always do). */
const ETRE = new Set(
  "aller venir devenir revenir parvenir survenir intervenir provenir advenir arriver partir repartir entrer rentrer sortir ressortir monter remonter descendre redescendre naître renaître mourir rester retourner tomber retomber décéder apparaître".split(
    " ",
  ),
);

/** Aspirated h: no elision (je hurle, not j'hurle). */
const H_ASPIRE = new Set("haïr hurler hausser heurter hacher harceler hanter hisser huer hâter hennir hérisser hocher hululer".split(" "));

const VOWEL = /^[aeiouyàâäéèêëîïôöûüœæ]/i;
const elides = (word: string, inf: string) => VOWEL.test(word) || (/^h/i.test(word) && !H_ASPIRE.has(inf));

/** -er verbs: the endings, with -ger/-cer before a and o, and the è / ie spelling changes. */
function firstGroup(inf: string): VerbForms {
  const stem = inf.slice(0, -2);
  const soft = (ending: string) => {
    if (!/^[ao]/.test(ending)) return stem;
    if (stem.endsWith("g")) return `${stem}e`;
    if (stem.endsWith("c")) return `${stem.slice(0, -1)}ç`;
    return stem;
  };
  // Stem used where the ending is silent (je, tu, il, ils, and all of the futur for e/oyer verbs).
  let strong = stem;
  let futStem = inf;
  const yer = /([ou])y$/.exec(stem);
  // lever → lève, acheter → achète, sevrer → sèvre (e + one consonant); céder → cède, célébrer → célèbre.
  const eCons = /e([bcdfgjklmnpqrstvwxz]|vr)$/.exec(stem);
  const eAcute = /é([bcdfgjklmnpqrstvwxz]+)$/.exec(stem);
  if (yer) {
    strong = `${stem.slice(0, -1)}i`;
    futStem = `${strong}er`;
  } else if (eCons && stem.length > eCons[0].length) {
    strong = `${stem.slice(0, stem.length - eCons[0].length)}è${eCons[1]}`;
    futStem = `${strong}er`;
  } else if (eAcute) {
    strong = `${stem.slice(0, stem.length - eAcute[0].length)}è${eAcute[1]}`;
  }
  return {
    present: [`${strong}e`, `${strong}es`, `${strong}e`, `${soft("ons")}ons`, `${stem}ez`, `${strong}ent`],
    imparfait: IMP.map((e) => `${soft(e)}${e}`),
    futur: FUT.map((e) => `${futStem}${e}`),
    participle: `${stem}é`,
  };
}

/** finir: finis, finissons, finissais, finirai, fini. */
function secondGroup(inf: string): VerbForms {
  const stem = inf.slice(0, -2);
  return {
    present: [`${stem}is`, `${stem}is`, `${stem}it`, `${stem}issons`, `${stem}issez`, `${stem}issent`],
    imparfait: IMP.map((e) => `${stem}iss${e}`),
    futur: FUT.map((e) => `${inf}${e}`),
    participle: `${stem}i`,
  };
}

/** What the rules give for an infinitive, or null when no rule applies (-re, -oir, an -ir verb not known to be second-group). */
export function ruleForms(inf: string, second: ReadonlySet<string> | null = null): VerbForms | null {
  if (inf === "aller") return null;
  if (/[a-zàâçéèêëîïôûü]er$/.test(inf)) return firstGroup(inf);
  if (/ir$/.test(inf) && (second === null || second.has(inf))) return secondGroup(inf);
  return null;
}

export function formsOf(inf: string, data: ConjData | null): VerbForms | null {
  const row = data?.irregular[inf];
  if (row) {
    const [p, i, f, participle] = row;
    return { present: p.split("|"), imparfait: i.split("|"), futur: f.split("|"), participle };
  }
  return ruleForms(inf, data ? new Set(data.second) : null);
}

/** «правильный на -er» for verbs the rules conjugate, null for the table's. */
function remarkFor(inf: string, data: ConjData | null): string | null {
  if (data?.irregular[inf]) return null;
  return inf.endsWith("er") ? "правильный на -er" : "правильный на -ir, как finir";
}

const PRONOMINAL = /^(?:se\s+|s['’])(.+)$/i;

/**
 * The four tenses of «kiffer», «se casser», «s'en aller»… with pronouns (je kiffe, j'ai kiffé,
 * je me suis cassé), or null when the headword is not a verb we can conjugate. Words after the
 * verb are kept («faire la gueule» → «je fais la gueule»).
 */
export function conjugate(headword: string, data: ConjData | null): Conjugation | null {
  const text = headword.replace(/\s+/g, " ").trim().toLowerCase().replace(/’/g, "'");
  const pron = PRONOMINAL.exec(text);
  let rest = pron ? pron[1] : text;
  // «s'en aller», «s'y prendre»: the en / y stays with the reflexive pronoun.
  const clitic = pron ? /^(en|y)\s+(.+)$/.exec(rest) : null;
  if (clitic) rest = clitic[2];
  const [inf, ...tail] = rest.split(" ");
  const forms = formsOf(inf, data);
  if (!forms) return null;
  const after = tail.length ? ` ${tail.join(" ")}` : "";
  const reflexive = pron !== null;
  const auxEtre = reflexive || ETRE.has(inf);

  const REFL = ["me", "te", "se", "nous", "vous", "se"];
  const withPronouns = (verb: string, i: number) => {
    let head = verb;
    if (reflexive) {
      const r = REFL[i];
      const c = clitic ? clitic[1] : "";
      if (c) head = `${r === "nous" || r === "vous" ? `${r} ` : `${r.slice(0, 1)}'`}${c} ${verb}`;
      else if (r === "nous" || r === "vous" || !elides(verb, inf)) head = `${r} ${verb}`;
      else head = `${r.slice(0, 1)}'${verb}`;
    }
    const subject = PERSONS[i];
    const first = head.split(" ")[0];
    const s = subject === "je" && elides(first, inf) ? "j'" : `${subject} `;
    return `${s}${head}${after}`;
  };

  const AVOIR = ["ai", "as", "a", "avons", "avez", "ont"];
  const ETRE_PRES = ["suis", "es", "est", "sommes", "êtes", "sont"];
  const passe = PERSONS.map((_, i) => {
    const participle = auxEtre && i >= 3 ? `${forms.participle}s` : forms.participle;
    return withPronouns(`${auxEtre ? ETRE_PRES[i] : AVOIR[i]} ${participle}`, i);
  });

  return {
    auxiliary: auxEtre ? "être" : "avoir",
    remark: remarkFor(inf, data),
    tenses: {
      present: forms.present.map(withPronouns),
      passe_compose: passe,
      imparfait: forms.imparfait.map(withPronouns),
      futur: forms.futur.map(withPronouns),
    },
  };
}

export const ORIGIN_MAX = 200;
const FORM_MAX = 80;
const TENSES = ["present", "passe_compose", "imparfait", "futur"] as const;

/** «Происхождение» as saved on a word: one line, trimmed, at most ORIGIN_MAX; empty → null. */
export function cleanOrigin(s: string | null | undefined): string | null {
  const t = (s ?? "").replace(/\s+/g, " ").trim().slice(0, ORIGIN_MAX).trim();
  return t || null;
}

/** A conjugation saved on a word: every tense six non-empty forms, or null when it does not hold. */
export function cleanConjugation(raw: unknown): Conjugation | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { auxiliary?: unknown; remark?: unknown; tenses?: Record<string, unknown> };
  const tenses = {} as Conjugation["tenses"];
  for (const t of TENSES) {
    const list = r.tenses?.[t];
    if (!Array.isArray(list) || list.length !== 6) return null;
    const forms = list.map((f) => (typeof f === "string" ? f.replace(/\s+/g, " ").trim().slice(0, FORM_MAX) : ""));
    if (forms.some((f) => !f)) return null;
    tenses[t] = forms;
  }
  const remark = typeof r.remark === "string" ? r.remark.replace(/\s+/g, " ").trim().slice(0, 120) || null : null;
  return { auxiliary: r.auxiliary === "être" ? "être" : "avoir", remark, tenses };
}
