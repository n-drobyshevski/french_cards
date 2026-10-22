// Node-only test helper (unit tests and e2e): builds small Anki packages with sql.js, in the legacy
// schema (note types and decks as JSON in `col`) or in schema 18 (zstd-compressed collection.anki21b).
// Uses node:zlib — never import it from app code.
import { zipSync, type Zippable } from "fflate";
import { zstdCompressSync } from "node:zlib";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";

export interface FixtureModel {
  id: number;
  name?: string;
  fields: string[];
  /** Card templates (default 1). */
  templates?: number;
  cloze?: boolean;
}

export interface FixtureDeck {
  id: number;
  /** Subdecks joined with "::". */
  name: string;
}

export interface FixtureCard {
  ord?: number;
  /** Deck id (default FIXTURE_DECK.id). */
  did?: number;
  type?: 0 | 1 | 2 | 3;
  /** Default: the type (relearning → 1). */
  queue?: number;
  due?: number;
  ivl?: number;
  factor?: number;
  reps?: number;
  lapses?: number;
  /** Raw `cards.data`, e.g. '{"s":12.5,"d":4.2}'. */
  data?: string;
  odid?: number;
  odue?: number;
  /** revlog ids (review times, ms). */
  reviews?: number[];
}

export interface FixtureNote {
  id?: number;
  /** Note type id (default BASIC_MODEL.id). */
  mid?: number;
  fields: string[];
  tags?: string[];
  /** Default: one new card (ord 0) in FIXTURE_DECK. */
  cards?: FixtureCard[];
}

export interface CollectionSpec {
  SQL: SqlJsStatic;
  schema: "legacy" | "v18";
  notes: FixtureNote[];
  /** Default [BASIC_MODEL]. */
  models?: FixtureModel[];
  /** Default [DEFAULT_DECK, FIXTURE_DECK]. */
  decks?: FixtureDeck[];
  /** Collection creation (unix seconds, start of a day). */
  crt?: number;
}

export interface ApkgSpec extends CollectionSpec {
  /** Legacy schema only: the collection's file name (default collection.anki21). */
  legacyFile?: "collection.anki21" | "collection.anki2";
  /** Add the stand-in collection.anki2 newer Anki writes for old versions (default: unless legacyFile is anki2). */
  dummy?: boolean;
  /** Extra zip entries (media files are named "0", "1", …, plus a "media" JSON map). */
  media?: Record<string, Uint8Array>;
}

export const BASIC_MODEL: FixtureModel = { id: 1_342_697_561_419, name: "Basic", fields: ["Front", "Back"], templates: 1 };
export const DEFAULT_DECK: FixtureDeck = { id: 1, name: "Default" };
export const FIXTURE_DECK: FixtureDeck = { id: 1_700_000_000_001, name: "Français" };
/** 2023-11-14 04:00 UTC. */
export const FIXTURE_CRT = 1_699_934_400;

export const DUMMY_TEXT = "Please update to the latest Anki version, then import the .colpkg/.apkg file again.";

let sql: Promise<SqlJsStatic> | null = null;
/** sql.js for node (loads its WebAssembly from node_modules). */
export function loadNodeSql(): Promise<SqlJsStatic> {
  sql ??= initSqlJs();
  return sql;
}

