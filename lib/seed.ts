// First-run seed: default folders, the prototype's 11 words, and words left in the old
// prototype's localStorage. Also parses the old prototype HTML for «Импорт из старой версии (HTML)».
import { db } from "./db";
import { defaultFolderId, ensureDefaultFolders, stableId } from "./folders";
import { newReviewState } from "./scheduler";
import { normalizeLemma } from "./text";
import { DEFAULT_SETTINGS, type Gender, type PartOfSpeech, type SlangLevel, type Word } from "./types";

/** Seed rows carry an old fixed timestamp so real edits from any device win the sync merge. */
export const SEED_TIMESTAMP = "2000-01-01T00:00:00.000Z";
export const LEGACY_STORAGE_KEY = "petit-argot-v1";
export const LEGACY_MIGRATED_KEY = "petit-argot-v1:migrated";

export interface SeedWord {
  fr: string;
  ru: string;
  note?: string;
  pos: PartOfSpeech;
  gender: Gender;
  slang_level: SlangLevel;
  verlan?: boolean;
  folder: string; // default folder slug
  /** The spelling used as a key in the prototype's localStorage. */
  legacy: string;
}

/** The 11 words of prototype/Petit_Argot.html, with slang levels and themes. */
export const PROTOTYPE_WORDS: readonly SeedWord[] = [
  { legacy: "Blague", fr: "une blague", ru: "шутка", pos: "noun", gender: "f", slang_level: 0, folder: "povsednevnoe" },
  { legacy: "Gras", fr: "le gras", ru: "жир", note: "Как прилагательное ещё и «жирный»", pos: "noun", gender: "m", slang_level: 0, folder: "eda" },
  { legacy: "Dépêche-toi", fr: "dépêche-toi", ru: "поторапливайся", pos: "expression", gender: "none", slang_level: 0, folder: "povsednevnoe" },
  { legacy: "Arrête", fr: "arrête", ru: "прекрати", pos: "expression", gender: "none", slang_level: 0, folder: "povsednevnoe" },
  { legacy: "Se casser", fr: "se casser", ru: "свалить, сбежать", note: "Ещё значит «сломаться». Casse-toi = грубое «свали»", pos: "verb", gender: "none", slang_level: 2, folder: "povsednevnoe" },
  { legacy: "Flics", fr: "les flics", ru: "копы", pos: "noun", gender: "m", slang_level: 1, folder: "politsiya" },
  { legacy: "Je vais me tuer", fr: "je vais me tuer", ru: "я сейчас сдохну", note: "Когда навалилось много дел, не буквально", pos: "expression", gender: "none", slang_level: 1, folder: "emotsii" },
  { legacy: "C'est dur", fr: "c'est dur", ru: "это тяжело", note: "Дословно «это твёрдо»", pos: "expression", gender: "none", slang_level: 0, folder: "emotsii" },
  { legacy: "Être dehors", fr: "être dehors", ru: "быть вне дома, на улице", pos: "verb", gender: "none", slang_level: 0, folder: "povsednevnoe" },
  { legacy: "Qu'est-ce qui se passe ?", fr: "qu'est-ce qui se passe ?", ru: "что происходит?", pos: "expression", gender: "none", slang_level: 0, folder: "povsednevnoe" },
  { legacy: "Vas-y", fr: "vas-y", ru: "давай", pos: "expression", gender: "none", slang_level: 1, folder: "povsednevnoe" },
];

export interface LegacyWord {
  fr: string;
  ru: string;
  note?: string | null;
}

/** Same id for the same lemma on every device. */
export const seedWordId = (fr: string) => stableId(`word:${normalizeLemma(fr)}`);

function seedTime(i: number): string {
  return new Date(Date.parse(SEED_TIMESTAMP) + i * 1000).toISOString();
}

function seedWordRow(s: SeedWord, i: number): Word {
  return {
    id: seedWordId(s.fr),
    fr: s.fr,
    ru: s.ru,
    note: s.note ?? null,
    example_fr: null,
    example_ru: null,
    pos: s.pos,
    gender: s.gender,
    slang_level: s.slang_level,
    verlan: s.verlan ?? false,
    tags: [],
    folder_id: defaultFolderId(s.folder),
    folder_source: "user",
    folder_confidence: null,
    source: "import",
    both_directions: true,
    created_at: seedTime(i),
    updated_at: SEED_TIMESTAMP,
    deleted_at: null,
  };
}

