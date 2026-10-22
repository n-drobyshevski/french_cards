// Builds public/lexique/fr-morpho.json for «Контекст» → «Состав слова» (lib/morpho.ts): how a
// word is made («volontaire» = volonté + -aire, «incroyable» = in- + croire + -able), from the
// morphological column of Lexique 3.83 (New & Pallier, www.lexique.org, CC BY-SA 4.0). Lexique
// splits some words that are not derived (distance → di + stance), so an entry is kept only when
// a part is itself a common French lemma and the rest are affixes around it.
//
//   node scripts/build-morpho.mjs [--input Lexique383.tsv] [--out public/lexique/fr-morpho.json]
//
// Output: { v: 1, words: [[lemma, "in-|croire|-able", freq], …] }, prefixes end with "-",
// suffixes start with "-", roots are bare; freq is per million words (films + books), rounded.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PREFIXES, SUFFIXES } from "../lib/core/affixes.ts";

const here = dirname(fileURLToPath(import.meta.url));
const LEXIQUE_URL = "http://www.lexique.org/databases/Lexique383/Lexique383.tsv";
const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const out = arg("--out") ?? join(here, "..", "public", "lexique", "fr-morpho.json");

async function readLexique() {
  const input = arg("--input");
  if (input) return readFileSync(input, "utf8");
  const local = join(here, "Lexique383.tsv");
  if (existsSync(local)) return readFileSync(local, "utf8");
  const res = await fetch(LEXIQUE_URL);
  if (!res.ok) throw new Error(`Lexique download failed: ${res.status}`);
  return await res.text();
}

/** A root must be at least this common (per million words), so «stance» or «mite» do not count. */
const ROOT_MIN_FREQ = 2;
/** Derived words rarer than this are left out (they only clutter «Однокоренные»). */
const WORD_MIN_FREQ = 0.3;

const text = await readLexique();
const lines = text.split(/\r?\n/);
const header = lines[0].split("\t");
const col = (name) => header.indexOf(name);
const [cLemme, cCgram, cFf, cFl, cIsLem, cMorph, cNb] = ["lemme", "cgram", "freqlemfilms2", "freqlemlivres", "islem", "morphoder", "nbmorph"].map(col);

const lemmaFreq = new Map();
const morph = new Map();
const adjectives = new Set();
const adverbs = new Set();
for (let n = 1; n < lines.length; n++) {
  const r = lines[n].split("\t");
  if (r.length < header.length) continue;
  const lemma = r[cLemme];
  const freq = (Number(r[cFf] || 0) + Number(r[cFl] || 0)) / 2;
  lemmaFreq.set(lemma, Math.max(lemmaFreq.get(lemma) ?? 0, freq));
  if (r[cCgram] === "ADJ") adjectives.add(lemma);
  if (r[cCgram] === "ADV") adverbs.add(lemma);
  if (r[cIsLem] === "1" && Number(r[cNb]) >= 2 && !morph.has(lemma)) morph.set(lemma, r[cMorph]);
}

// Lexique leaves -ment adverbs whole (volontairement): split them on their adjective, from the
// feminine form the adverb is built on (dangereusement ← dangereuse ← dangereux).
const FEMININE = [
  [/amment$/, "ant"],
  [/emment$/, "ent"],
  [/euse$/, "eux"],
  [/ive$/, "if"],
  [/elle$/, "el"],
  [/ière$/, "ier"],
  [/ète$/, "et"],
  [/ue$/, "u"],
  [/e$/, ""],
  [/$/, ""],
];
for (const adv of adverbs) {
  if (morph.has(adv) && morph.get(adv).includes("-")) continue;
  if (!/ment$/.test(adv)) continue;
  const base = adv.endsWith("amment") || adv.endsWith("emment") ? adv : adv.slice(0, -4);
  for (const [re, to] of FEMININE) {
    const adj = base.replace(re, to);
    if (adj !== adv && adjectives.has(adj) && (lemmaFreq.get(adj) ?? 0) >= ROOT_MIN_FREQ) {
      morph.set(adv, `${adj}-ment`);
      break;
    }
  }
}

const isAffixPart = (p) => p in PREFIXES || p in SUFFIXES;

const words = [];
for (const [lemma, raw] of morph) {
  const freq = lemmaFreq.get(lemma) ?? 0;
  if (freq < WORD_MIN_FREQ || /\s/.test(lemma)) continue;
  // «dé1» / «dé2» are homograph numbers; «:num», «:ind», «°» are Lexique's own markers.
  const parts = raw
    .split("-")
    .map((p) => p.replace(/\d+$/, ""))
    .filter((p) => p && !p.startsWith(":") && p !== "°");
  if (parts.length < 2) continue;
  const isRoot = (p) => p !== lemma && p.length >= 3 && !isAffixPart(p) && (lemmaFreq.get(p) ?? 0) >= ROOT_MIN_FREQ;
  const first = parts.findIndex(isRoot);
  if (first < 0) continue;
  let last = first;
  for (let i = parts.length - 1; i > first; i--) {
    if (isRoot(parts[i])) {
      last = i;
      break;
    }
  }
  const marked = parts.map((p, i) => (i < first ? `${p}-` : i > last ? `-${p}` : p));
  // Every part outside the root(s) must be a known affix, otherwise the split is Lexique noise.
  if (marked.some((p) => (p.startsWith("-") || p.endsWith("-")) && !isAffixPart(p.replace(/^-|-$/g, "")))) continue;
  words.push([lemma, marked.join("|"), Math.round(freq * 100) / 100]);
}

words.sort((a, b) => a[0].localeCompare(b[0], "fr"));
writeFileSync(out, `${JSON.stringify({ v: 1, words })}\n`);
console.log(`fr-morpho.json: ${words.length} words`);
