// Asks the browser to keep this origin's storage (IndexedDB holds the only copy of offline edits),
// so it isn't evicted under storage pressure. Chrome decides silently; Firefox may show a prompt,
// which needs a user gesture, hence calling this from the first click/keypress.

/** Resolves true when storage is (now) persistent. Never throws. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/** Whether storage is already persistent (false when unknown). */
export async function isStoragePersisted(): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.persisted) return false;
    return await navigator.storage.persisted();
  } catch {
    return false;
  }
}
