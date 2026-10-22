import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import { defaultFolderId, listFolders } from "./folders";
import {
  importLegacyHtml,
  LEGACY_MIGRATED_KEY,
  LEGACY_STORAGE_KEY,
  migrateLegacyStorage,
  parseLegacyHtml,
  PROTOTYPE_WORDS,
  SEED_TIMESTAMP,
  seedIfNeeded,
  seedWordId,
} from "./seed";
import { getSettings } from "./settings";
import { listWords, softDeleteWords } from "./words";

const T0 = new Date("2026-10-21T10:00:00.000Z");

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("parseLegacyHtml", () => {
  it("reads the 11 words of the prototype file", () => {
    const html = readFileSync(new URL("../prototype/Petit_Argot.html", import.meta.url), "utf8");
    const words = parseLegacyHtml(html);
    expect(words).toHaveLength(11);
    expect(words[0]).toEqual({ fr: "Blague", ru: "шутка", note: null });
    expect(words[4]).toMatchObject({ fr: "Se casser", note: "Ещё значит «сломаться». Casse-toi = грубое «свали»" });
    expect(words.map((w) => w.fr)).toEqual(PROTOTYPE_WORDS.map((w) => w.legacy));
  });

  it("handles single quotes, escapes and missing arrays", () => {
    const html = `<script>const WORDS = [{fr:'l\\'oseille', ru:"бабки \\"кэш\\""}, {fr:"x"}];</script>`;
    expect(parseLegacyHtml(html)).toEqual([{ fr: "l'oseille", ru: 'бабки "кэш"', note: null }]);
    expect(parseLegacyHtml("<html></html>")).toEqual([]);
  });
});

describe("seedIfNeeded", () => {
  it("seeds settings, folders and the prototype words once", async () => {
    const storage = new MemoryStorage();
    expect(await seedIfNeeded(storage, T0)).toBe(true);
    expect(await db.settings.get("settings")).toBeDefined();
    expect(await listFolders()).toHaveLength(7);
    const words = await listWords();
    expect(words).toHaveLength(11);
    expect(await db.review_state.count()).toBe(22);

    const casser = words.find((w) => w.fr === "se casser")!;
    expect(casser).toMatchObject({
      id: seedWordId("se casser"),
      slang_level: 2,
      folder_id: defaultFolderId("povsednevnoe"),
      folder_source: "user",
      updated_at: SEED_TIMESTAMP,
      both_directions: true,
    });
    expect(words.find((w) => w.fr === "les flics")?.folder_id).toBe(defaultFolderId("politsiya"));
    expect(words.every((w) => w.slang_level >= 0 && w.slang_level <= 3)).toBe(true);
    expect((await db.review_state.toArray()).every((s) => s.state === 0)).toBe(true);
    expect(await db.outbox.count()).toBe(7 + 11 + 22);

    expect(await seedIfNeeded(storage, T0)).toBe(false);
    expect(await db.words.count()).toBe(11);
  });

  it("retries on the next start when the first run was cut short", async () => {
    // A first run that failed after the folders but before the words: no marker yet.
    vi.spyOn(db.words, "bulkPut").mockRejectedValueOnce(new Error("QuotaExceededError"));
    await expect(seedIfNeeded(new MemoryStorage(), T0)).rejects.toThrow("QuotaExceededError");
    vi.restoreAllMocks();
    expect(await db.settings.get("settings")).toBeUndefined();

    expect(await seedIfNeeded(new MemoryStorage(), T0)).toBe(true);
    expect(await listFolders()).toHaveLength(7);
    expect(await listWords()).toHaveLength(11);
    expect(await db.settings.get("settings")).toBeDefined();
  });

  it("gives seeded words the same ids on every device", async () => {
    await seedIfNeeded(new MemoryStorage(), T0);
    const first = (await db.words.toArray()).map((w) => w.id).sort();
    await Promise.all(db.tables.map((t) => t.clear()));
    await seedIfNeeded(new MemoryStorage(), T0);
    expect((await db.words.toArray()).map((w) => w.id).sort()).toEqual(first);
  });

  it("orders seeded words like the prototype", async () => {
    await seedIfNeeded(new MemoryStorage(), T0);
    const byCreated = (await db.words.toArray()).sort((a, b) => a.created_at.localeCompare(b.created_at));
    expect(byCreated.map((w) => w.fr)).toEqual(PROTOTYPE_WORDS.map((w) => w.fr));
  });
});