function legacyWordRow(w: LegacyWord, i: number, updatedAt: string): Word {
  const known = PROTOTYPE_WORDS.find((p) => normalizeLemma(p.legacy) === normalizeLemma(w.fr));
  if (known) return { ...seedWordRow(known, i), updated_at: updatedAt };
  return {
    id: seedWordId(w.fr),
    fr: w.fr.trim(),
    ru: w.ru.trim(),
    note: w.note?.trim() || null,
    example_fr: null,
    example_ru: null,
    pos: "other",
    gender: "none",
    slang_level: 0,
    verlan: false,
    tags: [],
    folder_id: null,
    folder_source: "auto",
    folder_confidence: null,
    source: "import",
    both_directions: true,
    created_at: updatedAt,
    updated_at: updatedAt,
    deleted_at: null,
  };
}

/**
 * Inserts words whose lemma is not in the library yet, each with fresh (New) cards in both
 * directions. Existing words and their progress are left alone. A word whose fixed id is only
 * left as a tombstone (deleted, or an undone import) is skipped, unless `revive` is set: an
 * explicit import then brings it back with fresh cards.
 */
async function insertWords(rows: Word[], stampedAt: string, revive = false): Promise<Word[]> {
  return db.transaction("rw", [db.words, db.review_state, db.outbox], async () => {
    const existing = new Set<string>();
    const liveIds = new Set<string>();
    const deletedIds = new Set<string>();
    await db.words.each((w) => {
      if (w.deleted_at === null) {
        existing.add(normalizeLemma(w.fr));
        liveIds.add(w.id);
      } else {
        deletedIds.add(w.id);
      }
    });
    const fresh: Word[] = [];
    const revived = new Set<string>();
    for (const row of rows) {
      const key = normalizeLemma(row.fr);
      if (!key || !row.ru.trim() || existing.has(key) || liveIds.has(row.id)) continue;
      if (deletedIds.has(row.id)) {
        if (!revive) continue;
        revived.add(row.id);
      }
      existing.add(key);
      liveIds.add(row.id);
      fresh.push(revived.has(row.id) ? { ...row, deleted_at: null, updated_at: stampedAt } : row);
    }
    const created = new Date(stampedAt);
    const states = fresh.flatMap((w) =>
      (w.both_directions ? (["fr_ru", "ru_fr"] as const) : (["fr_ru"] as const)).map((d) => ({
        ...newReviewState(w.id, d, created),
        updated_at: revived.has(w.id) ? stampedAt : w.updated_at,
      })),
    );
    await db.words.bulkPut(fresh);
    await db.review_state.bulkPut(states);
    return fresh;
  });
}

/** Adds the prototype's 11 words (skipping ones already present). */
export async function seedPrototypeWords(): Promise<Word[]> {
  return insertWords(PROTOTYPE_WORDS.map(seedWordRow), SEED_TIMESTAMP);
}

/**
 * Extracts the `WORDS` array from the old prototype HTML without evaluating it.
 * Accepts `{fr:"…", ru:"…", note:"…"}` entries with single or double quotes.
 */
