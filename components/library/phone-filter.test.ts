import { describe, expect, it } from "vitest";
import type { LevelInfo } from "@/lib/core/level";
import type { Folder, Word } from "@/lib/types";
import type { WordSchedule } from "./format";
import { DEFAULT_PHONE_FILTER, filterPhoneWords, narrows, sheetFilterCount, type PhoneFilter } from "./phone-filter";
import type { LibraryWord } from "./useLibraryWords";

const money = { id: "money", sort: 1, name: "Деньги" } as Folder;
const people = { id: "people", sort: 2, name: "Люди" } as Folder;

function item(
  fr: string,
  opts: { ru?: string; level?: 0 | 1 | 2 | 3; verlan?: boolean; folder?: Folder; schedule?: Partial<WordSchedule>; cefr?: LevelInfo | null } = {},
): LibraryWord {
  return {
    word: { id: fr, fr, ru: opts.ru ?? fr, note: null, slang_level: opts.level ?? 0, verlan: opts.verlan ?? false } as Word,
    folder: opts.folder,
    schedule: { status: "new", dueLabel: "новое", tone: "new", due: false, nextDue: null, ...opts.schedule },
    level: opts.cefr ?? null,
  };
}

const later = (nextDue: number, status: WordSchedule["status"] = "learning"): Partial<WordSchedule> => ({ status, tone: "later", due: false, nextDue });

// Newest first, as useLibraryWords returns them.
const words = [
  item("la thune", { ru: "бабки", level: 2, folder: money, schedule: { status: "difficult", tone: "due", due: true, nextDue: 5 } }),
  item("la meuf", { ru: "девушка", level: 1, verlan: true, folder: people, schedule: later(300, "difficult") }),
  item("une blague", { ru: "шутка" }),
  item("le fric", { ru: "бабло", level: 1, folder: money, schedule: later(100, "known") }),
];

const frs = (items: readonly LibraryWord[]) => items.map((i) => i.word.fr);
const run = (patch: Partial<PhoneFilter>, query = "") => frs(filterPhoneWords(words, { ...DEFAULT_PHONE_FILTER, ...patch }, query));

describe("filterPhoneWords", () => {
  it("keeps everything, newest first, by default", () => {
    expect(run({})).toEqual(["la thune", "la meuf", "une blague", "le fric"]);
  });

  it("filters by status", () => {
    expect(run({ status: "due" })).toEqual(["la thune"]);
    expect(run({ status: "difficult" })).toEqual(["la thune", "la meuf"]);
    expect(run({ status: "new" })).toEqual(["une blague"]);
  });

  it("filters by theme, «Входящие» included", () => {
    expect(run({ theme: "money" })).toEqual(["la thune", "le fric"]);
    expect(run({ theme: "inbox" })).toEqual(["une blague"]);
  });

  it("combines slang, theme and search", () => {
    expect(run({ slang: [1] })).toEqual(["la meuf", "le fric"]);
    expect(run({ slang: [1], theme: "money" })).toEqual(["le fric"]);
    expect(run({ slang: ["verl"] })).toEqual(["la meuf"]);
    expect(run({}, "бабл")).toEqual(["le fric"]);
  });

  it("orders by next review, alphabet or difficulty", () => {
    expect(run({ order: "due" })).toEqual(["la thune", "une blague", "le fric", "la meuf"]);
    expect(run({ order: "fr" })).toEqual(["une blague", "le fric", "la meuf", "la thune"]);
    expect(run({ order: "difficult" })).toEqual(["la thune", "la meuf", "une blague", "le fric"]);
  });
});

describe("narrows / sheetFilterCount", () => {
  it("the order alone does not narrow the list but shows on the filter badge", () => {
    expect(narrows(DEFAULT_PHONE_FILTER)).toBe(false);
    expect(narrows({ ...DEFAULT_PHONE_FILTER, order: "fr" })).toBe(false);
    expect(sheetFilterCount({ ...DEFAULT_PHONE_FILTER, order: "fr" })).toBe(1);
  });

  it("statuses on the ledger strip are not counted on the badge", () => {
    expect(narrows({ ...DEFAULT_PHONE_FILTER, status: "due" })).toBe(true);
    expect(sheetFilterCount({ ...DEFAULT_PHONE_FILTER, status: "due" })).toBe(0);
    expect(sheetFilterCount({ ...DEFAULT_PHONE_FILTER, status: "new", slang: [2, 3], theme: "inbox" })).toBe(3);
  });
});

describe("«Уровень языка» in the phone filter", () => {
  const b1: LevelInfo = { level: "B1", source: "flelex", estimated: true };
  const a1: LevelInfo = { level: "A1", source: "user", estimated: false };
  const levelled = [
    item("la démarche", { cefr: b1 }),
    item("relou", { level: 2 }),
    item("la maison", { cefr: a1 }),
  ];
  const pick = (patch: Partial<PhoneFilter>) => frs(filterPhoneWords(levelled, { ...DEFAULT_PHONE_FILTER, ...patch }, ""));

  it("filters by level and «без уровня», and counts as a sheet choice", () => {
    expect(pick({ cefr: ["B1"] })).toEqual(["la démarche"]);
    expect(pick({ cefr: ["A1", "none"] })).toEqual(["relou", "la maison"]);
    expect(narrows({ ...DEFAULT_PHONE_FILTER, cefr: ["none"] })).toBe(true);
    expect(sheetFilterCount({ ...DEFAULT_PHONE_FILTER, cefr: ["A1", "B1"] })).toBe(1);
  });

  it("«По уровню языка»: A1 → C2, words without a level last", () => {
    expect(pick({ order: "cefr" })).toEqual(["la maison", "la démarche", "relou"]);
  });
});
