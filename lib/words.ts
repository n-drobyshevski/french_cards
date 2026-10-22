// Word CRUD and review persistence. Every write stamps updated_at; the outbox middleware
// (lib/outbox.ts, installed in lib/db.ts) queues each written row for sync.
import { cleanCustomFields } from "./core/custom-fields";
import { buildWord, cleanText, directionsOf, type NewWordInput, type WordPatch } from "./core/words";
import { db, liveRows } from "./db";
import { cleanExamples } from "./examples";
import { fromSnapshot, grade, newReviewState, resetState, reviewStateId, type GradeResult, type Rating } from "./scheduler";
import type { Confidence, Direction, ReviewLog, ReviewState, Word } from "./types";

export { buildWord, cleanText, directionsOf, type NewWordInput, type WordFields, type WordPatch } from "./core/words";

export interface MoveRecord {
  word_id: string;
  from: string | null;
  to: string | null;
  from_source: Word["folder_source"];
  from_confidence: Confidence | null;
}

export interface MoveOptions {
  /** "user" (default) for manual moves; "auto" for automatic sorting, which skips user-placed words. */
  source?: Word["folder_source"];
  confidence?: Confidence | null;
}

const WRITE_TABLES = () => [db.words, db.review_state, db.review_log, db.outbox];

/**
 * Ensures live review_state rows exist for the words' directions (reviving soft-deleted ones with
 * their progress) and retires the others; one bulkGet and one bulkPut for the lot.
 */
async function syncStatesForWords(words: readonly Word[], now: Date): Promise<void> {
  if (words.length === 0) return;
  const iso = now.toISOString();
  const byId = new Map(words.map((w) => [w.id, w]));
  const cards = [...byId.values()].flatMap((word) => (["fr_ru", "ru_fr"] as const).map((direction) => ({ word, direction })));
  const existing = await db.review_state.bulkGet(cards.map((c) => reviewStateId(c.word.id, c.direction)));
  const writes: ReviewState[] = [];
  cards.forEach(({ word, direction }, i) => {
    const current = existing[i];
    const wanted = word.deleted_at === null && directionsOf(word).includes(direction);
    if (wanted && !current) writes.push(newReviewState(word.id, direction, now));
    else if (wanted && current && current.deleted_at !== null) writes.push({ ...current, deleted_at: null, updated_at: iso });
    else if (!wanted && current && current.deleted_at === null) writes.push({ ...current, deleted_at: iso, updated_at: iso });
  });
  await db.review_state.bulkPut(writes);
}

/** Adds a word plus its review cards (fr_ru, and ru_fr when both_directions). */
export async function addWord(input: NewWordInput, now: Date = new Date()): Promise<Word> {
  const [word] = await addWords([input], now);
  return word;
}

/**
 * Bulk add (screenshot/list import) in one transaction. Undo with `softDeleteWords(ids)`.
 * `statesFor` may hand in carried-over progress for a word (Anki import); its directions the
 * word doesn't have are ignored and missing ones start fresh.
 */
export async function addWords(
  inputs: readonly NewWordInput[],
  now: Date = new Date(),
  statesFor?: (word: Word, index: number) => readonly ReviewState[] | null,
): Promise<Word[]> {
  const words = inputs.map((i) => buildWord(i, now));
  if (words.length === 0) return [];
  await db.transaction("rw", WRITE_TABLES(), async () => {
    await db.words.bulkPut(words);
    const states = words.flatMap((w, i) => {
      const carried = statesFor?.(w, i) ?? [];
      return directionsOf(w).map((d) => {
        const found = carried.find((s) => s.direction === d);
        return found ? { ...found, id: reviewStateId(w.id, d), word_id: w.id, deleted_at: null } : newReviewState(w.id, d, now);
      });
    });
    await db.review_state.bulkPut(states);
  });
  return words;
}

/**
 * Edits a word. Changing `folder_id` without an explicit `folder_source` marks it as placed by
 * the user. Turning `both_directions` off soft-deletes the ru_fr card; turning it on again
 * revives it with its old progress.
 */
