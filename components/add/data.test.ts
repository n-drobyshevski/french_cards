import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createFolder } from "@/lib/folders";
import { addWord, softDeleteWord } from "@/lib/words";
import { countBefore, loadDuplicate, loadListDuplicates } from "./data";

const T0 = new Date("2026-10-21T10:00:00.000Z");
const at = (s: number) => new Date(T0.getTime() + s * 1000);

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("countBefore", () => {
  it("counts entries strictly earlier, ties excluded", () => {
    const sorted = ["a", "b", "b", "c"];
    expect(countBefore(sorted, "a")).toBe(0);
    expect(countBefore(sorted, "b")).toBe(1);
    expect(countBefore(sorted, "bb")).toBe(3);
    expect(countBefore(sorted, "c")).toBe(3);
    expect(countBefore(sorted, "z")).toBe(4);
    expect(countBefore([], "a")).toBe(0);
  });
});

describe("duplicates", () => {
  it("numbers a duplicate by live words created before it, the same in both loaders", async () => {
    const money = await createFolder({ name: "Деньги" }, T0);
    const gone = await addWord({ fr: "chelou", ru: "стрёмный" }, at(1));
    await addWord({ fr: "bouffer", ru: "жрать" }, at(2));
    await addWord({ fr: "relou", ru: "надоедливый" }, at(3));
    const thune = await addWord({ fr: "la thune", ru: "бабки", folder_id: money.id }, at(3));
    const fric = await addWord({ fr: "le fric", ru: "бабло" }, at(4));
    await softDeleteWord(gone.id, at(5));

    expect(await loadDuplicate("thune")).toEqual({ word: thune, ordinal: 2, folderName: "Деньги" });
    expect(await loadDuplicate("Le  fric")).toEqual({ word: fric, ordinal: 4, folderName: null });
    expect(await loadDuplicate("chelou")).toBeNull();

    const list = await loadListDuplicates(["thune", "le fric", "fric", "chelou", "nouveau"]);
    expect([...list.keys()]).toEqual(["thune", "fric"]);
    expect(list.get("thune")).toEqual(await loadDuplicate("thune"));
    expect(list.get("fric")).toEqual(await loadDuplicate("fric"));
  });
});
