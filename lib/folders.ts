// Folders («темы»): CRUD, the default set, and per-folder counts for the library.
import { DEFAULT_FOLDERS, defaultFolderId, nextFolderSort, pickFolderColor, uniqueSlug } from "./core/folders";
import { db, newId } from "./db";
import { cardMastery, cardStatus, wordStatus } from "./scheduler";
import { endOfStudyDay } from "./session";
import type { Confidence, Folder, ReviewState, Word } from "./types";
import type { MoveRecord } from "./words";

export {
  DEFAULT_FOLDERS,
  defaultFolderId,
  FOLDER_COLORS,
  nextFolderSort,
  pickFolderColor,
  stableId,
  uniqueSlug,
  type DefaultFolder,
} from "./core/folders";

const FOLDER_TABLES = () => [db.folders, db.words, db.outbox];

/** Live folders ordered by `sort`. */
export async function listFolders(): Promise<Folder[]> {
  const rows = await db.folders.orderBy("sort").toArray();
  return rows.filter((f) => f.deleted_at === null);
}

export async function getFolder(id: string): Promise<Folder | undefined> {
  const f = await db.folders.get(id);
  return f && f.deleted_at === null ? f : undefined;
}

export async function getFolderBySlug(slug: string): Promise<Folder | undefined> {
  return db.folders.where("slug").equals(slug).filter((f) => f.deleted_at === null).first();
}

/**
 * Creates any default folder whose slug has never existed. A default the user deleted
 * (tombstone present) is not brought back. Uses a fixed old `updated_at` so a copy that
 * already exists on another device always wins the sync merge.
 */
export async function ensureDefaultFolders(updatedAt = "2000-01-01T00:00:00.000Z"): Promise<Folder[]> {
  return db.transaction("rw", FOLDER_TABLES(), async () => {
    const existing = await db.folders.toArray();
    const slugs = new Set(existing.map((f) => f.slug));
    const ids = new Set(existing.map((f) => f.id));
    const created: Folder[] = DEFAULT_FOLDERS.filter((d) => !slugs.has(d.slug) && !ids.has(defaultFolderId(d.slug))).map(
      (d) => ({
        id: defaultFolderId(d.slug),
        slug: d.slug,
        name: d.name,
        description: d.description,
        color: d.color,
        created_by: "user",
        locked: false,
        sort: DEFAULT_FOLDERS.indexOf(d),
        updated_at: updatedAt,
        deleted_at: null,
      }),
    );
    await db.folders.bulkPut(created);
    return created;
  });
}

export interface NewFolderInput {
  name: string;
  description?: string | null;
  color?: string;
  created_by?: Folder["created_by"];
  locked?: boolean;
}

export async function createFolder(input: NewFolderInput, now: Date = new Date()): Promise<Folder> {
  const name = input.name.replace(/\s+/g, " ").trim();
  if (!name) throw new Error("Пустое название темы");
  return db.transaction("rw", FOLDER_TABLES(), async () => {
    const live = await listFolders();
    const dup = live.find((f) => f.name.toLocaleLowerCase("ru") === name.toLocaleLowerCase("ru"));
    if (dup) throw new Error(`Тема «${dup.name}» уже есть`);
    const taken = new Set((await db.folders.toArray()).map((f) => f.slug));
    const folder: Folder = {
      id: newId(),
      slug: uniqueSlug(name, taken),
      name,
      description: input.description?.trim() || null,
      color: input.color ?? pickFolderColor(live),
      created_by: input.created_by ?? "user",
      locked: input.locked ?? false,
      sort: nextFolderSort(live),
      updated_at: now.toISOString(),
      deleted_at: null,
    };
    await db.folders.add(folder);
    return folder;
  });
}

export type FolderPatch = Partial<Pick<Folder, "name" | "description" | "color" | "locked" | "sort" | "created_by">>;

/** Renames/recolors/locks a folder. The slug stays stable. */
export async function updateFolder(id: string, patch: FolderPatch, now: Date = new Date()): Promise<Folder> {
  return db.transaction("rw", FOLDER_TABLES(), async () => {
    const current = await getFolder(id);
    if (!current) throw new Error("Тема не найдена");
    const next: Folder = { ...current, ...patch, id, updated_at: now.toISOString() };
    if (patch.name !== undefined) {
      next.name = patch.name.replace(/\s+/g, " ").trim();
      if (!next.name) throw new Error("Пустое название темы");
    }
    if (patch.description !== undefined) next.description = patch.description?.trim() || null;
    await db.folders.put(next);
    return next;
  });
}

