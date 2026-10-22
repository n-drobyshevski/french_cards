import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { VocabItem } from "@/lib/ai/schemas";
import { db } from "@/lib/db";
import { createFolder, listFolders } from "@/lib/folders";
import { addWord } from "@/lib/words";
import { commitImport, undoImport } from "./commit";
import { buildRows, setAllChecked, updateRow } from "./rows";

const NOW = new Date("2026-10-21T10:00:00.000Z");
const transport = { slug: "transport", name: "Транспорт", description: "Машины и метро." };

function item(fr: string, patch: Partial<VocabItem> = {}): VocabItem {
  return {
    fr,
    fr_as_seen: null,
    ru: `ru:${fr}`,
    ru_suggested: false,
    note: null,
    example_fr: null,
    example_ru: null,
    pos: "noun",
    gender: "f",
    slang_level: 2,
    verlan: false,
    provenance: "pair",
    confidence: "high",
    issue: null,
    folder: "INBOX",
    new_folder: null,
    ...patch,
  };
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("commitImport", () => {
  it("adds checked rows as screenshot words with both review directions", async () => {
    const emo = await createFolder({ name: "Эмоции" }, NOW);
    const rows = buildRows([item("chelou", { folder: emo.slug }), item("bouffer")], await listFolders(), new Map());
    const result = await commitImport(rows, NOW);
    expect(result.words.map((w) => w.fr)).toEqual(["chelou", "bouffer"]);
    expect(result.words[0]).toMatchObject({ folder_id: emo.id, folder_source: "auto", folder_confidence: "high", source: "screenshot" });
    expect(result.words[1]).toMatchObject({ folder_id: null, source: "screenshot" });
    expect(await db.review_state.count()).toBe(4);
    expect(result.createdFolders).toEqual([]);
  });

  it("creates a proposed theme only when checked rows use it, and undo removes it", async () => {
    const items = ["la caisse", "le tromé", "la bécane"].map((fr) => item(fr, { folder: "NEW", new_folder: transport }));
    const rows = buildRows(items, [], new Map());
    const result = await commitImport(rows, NOW);
    expect(result.createdFolders).toHaveLength(1);
    const [folder] = await listFolders();
    expect(folder).toMatchObject({ name: "Транспорт", created_by: "auto" });
    expect(result.words.every((w) => w.folder_id === folder.id)).toBe(true);

    await undoImport(result, new Date(NOW.getTime() + 1000));
    expect(await listFolders()).toEqual([]);
    const live = (await db.words.toArray()).filter((w) => w.deleted_at === null);
    expect(live).toEqual([]);
  });

  it("skips words that became duplicates and repeated rows", async () => {
    const rows = setAllChecked(buildRows([item("la thune"), item("le fric"), item("fric")], [], new Map()), true);
    await addWord({ fr: "thune", ru: "бабки" }, NOW);
    const result = await commitImport(rows, NOW);
    expect(result.words.map((w) => w.fr)).toEqual(["le fric"]);
    expect(result.skipped).toBe(2);
  });

  it("keeps a hand-picked theme as placed by the user", async () => {
    const ppl = await createFolder({ name: "Люди" }, NOW);
    let rows = buildRows([item("la meuf")], await listFolders(), new Map());
    rows = updateRow(rows, "r0", { folder: { kind: "folder", id: ppl.id }, folderSource: "user" });
    const [word] = (await commitImport(rows, NOW)).words;
    expect(word).toMatchObject({ folder_id: ppl.id, folder_source: "user", folder_confidence: null });
  });

  it("does nothing when nothing is checked", async () => {
    const rows = setAllChecked(buildRows([item("kiffer")], [], new Map()), false);
    expect(await commitImport(rows, NOW)).toEqual({ words: [], createdFolders: [], skipped: 0 });
    expect(await db.words.count()).toBe(0);
  });
});