export function parseLegacyHtml(html: string): LegacyWord[] {
  const start = html.search(/\bWORDS\s*=\s*\[/);
  if (start < 0) return [];
  const open = html.indexOf("[", start);
  const end = html.indexOf("];", open);
  const body = html.slice(open + 1, end < 0 ? undefined : end);
  const out: LegacyWord[] = [];
  for (const entry of body.match(/\{[^{}]*\}/g) ?? []) {
    const fields: Record<string, string> = {};
    const re = /["']?(\w+)["']?\s*:\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g;
    for (let m = re.exec(entry); m; m = re.exec(entry)) {
      fields[m[1]] = unescapeJs(m[2] ?? m[3] ?? "");
    }
    if (fields.fr?.trim() && fields.ru?.trim()) out.push({ fr: fields.fr, ru: fields.ru, note: fields.note ?? null });
  }
  return out;
}

function unescapeJs(s: string): string {
  return s.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (_, esc: string) => {
    if (esc.startsWith("u{")) return String.fromCodePoint(parseInt(esc.slice(2, -1), 16));
    if (esc[0] === "u" && esc.length === 5) return String.fromCharCode(parseInt(esc.slice(1), 16));
    if (esc[0] === "x" && esc.length === 3) return String.fromCharCode(parseInt(esc.slice(1), 16));
    return ({ n: "\n", t: "\t", r: "\r" } as Record<string, string>)[esc] ?? esc;
  });
}

/** Imports old-version words (progress is not carried over). Returns how many were added/skipped. */
export async function importLegacyWords(
  words: readonly LegacyWord[],
  now: Date = new Date(),
  { revive = false }: { revive?: boolean } = {},
): Promise<{ added: Word[]; skipped: number }> {
  const iso = now.toISOString();
  const rows = words.map((w, i) => {
    const row = legacyWordRow(w, i, iso);
    return { ...row, created_at: new Date(now.getTime() + i).toISOString() };
  });
  const added = await insertWords(rows, iso, revive);
  return { added, skipped: words.length - added.length };
}

/**
 * «Импорт из старой версии (HTML)»: parse the file text and import its words. Words deleted
 * earlier (or removed by «Отменить» after a previous import) come back.
 */
export async function importLegacyHtml(html: string, now: Date = new Date()) {
  return importLegacyWords(parseLegacyHtml(html), now, { revive: true });
}

interface LegacyState {
  cards?: Record<string, unknown>;
  words?: unknown;
  dir?: unknown;
}

/**
 * Reads the prototype's localStorage (`petit-argot-v1`). Its progress keys are French words;
 * those matching prototype words are imported (progress resets), and an optional `words`
 * array of {fr, ru, note} is imported too. Sets the default direction from `dir`.
 * Runs once per browser (marker key), and leaves the old key in place.
 */
export async function migrateLegacyStorage(
  storage: Pick<Storage, "getItem" | "setItem"> | undefined = typeof localStorage === "undefined" ? undefined : localStorage,
  now: Date = new Date(),
): Promise<{ added: number }> {
  if (!storage) return { added: 0 };
  let raw: string | null;
  try {
    if (storage.getItem(LEGACY_MIGRATED_KEY)) return { added: 0 };
    raw = storage.getItem(LEGACY_STORAGE_KEY);
  } catch {
    return { added: 0 };
  }
  if (!raw) return { added: 0 };
  let parsed: LegacyState;
  try {
    parsed = JSON.parse(raw) as LegacyState;
  } catch {
    parsed = {};
  }
  const items: LegacyWord[] = [];
  if (Array.isArray(parsed.words)) {
    for (const w of parsed.words as Partial<LegacyWord>[]) {
      if (w && typeof w.fr === "string" && typeof w.ru === "string") items.push({ fr: w.fr, ru: w.ru, note: w.note ?? null });
    }
  }
  if (parsed.cards && typeof parsed.cards === "object") {
    for (const key of Object.keys(parsed.cards)) {
      const known = PROTOTYPE_WORDS.find((p) => normalizeLemma(p.legacy) === normalizeLemma(key));
      if (known) items.push({ fr: known.legacy, ru: known.ru, note: known.note ?? null });
    }
  }
  const { added } = await importLegacyWords(items, now);
  if (parsed.dir === "ru") {
    const current = await db.settings.get("settings");
    await db.settings.put({ ...DEFAULT_SETTINGS, ...current, id: "settings", default_direction: "ru_fr" });
  }
  try {
    storage.setItem(LEGACY_MIGRATED_KEY, now.toISOString());
  } catch {
    // Storage may be read-only (private mode); the migration is idempotent anyway.
  }
  return { added: added.length };
}

/**
 * First-run setup, safe to call on every app start: until the settings row exists it creates
 * the default folders, adds the prototype words, migrates the old localStorage and finally
 * writes the default settings. The settings row is the "seeded" marker, so it is written last:
 * a run that is interrupted or fails part-way is retried on the next start (every step is
 * idempotent). Returns true if it seeded.
 */
export async function seedIfNeeded(
  storage?: Pick<Storage, "getItem" | "setItem">,
  now: Date = new Date(),
): Promise<boolean> {
  if (await db.settings.get("settings")) return false;
  await ensureDefaultFolders(SEED_TIMESTAMP);
  await seedPrototypeWords();
  await migrateLegacyStorage(storage ?? (typeof localStorage === "undefined" ? undefined : localStorage), now);
  return db.transaction("rw", db.settings, async () => {
    if (!(await db.settings.get("settings"))) await db.settings.put({ ...DEFAULT_SETTINGS });
    return true;
  });
}
