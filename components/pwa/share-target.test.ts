import { describe, expect, it } from "vitest";
import {
  MAX_SHARED_FILES,
  SHARE_TARGET_CACHE,
  SHARE_TARGET_FIELD,
  isSharedImport,
  readSharedImages,
  sharedImportUrl,
  stashSharedFiles,
  takeSharedImages,
} from "./share-target";

/** Minimal in-memory Cache Storage (string keys, insertion order like the real one). */
function memoryCaches() {
  const stores = new Map<string, Map<string, Response>>();
  const cacheFor = (name: string) => {
    const store = stores.get(name) ?? new Map<string, Response>();
    stores.set(name, store);
    return {
      async put(key: RequestInfo | URL, res: Response) {
        store.set(new URL(String(key), "https://app.test").href, res.clone());
      },
      async match(key: RequestInfo | URL) {
        const url = key instanceof Request ? key.url : new URL(String(key), "https://app.test").href;
        return store.get(url)?.clone();
      },
      async keys() {
        return [...store.keys()].map((url) => new Request(url));
      },
    } as unknown as Cache;
  };
  return {
    stores,
    open: async (name: string) => cacheFor(name),
    delete: async (name: string) => stores.delete(name),
    has: async (name: string) => stores.has(name),
  };
}

const image = (name: string, type = "image/png", body = "img") => new File([body], name, { type, lastModified: 1700000000000 });

describe("share target", () => {
  it("stashes accepted images and reads them back in order with names and types", async () => {
    const storage = memoryCaches();
    const form = new FormData();
    form.append(SHARE_TARGET_FIELD, image("Скриншот 1.png"));
    form.append(SHARE_TARGET_FIELD, image("b.jpg", "image/jpeg", "jpeg-bytes"));
    form.append(SHARE_TARGET_FIELD, image("c.webp", "image/webp"));

    expect(await stashSharedFiles(form, storage)).toBe(3);
    const files = await readSharedImages(storage);
    expect(files.map((f) => [f.name, f.type])).toEqual([
      ["Скриншот 1.png", "image/png"],
      ["b.jpg", "image/jpeg"],
      ["c.webp", "image/webp"],
    ]);
    expect(await files[1].text()).toBe("jpeg-bytes");
    expect(files[0].lastModified).toBe(1700000000000);
  });

  it("drops unsupported, empty and text entries and caps the count", async () => {
    const storage = memoryCaches();
    const form = new FormData();
    form.append(SHARE_TARGET_FIELD, image("photo.heic", "image/heic"));
    form.append(SHARE_TARGET_FIELD, image("empty.png", "image/png", ""));
    form.append(SHARE_TARGET_FIELD, "not a file");
    for (let i = 0; i < MAX_SHARED_FILES + 3; i++) form.append(SHARE_TARGET_FIELD, image(`s${i}.png`));

    expect(await stashSharedFiles(form, storage)).toBe(MAX_SHARED_FILES);
    expect((await readSharedImages(storage)).map((f) => f.name)[0]).toBe("s0.png");
  });

  it("replaces an earlier unclaimed share, and storing nothing clears it", async () => {
    const storage = memoryCaches();
    const first = new FormData();
    first.append(SHARE_TARGET_FIELD, image("old.png"));
    await stashSharedFiles(first, storage);

    const second = new FormData();
    second.append(SHARE_TARGET_FIELD, image("new.png"));
    await stashSharedFiles(second, storage);
    expect((await readSharedImages(storage)).map((f) => f.name)).toEqual(["new.png"]);

    expect(await stashSharedFiles(new FormData(), storage)).toBe(0);
    expect(storage.stores.has(SHARE_TARGET_CACHE)).toBe(false);
  });

  it("takeSharedImages returns the files once", async () => {
    const storage = memoryCaches();
    const form = new FormData();
    form.append(SHARE_TARGET_FIELD, image("a.png"));
    await stashSharedFiles(form, storage);

    expect(await takeSharedImages(storage)).toHaveLength(1);
    expect(await takeSharedImages(storage)).toEqual([]);
    expect(storage.stores.has(SHARE_TARGET_CACHE)).toBe(false);
  });

  it("builds the redirect URL and recognises it", () => {
    expect(sharedImportUrl(2)).toBe("/import?shared=1");
    expect(sharedImportUrl(0)).toBe("/import");
    expect(isSharedImport(new URL("https://app.test/import?shared=1").searchParams)).toBe(true);
    expect(isSharedImport(new URLSearchParams(""))).toBe(false);
  });

  it("is a no-op without Cache Storage", async () => {
    expect(await stashSharedFiles(new FormData(), null)).toBe(0);
    expect(await readSharedImages(null)).toEqual([]);
  });
});
