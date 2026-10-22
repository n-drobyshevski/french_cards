// «Контекст» → «Как говорят», the free part: French sentences with a Russian translation from
// Tatoeba (tatoeba.org, CC BY 2.0 FR), asked straight from the browser (the API allows any
// origin), so no model and no server time. The paid web search runs only on «Искать ещё в вебе».
import type { ContextExample, ContextResponse, LookupResponse } from "./ai/schemas";

export const TATOEBA_API = "https://api.tatoeba.org/unstable/sentences";
export const TATOEBA_MAX = 8;

const ARTICLE = /^(?:le|la|les|l'|un|une|des|du|de la|de l')\s*/i;
const PRONOMINAL = /^(?:se\s+|s')(?:(?:en|y)\s+)?/i;
const SMALL = new Set(["le", "la", "les", "l", "un", "une", "des", "du", "de", "d", "à", "au", "aux", "en", "y", "se", "s", "qqn", "qqch", "qch", "quelqu'un", "quelque", "chose"]);

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase();

/** «je me suis cassé» → «suis cassé»: the verb part of a conjugated form. */
const verbPart = (form: string) => form.replace(/^(?:je |j'|tu |il |nous |vous |ils )/, "").replace(/^(?:me |m'|te |t'|se |s'|nous |vous )/, "");

/**
 * The search for a headword. Tatoeba matches word forms by itself (kiffer finds «kiffe»), so a
 * single word goes as it is (without its article or «se»); an expression that starts with a verb
 * asks for any present form of it plus the other words («fais|fait|faire… gaffe»), since a quoted
 * «faire gaffe» would miss «fais gaffe».
 */
export function tatoebaQuery(lookup: Pick<LookupResponse, "fr" | "pos" | "conjugation">): string {
  const fr = lookup.fr.replace(/’/g, "'").trim();
  const bare = fr.replace(PRONOMINAL, "").replace(ARTICLE, "");
  const words = bare.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return bare;
  const conj = lookup.conjugation;
  const content = (list: string[]) => list.filter((w) => !SMALL.has(w.toLowerCase().replace(/'$/, "")));
  if (conj && (lookup.pos === "verb" || lookup.pos === "expression")) {
    const forms = new Set<string>([words[0]]);
    for (const f of conj.tenses.present) {
      const verb = verbPart(f).split(" ")[0];
      if (verb) forms.add(verb);
    }
    const rest = content(words.slice(1));
    return rest.length ? `${[...forms].join("|")} ${rest.join(" ")}` : [...forms].join("|");
  }
  const rest = content(words);
  return (rest.length ? rest : words).join(" ");
}

interface TatoebaSentence {
  id: number;
  text: string;
  lang: string;
  owner?: string | null;
  is_unapproved?: boolean;
  translations?: (TatoebaTranslation | TatoebaTranslation[])[];
}
interface TatoebaTranslation {
  text: string;
  lang: string;
  is_direct?: boolean;
  is_unapproved?: boolean;
}

/** The headword's form inside the sentence, for the underline («kiffes» in «Tu kiffes le café ?»). */
export function tatoebaHit(sentence: string, headword: string): string {
  const words = fold(headword.replace(PRONOMINAL, "").replace(ARTICLE, "").replace(/'/g, " "))
    .split(/\s+/)
    .filter((w) => w.length > 1 && !SMALL.has(w));
  const main = words.sort((a, b) => b.length - a.length)[0];
  if (!main) return "";
  const stem = main.slice(0, Math.max(3, Math.min(main.length - 2, 5)));
  for (const m of sentence.matchAll(/[\p{L}'’-]+/gu)) {
    const token = m[0].replace(/^[a-z]['’]/i, "");
    if (fold(token).startsWith(stem)) return token;
  }
  return "";
}

/** Sentences with a Russian translation (a direct one first), as «Как говорят» rows. */
export function parseTatoeba(json: unknown, headword: string): ContextExample[] {
  const data = (json as { data?: TatoebaSentence[] })?.data;
  if (!Array.isArray(data)) return [];
  const out: ContextExample[] = [];
  const seen = new Set<string>();
  for (const s of data) {
    if (!s || s.lang !== "fra" || s.is_unapproved || typeof s.text !== "string") continue;
    const fr = s.text.replace(/\s+/g, " ").trim();
    const key = fold(fr).replace(/[^\p{L}\p{N}]+/gu, "");
    if (fr.split(" ").length < 2 || seen.has(key)) continue;
    const ru = (s.translations ?? [])
      .flat()
      .filter((t) => t && t.lang === "rus" && !t.is_unapproved && typeof t.text === "string")
      .sort((a, b) => Number(b.is_direct === true) - Number(a.is_direct === true))[0];
    if (!ru) continue;
    seen.add(key);
    out.push({
      fr,
      ru: ru.text.replace(/\s+/g, " ").trim(),
      hit: tatoebaHit(fr, headword),
      meaning: null,
      kind: "tatoeba",
      url: `https://tatoeba.org/ru/sentences/show/${s.id}`,
      domain: "tatoeba.org",
      title: null,
    });
    if (out.length === TATOEBA_MAX) break;
  }
  return out;
}

export class TatoebaError extends Error {}

/** Free examples for a looked-up word; rejects when Tatoeba cannot be reached. */
export async function requestTatoeba(
  lookup: Pick<LookupResponse, "fr" | "pos" | "conjugation">,
  opts: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<ContextResponse> {
  const params = new URLSearchParams({ lang: "fra", q: tatoebaQuery(lookup), sort: "relevance", limit: String(TATOEBA_MAX + 4), "trans:lang": "rus" });
  const res = await (opts.fetchImpl ?? fetch)(`${TATOEBA_API}?${params}`, { signal: opts.signal });
  if (!res.ok) throw new TatoebaError(`tatoeba ${res.status}`);
  const examples = parseTatoeba(await res.json(), lookup.fr);
  return { examples, sources: examples.length, web: false };
}
