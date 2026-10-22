// «Тренировка всей темы» hand-over: `/?folder=<id>&practice=1` (ReviewFolderParam) asks the
// review screen, a sibling, to start a practice round over that theme once it is ready.

let pending: string | null = null;
const listeners = new Set<() => void>();

/** Ask for a practice round over `folder` (a folder id or "inbox"). */
export function requestThemePractice(folder: string): void {
  pending = folder;
  for (const l of listeners) l();
}

/** The pending request, consumed. */
export function takeThemePractice(): string | null {
  const folder = pending;
  pending = null;
  return folder;
}

export function onThemePractice(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
