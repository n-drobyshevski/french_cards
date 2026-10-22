import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import {
  cleanCustomFields,
  createFieldDef,
  deleteFieldDef,
  emptyAutoFields,
  fieldDefByName,
  fieldsForDisplay,
  listFieldDefs,
  MAX_FIELD_DEFS,
  moveFieldDef,
  restoreFieldDef,
  updateFieldDef,
  withFieldValue,
} from "./custom-fields";
import { matchesSearch } from "./text";
import type { FieldDef } from "./types";
import { addWord, updateWord } from "./words";

const NOW = new Date("2026-10-22T10:00:00.000Z");
const def = (id: string, name: string, patch: Partial<FieldDef> = {}): FieldDef => ({
  id,
  name,
  hint: null,
  ai_fill: true,
  sort: 1,
  updated_at: NOW.toISOString(),
  deleted_at: null,
  ...patch,
});

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("custom field values", () => {
  it("cleans: trims, drops empty labels and values, keeps the first of repeats", () => {
    expect(
      cleanCustomFields([
        { field_id: "a", label: " Синонимы ", value: "  nana,   meuf " },
        { field_id: "a", label: "Синонимы", value: "again" },
        { field_id: null, label: "Мнемоника", value: "" },
        { field_id: null, label: "", value: "x" },
        { field_id: null, label: "мнемоника", value: "m1" },
        { field_id: null, label: "МНЕМОНИКА", value: "m2" },
      ]),
    ).toEqual([
      { field_id: "a", label: "Синонимы", value: "nana, meuf" },
      { field_id: null, label: "мнемоника", value: "m1" },
    ]);
  });

  it("shows shared fields in definition order with current names, then one-off and orphaned values", () => {
    const defs = [
      def("b", "Мнемоника", { sort: 2 }),
      def("a", "Синонимы", { sort: 1 }),
      def("gone", "Старое", { deleted_at: NOW.toISOString() }),
    ];
    const word = {
      custom_fields: [
        { field_id: "b", label: "old name", value: "m" },
        { field_id: null, label: "Произношение", value: "[mœf]" },
        { field_id: "gone", label: "Старое", value: "kept" },
      ],
    };
    expect(fieldsForDisplay(word, defs).map((f) => [f.label, f.value, f.shared])).toEqual([
      ["Мнемоника", "m", true],
      ["Произношение", "[mœf]", false],
      ["Старое", "kept", false],
    ]);
    expect(fieldsForDisplay(word, defs, { withEmpty: true }).map((f) => f.label)).toEqual([
      "Синонимы",
      "Мнемоника",
      "Произношение",
      "Старое",
    ]);
  });

  it("sets, replaces and clears a value", () => {
    let list = withFieldValue([], { field_id: "a", label: "Синонимы" }, "nana");
    list = withFieldValue(list, { field_id: null, label: "Произношение" }, "[mœf]");
    list = withFieldValue(list, { field_id: "a", label: "Синонимы" }, "meuf, nana");
    expect(list).toEqual([
      { field_id: "a", label: "Синонимы", value: "meuf, nana" },
      { field_id: null, label: "Произношение", value: "[mœf]" },
    ]);
    expect(withFieldValue(list, { field_id: null, label: "произношение" }, "")).toEqual([list[0]]);
    // An orphaned value edited as one-off keeps its definition id.
    expect(withFieldValue([{ field_id: "gone", label: "Старое", value: "x" }], { field_id: null, label: "Старое" }, "y")).toEqual(
      [{ field_id: "gone", label: "Старое", value: "y" }],
    );
  });

  it("lists the auto fields a word still lacks and finds definitions by name", () => {
    const defs = [def("a", "Синонимы"), def("b", "Мнемоника", { ai_fill: false, sort: 2 })];
    expect(emptyAutoFields({ custom_fields: [] }, defs).map((d) => d.id)).toEqual(["a"]);
    expect(emptyAutoFields({ custom_fields: [{ field_id: "a", label: "Синонимы", value: "x" }] }, defs)).toEqual([]);
    expect(fieldDefByName(defs, " синонимы ")?.id).toBe("a");
  });

  it("is saved, cleaned and searchable on words", async () => {
    const word = await addWord(
      { fr: "la meuf", ru: "девушка", custom_fields: [{ field_id: null, label: "Синонимы", value: " nana " }] },
      NOW,
    );
    expect(word.custom_fields).toEqual([{ field_id: null, label: "Синонимы", value: "nana" }]);
    const next = await updateWord(
      word.id,
      { custom_fields: withFieldValue(word.custom_fields, { field_id: null, label: "Синонимы" }, null) },
      NOW,
    );
    expect(next.custom_fields).toEqual([]);
    expect(matchesSearch({ ...word, custom_fields: [{ field_id: null, label: "x", value: "Nanà" }] }, "nana")).toBe(true);
  });
});

describe("field definitions", () => {
  it("creates in order, refuses repeats and the limit, renames, moves", async () => {
    const a = await createFieldDef({ name: "Синонимы", hint: " 2–3 синонима ", ai_fill: true }, NOW);
    const b = await createFieldDef({ name: "Мнемоника", hint: null, ai_fill: false }, NOW);
    expect(a.hint).toBe("2–3 синонима");
    await expect(createFieldDef({ name: "синонимы", hint: null, ai_fill: true }, NOW)).rejects.toThrow("уже есть");
    await updateFieldDef(b.id, { name: "Ассоциация", hint: null, ai_fill: true }, NOW);
    await moveFieldDef(b.id, -1, NOW);
    expect((await listFieldDefs()).map((d) => d.name)).toEqual(["Ассоциация", "Синонимы"]);
    for (let i = 2; i < MAX_FIELD_DEFS; i++) await createFieldDef({ name: `Поле ${i}`, hint: null, ai_fill: false }, NOW);
    await expect(createFieldDef({ name: "Лишнее", hint: null, ai_fill: false }, NOW)).rejects.toThrow("Не больше");
  });

  it("delete is soft and restorable; outbox queues the rows for sync", async () => {
    const a = await createFieldDef({ name: "Синонимы", hint: null, ai_fill: true }, NOW);
    const removed = await deleteFieldDef(a.id, NOW);
    expect(await listFieldDefs()).toEqual([]);
    await restoreFieldDef(removed!, NOW);
    expect((await listFieldDefs()).map((d) => d.id)).toEqual([a.id]);
    expect(await db.outbox.where("table").equals("field_defs").count()).toBe(1);
  });
});
