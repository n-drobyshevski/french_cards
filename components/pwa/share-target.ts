// Android share target («Поделиться» → Карточки) for screenshots.
// The manifest declares POST /import (multipart, field "images"). The service worker
// catches that POST, stashes the files in Cache Storage and redirects (303) to
// /import?shared=1; the import page then calls takeSharedImages().
// No DOM or React here: this module is bundled into the service worker too.

export const SHARE_TARGET_ACTION = "/import";
export const SHARE_TARGET_FIELD = "images";
export const SHARE_TARGET_ACCEPT = ["image/png", "image/jpeg", "image/webp"] as const;
export const SHARE_TARGET_CACHE = "share-target";
/** Query flag the import page checks: `/import?shared=1`. */
export const SHARED_QUERY_PARAM = "shared";
/** More than this is almost certainly a mis-share; the extra files are dropped. */
export const MAX_SHARED_FILES = 10;

const KEY_PREFIX = "/__share-target/";
const NAME_HEADER = "X-Share-Name";
const MODIFIED_HEADER = "X-Share-Modified";

type Storage = Pick<CacheStorage, "open" | "delete" | "has">;

function defaultStorage(): Storage | null {
  return typeof caches === "undefined" ? null : caches;
}

export function isAcceptedSharedType(type: string): boolean {
  return (SHARE_TARGET_ACCEPT as readonly string[]).includes(type.toLowerCase());
}

/** Where the service worker redirects after a share: `/import?shared=1`, or plain /import when nothing usable came in. */
export function sharedImportUrl(count: number): string {
  return count > 0 ? `${SHARE_TARGET_ACTION}?${SHARED_QUERY_PARAM}=1` : SHARE_TARGET_ACTION;
}

/** True on the URL the service worker redirects to after a share. */
export function isSharedImport(searchParams: URLSearchParams | { get(name: string): string | null }): boolean {
  return searchParams.get(SHARED_QUERY_PARAM) === "1";
}

/**
 * Service-worker side: keeps the accepted images from a share POST, replacing any earlier
 * unclaimed share. Returns how many files were stored.
 */
export async function stashSharedFiles(form: FormData, storage: Storage | null = defaultStorage()): Promise<number> {
  if (!storage) return 0;
  const files = form
    .getAll(SHARE_TARGET_FIELD)
    .filter((entry): entry is File => typeof entry !== "string" && entry.size > 0 && isAcceptedSharedType(entry.type))
    .slice(0, MAX_SHARED_FILES);

  await storage.delete(SHARE_TARGET_CACHE);
  if (files.length === 0) return 0;

  const cache = await storage.open(SHARE_TARGET_CACHE);
  const stamp = Date.now();
  await Promise.all(
    files.map((file, index) =>
      cache.put(
        `${KEY_PREFIX}${stamp}-${String(index).padStart(2, "0")}`,
        new Response(file, {
          headers: {
            "Content-Type": file.type,
            [NAME_HEADER]: encodeURIComponent(file.name || `image-${index + 1}`),
            [MODIFIED_HEADER]: String(file.lastModified || stamp),
          },
        }),
      ),
    ),
  );
  return files.length;
}

function extensionFor(type: string): string {
  return type === "image/jpeg" ? "jpg" : type.replace("image/", "");
}

/** Page side: the shared images in the order they were shared, without removing them. */
export async function readSharedImages(storage: Storage | null = defaultStorage()): Promise<File[]> {
  if (!storage || !(await storage.has(SHARE_TARGET_CACHE))) return [];
  const cache = await storage.open(SHARE_TARGET_CACHE);
  const keys = (await cache.keys()).filter((req) => new URL(req.url).pathname.startsWith(KEY_PREFIX));
  keys.sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));

  const files: File[] = [];
  for (const [index, key] of keys.entries()) {
    const res = await cache.match(key);
    if (!res) continue;
    const blob = await res.blob();
    const type = res.headers.get("Content-Type") || blob.type;
    if (!isAcceptedSharedType(type)) continue;
    const rawName = res.headers.get(NAME_HEADER);
    let name = `image-${index + 1}.${extensionFor(type)}`;
    if (rawName) {
      try {
        name = decodeURIComponent(rawName);
      } catch {
        // Keep the generated name.
      }
    }
    const lastModified = Number(res.headers.get(MODIFIED_HEADER)) || Date.now();
    files.push(new File([blob], name, { type, lastModified }));
  }
  return files;
}

/** Page side: forgets the stashed share (after the import screen has taken it). */
export async function clearSharedImages(storage: Storage | null = defaultStorage()): Promise<void> {
  if (!storage) return;
  await storage.delete(SHARE_TARGET_CACHE);
}

/** Page side: reads the shared images and clears them, so a reload doesn't import twice. */
export async function takeSharedImages(storage: Storage | null = defaultStorage()): Promise<File[]> {
  const files = await readSharedImages(storage);
  await clearSharedImages(storage);
  return files;
}
