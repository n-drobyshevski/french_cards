// «Упражнения» on the device: the sets Claude wrote through the connector (synced table
// `exercise_sets`, content read-only here: the app only soft-deletes and restores them) and the
// runs played on this device (`exercise_runs`, one row upserted after every answer; the outbox
// coalesces the writes by `${table}:${id}`, so a run queues one push however many answers). A run
// is resumed only on the device that started it (`own_runs`, device-local): runs synced from
// another device show their result but are never written here.
// Exercises never touch review_state or review_log. Pure rules live in lib/core/exercises.ts.
import { useLiveQuery } from "dexie-react-hooks";
import { cleanLevels, countFirstTry, itemWordKeys, parseScope, playedItems, runItems, runSettled } from "./core/exercises";
import { isPaused, pausedFolderIds } from "./core/words";
import { db, liveRows, newId } from "./db";
import { isDueToday } from "./folders";
import { wordStatus } from "./scheduler";
import { findDuplicates, normalizeLemma } from "./text";
import type { ExerciseAnswer, ExerciseRun, ExerciseScope, ExerciseSet, Folder, ReviewState, Word } from "./types";
import { addWords, softDeleteWords, type NewWordInput } from "./words";

export * from "./core/exercises";

const byNewest = (a: ExerciseSet, b: ExerciseSet) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id);
const runsByNewest = (a: ExerciseRun, b: ExerciseRun) => b.started_at.localeCompare(a.started_at) || b.id.localeCompare(a.id);

/**
 * A set as the app reads it: rows synced before migration 0013 have no `scope`, before 0018 no
 * `levels` / `level_auto` (an old backup neither).
 */
const withScope = (set: ExerciseSet): ExerciseSet => {
  const levels = cleanLevels(set.levels);
  return { ...set, scope: parseScope(set.scope), levels, level_auto: levels.length > 0 && set.level_auto === true };
};

/** Live sets, newest first (use inside useLiveQuery). */
export async function liveSets(): Promise<ExerciseSet[]> {
  return (await liveRows(db.exercise_sets)).map(withScope).sort(byNewest);
}

/** Live sets, newest first; undefined while loading (so the empty state does not flash). */
export function useExerciseSets(): ExerciseSet[] | undefined {
  return useLiveQuery(() => liveSets(), []);
}

/** A live set, or undefined when it is missing or deleted. */
export async function getSet(id: string): Promise<ExerciseSet | undefined> {
  const set = await db.exercise_sets.get(id);
  return set && set.deleted_at === null ? withScope(set) : undefined;
}

export async function getRun(id: string): Promise<ExerciseRun | undefined> {
  const run = await db.exercise_runs.get(id);
  return run && run.deleted_at === null ? run : undefined;
}

/** Ids of the runs started on this device. */
export async function ownRunIds(): Promise<Set<string>> {
  return new Set(await db.own_runs.toCollection().primaryKeys());
}

/** A run is still to be played here: unfinished, started on this device, and not every item settled. */
const resumable = (run: ExerciseRun, set: Pick<ExerciseSet, "items">, own: ReadonlySet<string>) =>
  run.finished_at === null && own.has(run.id) && !runSettled(set, run);

/** The newest live run of a set (of `kind`, default the whole-set runs), finished or not. */
export async function latestRunFor(setId: string, kind: ExerciseRun["kind"] = "set"): Promise<ExerciseRun | undefined> {
  const runs = await db.exercise_runs.where("set_id").equals(setId).toArray();
  return runs.filter((r) => r.deleted_at === null && r.kind === kind).sort(runsByNewest)[0];
}

/** The newest whole-set run of a set that this device can resume, if any. */
export async function resumableRunFor(set: ExerciseSet): Promise<ExerciseRun | undefined> {
  const [runs, own] = await Promise.all([db.exercise_runs.where("set_id").equals(set.id).toArray(), ownRunIds()]);
  return runs.filter((r) => r.deleted_at === null && r.kind === "set" && resumable(r, set, own)).sort(runsByNewest)[0];
}

/** A run by id when this device can resume it. */
export async function getResumableRun(id: string, set: ExerciseSet): Promise<ExerciseRun | undefined> {
  const [run, own] = await Promise.all([getRun(id), ownRunIds()]);
  return run && run.set_id === set.id && resumable(run, set, own) ? run : undefined;
}

