import { describe, expect, it } from "vitest";
import type { CustomFieldValue, FieldDef, Word } from "@/lib/types";
import { draftOf, isDirty, patchFor, undoFor } from "./word-editor";
import { canAddField, fieldRows, fieldRowsError, newFieldRow, rowsToValues, sameFieldValues } from "./word-fields";

const def = (id: string, name: string, sort: number, extra: Partial<FieldDef> = {}): FieldDef => ({
  id,
  name,
  hint: null,
  ai_fill: false,
  sort,
  updated_at: "2026-10-01T00:00:00.000Z",
  deleted_at: null,
  ...extra,
});

const SYN = def("syn", "Синонимы", 1, { hint: "2–3 синонима" });
const PRON = def("pron", "Произношение", 2);
const GONE = def("gone", "Этимология", 3, { deleted_at: "2026-10-02T00:00:00.000Z" });

const word = (custom_fields?: CustomFieldValue[]): Word => ({
  id: "w1",
  fr: "la thune",
  ru: "бабки",
  note: null,
  example_fr: null,
  example_ru: null,
  extra_examples: [],
  custom_fields,
  pos: "noun",
  gender: "f",
  slang_level: 2,
  verlan: false,
  tags: [],
  folder_id: null,
  folder_source: "user",
  folder_confidence: null,
  source: "manual",
  both_directions: true,
  created_at: "2026-10-01T00:00:00.000Z",
  updated_at: "2026-10-01T00:00:00.000Z",
  deleted_at: null,
});

describe("fieldRows", () => {
  it("lists every shared field (empty ones too), then one-off fields and values of deleted ones", () => {
    const w = word([
      { field_id: null, label: "Где услышал", value: "в метро" },
      { field_id: "gone", label: "Этимология", value: "от «thunes»" },
      { field_id: "syn", label: "Синонимы", value: "le fric" },
    ]);
    const rows = fieldRows(w, [SYN, PRON, GONE]);
    expect(rows.map((r) => [r.label, r.value, r.shared])).toEqual([
      ["Синонимы", "le fric", true],
      ["Произношение", "", true],
      ["Где услышал", "в метро", false],
      ["Этимология", "от «thunes»", false],
    ]);
    expect(rows[1].hint).toBeNull();
    expect(rows[0].hint).toBe("2–3 синонима");
    // The value of a deleted definition keeps its field_id (it comes back with the definition).
    expect(rows[3].field_id).toBe("gone");
  });

  it("works for words written before custom fields", () => {
    expect(fieldRows(word(undefined), [SYN]).map((r) => r.value)).toEqual([""]);
    expect(fieldRows(word(undefined), [])).toEqual([]);
  });
});

describe("rowsToValues / sameFieldValues", () => {
  it("drops empty rows and trims values", () => {
    const rows = fieldRows(word([]), [SYN, PRON]);
    rows[0].value = "  le fric,  l'oseille ";
    const added = { ...newFieldRow(), label: "Произн.", value: "" };
    expect(rowsToValues([...rows, added])).toEqual([{ field_id: "syn", label: "Синонимы", value: "le fric, l'oseille" }]);
  });

  it("ignores order and the stored label of a shared value", () => {
    const a: CustomFieldValue[] = [
      { field_id: null, label: "Где", value: "метро" },
      { field_id: "syn", label: "Синонимы (старое)", value: "le fric" },
    ];
    const b: CustomFieldValue[] = [
      { field_id: "syn", label: "Синонимы", value: "le fric" },
      { field_id: null, label: "Где", value: "метро" },
    ];
    expect(sameFieldValues(a, b)).toBe(true);
    expect(sameFieldValues(a, [b[0]])).toBe(false);
    expect(sameFieldValues(undefined, [])).toBe(true);
    expect(
      sameFieldValues([{ field_id: null, label: "Где", value: "метро" }], [{ field_id: null, label: "Когда", value: "метро" }]),
    ).toBe(false);
  });
});

describe("fieldRowsError", () => {
  it("asks for a name when an added field has a value", () => {
    const rows = [{ ...newFieldRow(), value: "[ʒyn]" }];
    expect(fieldRowsError(rows, [SYN])).toBe("Назовите поле");
    expect(fieldRowsError([newFieldRow()], [SYN])).toBeNull();
  });

  it("refuses a name a shared or another one-off field already has", () => {
    expect(fieldRowsError([{ ...newFieldRow(), label: "синонимы", value: "x" }], [SYN])).toBe("Поле «синонимы» уже есть");
    const rows = [
      ...fieldRows(word([{ field_id: null, label: "Где", value: "метро" }]), []),
      { ...newFieldRow(), label: "где", value: "x" },
    ];
    expect(fieldRowsError(rows, [])).toBe("Поле «где» уже есть");
    expect(fieldRowsError([{ ...newFieldRow(), label: "Этимология", value: "x" }], [GONE])).toBeNull();
  });

  it("caps one-off fields at the per-word limit", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ ...newFieldRow(), label: `f${i}`, value: "v" }));
    expect(canAddField(many.slice(0, 11))).toBe(true);
    expect(canAddField(many)).toBe(false);
    // Empty shared fields do not count.
    expect(canAddField([...fieldRows(word([]), [SYN, PRON]), ...many.slice(0, 11)])).toBe(true);
  });
});

describe("word editor: fields", () => {
  it("patches custom_fields and undoes to the stored list ([] for older rows)", () => {
    const w = word(undefined);
    const draft = draftOf(w, [SYN]);
    expect(isDirty(w, "fields", draft)).toBe(false);
    draft.fields[0].value = "le fric";
    expect(isDirty(w, "fields", draft)).toBe(true);
    const patch = patchFor("fields", draft);
    expect(patch).toEqual({ custom_fields: [{ field_id: "syn", label: "Синонимы", value: "le fric" }] });
    expect(undoFor(w, patch)).toEqual({ custom_fields: [] });
  });

  it("is not dirty when nothing changed, whatever the stored order", () => {
    const w = word([
      { field_id: null, label: "Где", value: "метро" },
      { field_id: "syn", label: "Синонимы", value: "le fric" },
    ]);
    const draft = draftOf(w, [SYN, PRON]);
    expect(isDirty(w, "fields", draft)).toBe(false);
    // An added but empty row changes nothing either.
    draft.fields.push(newFieldRow());
    expect(isDirty(w, "fields", draft)).toBe(false);
    // Removing the one-off field does.
    draft.fields = draft.fields.filter((r) => r.label !== "Где");
    expect(isDirty(w, "fields", draft)).toBe(true);
    expect(patchFor("fields", draft).custom_fields).toEqual([{ field_id: "syn", label: "Синонимы", value: "le fric" }]);
  });

  it("other parts' dirtiness ignores the fields", () => {
    const w = word([{ field_id: "syn", label: "Синонимы", value: "le fric" }]);
    const draft = draftOf(w, [SYN]);
    draft.fields[0].value = "";
    expect(isDirty(w, "note", draft)).toBe(false);
    draft.note = "заметка";
    expect(isDirty(w, "note", draft)).toBe(true);
  });
});
