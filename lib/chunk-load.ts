// Lazy chunks (the desktop library, the quick-add sheet) and the build they belong to. A chunk that
// will not load is most often one a deploy removed: the page booted from an older build's cached
// HTML (app/sw.ts serves the shell stale-while-revalidate) and the new service worker has since
// dropped that build's files. One retry covers a dropped request; after that the page reloads once
// to pick up the current build, and only then does the error go through.

const RELOAD_KEY = "kartochki:chunk-reload";
/** A second reload within this window means reloading does not help: let the error through. */
const RELOAD_WINDOW_MS = 60_000;
const RETRY_MS = 1_000;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Whether a reload for a missing chunk may happen now (none in the last minute). Marks it if so. */
export function claimChunkReload(storage: Pick<Storage, "getItem" | "setItem"> | null, now: number): boolean {
  if (!storage) return false;
  try {
    const last = Number(storage.getItem(RELOAD_KEY));
    if (Number.isFinite(last) && now - last < RELOAD_WINDOW_MS) return false;
    storage.setItem(RELOAD_KEY, String(now));
    return true;
  } catch {
    return false;
  }
}

function sessionStore(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * `load()`, tried twice; if both fail while online, reloads the page once (the promise then never
 * settles) and otherwise rejects with the last error.
 */
export async function loadChunk<T>(load: () => Promise<T>, opts: { retryMs?: number } = {}): Promise<T> {
  try {
    return await load();
  } catch {
    await wait(opts.retryMs ?? RETRY_MS);
  }
  try {
    return await load();
  } catch (error: unknown) {
    if (typeof window !== "undefined" && navigator.onLine && claimChunkReload(sessionStore(), Date.now())) {
      window.location.reload();
      return new Promise<T>(() => {});
    }
    throw error;
  }
}
