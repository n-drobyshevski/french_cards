import { describe, expect, it } from "vitest";
import { compareFr } from "@/lib/text";
import type { LevelInfo } from "@/lib/core/level";
import type { Folder, Word } from "@/lib/types";
import type { WordSchedule } from "./format";
import {
  alphaNeighbours,
  alphaOrder,
  catalogNumbers,
  cursorAfterRemoval,
  neighboursAt,
  guideRange,
  listKeyAction,
  nextSort,
  orderLabel,
  rangeIds,
  sortWords,
  tableColumns,
} from "./table";
import type { LibraryWord } from "./useLibraryWords";

const folder = (id: string, sort: number) => ({ id, sort, name: id }) as Folder;

function item(
  fr: string,
  opts: { ru?: string; level?: 0 | 1 | 2 | 3; folder?: Folder; schedule?: Partial<WordSchedule>; added?: string; cefr?: LevelInfo | null } = {},
): LibraryWord {
  return {
    word: { id: fr, fr, ru: opts.ru ?? fr, slang_level: opts.level ?? 0, verlan: false, created_at: opts.added ?? "2026-10-01T00:00:00Z" } as Word,
    folder: opts.folder,
    schedule: { status: "new", dueLabel: "новое", tone: "new", due: false, nextDue: null, ...opts.schedule },
    level: opts.cefr ?? null,
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

  it("«Сначала новые»: the newest words first", () => {
    const list = [item("a", { added: "2026-10-01" }), item("b", { added: "2026-10-03" }), item("c", { added: "2026-10-02" })];
    expect(frs(sortWords(list, { key: "added", dir: 1 }))).toEqual(["b", "c", "a"]);
  });

  it("«Сначала трудные»: difficult words first, newest first inside each group", () => {
    const list = [
      item("a", { added: "2026-10-04" }),
      item("b", { added: "2026-10-01", schedule: { status: "difficult" } }),
      item("c", { added: "2026-10-02" }),
      item("d", { added: "2026-10-03", schedule: { status: "difficult" } }),
    ];
    expect(frs(sortWords(list, { key: "difficult", dir: 1 }))).toEqual(["d", "b", "a", "c"]);
  });

  it("names the order in the strip, column heads included", () => {
    expect(orderLabel({ key: "added", dir: 1 })).toBe("Сначала новые");
    expect(orderLabel({ key: "fr", dir: 1 })).toBe("По алфавиту");
    expect(orderLabel({ key: "ru", dir: 1 })).toBe("По переводу");
    expect(orderLabel({ key: "fr", dir: -1 })).toBe("По алфавиту ↓");
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
    expect(c.template).toBe("32px minmax(160px,1fr) minmax(160px,1fr) 44px 112px 112px 120px");
  });

  it("drops «Тема» and shortens «Сленг» at 1200 (inner 544); «Ур.» stays", () => {
    const c = tableColumns({ inner: 544, layout: "expanded", coarse: false, themeColumn: true });
    expect(c).toMatchObject({ theme: false, level: "abbr", levelWidth: 56 });
    expect(c.template).toBe("32px minmax(140px,1fr) minmax(140px,1fr) 44px 56px 120px");
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
    expect(c.template).toBe("40px minmax(140px,1fr) minmax(140px,1fr) 44px 64px 152px");
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

  it("orders like compareFr, then by id", () => {
    const list = ["Été", "été", "ete", "le zinc", "l'apéro", "s'en foutre", "la thune", "10 balles", "2 balles", "œil", "oeuf"].map((fr, i) => ({ id: `w${10 - i}`, fr }));
    const expected = [...list].sort((a, b) => compareFr(a.fr, b.fr) || a.id.localeCompare(b.id));
    expect(alphaOrder(list)).toEqual(expected);
    expect(alphaOrder([{ id: "b", fr: "ça" }, { id: "a", fr: "ca" }]).map((w) => w.id)).toEqual(
      [{ id: "b", fr: "ça" }, { id: "a", fr: "ca" }].sort((a, b) => compareFr(a.fr, b.fr) || a.id.localeCompare(b.id)).map((w) => w.id),
    );
  });

  it("takes the window around a position of the sorted list", () => {
    const sorted = alphaOrder(words);
    expect(neighboursAt(sorted, 2)).toEqual(alphaNeighbours(words, sorted[2].id));
    expect(neighboursAt(sorted, 0).map((n) => n.current)).toEqual([true, false, false, false]);
    expect(neighboursAt(sorted, -1)).toEqual([]);
  });

  it("formats guide words", () => {
    expect(guideRange("chelou", "vas-y")).toBe("chelou — vas-y");
    expect(guideRange("chelou", "chelou")).toBe("chelou");
    expect(guideRange(undefined, undefined)).toBeNull();
  });
});

describe("catalogNumbers", () => {
  it("numbers words in creation order, equal times by id", () => {
    const words = [
      { id: "c", created_at: "2026-10-02T00:00:00Z" },
      { id: "b", created_at: "2026-10-01T00:00:00Z" },
      { id: "a", created_at: "2026-10-02T00:00:00Z" },
      { id: "B", created_at: "2026-10-02T00:00:00Z" },
    ];
    const numbers = catalogNumbers(words);
    // The rule the pane used before: created earlier, or at the same time with id <= its own.
    for (const w of words) {
      expect(numbers.get(w.id)).toBe(words.filter((x) => x.created_at < w.created_at || (x.created_at === w.created_at && x.id <= w.id)).length);
    }
    expect([...numbers.entries()]).toEqual([
      ["b", 1],
      ["B", 2],
      ["a", 3],
      ["c", 4],
    ]);
  });
});

describe("sortWords keys", () => {
  it("matches compareFr under every order's tie-break", () => {
    const list = ["la thune", "Thune", "thune", "l'apéro", "apero", "se casser", "casser"].map((fr, i) => item(fr, { level: (i % 2) as 0 | 1 }));
    const expected = [...list].sort((a, b) => a.word.slang_level - b.word.slang_level || compareFr(a.word.fr, b.word.fr) || a.word.id.localeCompare(b.word.id));
    expect(frs(sortWords(list, { key: "level", dir: 1 }))).toEqual(frs(expected));
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

describe("sorting by «Ур.» («Уровень языка»)", () => {
  const lv = (level: "A1" | "B2" | "C1"): LevelInfo => ({ level, source: "flelex", estimated: true });
  const rows = [item("zut", { cefr: lv("C1") }), item("ouf"), item("aller", { cefr: lv("A1") }), item("bref", { cefr: lv("B2") })];

  it("goes A1 → C2 with no level last, and keeps no level last when reversed", () => {
    expect(frs(sortWords(rows, { key: "cefr", dir: 1 }))).toEqual(["aller", "bref", "zut", "ouf"]);
    expect(frs(sortWords(rows, { key: "cefr", dir: -1 }))).toEqual(["zut", "bref", "aller", "ouf"]);
  });

  it("names the orders: «По уровню языка», and «По сленгу» for the slang column", () => {
    expect(orderLabel({ key: "cefr", dir: 1 })).toBe("По уровню языка");
    expect(orderLabel({ key: "level", dir: 1 })).toBe("По сленгу");
  });
});
