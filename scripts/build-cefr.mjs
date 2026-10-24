// Builds public/lexique/fr-cefr.json for «Уровень языка» (lib/core/level.ts): an estimated CEFR
// level per French lemma and expression, from FLELex (François, Gala, Watrin & Fairon 2014,
// https://cental.uclouvain.be/cefrlex/flelex/), CC BY-NC-SA 4.0. Kept in its own file, never merged
// into the Lexique files (CC BY-SA): see public/lexique/LICENSE.txt.
//   - Beacco.txt (FLELex TreeTagger, «level» column from Pintard & François 2020, trained on
//     Beacco's référentiels): word, tag, freq_A1…freq_C2, freq_total, level.
//   - CRF.txt (FLELex CRF tagger, with multi-word expressions): word, tag, freq_a1…freq_c2,
//     freq_total, no level column, so an entry gets the first level where it occurs. Only its
//     multi-word, hyphenated and elided entries that Beacco lacks are kept: its single words
//     outside Beacco are mostly inflected forms, names and typos («achetent», «alice»).
//
//   node scripts/build-cefr.mjs <dir with Beacco.txt and CRF.txt> [--beacco file] [--crf file] [--out file]
//
// Output: { v: 1, beacco: [6 strings], crf: [6 strings] }; string i holds the keys of level
// A1…C2 (index i) joined with «|», sorted. A Beacco lemma whose level differs by part of speech is
// written once per part of speech as «key~p» (n, v, a, r = adv, o = other). Keys are
// `cleanLevelText` of lib/core/level.ts (lowercase, accents kept, œ → oe, «chef - d' oeuvre» →
// «chef-d'oeuvre»).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { CEFR_LEVELS, cleanLevelText, stripTrailingPrep } from "../lib/core/level.ts";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const dir = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
const beaccoPath = arg("--beacco") ?? (dir && join(dir, "Beacco.txt"));
const crfPath = arg("--crf") ?? (dir && join(dir, "CRF.txt"));
const out = arg("--out") ?? join(here, "..", "public", "lexique", "fr-cefr.json");
if (!beaccoPath || !crfPath) {
  console.error("usage: node scripts/build-cefr.mjs <flelex dir> [--beacco Beacco.txt] [--crf CRF.txt] [--out fr-cefr.json]");
  process.exit(1);
}

/** Header-keyed rows of a TSV file (CRLF or LF). */
function readTsv(path) {
  const [head, ...lines] = readFileSync(path, "utf8").replace(/^﻿/, "").split(/\r?\n/);
  const cols = head.split("\t").map((c) => c.trim().toLowerCase());
  return lines
    .filter((l) => l.trim())
    .map((l) => {
      const cells = l.split("\t");
      return Object.fromEntries(cols.map((c, i) => [c, (cells[i] ?? "").trim()]));
    });
}

const LEVEL_INDEX = new Map(CEFR_LEVELS.map((l, i) => [l, i]));
const FREQ_COLS = CEFR_LEVELS.map((l) => `freq_${l.toLowerCase()}`);
/** TreeTagger tags → the app's part-of-speech codes (CEFR_POS_CODE in lib/core/level.ts). */
const BEACCO_POS = { NOM: "n", VER: "v", ADJ: "a", ADV: "r" };
/** Characters the file format reserves, and keys that are not words. */
const usable = (key) => key && !/[|~]/.test(key) && /\p{L}/u.test(key);

// --- Beacco: lemma → { pos code → lowest level } ---
const beaccoRows = readTsv(beaccoPath);
const lemmas = new Map();
let beaccoSkipped = 0;
for (const row of beaccoRows) {
  const key = cleanLevelText(row.word);
  const level = LEVEL_INDEX.get(row.level);
  if (!usable(key) || level === undefined) {
    beaccoSkipped++;
    continue;
  }
  const pos = BEACCO_POS[row.tag] ?? "o";
  const byPos = lemmas.get(key) ?? new Map();
  byPos.set(pos, Math.min(byPos.get(pos) ?? 9, level));
  lemmas.set(key, byPos);
}

const beacco = CEFR_LEVELS.map(() => []);
let splitLemmas = 0;
for (const [key, byPos] of lemmas) {
  const levels = new Set(byPos.values());
  if (levels.size === 1) {
    beacco[[...levels][0]].push(key);
  } else {
    splitLemmas++;
    for (const [pos, level] of byPos) beacco[level].push(`${key}~${pos}`);
  }
}

// --- CRF: key → first level with a non-zero frequency (lowest across tags) ---
const crfRows = readTsv(crfPath);
const crfLevels = new Map();
for (const row of crfRows) {
  const key = cleanLevelText(row.word);
  if (!usable(key)) continue;
  const level = FREQ_COLS.findIndex((c) => Number(row[c]) > 0);
  if (level < 0) continue;
  crfLevels.set(key, Math.min(crfLevels.get(key) ?? 9, level));
}
// «au fur et à mesure du» also answers «au fur et à mesure» (lookups strip a trailing à / de too),
// unless the file has that one itself.
for (const [key, level] of [...crfLevels]) {
  const bare = stripTrailingPrep(key);
  if (bare !== key && !crfLevels.has(bare)) crfLevels.set(bare, level);
}
const crf = CEFR_LEVELS.map(() => []);
let crfExpressions = 0;
for (const [key, level] of crfLevels) {
  // Beacco is the better estimate for every word it has.
  if (lemmas.has(key) || !/[ '-]/.test(key)) continue;
  crfExpressions++;
  crf[level].push(key);
}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const join6 = (lists) => lists.map((l) => l.sort(cmp).join("|"));
const file = { v: 1, beacco: join6(beacco), crf: join6(crf) };
const json = JSON.stringify(file);
writeFileSync(out, json);

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const gz = gzipSync(json, { level: 9 }).length;
const beaccoOnly = gzipSync(JSON.stringify({ v: 1, beacco: file.beacco, crf: [] }), { level: 9 }).length;
console.log(`wrote ${out}: ${kb(json.length)} raw, ${kb(gz)} gzipped (Beacco alone ${kb(beaccoOnly)})`);
console.log(
  `  Beacco: ${lemmas.size} lemmas (${splitLemmas} split by part of speech), ${beaccoSkipped} rows skipped; ` +
    CEFR_LEVELS.map((l, i) => `${l} ${beacco[i].length}`).join(" · "),
);
console.log(
  `  CRF: ${crfExpressions} expressions not in Beacco; ` +
    CEFR_LEVELS.map((l, i) => `${l} ${crf[i].length}`).join(" · "),
);
