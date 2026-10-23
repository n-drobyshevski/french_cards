// How a conjugation is shown (the word card, «Контекст»): each form split into its pronouns, the part
// that stays and the part that changes from person to person (lit in red), and, per tense, an
// example sentence that uses one of the forms. Pure, for tests.
import type { Conjugation } from "../types";

export const CONJ_TENSE_ORDER = ["present", "passe_compose", "imparfait", "futur"] as const;
export type ConjTenseKey = (typeof CONJ_TENSE_ORDER)[number];

/** When a tense is used, in a few Russian words (under its name). */
export const TENSE_WHEN: Record<ConjTenseKey, string> = {
  present: "сейчас, обычно",
  passe_compose: "один раз в прошлом",
  imparfait: "фон, привычка в прошлом",
  futur: "будет потом",
};

export interface FormParts {
  /** Subject and reflexive pronouns as written, with their space («je me », «tu t’», «j’»). */
  pro: string;
  /** What stays from person to person. */
  stem: string;
  /** What changes: the ending, or the auxiliary in the passé composé ("" when nothing is shared). */
  hl: string;
  /** The rest of an expression («la flemme») or the participle («cassé»), with its leading space. */
  tail: string;
}

const SUBJECT = /^(je |j['’]|tu |il\/elle |il |elle |on |nous |vous |ils\/elles |ils |elles )/i;
const REFLEXIVE = /^(me |te |se |nous |vous |m['’]|t['’]|s['’])/i;
const AUX = new Set(["ai", "as", "a", "avons", "avez", "ont", "suis", "es", "est", "sommes", "êtes", "sont"]);

/** «tu te casses» → { pro: "tu te ", verb: "casses" }. */
export function splitForm(form: string): { pro: string; verb: string } {
  const f = form.replace(/\s+/g, " ").trim();
  const subject = SUBJECT.exec(f)?.[0] ?? "";
  const rest = f.slice(subject.length);
  const reflexive = subject ? (REFLEXIVE.exec(rest)?.[0] ?? "") : "";
  return { pro: subject + reflexive, verb: rest.slice(reflexive.length) };
}

function commonPrefix(list: readonly string[]): string {
  if (list.length === 0) return "";
  let n = 0;
  while (list.every((s) => n < s.length && s[n] === list[0][n])) n++;
  return list[0].slice(0, n);
}

/**
 * The six forms of one tense, split for display. Simple tenses light what follows the stem shared
 * by all six (at least 2 letters, else nothing: être, aller); the passé composé lights the auxiliary.
 */
export function tenseParts(forms: readonly string[], tense: ConjTenseKey): FormParts[] {
  const split = forms.map(splitForm);
  if (tense === "passe_compose") {
    return split.map(({ pro, verb }) => {
      const words = verb.split(" ");
      const at = words.findIndex((w) => AUX.has(w.toLowerCase()));
      if (at < 0) return { pro, stem: verb, hl: "", tail: "" };
      const before = words.slice(0, at).join(" ");
      const after = words.slice(at + 1).join(" ");
      return { pro, stem: before ? `${before} ` : "", hl: words[at], tail: after ? ` ${after}` : "" };
    });
  }
  // An expression keeps its words after the verb («ai la flemme»): shared by all six, they stay plain.
  const heads = split.map(({ verb }) => verb.split(" "));
  const rest = heads[0].slice(1).join(" ");
  const sharedTail = rest !== "" && heads.every((w) => w.slice(1).join(" ") === rest) ? ` ${rest}` : "";
  const cores = split.map(({ verb }) => (sharedTail ? verb.slice(0, verb.length - sharedTail.length) : verb));
  const stem = commonPrefix(cores);
  return split.map(({ pro }, i) =>
    stem.length >= 2 && cores.every((c) => c.length > stem.length || c === stem)
      ? { pro, stem, hl: cores[i].slice(stem.length), tail: sharedTail }
      : { pro, stem: cores[i], hl: "", tail: sharedTail },
  );
}

/** je / nous, tu / vous, il / ils: singular on the left, plural on the right. */
export const PAIRED = [0, 3, 1, 4, 2, 5] as const;

/** The past participle, from the passé composé («je suis cassé» → «cassé»), or null. */
export function participleOf(conj: Conjugation): string | null {
  const first = tenseParts(conj.tenses.passe_compose, "passe_compose")[0];
  return first?.hl ? first.tail.trim().split(" ")[0] || null : null;
}

export interface TenseExample {
  fr: string;
  ru: string | null;
  /** Where the form is in `fr` (for the underline). */
  at: number;
  length: number;
}

const norm = (s: string) => s.replace(/’/g, "'").toLocaleLowerCase("fr");
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The first sentence among `sentences` that uses one of the tense's forms as whole words (the
 * reflexive pronoun included, the subject not: «Il s’est cassé»). Longer forms are tried first.
 */
export function tenseExample(
  forms: readonly string[],
  sentences: readonly { fr: string; ru: string | null }[],
): TenseExample | null {
  const needles = [
    ...new Set(
      forms
        .map((f) => {
          const { pro, verb } = splitForm(f);
          const subject = SUBJECT.exec(pro)?.[0] ?? "";
          return norm(`${pro.slice(subject.length)}${verb}`.trim());
        })
        .filter((n) => n.length >= 2),
    ),
  ].sort((a, b) => b.length - a.length);
  for (const s of sentences) {
    const text = norm(s.fr);
    for (const needle of needles) {
      const m = new RegExp(`(?<![\\p{L}'])${escape(needle)}(?![\\p{L}])`, "u").exec(text);
      if (m) return { fr: s.fr, ru: s.ru, at: m.index, length: needle.length };
    }
  }
  return null;
}