/** Per set id, its newest whole-set run: the list's progress line and «ПРЕРВАНО · 5/12» (use inside useLiveQuery). */
export async function lastRunBySet(): Promise<Map<string, ExerciseRun>> {
  const out = new Map<string, ExerciseRun>();
  for (const run of (await liveRows(db.exercise_runs)).sort(runsByNewest)) {
    if (run.kind === "set" && run.set_id && !out.has(run.set_id)) out.set(run.set_id, run);
  }
  return out;
}

export function useLastRunBySet(): Map<string, ExerciseRun> | undefined {
  return useLiveQuery(() => lastRunBySet(), []);
}

/** The runs started on this device (the tiles offer «Продолжить» only for these). */
export function useOwnRunIds(): Set<string> | undefined {
  return useLiveQuery(() => ownRunIds(), []);
}

/**
 * The newest unfinished run whose set is still live («Продолжить»), with its set: started on this
 * device, with something left to play (a run left on its last, answered card counts as finished).
 */
export async function unfinishedRun(): Promise<{ run: ExerciseRun; set: ExerciseSet } | undefined> {
  const [runs, sets, own] = await Promise.all([liveRows(db.exercise_runs), liveRows(db.exercise_sets), ownRunIds()]);
  const live = new Map(sets.map((s) => [s.id, withScope(s)]));
  const run = runs.filter((r) => r.set_id !== null && live.has(r.set_id) && resumable(r, live.get(r.set_id)!, own)).sort(runsByNewest)[0];
  return run ? { run, set: live.get(run.set_id!)! } : undefined;
}

/** How many words a scoped set («Трудные», «К повторению», «Трудные и к повторению») could draw on. */
export interface ScopeCounts {
  difficult: number;
  due: number;
  /** Words that are difficult or due (each counted once). */
  both: number;
}

/**
 * The words a scoped exercise set can use, counted like the library ledger («23 к повт. / 9
 * трудных», libraryStatsFrom): live words not «на паузе» (the word or its theme, isPaused);
 * difficult = wordStatus difficult, due = a non-new card due today (isDueToday); both = either.
 */
export function scopeCounts(
  words: readonly Word[],
  states: readonly ReviewState[],
  folders: readonly Pick<Folder, "id" | "muted" | "deleted_at">[],
  now: Date = new Date(),
): ScopeCounts {
  const statesByWord = new Map<string, ReviewState[]>();
  for (const s of states) {
    if (s.deleted_at !== null) continue;
    const list = statesByWord.get(s.word_id);
    if (list) list.push(s);
    else statesByWord.set(s.word_id, [s]);
  }
  const paused = pausedFolderIds(folders);
  const out: ScopeCounts = { difficult: 0, due: 0, both: 0 };
  for (const w of words) {
    if (w.deleted_at !== null || isPaused(w, paused)) continue;
    const ws = statesByWord.get(w.id) ?? [];
    const difficult = wordStatus(ws) === "difficult";
    const due = ws.some((s) => isDueToday(s, now));
    if (difficult) out.difficult++;
    if (due) out.due++;
    if (difficult || due) out.both++;
  }
  return out;
}

/**
 * The words a request would draw on, for «Авто»'s level (the connector's exercise_material does the
 * same): a scope's words (difficult and/or due today), else the words of the picked themes ("inbox"
 * = «Входящие»), else of every theme not «на паузе». Never words «на паузе» themselves.
 */
export function requestWords(
  words: readonly Word[],
  states: readonly ReviewState[],
  folders: readonly Pick<Folder, "id" | "muted" | "deleted_at">[],
  picked: readonly string[],
  scope: ExerciseScope | null,
  now: Date = new Date(),
): Word[] {
  const live = words.filter((w) => w.deleted_at === null && !w.muted);
  if (scope) {
    const paused = pausedFolderIds(folders);
    const statesByWord = new Map<string, ReviewState[]>();
    for (const s of states) if (s.deleted_at === null) statesByWord.set(s.word_id, [...(statesByWord.get(s.word_id) ?? []), s]);
    return live.filter((w) => {
      if (isPaused(w, paused)) return false;
      const ws = statesByWord.get(w.id) ?? [];
      const difficult = wordStatus(ws) === "difficult";
      const due = ws.some((s) => isDueToday(s, now));
      return scope === "difficult" ? difficult : scope === "due" ? due : difficult || due;
    });
  }
  const ids = new Set(folders.filter((f) => f.deleted_at === null).map((f) => f.id));
  const themeOf = (w: Word) => (w.folder_id !== null && ids.has(w.folder_id) ? w.folder_id : "inbox");
  if (picked.length > 0) return live.filter((w) => picked.includes(themeOf(w)));
  const paused = pausedFolderIds(folders);
  return live.filter((w) => !isPaused(w, paused));
}

