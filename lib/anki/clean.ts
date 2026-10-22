// Anki field HTML → plain text for the model and the import preview. String-only (no DOM), so it runs
// the same in the browser, in workers and in node tests.
import { ANKI_FIELD_CHARS, ANKI_FIELDS_MAX, type AnkiField } from "./types";

export interface CleanOptions {
  /** The field holds HTML (default). Plain text keeps «<» and «&» as written. */
  html?: boolean;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  shy: "",
  zwj: "",
  zwnj: "",
  laquo: "«",
  raquo: "»",
  lsquo: "‘",
  rsquo: "’",
  sbquo: "‚",
  ldquo: "“",
  rdquo: "”",
  bdquo: "„",
  hellip: "…",
  ndash: "–",
  mdash: "—",
  middot: "·",
  bull: "•",
  deg: "°",
  euro: "€",
  copy: "©",
  times: "×",
  agrave: "à",
  aacute: "á",
  acirc: "â",
  auml: "ä",
  ccedil: "ç",
  egrave: "è",
  eacute: "é",
  ecirc: "ê",
  euml: "ë",
  icirc: "î",
  iuml: "ï",
  ocirc: "ô",
  ouml: "ö",
  ugrave: "ù",
  ucirc: "û",
  uuml: "ü",
  yuml: "ÿ",
  oelig: "œ",
  aelig: "æ",
  Agrave: "À",
  Acirc: "Â",
  Ccedil: "Ç",
  Egrave: "È",
  Eacute: "É",
  Ecirc: "Ê",
  Icirc: "Î",
  Ocirc: "Ô",
  Ugrave: "Ù",
  Ucirc: "Û",
  OElig: "Œ",
  AElig: "Æ",
};

const SOUND = /\[sound:[^\]]*\]/gi;
// {{c1::text}} and {{c1::text::hint}}, innermost first: text and hint never contain «{{» or «}}».
const CLOZE_PART = "(?:(?!\\{\\{|\\}\\})[\\s\\S])*?";
const CLOZE = new RegExp(`\\{\\{c\\d+::(${CLOZE_PART})(?:::${CLOZE_PART})?\\}\\}`, "g");
const DROP_BLOCKS = /<(script|style|head|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const COMMENT = /<!--[\s\S]*?-->/g;
const IMG = /<img\b[^>]*>/gi;
const LINE_BREAK = /<br\s*\/?>|<\/?(?:div|p|li|tr|h[1-6]|blockquote|ul|ol|table)\b[^>]*>/gi;
// Only real tags: «a < b» in a field stays text.
const TAG = /<\/?[a-zA-Z][^<>]*>/g;
const ENTITY = /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z][a-zA-Z0-9]{1,31}));/g;

function decodeEntities(text: string): string {
  return text.replace(ENTITY, (whole, dec: string | undefined, hex: string | undefined, name: string | undefined) => {
    if (name !== undefined) return NAMED_ENTITIES[name] ?? NAMED_ENTITIES[name.toLowerCase()] ?? whole;
    const code = dec !== undefined ? parseInt(dec, 10) : parseInt(hex ?? "", 16);
    if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return whole;
    return String.fromCodePoint(code);
  });
}

function unwrapCloze(text: string): string {
  // Nested clozes ({{c1::a {{c2::b}}}}) unwrap from the inside out.
  for (let i = 0; i < 5; i++) {
    const next = text.replace(CLOZE, "$1");
    if (next === text) break;
    text = next;
  }
  return text;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  let cut = text.slice(0, max - 1);
  // Never leave half of a surrogate pair (emoji) before the ellipsis.
  if (/[\ud800-\udbff]$/.test(cut)) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

/**
 * Plain text of one Anki field: line breaks from <br> and block tags, no other tags, entities decoded,
 * no [sound:…] or images, cloze markup reduced to its answer, whitespace collapsed (single newlines kept),
 * at most ANKI_FIELD_CHARS characters (cut with «…»).
 */
export function cleanField(raw: string, { html = true }: CleanOptions = {}): string {
  let text = unwrapCloze(raw.replace(SOUND, ""));
  if (html) {
    text = text
      .replace(DROP_BLOCKS, "")
      .replace(COMMENT, "")
      .replace(IMG, "")
      .replace(/[\r\n]+/g, " ") // in HTML source a newline is just a space
      .replace(LINE_BREAK, "\n")
      .replace(TAG, "");
    text = decodeEntities(text);
  }
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .filter(Boolean);
  return truncate(lines.join("\n"), ANKI_FIELD_CHARS);
}

/**
 * Cleaned, non-empty fields of a note in note-type order, at most ANKI_FIELDS_MAX. A value without a
 * name (more values than names) is called «Поле N».
 */
export function cleanFields(names: readonly string[], rawValues: readonly string[], options?: CleanOptions): AnkiField[] {
  const fields: AnkiField[] = [];
  for (let i = 0; i < rawValues.length && fields.length < ANKI_FIELDS_MAX; i++) {
    const text = cleanField(rawValues[i] ?? "", options);
    if (!text) continue;
    fields.push({ name: names[i]?.trim() || `Поле ${i + 1}`, text });
  }
  return fields;
}
