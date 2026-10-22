// «Мои наборы»: named card sets for Повторение, built from filters (themes, word status, slang
// level, age) and reviewed either on the schedule or as a practice round. Rows of the synced
// `review_sets` table, so every device sees the same sets; deletes are soft, like other rows.
import { db, liveRows, newId } from "./db";
import { buildPracticeQueue, getSessionCounts, PRACTICE_ALL_MAX, type SessionData, type SessionFilter } from "./session";
import { SLANG_LABELS, type Direction, type Folder, type ReviewSet, type ReviewSetStatus, type SlangLevel } from "./types";

const DAY_MS = 86_400_000;
export const REVIEW_SET_NAME_MAX = 40;
/** The review filter's value for a set: `set:<id>`. */
export const SET_PREFIX = "set:";
export const INBOX_KEY = "inbox";

export const SET_STATUSES: readonly ReviewSetStatus[] = ["new", "learning", "difficult", "known"];
export const STATUS_LABELS: Record<ReviewSetStatus, string> = {
  new: "Новые",
  learning: "В изучении",
  difficult: "Трудные",
  known: "Выученные",
};
export const SET_SLANG: readonly (SlangLevel | "verl")[] = [0, 1, 2, 3, "verl"];
export const ADDED_LABELS: Record<ReviewSet["added"], string> = { all: "Всё время", week: "За неделю", month: "За месяц" };
export const MODE_LABELS: Record<ReviewSet["mode"], string> = { schedule: "По расписанию", practice: "Тренировка" };

export type ReviewSetDraft = Omit<ReviewSet, "id" | "created_at" | "updated_at" | "deleted_at">;

export const EMPTY_SET_DRAFT: ReviewSetDraft = { name: "", folders: [], statuses: [], slang: [], added: "all", mode: "schedule" };

export const setChoice = (id: string) => `${SET_PREFIX}${id}`;
export const setIdOf = (choice: string): string | null => (choice.startsWith(SET_PREFIX) ? choice.slice(SET_PREFIX.length) : null);

const cleanName = (name: string) => name.replace(/\s+/g, " ").trim().slice(0, REVIEW_SET_NAME_MAX);

/** Live sets, oldest first (use inside useLiveQuery). */
export async function listReviewSets(): Promise<ReviewSet[]> {
  const rows = await liveRows(db.review_sets);
  return rows.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

export async function createReviewSet(draft: ReviewSetDraft, now: Date = new Date()): Promise<ReviewSet> {
  const name = cleanName(draft.name);
  if (!name) throw new Error("Дайте набору название");
  const iso = now.toISOString();
  const set: ReviewSet = { ...draft, name, id: newId(), created_at: iso, updated_at: iso, deleted_at: null };
  await db.review_sets.put(set);
  return set;
}

export async function updateReviewSet(id: string, draft: ReviewSetDraft, now: Date = new Date()): Promise<ReviewSet | null> {
  const name = cleanName(draft.name);
  if (!name) throw new Error("Дайте набору название");
  return db.transaction("rw", db.review_sets, async () => {
    const current = await db.review_sets.get(id);
    if (!current || current.deleted_at !== null) return null;
    const next: ReviewSet = { ...current, ...draft, name, updated_at: now.toISOString() };
    await db.review_sets.put(next);
    return next;
  });
}

/** Soft-deletes the set (synced like any row); `restoreReviewSet` brings it back. */
export async function deleteReviewSet(id: string, now: Date = new Date()): Promise<ReviewSet | null> {
  return db.transaction("rw", db.review_sets, async () => {
    const current = await db.review_sets.get(id);
    if (!current || current.deleted_at !== null) return null;
    const iso = now.toISOString();
    await db.review_sets.put({ ...current, deleted_at: iso, updated_at: iso });
    return current;
  });
}

export async function restoreReviewSet(set: ReviewSet, now: Date = new Date()): Promise<void> {
  const current = await db.review_sets.get(set.id);
  await db.review_sets.put({ ...(current ?? set), deleted_at: null, updated_at: now.toISOString() });
}

/** The session filter for a set. Themes deleted since are ignored (none left = every theme). */
export function setSessionFilter(
  set: Pick<ReviewSet, "folders" | "statuses" | "slang" | "added">,
  direction: Direction | undefined,
  liveFolderIds?: ReadonlySet<string>,
  now: Date = new Date(),
): SessionFilter {
  const folders = set.folders.filter((f) => f === INBOX_KEY || !liveFolderIds || liveFolderIds.has(f));
  const days = set.added === "week" ? 7 : set.added === "month" ? 30 : 0;
  return {
    direction,
    folderIds: folders.length > 0 ? folders.map((f) => (f === INBOX_KEY ? null : f)) : undefined,
    slang: set.slang.length > 0 ? set.slang : undefined,
    statuses: set.statuses.length > 0 ? set.statuses : undefined,
    addedSince: days ? new Date(now.getTime() - days * DAY_MS).toISOString() : undefined,
  };
}

/**
 * What «Повторять» would give now: due + new cards for a schedule set, every card (capped like a
 * practice round) for a practice set.
 */
export async function countSetCards(
  filter: SessionFilter,
  mode: ReviewSet["mode"],
  now: Date = new Date(),
  pre?: SessionData,
): Promise<number> {
  if (mode === "practice") return (await buildPracticeQueue({ ...filter, scope: "all", limit: PRACTICE_ALL_MAX, random: () => 0 }, now, pre)).length;
  const c = await getSessionCounts(filter, now, pre);
  return c.due + c.new;
}

/** One line under the set's name: «Тусовка, Полиция · arg., vulg. · трудные · за неделю». */
export function describeSet(set: Pick<ReviewSet, "folders" | "statuses" | "slang" | "added">, folders: readonly Pick<Folder, "id" | "name">[]): string {
  const names = set.folders
    .map((f) => (f === INBOX_KEY ? "Входящие" : folders.find((x) => x.id === f)?.name))
    .filter((n): n is string => !!n);
  const parts = [names.length ? names.join(", ") : "все темы"];
  if (set.slang.length) parts.push(set.slang.map((k) => (k === "verl" ? "verl." : SLANG_LABELS[k])).join(", "));
  if (set.statuses.length) parts.push(set.statuses.map((s) => STATUS_LABELS[s].toLowerCase()).join(", "));
  if (set.added !== "all") parts.push(ADDED_LABELS[set.added].toLowerCase());
  return parts.join(" · ");
}