/** `scopeCounts` over the device's live rows (use inside useLiveQuery). */
export async function getScopeCounts(now: Date = new Date()): Promise<ScopeCounts> {
  const [folders, words, states] = await Promise.all([liveRows(db.folders), liveRows(db.words), liveRows(db.review_state)]);
  return scopeCounts(words, states, folders, now);
}

/** Live counts for the scoped requests («Трудные · 9», «К повторению · 23»); undefined while loading. */
export function useScopeCounts(): ScopeCounts | undefined {
  return useLiveQuery(() => getScopeCounts(), []);
}

/** What playing a set needs from the library: its new words already saved, and its words deleted or paused since. */
export interface PlayContext {
  /** Refs of the set's new words already in the library (no intro card). */
  savedRefs: Set<string>;
  /** Library word ids deleted or «на паузе»: their items are not played. */
  blocked: Set<string>;
}

export async function playContext(set: ExerciseSet): Promise<PlayContext> {
  const refs = new Set(set.new_words.map((w) => w.ref));
  const ids = [...new Set(set.items.flatMap(itemWordKeys))].filter((k) => !refs.has(k));
  const [rows, saved] = await Promise.all([db.words.bulkGet(ids), savedNewWords(set)]);
  // A word not on this device yet (sync still pulling) is not blocked: only an explicit delete or pause is.
  const blocked = new Set(ids.filter((_, i) => !!rows[i] && (rows[i]!.deleted_at !== null || !!rows[i]!.muted)));
  return { savedRefs: new Set(saved.keys()), blocked };
}

/** Live (not deleted) library words by id: «Слово ›» and the done screen's links and meters. */
export async function liveWordsById(ids: readonly string[]): Promise<Map<string, Word>> {
  const unique = [...new Set(ids)];
  const rows = await db.words.bulkGet(unique);
  return new Map(rows.filter((w): w is Word => !!w && w.deleted_at === null).map((w) => [w.id, w]));
}

export function useLiveWords(ids: readonly string[]): Map<string, Word> | undefined {
  const key = [...new Set(ids)].sort().join(",");
  return useLiveQuery(() => liveWordsById(ids), [key]);
}

export interface StartRunOptions {
  /** set (default): every item; mistakes: «Повторить ошибки» over `itemIds`. */
  kind?: ExerciseRun["kind"];
  itemIds?: readonly string[];
}

/** Starts a run (saved at once, so × mid-round can resume it; marked as this device's). */
export async function startRun(set: ExerciseSet, opts: StartRunOptions = {}, now: Date = new Date()): Promise<ExerciseRun> {
  const iso = now.toISOString();
  const wanted = opts.itemIds ? new Set(opts.itemIds) : null;
  // Played items only: a selection of old register items alone plays nothing.
  const itemIds = wanted ? playedItems(set.items).filter((i) => wanted.has(i.id)).map((i) => i.id) : [];
  // item_ids [] means "every item": an explicit selection that matches nothing must not become the whole set.
  if (opts.itemIds && itemIds.length === 0) throw new Error("В наборе нет этих вопросов");
  const run: ExerciseRun = {
    id: newId(),
    set_id: set.id,
    kind: opts.kind ?? "set",
    item_ids: itemIds,
    started_at: iso,
    finished_at: null,
    answers: [],
    total: runItems(set, itemIds).length,
    first_try: 0,
    updated_at: iso,
    deleted_at: null,
  };
  await db.own_runs.put({ id: run.id });
  await db.exercise_runs.put(run);
  return run;
}

/** Appends an answer to the run (the same row, upserted) and recounts `first_try`. */
export async function recordAnswer(runId: string, answer: ExerciseAnswer, now: Date = new Date()): Promise<ExerciseRun> {
  return db.transaction("rw", db.exercise_runs, async () => {
    const run = await db.exercise_runs.get(runId);
    if (!run || run.deleted_at !== null) throw new Error("Упражнение не найдено");
    const answers = [...run.answers, answer];
    const next: ExerciseRun = { ...run, answers, first_try: countFirstTry(answers), updated_at: now.toISOString() };
    await db.exercise_runs.put(next);
    return next;
  });
}

