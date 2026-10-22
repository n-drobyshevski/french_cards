// Builds public/lexique/fr-conj.json for «Контекст» → «Спряжение» (lib/core/conjugate.ts): the
// verbs the rules get wrong (irregular, third group, spelling quirks such as appeler → appelle),
// as présent / imparfait / futur / participle, and the -ir verbs Lexique confirms as second group.
// Source: Lexique 3.83 (New & Pallier, www.lexique.org, CC BY-SA 4.0); per cell the most frequent
// form wins (Lexique has a few mislabelled rows). Lexique is corpus-based, so rare verbs can miss
// cells: imparfait and futur are derived from the forms that are there, a verb whose présent or
// participle stays incomplete is left out (the screen then shows no table for it).
//
//   node scripts/build-conjugation.mjs [--input Lexique383.tsv] [--out public/lexique/fr-conj.json]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ruleForms } from "../lib/core/conjugate.ts";

const here = dirname(fileURLToPath(import.meta.url));
const LEXIQUE_URL = "http://www.lexique.org/databases/Lexique383/Lexique383.tsv";
const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const out = arg("--out") ?? join(here, "..", "public", "lexique", "fr-conj.json");

async function readLexique() {
  const input = arg("--input");
  if (input) return readFileSync(input, "utf8");
  const local = join(here, "Lexique383.tsv");
  if (existsSync(local)) return readFileSync(local, "utf8");
  const res = await fetch(LEXIQUE_URL);
  if (!res.ok) throw new Error(`Lexique download failed: ${res.status}`);
  return await res.text();
}

const PERSON = { "1s": 0, "2s": 1, "3s": 2, "1p": 3, "2p": 4, "3p": 5 };
const TENSE = { "ind:pre": "present", "ind:imp": "imparfait", "ind:fut": "futur", "cnd:pre": "conditionnel" };
const IMP = ["ais", "ais", "ait", "ions", "iez", "aient"];
const FUT = ["ai", "as", "a", "ons", "ez", "ont"];
const COND = ["ais", "ais", "ait", "ions", "iez", "aient"];

const text = await readLexique();
const lines = text.split(/\r?\n/);
const header = lines[0].split("\t");
const col = (name) => header.indexOf(name);
const [cOrtho, cLemme, cCgram, cGenre, cNombre, cFf, cFl, cInfo] = ["ortho", "lemme", "cgram", "genre", "nombre", "freqfilms2", "freqlivres", "infover"].map(col);

/** lemma → { present: [Map(form → freq)…×6], …, participle: Map } with every candidate per cell. */
const verbs = new Map();
const add = (cell, form, freq) => {
  const m = cell ?? new Map();
  m.set(form, (m.get(form) ?? 0) + freq);
  return m;
};

// A form must end the way its cell does: Lexique has mislabelled rows (dire → «dit» as futur 3p).
const ENDS = {
  present: [null, null, null, /(ons|sommes)$/, /(ez|êtes|dites|faites)$/, /(ent|ont)$/],
  imparfait: [/ais$/, /ais$/, /ait$/, /ions$/, /iez$/, /aient$/],
  futur: [/ai$/, /as$/, /a$/, /ons$/, /ez$/, /ont$/],
  conditionnel: [/ais$/, /ais$/, /ait$/, /ions$/, /iez$/, /aient$/],
};
const fitsCell = (tense, i, form) => {
  const re = ENDS[tense][i];
  if (re) return re.test(form);
  // je / tu / il: never an infinitive or a nous / vous ending (il tient, il ment are fine).
  return !/(er|ir|ez|ons)$/.test(form);
};
/** The cell's form: the rule's when Lexique has it, otherwise the most frequent one that fits. */
const pick = (cell, tense, i, ruleForm) => {
  if (!cell) return undefined;
  if (ruleForm && cell.has(ruleForm)) return ruleForm;
  let out;
  let top = -1;
  for (const [form, freq] of cell) {
    const fits = !/[\s-]/.test(form) && (tense === null || fitsCell(tense, i, form));
    if (fits && freq > top) [out, top] = [form, freq];
  }
  return out;
};

