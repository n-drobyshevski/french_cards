import { describe, expect, it } from "vitest";
import type { Folder, Word } from "@/lib/types";
import type { WordSchedule } from "./format";
import {
  alphaNeighbours,
  cursorAfterRemoval,
  guideRange,
  listKeyAction,
  nextSort,
  rangeIds,
  sortWords,
  tableColumns,
} from "./table";
import type { LibraryWord } from "./useLibraryWords";

const folder = (id: string, sort: number) => ({ id, sort, name: id }) as Folder;

function item(fr: string, opts: { ru?: string; level?: 0 | 1 | 2 | 3; folder?: Folder; schedule?: Partial<WordSchedule> } = {}): LibraryWord {
  return {
    word: { id: fr, fr, ru: opts.ru ?? fr, slang_level: opts.level ?? 0, verlan: false } as Word,
    folder: opts.folder,
    schedule: { status: "new", dueLabel: "новое", tone: "new", due: false, nextDue: null, ...opts.schedule },
  };
}

const frs = (items: readonly LibraryWord[]) => items.map((i) => i.word.fr);

describe("sortWords", () => {
  const words = [item("la thune"), item("se casser"), item("une blague"), item("chelou"), item("vas-y")];

  it("sorts «Слово» like a dictionary, ignoring articles and «se»", () => {
    expect(frs(sortWords(words, { key: "fr", dir: 1 }))).toEqual(["une blague", "se casser", "chelou", "la thune", "vas-y"]);
    expect(frs(sortWords(words, { key: "fr", dir: -1 }))).toEqual(["vas-y", "la thune", "chelou", "se casser", "une blague"]);
  });

  it("sorts «Показ»: due first, then new, then by the next review", () => {
    const list = [
      item("a", { schedule: { tone: "later", nextDue: 500 } }),
      item("b", { schedule: { tone: "new" } }),
      item("c", { schedule: { tone: "due", nextDue: 10 } }),
      item("d", { schedule: { tone: "later", nextDue: 100 } }),
    ];
    expect(frs(sortWords(list, { key: "due", dir: 1 }))).toEqual(["c", "b", "d", "a"]);
  });

  it("sorts «Тема» by folder order with «Входящие» first", () => {
    const f1 = folder("f1", 1);
    const f2 = folder("f2", 2);
    const list = [item("a", { folder: f2 }), item("b"), item("c", { folder: f1 })];
    expect(frs(sortWords(list, { key: "theme", dir: 1 }))).toEqual(["b", "c", "a"]);
  });

  it("sorts «Уровень» and breaks ties by the word", () => {
    const list = [item("z", { level: 2 }), item("b", { level: 1 }), item("a", { level: 2 })];
    expect(frs(sortWords(list, { key: "level", dir: 1 }))).toEqual(["b", "a", "z"]);
  });

  it("flips the direction on the same column", () => {
    expect(nextSort({ key: "fr", dir: 1 }, "fr")).toEqual({ key: "fr", dir: -1 });
    expect(nextSort({ key: "fr", dir: -1 }, "due")).toEqual({ key: "due", dir: 1 });
  });
});

describe("tableColumns", () => {
  it("keeps every column at 1440 (inner 744)", () => {
    const c = tableColumns({ inner: 744, layout: "expanded", coarse: false, themeColumn: true });
    expect(c).toMatchObject({ theme: true, level: "meter", dueWidth: 120 });
    expect(c.template).toBe("32px minmax(160px,1fr) minmax(160px,1fr) 104px 112px 120px");
  });

  it("drops «Тема» and shortens «Уровень» at 1200 (inner 544)", () => {
    const c = tableColumns({ inner: 544, layout: "expanded", coarse: false, themeColumn: true });
    expect(c).toMatchObject({ theme: false, level: "abbr", levelWidth: 56 });
  });

  it("never shows «Тема» inside a theme", () => {
    expect(tableColumns({ inner: 900, layout: "expanded", coarse: false, themeColumn: false }).theme).toBe(false);
  });

  it("medium: no «Тема» below 960, compact «Показ» below 760", () => {
    const c = tableColumns({ inner: 904, layout: "medium", coarse: false, themeColumn: true });
    expect(c).toMatchObject({ theme: false, level: "meter", dueCompact: false });
    expect(tableColumns({ inner: 700, layout: "medium", coarse: false, themeColumn: true })).toMatchObject({ dueCompact: true, dueWidth: 72 });
  });

  it("coarse pointer: 40px gutter, «Показ» 152 with its ⋯", () => {
    const c = tableColumns({ inner: 660, layout: "medium", coarse: true, themeColumn: true });
    expect(c.template).toBe("40px minmax(150px,1fr) minmax(150px,1fr) 64px 152px");
  });
});

