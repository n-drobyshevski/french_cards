// Hand-over from the «Упражнения» list (or the done screen) to the player at /exercises/play.
// The player route is static so it opens on an offline cold start; the set to play waits here in
// module memory (it survives client-side navigation, a reload drops it). Without one the player
// falls back to `?set=<id>`, then to the newest unfinished run, else back to /exercises.

export interface PendingExercise {
  setId: string;
  /** set (default): the whole set; mistakes: «Повторить ошибки» over `itemIds`. */
  kind?: "set" | "mistakes";
  /** The items of a «mistakes» round. */
  itemIds?: string[];
  /** Resume this unfinished run instead of starting a new one. */
  runId?: string;
}

/** Where the player lives. */
export const EXERCISE_PLAY_HREF = "/exercises/play";

let pending: PendingExercise | null = null;
const listeners = new Set<() => void>();

/** Ask the player to open `request` (call right before navigating to EXERCISE_PLAY_HREF). */
export function setPendingExercise(request: PendingExercise): void {
  pending = { ...request, itemIds: request.itemIds ? [...request.itemIds] : undefined };
  for (const l of listeners) l();
}

/** The pending request, consumed. */
export function takePendingExercise(): PendingExercise | null {
  const request = pending;
  pending = null;
  return request;
}

export function onPendingExercise(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
