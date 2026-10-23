// Practice-round queue arithmetic shared by review practice (lib/session.ts re-exports it) and
// «Упражнения» (lib/core/exercises.ts). Pure: no Dexie, never writes the schedule.

/** Again, Hard, Good, Easy (the same numbers as lib/scheduler `Rating`). */
export type PracticeRating = 1 | 2 | 3 | 4;

/**
 * Next practice queue after answering its head. «Не знаю» brings the card back after
 * 3 others, «Сложно» puts it at the end, «Знаю»/Easy drops it. Never writes to the db.
 */
export function advancePractice<T>(queue: readonly T[], rating: PracticeRating): T[] {
  if (queue.length === 0) return [];
  const [head, ...rest] = queue;
  if (rating === 1) {
    const at = Math.min(3, rest.length);
    return [...rest.slice(0, at), head, ...rest.slice(at)];
  }
  if (rating === 2) return [...rest, head];
  return rest;
}