const LEGACY_TABLES = `
CREATE TABLE col (id integer PRIMARY KEY, crt integer NOT NULL, mod integer NOT NULL, scm integer NOT NULL,
  ver integer NOT NULL, dty integer NOT NULL, usn integer NOT NULL, ls integer NOT NULL, conf text NOT NULL,
  models text NOT NULL, decks text NOT NULL, dconf text NOT NULL, tags text NOT NULL);
CREATE TABLE notes (id integer PRIMARY KEY, guid text NOT NULL, mid integer NOT NULL, mod integer NOT NULL,
  usn integer NOT NULL, tags text NOT NULL, flds text NOT NULL, sfld integer NOT NULL, csum integer NOT NULL,
  flags integer NOT NULL, data text NOT NULL);
CREATE TABLE cards (id integer PRIMARY KEY, nid integer NOT NULL, did integer NOT NULL, ord integer NOT NULL,
  mod integer NOT NULL, usn integer NOT NULL, type integer NOT NULL, queue integer NOT NULL, due integer NOT NULL,
  ivl integer NOT NULL, factor integer NOT NULL, reps integer NOT NULL, lapses integer NOT NULL, left integer NOT NULL,
  odue integer NOT NULL, odid integer NOT NULL, flags integer NOT NULL, data text NOT NULL);
CREATE TABLE revlog (id integer PRIMARY KEY, cid integer NOT NULL, usn integer NOT NULL, ease integer NOT NULL,
  ivl integer NOT NULL, lastIvl integer NOT NULL, factor integer NOT NULL, time integer NOT NULL, type integer NOT NULL);
CREATE TABLE graves (usn integer NOT NULL, oid integer NOT NULL, type integer NOT NULL);
`;

// As in Anki's schema 18, minus the `unicase` collation (added afterwards, see addUnicase).
const V18_TABLES = `
CREATE TABLE notetypes (id integer NOT NULL PRIMARY KEY, name text NOT NULL, mtime_secs integer NOT NULL,
  usn integer NOT NULL, config blob NOT NULL);
CREATE UNIQUE INDEX idx_notetypes_name ON notetypes (name);
CREATE TABLE fields (ntid integer NOT NULL, ord integer NOT NULL, name text NOT NULL, config blob NOT NULL,
  PRIMARY KEY (ntid, ord)) WITHOUT ROWID;
CREATE UNIQUE INDEX idx_fields_name_ntid ON fields (name, ntid);
CREATE TABLE templates (ntid integer NOT NULL, ord integer NOT NULL, name text NOT NULL, mtime_secs integer NOT NULL,
  usn integer NOT NULL, config blob NOT NULL, PRIMARY KEY (ntid, ord)) WITHOUT ROWID;
CREATE UNIQUE INDEX idx_templates_name_ntid ON templates (name, ntid);
CREATE TABLE decks (id integer PRIMARY KEY NOT NULL, name text NOT NULL, mtime_secs integer NOT NULL,
  usn integer NOT NULL, common blob NOT NULL, kind blob NOT NULL);
CREATE UNIQUE INDEX idx_decks_name ON decks (name);
`;

/** Real schema-18 files declare name columns COLLATE unicase, which sql.js cannot read without help. */
function addUnicase(db: Database): void {
  db.run("PRAGMA writable_schema = ON");
  db.run(
    "UPDATE sqlite_master SET sql = replace(sql, 'name text NOT NULL', 'name text NOT NULL COLLATE unicase') " +
      "WHERE type = 'table' AND name IN ('notetypes', 'fields', 'templates', 'decks')",
  );
  db.run("PRAGMA writable_schema = OFF");
}

/** Notetype.Config protobuf: kind (field 1) = 1 for cloze, then a css string (field 3). */
const notetypeConfig = (cloze: boolean) => new Uint8Array([...(cloze ? [0x08, 0x01] : []), 0x1a, 0x03, 0x61, 0x62, 0x63]);