for (let n = 1; n < lines.length; n++) {
  const r = lines[n].split("\t");
  if (r.length < header.length) continue;
  const cgram = r[cCgram];
  if (cgram !== "VER" && cgram !== "AUX") continue;
  const lemma = r[cLemme];
  if (!/^[a-zàâçéèêëîïôûüœ]+$/.test(lemma)) continue;
  const form = r[cOrtho];
  const freq = Number(r[cFf] || 0) + Number(r[cFl] || 0) + 0.001;
  let v = verbs.get(lemma);
  if (!v) verbs.set(lemma, (v = { present: [], imparfait: [], futur: [], conditionnel: [], participle: null }));
  for (const info of r[cInfo].split(";")) {
    if (info === "par:pas") {
      const genre = r[cGenre];
      const nombre = r[cNombre];
      if ((genre === "m" || genre === "") && (nombre === "s" || nombre === "")) v.participle = add(v.participle, form, freq);
      continue;
    }
    const m = /^(ind:pre|ind:imp|ind:fut|cnd:pre):(1s|2s|3s|1p|2p|3p)$/.exec(info);
    if (!m) continue;
    const list = v[TENSE[m[1]]];
    const i = PERSON[m[2]];
    list[i] = add(list[i], form, freq);
  }
}

const cells = (list, tense, rule) => Array.from({ length: 6 }, (_, i) => pick(list[i], tense, i, rule?.[i]));
const stemOf = (forms, endings) => {
  for (let i = 0; i < 6; i++) if (forms[i]?.endsWith(endings[i])) return forms[i].slice(0, forms[i].length - endings[i].length);
  return null;
};


const fold = (s) => s.normalize("NFD").replace(/\p{M}+/gu, "");

/** Other -er patterns: appeler / jeter double the consonant; payer may keep its y. */
function variantsOf(inf) {
  const stem = inf.slice(0, -2);
  const out = [];
  const lt = /e([lt])$/.exec(stem);
  if (lt) {
    const strong = `${stem}${lt[1]}`;
    const base = ruleForms(inf);
    out.push({
      ...base,
      present: base.present.map((f, i) => ([3, 4].includes(i) ? f : `${strong}${f.slice(stem.length)}`.replace(/è(?=[lt])/, "e"))),
      futur: base.futur.map((f) => `${strong}er${f.slice(f.length - (f.length - inf.length))}`),
    });
  }
  if (/ay$/.test(stem)) {
    const base = ruleForms(inf);
    out.push({ ...base, present: base.present.map((f) => f.replace(/ai(?=e)/, "ay")), futur: base.futur.map((f) => f.replace(/aie(?=r)/, "aye")) });
  }
  return out;
}

const irregular = {};
const second = [];
let ruleOk = 0;
let dropped = 0;
/** Third-group verbs with gaps in Lexique, filled by analogy once the complete tables are known. */
const partial = new Map();

