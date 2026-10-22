#!/usr/bin/env node
// Builds public/lexique/fr-lemmas.json for instant local suggestions (lib/lexique.ts):
// an array of [lemma, pos, gender, freq] for the most frequent French lemmas, sorted by the
// accent-folded lemma. Source: Lexique 3.83 (New & Pallier, www.lexique.org, CC BY-SA 4.0),
// plus the curated slang list in lexique-slang.mjs. Without network it falls back to the
// bundled scripts/lexique-fallback.json (top lemmas from an earlier Lexique run + slang).
//
//   node scripts/build-lexique.mjs [--input Lexique383.tsv | --offline] [--limit 25000] [--out path] [--write-fallback]
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SLANG_FREQ, SLANG_LEMMAS } from "./lexique-slang.mjs";

const LEXIQUE_URL = "http://www.lexique.org/databases/Lexique383/Lexique383.tsv";
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const FALLBACK_PATH = join(here, "lexique-fallback.json");
const FALLBACK_SIZE = 4000;

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : fallback;
}
const flag = (name) => process.argv.includes(`--${name}`);

const LIMIT = Number(arg("limit", "25000"));
const OUT = resolve(root, arg("out", "public/lexique/fr-lemmas.json"));

/** Must stay identical to `foldKey` in lib/lexique.ts. */
export function foldKey(s) {
  return s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[’‘ʼ`´′]/g, "'")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .normalize("NFC")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/\s+/g, " ")
    .trim();
}

const POS = { NOM: "noun", VER: "verb", AUX: "verb", ADJ: "adj", ADV: "adv", ONO: "expression" };

async function download() {
  try {
    const res = await fetch(LEXIQUE_URL, { signal: AbortSignal.timeout(90_000) });
    if (res.ok) return await res.text();
    console.warn(`fetch: HTTP ${res.status}`);
  } catch (e) {
    console.warn(`fetch failed: ${e?.message ?? e}`);
  }
  // Node's fetch ignores HTTP(S)_PROXY; curl honours it.
  try {
    return execFileSync("curl", ["-sSfL", "--max-time", "120", LEXIQUE_URL], { maxBuffer: 64 * 1024 * 1024, encoding: "utf8" });
  } catch (e) {
    console.warn(`curl failed: ${e?.message?.split("\n")[0] ?? e}`);
  }
  return null;
}

/** Lexique TSV → Map(lemma → {pos, genders:Set, freq}) keeping the most frequent POS per lemma. */
function parseLexique(tsv) {
  const lines = tsv.split(/\r?\n/);
  const header = lines[0].split("\t");
  const col = (name) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`Lexique column missing: ${name}`);
    return i;
  };
  const iLemme = col("lemme"), iCgram = col("cgram"), iGenre = col("genre");
  const iFilms = col("freqlemfilms2"), iBooks = col("freqlemlivres");

  // (lemma, cgram) → stats
  const byPair = new Map();
  for (let n = 1; n < lines.length; n++) {
    const f = lines[n].split("\t");
    if (f.length < header.length - 2) continue;
    const lemma = f[iLemme]?.trim();
    const cgram = (f[iCgram] ?? "").trim();
    if (!lemma || /\d/.test(lemma) || !/\p{L}/u.test(lemma)) continue;
    if (lemma.length < 2 && !["à", "y", "a", "ô"].includes(lemma)) continue;
    const key = `${lemma}\u0000${cgram}`;
    let s = byPair.get(key);
    if (!s) {
      const films = Number.parseFloat(f[iFilms]) || 0;
      const books = Number.parseFloat(f[iBooks]) || 0;
      // Slang lives in speech: weight film subtitles above books.
      s = { lemma, cgram, freq: 0.6 * films + 0.4 * books, genders: new Set() };
      byPair.set(key, s);
    }
    const genre = (f[iGenre] ?? "").trim();
    if (cgram === "NOM" && (genre === "m" || genre === "f")) s.genders.add(genre);
  }

  const byLemma = new Map();
  for (const s of byPair.values()) {
    const pos = POS[s.cgram] ?? "other";
    const prev = byLemma.get(s.lemma);
    const freq = s.freq;
    if (!prev) {
      byLemma.set(s.lemma, { pos, genders: s.genders, freq, best: freq });
    } else {
      // Frequency of the dominant reading; POS and gender come from it too.
      prev.freq = Math.max(prev.freq, freq);
      if (freq > prev.best) Object.assign(prev, { pos, genders: s.genders, best: freq });
    }
  }
  return byLemma;
}

function genderOf(pos, genders) {
  if (pos !== "noun") return "none";
  // No gender on any form usually means an epicene noun (un/une élève).
  if (genders.size === 0 || (genders.has("m") && genders.has("f"))) return "mf";
  if (genders.has("f")) return "f";
  return "m";
}

const round = (x) => Math.round(x * 100) / 100;
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function sortByKey(entries) {
  return entries
    .map((e) => ({ e, k: foldKey(e[0]) }))
    .sort((a, b) => compare(a.k, b.k) || compare(a.e[0], b.e[0]))
    .map((x) => x.e);
}

/** Adds curated slang that is missing, and fixes noun genders Lexique gets wrong for slang (keuf). */
function withSlang(entries) {
  const index = new Map(entries.map((e, i) => [e[0], i]));
  const out = entries.map((e) => [...e]);
  for (const [lemma, pos, gender] of SLANG_LEMMAS) {
    const i = index.get(lemma);
    if (i === undefined) {
      index.set(lemma, out.length);
      out.push([lemma, pos, gender, SLANG_FREQ]);
    } else if (out[i][1] === "noun" && pos === "noun") {
      out[i][2] = gender;
    }
  }
  return out;
}

async function main() {
  const input = arg("input", null);
  let tsv = null;
  if (input) tsv = readFileSync(resolve(input), "utf8");
  else if (!flag("offline")) tsv = await download();

  let entries;
  let source;
  if (tsv) {
    const lemmas = parseLexique(tsv);
    entries = [...lemmas.entries()]
      .filter(([, v]) => v.freq > 0)
      .sort((a, b) => b[1].freq - a[1].freq || compare(a[0], b[0]))
      .map(([lemma, v]) => [lemma, v.pos, genderOf(v.pos, v.genders), round(v.freq)]);
    source = `Lexique 3.83 (${lemmas.size} lemmas)`;
    if (flag("write-fallback")) {
      const top = entries.slice(0, FALLBACK_SIZE);
      writeFileSync(FALLBACK_PATH, `[\n${sortByKey(top).map((e) => JSON.stringify(e)).join(",\n")}\n]\n`);
      console.log(`wrote ${FALLBACK_PATH} (${top.length} lemmas)`);
    }
    entries = entries.slice(0, LIMIT);
  } else if (existsSync(FALLBACK_PATH)) {
    entries = JSON.parse(readFileSync(FALLBACK_PATH, "utf8"));
    source = "bundled fallback list";
  } else {
    throw new Error("Lexique unreachable and scripts/lexique-fallback.json is missing");
  }

  const final = sortByKey(withSlang(entries));
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `[\n${final.map((e) => JSON.stringify(e)).join(",\n")}\n]\n`);
  const kb = Math.round(readFileSync(OUT).byteLength / 1024);
  console.log(`wrote ${OUT}: ${final.length} lemmas, ${kb} KB, from ${source} + curated slang`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
