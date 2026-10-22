import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db, liveRows } from "./db";
import {
  createFolder,
  DEFAULT_FOLDERS,
  defaultFolderId,
  deleteFolder,
  ensureDefaultFolders,
  getFolderBySlug,
  getFolderStats,
  getLibraryStats,
  libraryStatsFrom,
  listFolders,
  reorderFolders,
  restoreFolder,
  stableId,
  updateFolder,
} from "./folders";
import { addWord, gradeCard } from "./words";

const T0 = new Date(2026, 9, 21, 12, 0);
const DAY = 86_400_000;

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("stableId", () => {
  it("is a deterministic UUID-shaped string", () => {
    expect(stableId("folder:dengi")).toBe(stableId("folder:dengi"));
    expect(stableId("folder:dengi")).not.toBe(stableId("folder:eda"));
    expect(stableId("x")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("default folders", () => {
  it("creates the seven SPEC themes once, with their colors", async () => {
    const created = await ensureDefaultFolders();
    expect(created).toHaveLength(7);
    const folders = await listFolders();
    expect(folders.map((f) => f.name)).toEqual(["Повседневное", "Деньги", "Еда", "Полиция", "Тусовка", "Эмоции", "Люди"]);
    expect((await getFolderBySlug("dengi"))?.color).toBe("#2f6b4f");
    expect(folders[0].id).toBe(defaultFolderId("povsednevnoe"));
    expect(await ensureDefaultFolders()).toEqual([]);
    expect(await db.outbox.where("table").equals("folders").count()).toBe(7);
  });

  it("does not bring back a default the user deleted", async () => {
    await ensureDefaultFolders();
    await deleteFolder(defaultFolderId("eda"));
    expect(await ensureDefaultFolders()).toEqual([]);
    expect((await listFolders()).map((f) => f.slug)).not.toContain("eda");
    expect(DEFAULT_FOLDERS).toHaveLength(7);
  });
});

describe("folder CRUD", () => {
  it("creates folders with unique slugs, unused colors and next sort", async () => {
    await ensureDefaultFolders();
    const f = await createFolder({ name: "  Транспорт ", description: "машины" }, T0);
    expect(f).toMatchObject({ name: "Транспорт", slug: "transport", description: "машины", created_by: "user", locked: false, sort: 7 });
    expect(DEFAULT_FOLDERS.map((d) => d.color)).not.toContain(f.color);
    await expect(createFolder({ name: "транспорт" })).rejects.toThrow(/уже есть/);
    await expect(createFolder({ name: " " })).rejects.toThrow();
    const auto = await createFolder({ name: "Transport!", created_by: "auto" });
    expect(auto.slug).toBe("transport-2");
  });

  it("renames without changing the slug", async () => {
    const f = await createFolder({ name: "Еда и питьё" }, T0);
    const u = await updateFolder(f.id, { name: "Застолье", locked: true }, new Date(T0.getTime() + 1000));
    expect(u).toMatchObject({ name: "Застолье", slug: f.slug, locked: true });
    expect(u.updated_at).not.toBe(f.updated_at);
  });

  it("reorders", async () => {
    await ensureDefaultFolders();
    const ids = (await listFolders()).map((f) => f.id).reverse();
    await reorderFolders(ids, T0);
    expect((await listFolders()).map((f) => f.id)).toEqual(ids);
  });

  it("delete moves words to the inbox and restore puts them back", async () => {
    const f = await createFolder({ name: "Деньги2" }, T0);
    const a = await addWord({ fr: "a", ru: "1", folder_id: f.id, folder_source: "user" }, T0);
    const b = await addWord({ fr: "b", ru: "2", folder_id: f.id, folder_source: "auto", folder_confidence: "low" }, T0);
    const moves = await deleteFolder(f.id, T0);
    expect(moves).toHaveLength(2);
    expect(await listFolders()).toEqual([]);
    expect(await db.words.get(a.id)).toMatchObject({ folder_id: null, folder_source: "auto" });
    await restoreFolder(f.id, moves, T0);
    expect((await listFolders()).map((x) => x.id)).toEqual([f.id]);
    expect(await db.words.get(a.id)).toMatchObject({ folder_id: f.id, folder_source: "user" });
    expect(await db.words.get(b.id)).toMatchObject({ folder_id: f.id, folder_source: "auto", folder_confidence: "low" });
  });
});

describe("getLibraryStats", () => {
  it("counts total, due, difficult and mastery per folder and for the inbox", async () => {
    await ensureDefaultFolders();
    const money = defaultFolderId("dengi");
    const a = await addWord({ fr: "la thune", ru: "бабки", folder_id: money, both_directions: false }, T0);
    const b = await addWord({ fr: "le fric", ru: "бабло", folder_id: money, both_directions: false }, T0);
    await addWord({ fr: "inbox", ru: "x" }, T0);
    await gradeCard(a.id, "fr_ru", 3, new Date(T0.getTime() - 20 * DAY));
    const st = (await db.review_state.get(`${b.id}:fr_ru`))!;
    await db.review_state.put({ ...st, state: 2, stability: 21, lapses: 3, due: new Date(T0.getTime() + 3 * DAY).toISOString() });

    const lib = await getLibraryStats(T0);
    const m = lib.folders.find((f) => f.id === money)!.stats;
    expect(m.total).toBe(2);
    expect(m.due).toBe(1); // a's learning step is long overdue; b is due in 3 days
    expect(m.difficult).toBe(1);
    expect(m.fresh).toBe(0);
    expect(m.mastery).toBeGreaterThan(0.5);
    expect(m.mastery).toBeLessThanOrEqual(1);
    expect(lib.inbox).toMatchObject({ total: 1, due: 0, fresh: 1, mastery: 0, samples: ["inbox"] });
    expect(lib.folders.find((f) => f.id === money)!.stats.samples.sort()).toEqual(["la thune", "le fric"]);
    expect(lib.totals.samples).toHaveLength(3);
    expect(lib.totals.total).toBe(3);
    expect(lib.folders.find((f) => f.slug === "eda")!.stats.total).toBe(0);
    expect(await getFolderStats(null, T0)).toEqual(lib.inbox);
  });

  it("counts words «на паузе» apart: never due, new or difficult", async () => {
    const a = await addWord({ fr: "mute", ru: "x", both_directions: false, muted: true }, T0);
    const st = (await db.review_state.get(`${a.id}:fr_ru`))!;
    await db.review_state.put({ ...st, state: 2, stability: 1, lapses: 4, due: new Date(T0.getTime() - DAY).toISOString() });
    await addWord({ fr: "new", ru: "y", both_directions: false }, T0);
    const lib = await getLibraryStats(T0);
    expect(lib.totals).toMatchObject({ total: 2, due: 0, difficult: 0, fresh: 1, paused: 1 });
  });

  it("previews the newest words of a theme, at most three", async () => {
    const f = await createFolder({ name: "Tmp" }, T0);
    for (let i = 0; i < 5; i++) await addWord({ fr: `w${i}`, ru: "x", folder_id: f.id }, new Date(T0.getTime() + i * 1000));
    const lib = await getLibraryStats(T0);
    expect(lib.folders.find((x) => x.id === f.id)!.stats.samples).toEqual(["w4", "w3", "w2"]);
  });

  it("treats words in a deleted folder as inbox", async () => {
    const f = await createFolder({ name: "Tmp" }, T0);
    await addWord({ fr: "a", ru: "1", folder_id: f.id }, T0);
    await db.folders.update(f.id, { deleted_at: T0.toISOString() });
    expect((await getLibraryStats(T0)).inbox.total).toBe(1);
  });

  it("libraryStatsFrom matches getLibraryStats and leaves the caller's words in their order", async () => {
    const f = await createFolder({ name: "Tmp" }, T0);
    for (let i = 0; i < 4; i++) await addWord({ fr: `w${i}`, ru: "x", folder_id: i % 2 ? f.id : null }, new Date(T0.getTime() + i * 1000));
    const [folders, words, states] = await Promise.all([listFolders(), liveRows(db.words), liveRows(db.review_state)]);
    const order = words.map((w) => w.id);
    expect(libraryStatsFrom(folders, words, states, T0)).toEqual(await getLibraryStats(T0));
    expect(words.map((w) => w.id)).toEqual(order);
  });
});

describe("restoreFolder", () => {
  it("returns only the words still where the deletion put them", async () => {
    const f = await createFolder({ name: "Tmp" }, T0);
    const a = await addWord({ fr: "a", ru: "1", folder_id: f.id }, T0);
    const b = await addWord({ fr: "b", ru: "2", folder_id: f.id }, T0);
    const moves = await deleteFolder(f.id, T0);
    await db.words.update(b.id, { folder_id: "elsewhere" });
    await restoreFolder(f.id, [...moves, { word_id: "missing", from: f.id, to: null, from_source: "auto", from_confidence: null }], T0);
    expect((await db.words.get(a.id))?.folder_id).toBe(f.id);
    expect((await db.words.get(b.id))?.folder_id).toBe("elsewhere");
  });
});