/** Persists a new order (ids in display order). */
export async function reorderFolders(ids: readonly string[], now: Date = new Date()): Promise<void> {
  const iso = now.toISOString();
  await db.transaction("rw", FOLDER_TABLES(), async () => {
    const rows = await db.folders.bulkGet([...ids]);
    const changed: Folder[] = [];
    rows.forEach((f, i) => {
      if (f && f.deleted_at === null && f.sort !== i) changed.push({ ...f, sort: i, updated_at: iso });
    });
    await db.folders.bulkPut(changed);
  });
}

/**
 * Soft-deletes a folder; its words go to «Входящие» (folder_source "auto", so they can be
 * re-sorted). Returns the moves; `restoreFolder(id, moves)` undoes it.
 */
export async function deleteFolder(id: string, now: Date = new Date()): Promise<MoveRecord[]> {
  const iso = now.toISOString();
  return db.transaction("rw", FOLDER_TABLES(), async () => {
    const folder = await getFolder(id);
    if (!folder) return [];
    await db.folders.put({ ...folder, deleted_at: iso, updated_at: iso });
    const words = await db.words.where("folder_id").equals(id).filter((w) => w.deleted_at === null).toArray();
    const moves: MoveRecord[] = words.map((w) => ({
      word_id: w.id,
      from: id,
      to: null,
      from_source: w.folder_source,
      from_confidence: w.folder_confidence,
    }));
    await db.words.bulkPut(
      words.map((w) => ({ ...w, folder_id: null, folder_source: "auto" as const, folder_confidence: null, updated_at: iso })),
    );
    return moves;
  });
}

/** Where «Расформировать» puts one word of the theme. */
export interface FolderPlacement {
  wordId: string;
  /** Another live theme; null = «Входящие». */
  to: string | null;
  /** "user" when picked by hand in the plan. */
  source: Word["folder_source"];
  confidence: Confidence | null;
}

/**
 * «Расформировать»: deletes the theme and moves its words to the placements in one transaction.
 * Words without a placement (added since the plan), or whose target theme is gone, go to
 * «Входящие». Returns the moves; `restoreFolder(id, moves)` undoes it. Null when the theme is gone.
 */
export async function disbandFolder(
  id: string,
  placements: readonly FolderPlacement[],
  now: Date = new Date(),
): Promise<MoveRecord[] | null> {
  const iso = now.toISOString();
  return db.transaction("rw", FOLDER_TABLES(), async () => {
    const folder = await getFolder(id);
    if (!folder) return null;
    const others = new Set((await listFolders()).filter((f) => f.id !== id).map((f) => f.id));
    const byWord = new Map(placements.map((p) => [p.wordId, p]));
    const words = await db.words.where("folder_id").equals(id).filter((w) => w.deleted_at === null).toArray();
    const moves: MoveRecord[] = [];
    const updated: Word[] = [];
    for (const w of words) {
      const p = byWord.get(w.id);
      const to = p && p.to !== null && others.has(p.to) ? p.to : null;
      moves.push({ word_id: w.id, from: id, to, from_source: w.folder_source, from_confidence: w.folder_confidence });
      updated.push({
        ...w,
        folder_id: to,
        folder_source: to === null ? "auto" : p!.source,
        folder_confidence: to === null || p!.source === "user" ? null : p!.confidence,
        updated_at: iso,
      });
    }
    await db.words.bulkPut(updated);
    await db.folders.put({ ...folder, deleted_at: iso, updated_at: iso });
    return moves;
  });
}

/**
 * Brings a deleted or disbanded theme back and returns its words to it — only those still where
 * the deletion put them (a word moved since stays where the user put it).
 */
export async function restoreFolder(id: string, moves: readonly MoveRecord[], now: Date = new Date()): Promise<void> {
  const iso = now.toISOString();
  await db.transaction("rw", FOLDER_TABLES(), async () => {
    const folder = await db.folders.get(id);
    if (!folder) return;
    await db.folders.put({ ...folder, deleted_at: null, updated_at: iso });
    const restored: Word[] = [];
    for (const m of moves) {
      const w = await db.words.get(m.word_id);
      if (!w || w.deleted_at !== null || w.folder_id !== m.to) continue;
      restored.push({ ...w, folder_id: m.from, folder_source: m.from_source, folder_confidence: m.from_confidence, updated_at: iso });
    }
    await db.words.bulkPut(restored);
  });
}