for (const [lemma, v] of verbs) {
  const isIr = lemma.endsWith("ir");
  const rule = ruleForms(lemma, isIr ? new Set([lemma]) : null);
  const present = cells(v.present, "present", rule?.present);
  const imparfait = cells(v.imparfait, "imparfait", rule?.imparfait);
  const futur = cells(v.futur, "futur", rule?.futur);
  const participle = pick(v.participle, null, 0, rule?.participle);

  if (rule && isIr) {
    const same = (a, b) => a.every((f, i) => f === undefined || f === b[i]);
    const matches =
      same(present, rule.present) && same(imparfait, rule.imparfait) && same(futur, rule.futur) && (participle === undefined || participle === rule.participle);
    if (matches && [...present, ...imparfait, ...futur, participle].some(Boolean)) {
      second.push(lemma);
      continue;
    }
  }

  if (rule && !isIr) {
    // An -er verb: pick the whole pattern Lexique supports best (the rule, or appeler / jeter
    // doubling, or payer keeping its y), then let Lexique override only cells that differ in more
    // than accents (envoyer → enverrai), so a stray row like «desséches» cannot.
    const variants = [rule, ...variantsOf(lemma)];
    const score = (vf) =>
      ["present", "imparfait", "futur"].reduce((sum, t) => sum + vf[t].reduce((a, f, i) => a + (v[t][i]?.get(f) ?? 0), 0), 0);
    const chosen = variants.reduce((a, b) => (score(b) > score(a) ? b : a));
    const merge = (t, lex) => chosen[t].map((f, i) => (lex[i] && fold(lex[i]) !== fold(f) ? lex[i] : f));
    const table = {
      present: merge("present", present),
      // The imparfait is regular for every -er verb (pariions, not Lexique's stray «parions»).
      imparfait: chosen.imparfait,
      futur: merge("futur", futur),
      participle: participle && fold(participle) !== fold(chosen.participle) ? participle : chosen.participle,
    };
    const same = ["present", "imparfait", "futur"].every((t) => table[t].every((f, i) => f === rule[t][i])) && table.participle === rule.participle;
    if (same) {
      ruleOk++;
      continue;
    }
    irregular[lemma] = [table.present.join("|"), table.imparfait.join("|"), table.futur.join("|"), table.participle];
    continue;
  }

  // Third group (and -ir verbs that are not like finir): derive the gaps, keep only complete tables.
  if (present.some((f) => !f) || !participle) {
    partial.set(lemma, { present, imparfait, futur, participle });
    continue;
  }
  const impStem = lemma === "être" ? "ét" : (stemOf(imparfait, IMP) ?? (present[3]?.endsWith("ons") ? present[3].slice(0, -3) : null));
  const futStem = stemOf(futur, FUT) ?? stemOf(cells(v.conditionnel, "conditionnel"), COND) ?? (lemma.endsWith("re") ? lemma.slice(0, -1) : lemma.endsWith("ir") ? lemma : null);
  if (!impStem || !futStem) {
    dropped++;
    continue;
  }
  irregular[lemma] = [
    present.join("|"),
    imparfait.map((f, i) => f ?? `${impStem}${IMP[i]}`).join("|"),
    futur.map((f, i) => f ?? `${futStem}${FUT[i]}`).join("|"),
    participle,
  ];
}

// Analogy: contenir ← tenir, traduire ← conduire, décrire ← écrire. The model is the complete
// table verb sharing the longest ending (at least 4 letters); its forms get this verb's prefix,
// and Lexique's own forms still win where they exist.
const complete = Object.keys(irregular).filter((k) => !k.endsWith("er"));
const commonEnd = (a, b) => {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
};
for (const [lemma, lex] of partial) {
  let model = null;
  let len = 3;
  for (const m of complete) {
    const n = commonEnd(lemma, m);
    if (n > len && n < m.length + 1) [model, len] = [m, n];
  }
  if (!model) {
    dropped++;
    continue;
  }
  const mPrefix = model.slice(0, model.length - len);
  const xPrefix = lemma.slice(0, lemma.length - len);
  const swap = (f) => (f.startsWith(mPrefix) ? `${xPrefix}${f.slice(mPrefix.length)}` : null);
  const [p, i, f, part] = irregular[model];
  const table = [p, i, f].map((t, k) => t.split("|").map((form, j) => [lex.present, lex.imparfait, lex.futur][k][j] ?? swap(form)));
  const participle = lex.participle ?? swap(part);
  if (table.some((t) => t.some((form) => !form)) || !participle) {
    dropped++;
    continue;
  }
  irregular[lemma] = [...table.map((t) => t.join("|")), participle];
}

// Lexique errors on frequent verbs, and impersonal verbs (il faut, il pleut) that have no table.
const IMPERSONAL = ["falloir", "pleuvoir"];
const FIXES = {
  plaire: { participle: "plu" },
  déplaire: { participle: "déplu" },
  complaire: { participle: "complu" },
  émouvoir: { futur: "émouvrai|émouvras|émouvra|émouvrons|émouvrez|émouvront" },
};
for (const v of IMPERSONAL) delete irregular[v];
for (const [v, fix] of Object.entries(FIXES)) {
  const row = irregular[v];
  if (!row) continue;
  if (fix.futur) row[2] = fix.futur;
  if (fix.participle) row[3] = fix.participle;
}

const sortedIrregular = Object.fromEntries(Object.entries(irregular).sort(([a], [b]) => a.localeCompare(b, "fr")));
writeFileSync(out, `${JSON.stringify({ v: 1, irregular: sortedIrregular, second: second.sort((a, b) => a.localeCompare(b, "fr")) })}\n`);
console.log(
  `fr-conj.json: ${Object.keys(irregular).length} table verbs, ${second.length} second-group, ${ruleOk} regular -er by rule, ${dropped} left out (incomplete in Lexique)`,
);