export async function updateWord(id: string, patch: WordPatch, now: Date = new Date()): Promise<Word> {
  return db.transaction("rw", WRITE_TABLES(), async () => {
    const current = await db.words.get(id);
    if (!current || current.deleted_at !== null) throw new Error("Слово не найдено");
    const next = applyWordPatch(current, patch, now);
    await db.words.put(next);
    if (next.both_directions !== current.both_directions) await syncStatesForWords([next], now);
    return next;
  });
}

/** The word after `patch` (cleaned like `addWord`'s input). Throws on an empty fr or ru. */
export function applyWordPatch(current: Word, patch: WordPatch, now: Date): Word {
  const next: Word = { ...current, ...patch, id: current.id, updated_at: now.toISOString() };
  if ("fr" in patch) {
    const fr = cleanText(patch.fr);
    if (!fr) throw new Error("Пустое французское слово");
    next.fr = fr;
  }
  if ("ru" in patch) {
    const ru = cleanText(patch.ru);
    if (!ru) throw new Error("Пустой перевод");
    next.ru = ru;
  }
  for (const key of ["note", "example_fr", "example_ru"] as const) {
    if (key in patch) next[key] = cleanText(patch[key]);
  }
  if ("extra_examples" in patch) next.extra_examples = cleanExamples(patch.extra_examples);
  if ("custom_fields" in patch) next.custom_fields = cleanCustomFields(patch.custom_fields);
  if (patch.tags) next.tags = [...new Set(patch.tags.map((t) => t.trim()).filter(Boolean))];
  if ("folder_id" in patch && patch.folder_id !== current.folder_id) {
    if (patch.folder_source === undefined) next.folder_source = "user";
    if (patch.folder_confidence === undefined) next.folder_confidence = null;
  }
  if (next.folder_id === null) next.folder_confidence = null;
  return next;
}

/**
 * Patches several words in one transaction (one bulkGet, one bulkPut); words deleted meanwhile
 * are skipped. Several patches to one word apply in order, as consecutive `updateWord`s would.
 */
export async function updateWords(
  patches: readonly { id: string; patch: WordPatch }[],
  now: Date = new Date(),
): Promise<Word[]> {
  if (patches.length === 0) return [];
  return db.transaction("rw", WRITE_TABLES(), async () => {
    const stored = await db.words.bulkGet(patches.map((p) => p.id));
    const before = new Map<string, Word>();
    const latest = new Map<string, Word>();
    const out: Word[] = [];
    patches.forEach(({ id, patch }, i) => {
      const current = latest.get(id) ?? stored[i];
      if (!current || current.deleted_at !== null) return;
      if (!before.has(id)) before.set(id, current);
      const next = applyWordPatch(current, patch, now);
      latest.set(id, next);
      out.push(next);
    });
    if (latest.size === 0) return out;
    await db.words.bulkPut([...latest.values()]);
    await syncStatesForWords(
      [...latest.values()].filter((w) => w.both_directions !== before.get(w.id)!.both_directions),
      now,
    );
    return out;
  });
}

export async function softDeleteWord(id: string, now: Date = new Date()): Promise<void> {
  await softDeleteWords([id], now);
}

/** Soft-deletes words and their review cards. Undo with `restoreWords(ids)`. */
export async function softDeleteWords(ids: readonly string[], now: Date = new Date()): Promise<void> {
  if (ids.length === 0) return;
  const iso = now.toISOString();
  await db.transaction("rw", WRITE_TABLES(), async () => {
    const words = (await db.words.bulkGet([...ids])).filter((w): w is Word => !!w && w.deleted_at === null);
    if (words.length === 0) return;
    await db.words.bulkPut(words.map((w) => ({ ...w, deleted_at: iso, updated_at: iso })));
    const states = await db.review_state
      .where("word_id")
      .anyOf(words.map((w) => w.id))
      .filter((s) => s.deleted_at === null)
      .toArray();
    await db.review_state.bulkPut(states.map((s) => ({ ...s, deleted_at: iso, updated_at: iso })));
  });
}