describe("selection helpers", () => {
  const ids = ["a", "b", "c", "d", "e"];

  it("takes a range in either direction", () => {
    expect(rangeIds(ids, 1, 3)).toEqual(["b", "c", "d"]);
    expect(rangeIds(ids, 3, 1)).toEqual(["b", "c", "d"]);
  });

  it("moves the cursor to the next row after a removal, the previous at the end", () => {
    expect(cursorAfterRemoval(ids, ["a", "b", "d", "e"], "c")).toBe("d");
    expect(cursorAfterRemoval(ids, ["a", "b", "e"], "c")).toBe("e");
    expect(cursorAfterRemoval(ids, ["a", "b", "c", "d"], "e")).toBe("d");
    expect(cursorAfterRemoval(ids, [], "e")).toBeNull();
  });
});

describe("alphaNeighbours", () => {
  const words = ["la teuf", "la thune", "se tirer", "le tromé", "vas-y", "une blague"].map((fr) => ({ id: fr, fr }));

  it("shows one word before and two after", () => {
    expect(alphaNeighbours(words, "la thune").map((n) => n.fr)).toEqual(["la teuf", "la thune", "se tirer", "le tromé"]);
  });

  it("fills from the other side at the ends", () => {
    expect(alphaNeighbours(words, "une blague").map((n) => n.fr)).toEqual(["une blague", "la teuf", "la thune", "se tirer"]);
    expect(alphaNeighbours(words, "vas-y").map((n) => n.fr)).toEqual(["la thune", "se tirer", "le tromé", "vas-y"]);
  });

  it("formats guide words", () => {
    expect(guideRange("chelou", "vas-y")).toBe("chelou — vas-y");
    expect(guideRange("chelou", "chelou")).toBe("chelou");
    expect(guideRange(undefined, undefined)).toBeNull();
  });
});

describe("listKeyAction", () => {
  const key = (code: string, extra: Record<string, unknown> = {}) => ({ key: "", code, ...extra });

  it("maps letters by code, only when shortcuts are on", () => {
    expect(listKeyAction(key("KeyJ"), true)).toBe("next");
    expect(listKeyAction(key("KeyK"), true)).toBe("prev");
    expect(listKeyAction(key("KeyX"), true)).toBe("toggle");
    expect(listKeyAction(key("KeyM"), true)).toBe("move");
    expect(listKeyAction(key("KeyE"), true)).toBe("edit");
    expect(listKeyAction(key("KeyZ"), true)).toBe("undo");
    expect(listKeyAction(key("KeyJ"), false)).toBeNull();
  });

  it("keeps arrows, ↵, Пробел, Delete and modifier combos without shortcuts", () => {
    expect(listKeyAction(key("ArrowDown"), false)).toBe("next");
    expect(listKeyAction(key("ArrowDown", { shiftKey: true }), false)).toBe("extend-next");
    expect(listKeyAction(key("ArrowUp", { shiftKey: true }), false)).toBe("extend-prev");
    expect(listKeyAction(key("Enter"), false)).toBe("open");
    expect(listKeyAction(key("Space"), false)).toBe("toggle");
    expect(listKeyAction(key("Delete"), false)).toBe("delete");
    expect(listKeyAction(key("Backspace", { metaKey: true }), false)).toBe("delete");
    expect(listKeyAction(key("KeyA", { ctrlKey: true }), false)).toBe("select-all");
    expect(listKeyAction(key("KeyZ", { metaKey: true }), false)).toBe("undo");
    expect(listKeyAction(key("Escape"), false)).toBe("clear");
  });

  it("ignores bare ⌫, IME input and repeats of non-movement keys", () => {
    expect(listKeyAction(key("Backspace"), true)).toBeNull();
    expect(listKeyAction(key("KeyJ", { isComposing: true }), true)).toBeNull();
    expect(listKeyAction(key("KeyJ", { keyCode: 229 }), true)).toBeNull();
    expect(listKeyAction(key("KeyX", { repeat: true }), true)).toBeNull();
    expect(listKeyAction(key("KeyJ", { repeat: true }), true)).toBe("next");
  });
});