describe("legacy localStorage", () => {
  it("imports extra words, resets progress, sets direction and runs once", async () => {
    await seedIfNeeded(new MemoryStorage(), T0);
    const storage = new MemoryStorage();
    storage.setItem(
      LEGACY_STORAGE_KEY,
      JSON.stringify({
        cards: { "Se casser": { box: 4, lapses: 1, seen: 9 }, Inconnu: { box: 1 } },
        words: [{ fr: "la daronne", ru: "мать", note: "verlan" }, { fr: "Blague", ru: "шутка" }],
        reviews: 30,
        dir: "ru",
      }),
    );
    const res = await migrateLegacyStorage(storage, T0);
    expect(res.added).toBe(1);
    const daronne = (await listWords()).find((w) => w.fr === "la daronne")!;
    expect(daronne).toMatchObject({ ru: "мать", note: "verlan", folder_id: null, source: "import" });
    expect((await db.review_state.where("word_id").equals(daronne.id).toArray()).map((s) => s.state)).toEqual([0, 0]);
    expect((await getSettings()).default_direction).toBe("ru_fr");
    expect(storage.getItem(LEGACY_MIGRATED_KEY)).toBe(T0.toISOString());
    expect(storage.getItem(LEGACY_STORAGE_KEY)).not.toBeNull();

    expect((await migrateLegacyStorage(storage, T0)).added).toBe(0);
  });

  it("survives garbage and missing storage", async () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_STORAGE_KEY, "{not json");
    expect(await migrateLegacyStorage(storage, T0)).toEqual({ added: 0 });
    expect(await migrateLegacyStorage(undefined, T0)).toEqual({ added: 0 });
  });

  it("restores prototype words from storage when the library was emptied", async () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ cards: { "Vas-y": { box: 3 } } }));
    expect((await migrateLegacyStorage(storage, T0)).added).toBe(1);
    expect((await listWords())[0]).toMatchObject({ fr: "vas-y", slang_level: 1, id: seedWordId("vas-y") });
  });
});

describe("importLegacyHtml", () => {
  it("adds only words that are not in the library yet", async () => {
    await seedIfNeeded(new MemoryStorage(), T0);
    const html = `const WORDS = [{fr:"Flics", ru:"копы"}, {fr:"Chelou", ru:"стрёмный", note:"верлан от louche"}];`;
    const res = await importLegacyHtml(html, T0);
    expect(res.added.map((w) => w.fr)).toEqual(["Chelou"]);
    expect(res.skipped).toBe(1);
    expect(await db.words.count()).toBe(12);
  });

  it("brings back words removed by «Отменить» when the same file is imported again", async () => {
    await seedIfNeeded(new MemoryStorage(), T0);
    const html = `const WORDS = [{fr:"la thune", ru:"бабки"}];`;
    const first = await importLegacyHtml(html, T0);
    expect(first.added).toHaveLength(1);
    const later = new Date(T0.getTime() + 60_000);
    await softDeleteWords(first.added.map((w) => w.id), later);

    const again = await importLegacyHtml(html, new Date(T0.getTime() + 120_000));
    expect(again).toMatchObject({ skipped: 0 });
    expect(again.added.map((w) => w.id)).toEqual(first.added.map((w) => w.id));
    const word = await db.words.get(first.added[0].id);
    expect(word).toMatchObject({ fr: "la thune", deleted_at: null });
    expect(Date.parse(word!.updated_at)).toBeGreaterThan(later.getTime());
    const states = await db.review_state.where("word_id").equals(word!.id).toArray();
    expect(states.map((st) => [st.direction, st.deleted_at, st.state]).sort()).toEqual([
      ["fr_ru", null, 0],
      ["ru_fr", null, 0],
    ]);
  });

  it("does not bring back a deleted prototype word when seeding", async () => {
    await seedIfNeeded(new MemoryStorage(), T0);
    await softDeleteWords([seedWordId("vas-y")], T0);
    await db.settings.clear();
    await seedIfNeeded(new MemoryStorage(), T0);
    expect((await db.words.get(seedWordId("vas-y")))?.deleted_at).not.toBeNull();
  });
});
