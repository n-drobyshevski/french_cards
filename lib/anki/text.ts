// Anki «Notes in Plain Text» exports (.txt) and hand-made .csv/.tsv: optional `#key:value` header lines,
// then one note per row. No scheduling, so the deck carries no progress.
import { cleanFields } from "./clean";
import type { AnkiDeck, AnkiDeckInfo, AnkiNote } from "./types";

/** Deck name when the file names none. */
export const TEXT_DEFAULT_DECK = "Импорт";

const SEPARATOR_NAMES: Record<string, string> = {
  tab: "\t",
  comma: ",",
  semicolon: ";",
  pipe: "|",
  space: " ",
  colon: ":",
};

interface Header {
  separator: string | null;
  html: boolean;
  /** 0-based column indexes of the special columns. */
  tags: number | null;
  deck: number | null;
  notetype: number | null;
  guid: number | null;
  columns: string[] | null;
  /** `#deck:` / `#tags:` — apply to every row. */
  deckName: string | null;
  extraTags: string[];
}

const HEADER_LINE = /^#([a-zA-Z][a-zA-Z ]*):(.*)$/;

function parseSeparator(value: string): string | null {
  const v = value.trim();
  if (!v) return value.length > 0 ? value[0] : null; // «#separator: » is a space
  return SEPARATOR_NAMES[v.toLowerCase()] ?? v[0];
}

function columnIndex(value: string): number | null {
  const n = parseInt(value.trim(), 10);
  return Number.isInteger(n) && n >= 1 ? n - 1 : null;
}

/** Reads the leading `#key:value` lines; returns the header and where the rows start. */
function readHeader(text: string): { header: Header; body: string } {
  const header: Header = {
    separator: null,
    html: true,
    tags: null,
    deck: null,
    notetype: null,
    guid: null,
    columns: null,
    deckName: null,
    extraTags: [],
  };
  let rawColumns: string | null = null;
  let pos = 0;
  while (pos < text.length) {
    const end = text.indexOf("\n", pos);
    const line = (end === -1 ? text.slice(pos) : text.slice(pos, end)).replace(/\r$/, "");
    const match = HEADER_LINE.exec(line);
    if (!match) break;
    const key = match[1].trim().toLowerCase();
    const value = match[2];
    if (key === "separator") header.separator = parseSeparator(value);
    else if (key === "html") header.html = value.trim().toLowerCase() !== "false";
    else if (key === "tags column") header.tags = columnIndex(value);
    else if (key === "deck column") header.deck = columnIndex(value);
    else if (key === "notetype column") header.notetype = columnIndex(value);
    else if (key === "guid column") header.guid = columnIndex(value);
    else if (key === "columns") rawColumns = value;
    else if (key === "deck") header.deckName = value.trim() || null;
    else if (key === "tags") header.extraTags = splitTags(value);
    pos = end === -1 ? text.length : end + 1;
  }
  const body = text.slice(pos);
  header.separator ??= sniffSeparator(body);
  if (rawColumns !== null) header.columns = parseRows(rawColumns, header.separator)[0] ?? null;
  return { header, body };
}

/** Tab, else semicolon, else comma — whichever the first rows contain. */
function sniffSeparator(body: string): string {
  const sample = body.split("\n", 5).join("\n");
  if (sample.includes("\t")) return "\t";
  if (sample.includes(";")) return ";";
  return ",";
}

/**
 * CSV rows with `"`-quoting: a field starting with a quote runs to the closing quote, `""` inside is a
 * literal quote and newlines inside are kept. Blank lines are skipped.
 */
export function parseRows(text: string, separator: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let atFieldStart = true;
  const endRow = () => {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
    field = "";
    atFieldStart = true;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && atFieldStart) {
      quoted = true;
      atFieldStart = false;
    } else if (ch === separator) {
      row.push(field);
      field = "";
      atFieldStart = true;
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endRow();
    } else {
      field += ch;
      atFieldStart = false;
    }
  }
  if (field !== "" || row.length > 0) endRow();
  return rows;
}

function splitTags(value: string): string[] {
  return value.split(/\s+/).filter(Boolean);
}

/** Parses an Anki plain-text export (or a simple CSV/TSV of notes) into a deck without progress. */
export function readAnkiText(text: string): AnkiDeck {
  const { header, body } = readHeader(text.replace(/^\uFEFF/, ""));
  const separator = header.separator ?? ",";
  const special = new Set([header.tags, header.deck, header.notetype, header.guid].filter((c): c is number => c !== null));

  const notes: AnkiNote[] = [];
  const usedIds = new Set<string>();
  parseRows(body, separator).forEach((cells, rowIndex) => {
    const names: string[] = [];
    const values: string[] = [];
    cells.forEach((cell, col) => {
      if (special.has(col)) return;
      names.push(header.columns?.[col]?.trim() || `Поле ${values.length + 1}`);
      values.push(cell);
    });
    const fields = cleanFields(names, values, { html: header.html });
    if (fields.length === 0) return;

    const deckName = (header.deck !== null ? cells[header.deck]?.trim() : "") || header.deckName || TEXT_DEFAULT_DECK;
    let id = (header.guid !== null ? cells[header.guid]?.trim() : "") || `row${rowIndex + 1}`;
    while (usedIds.has(id)) id = `${id}+`;
    usedIds.add(id);
    const tags = [...header.extraTags, ...(header.tags !== null ? splitTags(cells[header.tags] ?? "") : [])];
    notes.push({ id, deckId: deckName, fields, tags: [...new Set(tags)], cards: [], templates: 0 });
  });

  const counts = new Map<string, number>();
  for (const note of notes) counts.set(note.deckId, (counts.get(note.deckId) ?? 0) + 1);
  const decks: AnkiDeckInfo[] = [...counts].map(([id, count]) => ({ id, name: id, count }));
  return { crt: null, decks, notes, hasProgress: false };
}
