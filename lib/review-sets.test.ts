import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import Dexie from "dexie";
import { db, KartochkiDB, legacyReviewSets } from "./db";
import { createFolder } from "./folders";
import {
  countSetCards,
  createReviewSet,
  deleteReviewSet,
  describeSet,
  EMPTY_SET_DRAFT,
  listReviewSets,
  restoreReviewSet,
  setChoice,
  setIdOf,
  setSessionFilter,
  updateReviewSet,
} from "./review-sets";
import { buildPracticeQueue, loadSession } from "./session";
import type { Folder, Word } from "./types";
import { addWord, gradeCard } from "./words";

const NOON = new Date(2026, 9, 22, 12, 0, 0);
const DAY = 86_400_000;

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

interface Fixture {
  party: Folder;
  police: Folder;
  words: Record<string, Word>;
}

async function fixture(): Promise<Fixture> {
  const party = await createFolder({ name: "Тусовка" }, NOON);
  const police = await createFolder({ name: "Полиция" }, NOON);
  const add = (fr: string, extra: Partial<Word>, at: Date) =>
    addWord({ fr, ru: `ru-${fr}`, both_directions: false, ...extra }, at);
  const words = {
    teuf: await add("la teuf", { folder_id: party.id, slang_level: 2, verlan: true }, new Date(NOON.getTime() - 2 * DAY)),
    keufs: await add("les keufs", { folder_id: police.id, slang_level: 2, verlan: true }, new Date(NOON.getTime() - 40 * DAY)),
    flics: await add("les flics", { folder_id: police.id, slang_level: 1 }, new Date(NOON.getTime() - 40 * DAY)),
    blague: await add("une blague", { slang_level: 0 }, new Date(NOON.getTime() - 3 * DAY)),
  };
  return { party, police, words };
}

const frs = (items: { word: Word }[]) => items.map((i) => i.word.fr).sort();

describe("session filters for sets", () => {
  it("combines themes («Входящие» included), slang, status and age", async () => {
    const f = await fixture();
    await gradeCard(f.words.flics.id, "fr_ru", 3, new Date(NOON.getTime() - 5 * DAY));
    const run = async (patch: Partial<typeof EMPTY_SET_DRAFT>) =>
      frs(await buildPracticeQueue({ ...setSessionFilter({ ...EMPTY_SET_DRAFT, ...patch }, undefined, undefined, NOON), scope: "all" }, NOON));

    expect(await run({})).toEqual(["la teuf", "les flics", "les keufs", "une blague"]);
    expect(await run({ folders: [f.party.id, "inbox"] })).toEqual(["la teuf", "une blague"]);
    expect(await run({ slang: [2] })).toEqual(["la teuf", "les keufs"]);
    expect(await run({ slang: [1, 2], folders: [f.police.id] })).toEqual(["les flics", "les keufs"]);
    expect(await run({ slang: ["verl"] })).toEqual(["la teuf", "les keufs"]);
    expect(await run({ statuses: ["learning"] })).toEqual(["les flics"]);
    expect(await run({ statuses: ["new"], added: "week" })).toEqual(["la teuf", "une blague"]);
    expect(await run({ added: "month" })).toEqual(["la teuf", "une blague"]);
  });

  it("the scheduled session respects the set too", async () => {
    const f = await fixture();
    const filter = setSessionFilter({ ...EMPTY_SET_DRAFT, folders: [f.police.id] }, "fr_ru", undefined, NOON);
    const session = await loadSession(filter, NOON);
    expect(frs(session.queue)).toEqual(["les flics", "les keufs"]);
    expect(await countSetCards(filter, "schedule", NOON)).toBe(2);
    expect(await countSetCards(filter, "practice", NOON)).toBe(2);
  });

  it("themes deleted since are dropped; none left means every theme", async () => {
    const f = await fixture();
    const live = new Set([f.party.id]);
    expect(setSessionFilter({ ...EMPTY_SET_DRAFT, folders: ["gone", f.party.id] }, undefined, live).folderIds).toEqual([f.party.id]);
    expect(setSessionFilter({ ...EMPTY_SET_DRAFT, folders: ["gone"] }, undefined, live).folderIds).toBeUndefined();
  });
});

