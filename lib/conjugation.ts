// «Спряжение» in «Контекст», on the device: the table of irregular verbs (scripts/build-
// conjugation.mjs → public/lexique/fr-conj.json, precached by the service worker) is fetched
// once per session; the rules in lib/core/conjugate.ts do the rest. No model is asked.
import type { LookupResponse } from "./ai/schemas";
import { conjugate, formsOf, type ConjData } from "./core/conjugate";

export const CONJ_URL = "/lexique/fr-conj.json";

let loading: Promise<ConjData | null> | null = null;

/** The table, or null when it cannot be fetched (rules still conjugate regular verbs). */
export function loadConjData(fetchImpl: typeof fetch = fetch): Promise<ConjData | null> {
  loading ??= fetchImpl(CONJ_URL)
    .then((res) => (res.ok ? (res.json() as Promise<ConjData>) : null))
    .catch(() => null)
    .then((data) => {
      if (!data) loading = null; // try again next time
      return data;
    });
  return loading;
}

/** «avoir la flemme», «se casser», «kiffer»: the first word after se / s' is the infinitive. */
function infinitiveOf(fr: string): string {
  return fr
    .toLowerCase()
    .replace(/’/g, "'")
    .replace(/^(?:se\s+|s')(?:(?:en|y)\s+)?/, "")
    .split(/\s+/)[0];
}

/** The lookup with its conjugation built here: verbs, and expressions that start with one. */
export async function withConjugation(lookup: LookupResponse, fetchImpl?: typeof fetch): Promise<LookupResponse> {
  if (!lookup.found || (lookup.pos !== "verb" && lookup.pos !== "expression")) return { ...lookup, conjugation: null };
  const data = await loadConjData(fetchImpl);
  const inf = infinitiveOf(lookup.fr);
  // An expression only when its first word is a verb we know («c'est relou» is not).
  if (lookup.pos === "expression" && !(data?.irregular[inf] || /[^ ]er$/.test(inf) || data?.second.includes(inf))) {
    return { ...lookup, conjugation: null };
  }
  if (lookup.pos === "expression" && !formsOf(inf, data)) return { ...lookup, conjugation: null };
  return { ...lookup, conjugation: conjugate(lookup.fr, data) };
}