/** Marks the run finished (once); returns it, or undefined when it is gone. */
export async function finishRun(runId: string, now: Date = new Date()): Promise<ExerciseRun | undefined> {
  return db.transaction("rw", db.exercise_runs, async () => {
    const run = await db.exercise_runs.get(runId);
    if (!run || run.deleted_at !== null) return undefined;
    if (run.finished_at !== null) return run;
    const iso = now.toISOString();
    const next: ExerciseRun = { ...run, finished_at: iso, updated_at: iso };
    await db.exercise_runs.put(next);
    return next;
  });
}

/** Soft-deletes a set (synced; the connector sees it gone). Returns the set for «Отменить», or null. */
export async function deleteSet(id: string, now: Date = new Date()): Promise<ExerciseSet | null> {
  return db.transaction("rw", db.exercise_sets, async () => {
    const current = await db.exercise_sets.get(id);
    if (!current || current.deleted_at !== null) return null;
    const iso = now.toISOString();
    await db.exercise_sets.put({ ...current, deleted_at: iso, updated_at: iso });
    return current;
  });
}

/** Undoes `deleteSet`. */
export async function restoreSet(id: string, now: Date = new Date()): Promise<ExerciseSet | null> {
  return db.transaction("rw", db.exercise_sets, async () => {
    const current = await db.exercise_sets.get(id);
    if (!current) return null;
    if (current.deleted_at === null) return current;
    const next: ExerciseSet = { ...current, deleted_at: null, updated_at: now.toISOString() };
    await db.exercise_sets.put(next);
    return next;
  });
}

/** The set's new words already in the library (by normalizeLemma), keyed by ref: the done screen's checkboxes skip them. */
export async function savedNewWords(set: Pick<ExerciseSet, "new_words">): Promise<Map<string, Word>> {
  const found = await findDuplicates(set.new_words.map((w) => w.fr));
  const out = new Map<string, Word>();
  for (const w of set.new_words) {
    const hit = found.get(w.fr);
    if (hit) out.set(w.ref, hit);
  }
  return out;
}

export interface AddNewWordsResult {
  added: Word[];
  /** Refs skipped because the library already has the word (or the ref is unknown: existing null). */
  skipped: { ref: string; existing: Word | null }[];
  /** Pass to `undoAddNewWords`. */
  undo: string[];
}

/**
 * «Добавить в библиотеку»: adds the checked new words with their review cards in one transaction
 * (source "chat"), into the set's first theme that is still live («Входящие» when the inbox comes
 * first or none is). Words the library already has are skipped. Undo with `undoAddNewWords(result.undo)`.
 */
export async function addNewWords(set: Pick<ExerciseSet, "folders" | "new_words">, refs: readonly string[], now: Date = new Date()): Promise<AddNewWordsResult> {
  return db.transaction("rw", [db.words, db.review_state, db.review_log, db.folders, db.outbox], async () => {
    const wanted = [...new Set(refs)];
    const byRef = new Map(set.new_words.map((w) => [w.ref, w]));
    let folderId: string | null = null;
    for (const id of set.folders) {
      if (id === "inbox") break;
      const folder = await db.folders.get(id);
      if (folder && folder.deleted_at === null) {
        folderId = folder.id;
        break;
      }
    }
    const picked = wanted.map((ref) => byRef.get(ref)).filter((w) => !!w);
    const existing = await findDuplicates(picked.map((w) => w.fr));
    const skipped: AddNewWordsResult["skipped"] = wanted.filter((ref) => !byRef.has(ref)).map((ref) => ({ ref, existing: null }));
    const inputs: NewWordInput[] = [];
    const seen = new Set<string>();
    for (const w of picked) {
      const dup = existing.get(w.fr);
      const lemma = normalizeLemma(w.fr);
      if (dup || seen.has(lemma)) {
        skipped.push({ ref: w.ref, existing: dup ?? null });
        continue;
      }
      seen.add(lemma);
      inputs.push({
        fr: w.fr,
        ru: w.ru,
        note: w.note,
        example_fr: w.example_fr,
        example_ru: w.example_ru,
        origin: w.origin,
        pos: w.pos,
        gender: w.pos === "noun" ? w.gender : "none",
        slang_level: w.slang_level,
        verlan: w.verlan,
        folder_id: folderId,
        folder_source: "auto",
        source: "chat",
      });
    }
    // The library's own add path: the word rows plus their review cards (nested in this transaction).
    const added = await addWords(inputs, now);
    return { added, skipped, undo: added.map((w) => w.id) };
  });
}

/** Undoes `addNewWords`: soft-deletes the words and their cards. */
export async function undoAddNewWords(ids: readonly string[], now: Date = new Date()): Promise<void> {
  await softDeleteWords(ids, now);
}
