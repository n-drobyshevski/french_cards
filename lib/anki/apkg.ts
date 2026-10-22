// Reads Anki packages (.apkg / .colpkg) on the device: unzips only the collection (never the media),
// opens it with sql.js (SQLite in WebAssembly, loaded on first use) and returns its notes, decks and
// card scheduling as an AnkiDeck. Handles both the legacy schema (note types and decks as JSON in `col`)
// and schema 18 (Anki 2.1.50+: `notetypes`, `fields`, `templates`, `decks` tables, zstd-compressed
// collection.anki21b).
import { unzipSync } from "fflate";
import { decompress as zstdDecompress } from "fzstd";
import type { Database, SqlJsStatic, SqlValue } from "sql.js";
import { cleanFields } from "./clean";
import { AnkiReadError } from "./errors";
import { readAnkiText } from "./text";
import { ANKI_MAX_FILE_BYTES, type AnkiCard, type AnkiDeck, type AnkiDeckInfo, type AnkiNote } from "./types";

export { AnkiReadError, type AnkiReadErrorCode } from "./errors";

/** Where the browser fetches sql.js's WebAssembly (copied from node_modules by scripts/copy-sqljs.mjs). */
export const SQL_WASM_URL = "/vendor/sql-wasm.wasm";

/** Collection files by preference; newer Anki also adds a dummy collection.anki2 for old versions. */
const COLLECTIONS = ["collection.anki21b", "collection.anki21", "collection.anki2"] as const;
type CollectionName = (typeof COLLECTIONS)[number];

const TEXT_EXTENSIONS = new Set(["txt", "csv", "tsv"]);
const PACKAGE_EXTENSIONS = new Set(["apkg", "colpkg"]);

export interface ReadApkgOptions {
  /** URL of sql-wasm.wasm in the browser (default SQL_WASM_URL). */
  locateWasm?: string;
  /** A ready sql.js instance (node tests: `await initSqlJs()`); skips the lazy load. */
  SQL?: SqlJsStatic;
}

type InitSqlJs = typeof import("sql.js").default;

let sqlPromise: Promise<SqlJsStatic> | null = null;

/** Loads sql.js once per page; a failed load (offline) is retried on the next import. */
function loadSql(locateWasm: string): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = import("sql.js").then((mod) => {
      // CommonJS interop differs between bundlers: the init function is the default export or the module.
      const init: InitSqlJs = typeof mod.default === "function" ? mod.default : (mod as unknown as InitSqlJs);
      return init({ locateFile: () => locateWasm });
    });
    sqlPromise.catch(() => {
      sqlPromise = null;
    });
  }
  return sqlPromise;
}

const toBytes = (data: Uint8Array | ArrayBuffer) => (data instanceof Uint8Array ? data : new Uint8Array(data));

const num = (v: SqlValue | undefined): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};

const str = (v: SqlValue | undefined): string =>
  typeof v === "string" ? v : v instanceof Uint8Array ? new TextDecoder().decode(v) : v == null ? "" : String(v);

function rows(db: Database, sql: string, params?: SqlValue[]): SqlValue[][] {
  return db.exec(sql, params)[0]?.values ?? [];
}

const hasTable = (db: Database, name: string) =>
  rows(db, "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", [name]).length > 0;

/**
 * Schema 18 declares name columns `COLLATE unicase`, a collation only Anki registers; SQLite then refuses
 * to read those tables («no query solution»). The schema text is rewritten in memory without it — the
 * reader only scans, so the index order it implies does not matter.
 */