/** The SQLite bytes of a collection. */
export function buildCollection(spec: CollectionSpec): Uint8Array {
  const { SQL, schema, notes } = spec;
  const models = spec.models ?? [BASIC_MODEL];
  const decks = spec.decks ?? [DEFAULT_DECK, FIXTURE_DECK];
  const crt = spec.crt ?? FIXTURE_CRT;
  const db = new SQL.Database();
  try {
    db.run(LEGACY_TABLES);
    const legacy = schema === "legacy";
    const modelsJson = Object.fromEntries(
      models.map((m) => [
        String(m.id),
        {
          id: m.id,
          name: m.name ?? `Model ${m.id}`,
          type: m.cloze ? 1 : 0,
          flds: m.fields.map((name, ord) => ({ name, ord })),
          tmpls: Array.from({ length: m.templates ?? 1 }, (_, ord) => ({ name: `Card ${ord + 1}`, ord })),
        },
      ]),
    );
    const decksJson = Object.fromEntries(decks.map((d) => [String(d.id), { id: d.id, name: d.name }]));
    db.run("INSERT INTO col VALUES (1, ?, 0, 0, ?, 0, 0, 0, '{}', ?, ?, '{}', '{}')", [
      crt,
      legacy ? 11 : 18,
      legacy ? JSON.stringify(modelsJson) : "",
      legacy ? JSON.stringify(decksJson) : "",
    ]);
    if (!legacy) {
      db.run(V18_TABLES);
      for (const m of models) {
        db.run("INSERT INTO notetypes VALUES (?, ?, 0, 0, ?)", [m.id, m.name ?? `Model ${m.id}`, notetypeConfig(!!m.cloze)]);
        m.fields.forEach((name, ord) => db.run("INSERT INTO fields VALUES (?, ?, ?, x'')", [m.id, ord, name]));
        for (let ord = 0; ord < (m.templates ?? 1); ord++) {
          db.run("INSERT INTO templates VALUES (?, ?, ?, 0, 0, x'')", [m.id, ord, `Card ${ord + 1}`]);
        }
      }
      for (const d of decks) db.run("INSERT INTO decks VALUES (?, ?, 0, 0, x'', x'')", [d.id, d.name.split("::").join("\x1f")]);
    }

    let cardId = 1_700_000_000_000;
    let position = 0;
    notes.forEach((note, i) => {
      const nid = note.id ?? 1_600_000_000_000 + i;
      const tags = note.tags?.length ? ` ${note.tags.join(" ")} ` : "";
      db.run("INSERT INTO notes VALUES (?, ?, ?, 0, 0, ?, ?, ?, 0, 0, '')", [
        nid,
        `guid${nid}`,
        note.mid ?? BASIC_MODEL.id,
        tags,
        note.fields.join("\x1f"),
        note.fields[0] ?? "",
      ]);
      for (const card of note.cards ?? [{}]) {
        const id = cardId++;
        const type = card.type ?? 0;
        db.run("INSERT INTO cards VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0, ?)", [
          id,
          nid,
          card.did ?? FIXTURE_DECK.id,
          card.ord ?? 0,
          type,
          card.queue ?? (type === 3 ? 1 : type),
          card.due ?? position++,
          card.ivl ?? 0,
          card.factor ?? (type === 0 ? 0 : 2500),
          card.reps ?? 0,
          card.lapses ?? 0,
          card.odue ?? 0,
          card.odid ?? 0,
          card.data ?? "",
        ]);
        for (const review of card.reviews ?? [])
          db.run("INSERT INTO revlog VALUES (?, ?, 0, 3, 1, 0, 2500, 5000, 1)", [review, id]);
      }
    });
    if (!legacy) addUnicase(db);
    return db.export();
  } finally {
    db.close();
  }
}

/** The stand-in collection.anki2 that Anki ≥ 2.1.50 adds to its exports. */
export function buildDummyCollection(SQL: SqlJsStatic): Uint8Array {
  return buildCollection({ SQL, schema: "legacy", notes: [{ fields: [DUMMY_TEXT, ""], cards: [{ did: DEFAULT_DECK.id }] }] });
}

/** A whole .apkg (zip) as Anki exports it. */
export function buildApkg(spec: ApkgSpec): Uint8Array<ArrayBuffer> {
  const collection = buildCollection(spec);
  const entries: Zippable = { ...spec.media };
  if (spec.schema === "v18") {
    const compressed = zstdCompressSync(collection);
    entries["collection.anki21b"] = new Uint8Array(compressed.buffer, compressed.byteOffset, compressed.byteLength);
  } else {
    entries[spec.legacyFile ?? "collection.anki21"] = collection;
  }
  const dummy = spec.dummy ?? !(spec.schema === "legacy" && spec.legacyFile === "collection.anki2");
  if (dummy) entries["collection.anki2"] = buildDummyCollection(spec.SQL);
  if (!entries.media) entries.media = new TextEncoder().encode("{}");
  return zipSync(entries);
}