describe("stored sets", () => {
  it("creates, updates, soft-deletes and restores sets; every write is queued for sync", async () => {
    const a = await createReviewSet({ ...EMPTY_SET_DRAFT, name: "  Арго   для метро ", slang: [2, 3], mode: "practice" }, NOON);
    expect(a.name).toBe("Арго для метро");
    const b = await createReviewSet({ ...EMPTY_SET_DRAFT, name: "Трудные", statuses: ["difficult"] }, new Date(NOON.getTime() + 1000));
    await updateReviewSet(a.id, { ...a, name: "Арго" }, new Date(NOON.getTime() + 2000));
    expect((await listReviewSets()).map((s) => s.name)).toEqual(["Арго", "Трудные"]);
    expect((await db.outbox.toArray()).map((o) => o.key).sort()).toEqual([`review_sets:${a.id}`, `review_sets:${b.id}`]);

    const removed = await deleteReviewSet(a.id, new Date(NOON.getTime() + 3000));
    expect((await listReviewSets()).map((s) => s.id)).toEqual([b.id]);
    expect((await db.review_sets.get(a.id))!.deleted_at).not.toBeNull();
    await restoreReviewSet(removed!, new Date(NOON.getTime() + 4000));
    expect((await listReviewSets()).map((s) => s.id)).toEqual([a.id, b.id]);

    await expect(createReviewSet({ ...EMPTY_SET_DRAFT, name: "   " })).rejects.toThrow();
    expect(setIdOf(setChoice(b.id))).toBe(b.id);
    expect(setIdOf("inbox")).toBeNull();
  });

  it("reads sets stored the old way, dropping malformed ones", () => {
    const at = "2026-10-22T12:00:00.000Z";
    expect(
      legacyReviewSets(
        [
          { id: "a", name: "Ok", folders: ["x", "x", 3], statuses: ["new", "bogus"], slang: [2, "verl", 9], added: "week", mode: "practice", created_at: "2026-10-01T00:00:00.000Z" },
          { id: "a", name: "Duplicate id" },
          { id: "b", name: "  " },
          "nope",
        ],
        at,
      ),
    ).toEqual([
      { id: "a", name: "Ok", folders: ["x"], statuses: ["new"], slang: [2, "verl"], added: "week", mode: "practice", created_at: "2026-10-01T00:00:00.000Z", updated_at: at, deleted_at: null },
    ]);
    expect(legacyReviewSets(null, at)).toEqual([]);
  });

  it("upgrading the database moves the old Settings sets into the synced table", async () => {
    const name = "kartochki-upgrade-test";
    const old = new Dexie(name);
    old.version(1).stores({
      folders: "id, slug, sort, updated_at",
      words: "id, fr, ru, folder_id, slang_level, created_at, updated_at",
      review_state: "id, word_id, direction, due, state, updated_at",
      review_log: "id, word_id, review, updated_at",
      reorg_runs: "id, created_at, updated_at",
      settings: "id",
      outbox: "key, table, queued_at",
    });
    await old.table("settings").put({ id: "settings", new_per_day: 20, review_sets: [{ id: "s1", name: "Арго", folders: [], statuses: [], slang: [2], added: "all", mode: "schedule" }] });
    old.close();

    const next = new KartochkiDB(name);
    const rows = await next.review_sets.toArray();
    expect(rows.map((r) => [r.id, r.name, r.slang])).toEqual([["s1", "Арго", [2]]]);
    const settings = (await next.settings.get("settings"))!;
    expect(settings.new_per_day).toBe(20);
    expect("review_sets" in settings).toBe(false);
    expect((await next.outbox.toArray()).map((o) => o.key)).toEqual(["review_sets:s1"]);
    next.close();
    await Dexie.delete(name);
  });

  it("describes a set in one line", () => {
    const folders = [{ id: "p", name: "Полиция" }];
    expect(describeSet({ folders: ["p", "inbox"], slang: [2, 3], statuses: ["difficult"], added: "week" }, folders)).toBe(
      "Полиция, Входящие · arg., vulg. · трудные · за неделю",
    );
    expect(describeSet(EMPTY_SET_DRAFT, folders)).toBe("все темы");
  });
});
