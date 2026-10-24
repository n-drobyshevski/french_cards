import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type { Folder, Word } from "@/lib/types";
import type { WordSchedule } from "./format";
import { shareLibraryWords, type LibraryWord, type LibraryWords } from "./useLibraryWords";

const folder = (id: string, name = id): Folder => ({ id, name, sort: 1, locked: false, color: "#000", updated_at: "t0" }) as Folder;
const schedule = (dueLabel = "новое"): WordSchedule => ({ status: "new", dueLabel, tone: "new", due: false, nextDue: null });
const word = (id: string, extra: Partial<Word> = {}): Word => ({ id, fr: id, ru: id, tags: ["a"], updated_at: "t0", ...extra }) as Word;
const row = (w: Word, f?: Folder, s = schedule()): LibraryWord => ({ word: w, folder: f, schedule: s, level: null });

/** A fresh read of the same data: new objects with equal values, as Dexie hands them out. */
const reread = (lib: LibraryWords): LibraryWords => structuredClone(lib);

describe("shareLibraryWords", () => {
  const f1 = folder("f1");
  const prev: LibraryWords = { folders: [f1], words: [row(word("a"), f1), row(word("b"))] };

  it("returns the previous result when nothing changed", () => {
    expect(shareLibraryWords(prev, reread(prev))).toBe(prev);
  });

  it("keeps unchanged rows and replaces only the changed one", () => {
    const next = reread(prev);
    next.words[1].word.ru = "другое";
    const out = shareLibraryWords(prev, next);
    expect(out).not.toBe(prev);
    expect(out.folders).toBe(prev.folders);
    expect(out.words[0]).toBe(prev.words[0]);
    expect(out.words[1]).toBe(next.words[1]);
  });

  it("compares arrays by value and notices a changed schedule", () => {
    const tags = reread(prev);
    tags.words[0].word.tags = ["b"];
    expect(shareLibraryWords(prev, tags).words[0]).not.toBe(prev.words[0]);
    const due = reread(prev);
    due.words[1].schedule = schedule("к повт.");
    const out = shareLibraryWords(prev, due);
    expect(out.words[0]).toBe(prev.words[0]);
    expect(out.words[1]).not.toBe(prev.words[1]);
  });

  it("a renamed folder renews its rows, which point at the new folder", () => {
    const next = reread(prev);
    next.folders[0].name = "Деньги";
    next.words[0].folder = next.folders[0];
    const out = shareLibraryWords(prev, next);
    expect(out.folders[0]).toBe(next.folders[0]);
    expect(out.words[0]).not.toBe(prev.words[0]);
    expect(out.words[0].folder).toBe(out.folders[0]);
    expect(out.words[1]).toBe(prev.words[1]);
  });

  it("rows of reused folders point at the reused folder", () => {
    const next = reread(prev);
    next.words.push(row(word("c"), next.folders[0]));
    const out = shareLibraryWords(prev, next);
    expect(out.words[2].folder).toBe(prev.folders[0]);
    expect(out.words.slice(0, 2)).toEqual(prev.words);
  });

  it("follows a new order or a removed row", () => {
    const swapped = reread(prev);
    swapped.words.reverse();
    const out = shareLibraryWords(prev, swapped);
    expect(out.words).toEqual([prev.words[1], prev.words[0]]);
    expect(out.words[0]).toBe(prev.words[1]);
    const removed = reread(prev);
    removed.words.pop();
    expect(shareLibraryWords(prev, removed).words).toEqual([prev.words[0]]);
  });
});