/** Undoes `softDeleteWords`: revives the words and the cards for their directions. */
export async function restoreWords(ids: readonly string[], now: Date = new Date()): Promise<void> {
  if (ids.length === 0) return;
  const iso = now.toISOString();
  await db.transaction("rw", WRITE_TABLES(), async () => {
    const words = (await db.words.bulkGet([...ids])).filter((w): w is Word => !!w && w.deleted_at !== null);
    const restored = words.map((w) => ({ ...w, deleted_at: null, updated_at: iso }));
    await db.words.bulkPut(restored);
    await syncStatesForWords(restored, now);
  });
}

/**
 * Moves words to a folder (null = «Входящие»). Manual moves set folder_source "user".
 * With `source: "auto"` words the user placed by hand are skipped.
 * Returns what changed; pass it to `restoreMoves` to undo.
 */
export async function moveWords(
  ids: readonly string[],
  folderId: string | null,
  opts: MoveOptions = {},
  now: Date = new Date(),
): Promise<MoveRecord[]> {
  const source = opts.source ?? "user";
  const iso = now.toISOString();
  return db.transaction("rw", WRITE_TABLES(), async () => {
    const words = (await db.words.bulkGet([...ids])).filter((w): w is Word => !!w && w.deleted_at === null);
    const records: MoveRecord[] = [];
    const updated: Word[] = [];
    for (const w of words) {
      if (source === "auto" && w.folder_source === "user") continue;
      const confidence = folderId === null ? null : source === "auto" ? (opts.confidence ?? null) : null;
      if (w.folder_id === folderId && w.folder_source === source && w.folder_confidence === confidence) continue;
      records.push({
        word_id: w.id,
        from: w.folder_id,
        to: folderId,
        from_source: w.folder_source,
        from_confidence: w.folder_confidence,
      });
      updated.push({ ...w, folder_id: folderId, folder_source: source, folder_confidence: confidence, updated_at: iso });
    }
    await db.words.bulkPut(updated);
    return records;
  });
}

/** Undoes `moveWords` (or a reorg run's moves when given full MoveRecords). */
export async function restoreMoves(records: readonly MoveRecord[], now: Date = new Date()): Promise<void> {
  if (records.length === 0) return;
  const iso = now.toISOString();
  await db.transaction("rw", WRITE_TABLES(), async () => {
    const updated: Word[] = [];
    const words = await db.words.bulkGet(records.map((r) => r.word_id));
    records.forEach((r, i) => {
      const w = words[i];
      if (!w || w.deleted_at !== null) return;
      updated.push({
        ...w,
        folder_id: r.from,
        folder_source: r.from_source,
        folder_confidence: r.from === null ? null : r.from_confidence,
        updated_at: iso,
      });
    });
    await db.words.bulkPut(updated);
  });
}

/**
 * Resets a word's cards (one direction, or all) to New. Review history is kept.
 * Returns the previous states; pass them to `restoreReviewStates` to undo.
 */
export async function resetProgress(wordId: string, direction?: Direction, now: Date = new Date()): Promise<ReviewState[]> {
  return db.transaction("rw", WRITE_TABLES(), async () => {
    const states = await db.review_state
      .where("word_id")
      .equals(wordId)
      .filter((s) => s.deleted_at === null && (direction === undefined || s.direction === direction))
      .toArray();
    await db.review_state.bulkPut(states.map((s) => resetState(s, now)));
    return states;
  });
}

export async function restoreReviewStates(states: readonly ReviewState[], now: Date = new Date()): Promise<void> {
  if (states.length === 0) return;
  const iso = now.toISOString();
  await db.transaction("rw", WRITE_TABLES(), async () => {
    await db.review_state.bulkPut(states.map((s) => ({ ...s, updated_at: iso })));
  });
}