export interface FolderStats {
  /** Live words. */
  total: number;
  /** Words with at least one non-new card due today. */
  due: number;
  /** Words whose status is "difficult". */
  difficult: number;
  /** Words never reviewed. */
  fresh: number;
  /** 0..1 mean card mastery (stability / 21 d, new = 0). */
  mastery: number;
  /** Up to SAMPLE_WORDS French headwords, newest first (the phone tiles show them). */
  samples: string[];
}

/** How many headwords a theme tile previews. */
export const SAMPLE_WORDS = 3;

export interface FolderWithStats extends Folder {
  stats: FolderStats;
}

export interface LibraryStats {
  /** Totals across all live words (header «158 СЛОВ · 23 К ПОВТОРЕНИЮ», chips). */
  totals: FolderStats;
  /** «Входящие» (folder_id null). */
  inbox: FolderStats;
  folders: FolderWithStats[];
}

const emptyStats = (): FolderStats => ({ total: 0, due: 0, difficult: 0, fresh: 0, mastery: 0, samples: [] });

interface Acc {
  stats: FolderStats;
  masterySum: number;
  cards: number;
}

/** True when a card counts as «к повторению» today. */
export function isDueToday(s: Pick<ReviewState, "state" | "due">, now: Date = new Date()): boolean {
  return s.state !== 0 && Date.parse(s.due) < endOfStudyDay(now).getTime();
}

/** Counts for the library screen in one pass (use inside useLiveQuery). */
export async function getLibraryStats(now: Date = new Date()): Promise<LibraryStats> {
  const [folders, words, states] = await Promise.all([
    listFolders(),
    db.words.filter((w) => w.deleted_at === null).toArray(),
    db.review_state.filter((s) => s.deleted_at === null).toArray(),
  ]);
  const statesByWord = new Map<string, ReviewState[]>();
  for (const s of states) {
    const list = statesByWord.get(s.word_id);
    if (list) list.push(s);
    else statesByWord.set(s.word_id, [s]);
  }
  const accs = new Map<string | null, Acc>();
  const acc = (key: string | null) => {
    let a = accs.get(key);
    if (!a) accs.set(key, (a = { stats: emptyStats(), masterySum: 0, cards: 0 }));
    return a;
  };
  const total = acc("__all__");
  const folderIds = new Set(folders.map((f) => f.id));
  // Newest first, so each folder's samples are its latest words.
  words.sort((a, b) => b.created_at.localeCompare(a.created_at));
  for (const w of words) {
    const key = w.folder_id !== null && folderIds.has(w.folder_id) ? w.folder_id : null;
    const ws = statesByWord.get(w.id) ?? [];
    const status = wordStatus(ws);
    const due = ws.some((s) => isDueToday(s, now));
    const m = ws.reduce((sum, s) => sum + cardMastery(s), 0);
    for (const a of [acc(key), total]) {
      a.stats.total++;
      if (a.stats.samples.length < SAMPLE_WORDS) a.stats.samples.push(w.fr);
      if (due) a.stats.due++;
      if (status === "difficult") a.stats.difficult++;
      if (ws.every((s) => cardStatus(s) === "new")) a.stats.fresh++;
      a.masterySum += m;
      a.cards += ws.length;
    }
  }
  const finish = (a: Acc | undefined): FolderStats =>
    a ? { ...a.stats, mastery: a.cards ? a.masterySum / a.cards : 0 } : emptyStats();
  return {
    totals: finish(total),
    inbox: finish(accs.get(null)),
    folders: folders.map((f) => ({ ...f, stats: finish(accs.get(f.id)) })),
  };
}

/** Stats for a single folder (null = «Входящие»). */
export async function getFolderStats(folderId: string | null, now: Date = new Date()): Promise<FolderStats> {
  const lib = await getLibraryStats(now);
  if (folderId === null) return lib.inbox;
  return lib.folders.find((f) => f.id === folderId)?.stats ?? emptyStats();
}