function dropUnicase(db: Database): void {
  const affected = rows(db, "SELECT name, sql FROM sqlite_master WHERE sql LIKE '%unicase%'");
  if (affected.length === 0) return;
  db.run("PRAGMA writable_schema = ON");
  for (const [name, sql] of affected) {
    db.run("UPDATE sqlite_master SET sql = ? WHERE name = ?", [str(sql).replace(/\s+collate\s+unicase\b/gi, ""), str(name)]);
  }
  db.run("PRAGMA writable_schema = RESET");
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

interface NoteType {
  /** Field names in order. */
  fields: string[];
  /** Card templates; 0 for cloze. */
  templates: number;
}

/** Legacy schema: `col.models` and `col.decks` are JSON objects keyed by id. */
function legacyMeta(db: Database): { types: Map<string, NoteType>; decks: Map<string, string> } {
  const [models, decks] = rows(db, "SELECT models, decks FROM col")[0] ?? [];
  const types = new Map<string, NoteType>();
  const modelsJson = parseJson(str(models));
  if (isRecord(modelsJson)) {
    for (const [id, model] of Object.entries(modelsJson)) {
      if (!isRecord(model)) continue;
      const flds = Array.isArray(model.flds) ? model.flds.filter(isRecord) : [];
      const ord = (f: Record<string, unknown>) => (typeof f.ord === "number" ? f.ord : 0);
      flds.sort((a, b) => ord(a) - ord(b));
      const tmpls = Array.isArray(model.tmpls) ? model.tmpls.length : 0;
      types.set(String(model.id ?? id), {
        fields: flds.map((f) => (typeof f.name === "string" ? f.name : "")),
        templates: model.type === 1 ? 0 : tmpls,
      });
    }
  }
  const deckNames = new Map<string, string>();
  const decksJson = parseJson(str(decks));
  if (isRecord(decksJson)) {
    for (const [id, deck] of Object.entries(decksJson)) {
      if (isRecord(deck) && typeof deck.name === "string") deckNames.set(String(deck.id ?? id), deck.name);
    }
  }
  return { types, decks: deckNames };
}

/** Reads a protobuf varint; `next` runs past the end when the bytes are cut off. */
function readVarint(bytes: Uint8Array, pos: number): { value: number; next: number } {
  let value = 0;
  let scale = 1;
  while (pos < bytes.length) {
    const byte = bytes[pos++];
    value += (byte & 0x7f) * scale;
    if (byte < 0x80) return { value, next: pos };
    scale *= 128;
  }
  return { value, next: bytes.length + 1 };
}

/** `Notetype.Config.kind` (protobuf field 1, varint; 1 = cloze) from notetypes.config, 0 when absent. */
export function notetypeKind(config: Uint8Array): number {
  let pos = 0;
  while (pos < config.length) {
    const key = readVarint(config, pos);
    const field = Math.floor(key.value / 8);
    const wire = key.value % 8;
    pos = key.next;
    if (wire === 0) {
      const v = readVarint(config, pos);
      if (field === 1) return v.value;
      pos = v.next;
    } else if (wire === 2) {
      const len = readVarint(config, pos);
      pos = len.next + len.value;
    } else if (wire === 1) pos += 8;
    else if (wire === 5) pos += 4;
    else return 0;
  }
  return 0;
}

const CLOZE_MARKUP = /\{\{c\d+::/;

/**
 * Schema 18: note types from `notetypes` / `fields` / `templates`, deck names from `decks` (path parts
 * joined by \x1f). A note type counts as cloze when its config says so (kind = 1) or, should the config
 * not decode, when it has a single template and either its notes contain {{c1::…}} markup or its fields
 * are the stock cloze «Text» + «Back Extra».
 */
function v18Meta(db: Database, rawNotes: SqlValue[][]): { types: Map<string, NoteType>; decks: Map<string, string> } {
  const fieldRows = rows(db, "SELECT ntid, ord, name FROM fields").map(([ntid, ord, name]) => ({
    ntid: str(ntid),
    ord: num(ord),
    name: str(name),
  }));
  fieldRows.sort((a, b) => a.ord - b.ord);
  const templateCounts = new Map(
    rows(db, "SELECT ntid, count(*) FROM templates GROUP BY ntid").map(([id, n]) => [str(id), num(n)]),
  );
  const clozeMarkup = new Set<string>();
  for (const [, mid, flds] of rawNotes) if (CLOZE_MARKUP.test(str(flds))) clozeMarkup.add(str(mid));

  const types = new Map<string, NoteType>();
  for (const [idValue, config] of rows(db, "SELECT id, config FROM notetypes")) {
    const id = str(idValue);
    const fields = fieldRows.filter((f) => f.ntid === id).map((f) => f.name);
    const templates = templateCounts.get(id) ?? 0;
    const kind = config instanceof Uint8Array ? notetypeKind(config) : 0;
    const stockCloze = fields.includes("Text") && fields.includes("Back Extra");
    const cloze = kind === 1 || (templates <= 1 && (clozeMarkup.has(id) || stockCloze));
    types.set(id, { fields, templates: cloze ? 0 : templates });
  }
  const decks = new Map(
    rows(db, "SELECT id, name FROM decks").map(([id, name]) => [str(id), str(name).split("\x1f").join("::")]),
  );
  return { types, decks };
}

function toCardType(v: number): AnkiCard["type"] {
  return v === 1 || v === 2 || v === 3 ? v : 0;
}

/** Card `data` JSON: FSRS memory state {"s": stability, "d": difficulty}; often "" or "{}". */
function parseCardData(data: string): { fsrs: AnkiCard["fsrs"]; lastReviewSec: number | null } {
  const json = data ? parseJson(data) : null;
  if (!isRecord(json)) return { fsrs: null, lastReviewSec: null };
  const { s, d, lrt } = json;
  const fsrs =
    typeof s === "number" && typeof d === "number" && Number.isFinite(s) && Number.isFinite(d) && s > 0
      ? { stability: s, difficulty: d }
      : null;
  return { fsrs, lastReviewSec: typeof lrt === "number" && lrt > 0 ? lrt : null };
}

function readCollection(db: Database, name: CollectionName): AnkiDeck {
  dropUnicase(db);
  const crtValue = rows(db, "SELECT crt FROM col")[0]?.[0];
  if (crtValue === undefined) throw new AnkiReadError("broken");
  const crt = num(crtValue);

  const rawNotes = rows(db, "SELECT id, mid, flds, tags FROM notes ORDER BY id");
  // Anki ≥ 2.1.50 exports carry a stand-in collection.anki2 whose single note asks to update Anki; it is
  // only read when the package has no newer collection we understand.
  if (name === "collection.anki2" && rawNotes.length === 1 && /update/i.test(str(rawNotes[0][2]))) {
    throw new AnkiReadError("old_format");
  }
  const meta = hasTable(db, "notetypes") ? v18Meta(db, rawNotes) : legacyMeta(db);

  const lastReview = new Map(rows(db, "SELECT cid, max(id) FROM revlog GROUP BY cid").map(([cid, id]) => [str(cid), num(id)]));
  const cardsByNote = new Map<string, { did: string; card: AnkiCard }[]>();
  const cardRows = rows(db, "SELECT id, nid, did, ord, type, queue, due, ivl, factor, reps, lapses, odid, odue, data FROM cards");
  for (const [id, nid, did, ord, type, queue, due, ivl, factor, reps, lapses, odid, odue, data] of cardRows) {
    // A card in a filtered deck keeps its home deck and real due date in odid / odue.
    const filtered = num(odid) !== 0;
    const { fsrs, lastReviewSec } = parseCardData(str(data));
    const card: AnkiCard = {
      ord: num(ord),
      type: toCardType(num(type)),
      queue: num(queue),
      due: filtered && num(odue) !== 0 ? num(odue) : num(due),
      ivl: num(ivl),
      factor: num(factor),
      reps: num(reps),
      lapses: num(lapses),
      fsrs,
      lastReviewMs: lastReview.get(str(id)) ?? (lastReviewSec !== null ? lastReviewSec * 1000 : null),
    };
    const list = cardsByNote.get(str(nid)) ?? [];
    list.push({ did: str(filtered ? odid : did), card });
    cardsByNote.set(str(nid), list);
  }

  const notes: AnkiNote[] = [];
  for (const [id, mid, flds, tags] of rawNotes) {
    const cards = cardsByNote.get(str(id));
    // A note without cards belongs to no deck (Anki would delete it on «Check database»).
    if (!cards || cards.length === 0) continue;
    cards.sort((a, b) => a.card.ord - b.card.ord);
    const type = meta.types.get(str(mid));
    const fields = cleanFields(type?.fields ?? [], str(flds).split("\x1f"));
    if (fields.length === 0) continue;
    notes.push({
      id: str(id),
      deckId: cards[0].did,
      fields,
      tags: str(tags).split(/\s+/).filter(Boolean),
      cards: cards.map((c) => c.card),
      templates: type?.templates ?? 0,
    });
  }

  const counts = new Map<string, number>();
  for (const note of notes) counts.set(note.deckId, (counts.get(note.deckId) ?? 0) + 1);
  const decks: AnkiDeckInfo[] = [...counts]
    .map(([id, count]) => ({ id, name: meta.decks.get(id) || `Колода ${id}`, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { crt, decks, notes, hasProgress: notes.some((n) => n.cards.some((c) => c.type !== 0)) };
}

/** Parses an .apkg / .colpkg. Throws AnkiReadError (not_anki, old_format, broken, too_big). */
export async function readApkg(data: Uint8Array | ArrayBuffer, opts: ReadApkgOptions = {}): Promise<AnkiDeck> {
  const bytes = toBytes(data);
  if (bytes.byteLength > ANKI_MAX_FILE_BYTES) throw new AnkiReadError("too_big");

  let files: Record<string, Uint8Array>;
  let unknownCollection = false;
  try {
    files = unzipSync(bytes, {
      // Media entries are never inflated: only the collection is read.
      filter: (file) => {
        const wanted = (COLLECTIONS as readonly string[]).includes(file.name);
        if (!wanted && file.name.startsWith("collection.")) unknownCollection = true;
        return wanted;
      },
    });
  } catch (error) {
    throw new AnkiReadError("not_anki", undefined, { cause: error });
  }
  const name = COLLECTIONS.find((n) => files[n]);
  if (!name) throw new AnkiReadError(unknownCollection ? "old_format" : "not_anki");

  let collection: Uint8Array;
  try {
    collection = name === "collection.anki21b" ? zstdDecompress(files[name]) : files[name];
  } catch (error) {
    throw new AnkiReadError("broken", undefined, { cause: error });
  }

  let SQL: SqlJsStatic;
  try {
    SQL = opts.SQL ?? (await loadSql(opts.locateWasm ?? SQL_WASM_URL));
  } catch (error) {
    throw new AnkiReadError(
      "broken",
      "Не получилось загрузить модуль для чтения Anki. Проверьте интернет и попробуйте ещё раз.",
      {
        cause: error,
      },
    );
  }

  let db: Database | null = null;
  try {
    db = new SQL.Database(collection);
    return readCollection(db, name);
  } catch (error) {
    if (error instanceof AnkiReadError) throw error;
    throw new AnkiReadError("broken", undefined, { cause: error });
  } finally {
    db?.close();
  }
}

const isZip = (head: Uint8Array) => head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;

/**
 * Reads a file the user picked: .apkg / .colpkg packages, .txt / .csv / .tsv text exports (an unknown
 * extension is read as a package when it is a zip). Throws AnkiReadError, also when it has no notes.
 */
export async function readAnkiFile(file: File, opts?: ReadApkgOptions): Promise<AnkiDeck> {
  if (file.size > ANKI_MAX_FILE_BYTES) throw new AnkiReadError("too_big");
  const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase() ?? "";
  let deck: AnkiDeck;
  if (PACKAGE_EXTENSIONS.has(ext)) deck = await readApkg(await file.arrayBuffer(), opts);
  else if (TEXT_EXTENSIONS.has(ext)) deck = readAnkiText(await file.text());
  else if (isZip(new Uint8Array(await file.slice(0, 4).arrayBuffer()))) deck = await readApkg(await file.arrayBuffer(), opts);
  else throw new AnkiReadError("not_anki");
  if (deck.notes.length === 0) throw new AnkiReadError("empty");
  return deck;
}