/** Grades a card and persists the new state plus an append-only log row (with the undo snapshot). */
export async function gradeCard(
  wordId: string,
  direction: Direction,
  rating: Rating,
  now: Date = new Date(),
): Promise<GradeResult> {
  return db.transaction("rw", WRITE_TABLES(), async () => {
    const word = await db.words.get(wordId);
    if (!word || word.deleted_at !== null) throw new Error("Слово не найдено");
    const id = reviewStateId(wordId, direction);
    let current = await db.review_state.get(id);
    if (!current || current.deleted_at !== null) current = newReviewState(wordId, direction, now);
    const result = grade(current, rating, now);
    await db.review_state.put(result.state);
    await db.review_log.add(result.log);
    return result;
  });
}

/** Latest live review (optionally for one card) — what «Отменить» would undo. */
export async function getLastReview(filter: { wordId?: string; direction?: Direction } = {}): Promise<ReviewLog | undefined> {
  return db.review_log
    .orderBy("review")
    .reverse()
    .filter(
      (l) =>
        l.deleted_at === null &&
        (filter.wordId === undefined || l.word_id === filter.wordId) &&
        (filter.direction === undefined || l.direction === filter.direction),
    )
    .first();
}

/**
 * Undoes the most recent review: restores the card from the log's `prev` snapshot and
 * tombstones the log row (deleted_at), so it no longer counts for today. Returns the undone
 * log and the restored state, or null when there is nothing to undo.
 */
export async function undoLastReview(
  filter: { wordId?: string; direction?: Direction } = {},
  now: Date = new Date(),
): Promise<{ log: ReviewLog; state: ReviewState | null } | null> {
  return db.transaction("rw", WRITE_TABLES(), async () => {
    const log = await getLastReview(filter);
    if (!log) return null;
    const iso = now.toISOString();
    const tomb: ReviewLog = { ...log, deleted_at: iso, updated_at: iso };
    await db.review_log.put(tomb);
    let state: ReviewState | null = null;
    if (log.prev) {
      state = fromSnapshot(log.prev, now);
      const word = await db.words.get(log.word_id);
      if (word?.deleted_at) state.deleted_at = word.deleted_at;
      await db.review_state.put(state);
    }
    return { log: tomb, state };
  });
}

export async function getWord(id: string): Promise<Word | undefined> {
  const w = await db.words.get(id);
  return w && w.deleted_at === null ? w : undefined;
}

/** Live review cards of a word, fr_ru first. */
export async function getWordStates(wordId: string): Promise<ReviewState[]> {
  const states = await db.review_state.where("word_id").equals(wordId).filter((s) => s.deleted_at === null).toArray();
  return states.sort((a, b) => (a.direction === b.direction ? 0 : a.direction === "fr_ru" ? -1 : 1));
}

/** Review history of a word, newest first (for the Word-Detail strip). */
export async function getWordHistory(wordId: string, limit = 8): Promise<ReviewLog[]> {
  const logs = await db.review_log.where("word_id").equals(wordId).filter((l) => l.deleted_at === null).toArray();
  return logs.sort((a, b) => b.review.localeCompare(a.review)).slice(0, limit);
}

/**
 * Live words, optionally in one folder, newest first. `null` = «Входящие», which also holds
 * words whose folder no longer exists.
 */
export async function listWords(folderId?: string | null): Promise<Word[]> {
  let words: Word[];
  if (folderId === null) {
    const [all, folders] = await Promise.all([liveRows(db.words), liveRows(db.folders)]);
    const live = new Set(folders.map((f) => f.id));
    words = all.filter((w) => w.folder_id === null || !live.has(w.folder_id));
  } else if (folderId !== undefined) {
    words = (await db.words.where("folder_id").equals(folderId).toArray()).filter((w) => w.deleted_at === null);
  } else {
    words = await liveRows(db.words);
  }
  return words.sort((a, b) => b.created_at.localeCompare(a.created_at));
}
