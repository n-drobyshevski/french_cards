// «Свои поля» in the word's view: the rows of the fields editor (shared fields first, empty ones
// included, then the word's one-off fields) and the patch they make. Pure, for tests.
import {
  cleanCustomFields,
  cleanFieldLabel,
  fieldKey,
  fieldsForDisplay,
  liveFieldDefs,
  MAX_WORD_FIELDS,
} from "@/lib/core/custom-fields";
import type { CustomFieldValue, FieldDef, Word } from "@/lib/types";

export interface FieldRow {
  /** Stable key (fieldKey of the stored value, or `new:N` for a row added in the editor). */
  key: string;
  /** The stored field_id: a shared field's definition, or the deleted definition a value outlived. */
  field_id: string | null;
  label: string;
  value: string;
  /** A shared field (live definition): its label is the definition's name and it cannot be removed. */
  shared: boolean;
  hint: string | null;
  /** Added in the editor («+ Поле»): its label is typed too. */
  added?: boolean;
}

/** The editor's rows for a word: every shared field (empty ones too), then its one-off fields. */
export function fieldRows(word: Pick<Word, "custom_fields">, defs: readonly FieldDef[]): FieldRow[] {
  const stored = cleanCustomFields(word.custom_fields);
  return fieldsForDisplay(word, defs, { withEmpty: true }).map((f) => ({
    key: f.key,
    // A value whose definition was deleted is shown as one-off but keeps its field_id when saved.
    field_id: f.shared ? f.field_id : (stored.find((v) => fieldKey(v) === f.key)?.field_id ?? null),
    label: f.label,
    value: f.value,
    shared: f.shared,
    hint: f.hint,
  }));
}

let added = 0;

/** An empty one-off row («+ Поле»). */
export const newFieldRow = (): FieldRow => ({
  key: `new:${++added}`,
  field_id: null,
  label: "",
  value: "",
  shared: false,
  hint: null,
  added: true,
});

/** Room for another one-off field. */
export const canAddField = (rows: readonly FieldRow[]) =>
  rows.filter((r) => !r.shared || r.value.trim()).length < MAX_WORD_FIELDS;

/** The values the rows stand for (empty ones dropped), as `custom_fields`. */
export function rowsToValues(rows: readonly FieldRow[]): CustomFieldValue[] {
  return cleanCustomFields(rows.map((r) => ({ field_id: r.field_id, label: r.label, value: r.value })));
}

/**
 * Same fields and values, whatever the order. Labels count only for one-off values without a
 * definition (a shared value's label just follows its definition's name).
 */
export function sameFieldValues(
  a: readonly CustomFieldValue[] | null | undefined,
  b: readonly CustomFieldValue[] | null | undefined,
): boolean {
  const canon = (list: readonly CustomFieldValue[] | null | undefined) =>
    cleanCustomFields(list)
      .map((f) => [fieldKey(f), f.field_id ? "" : f.label, f.value].join("\u0000"))
      .sort()
      .join("\u0001");
  return canon(a) === canon(b);
}

/** What stops the rows from saving: an added field with a value but no name, or a name used twice. */
export function fieldRowsError(rows: readonly FieldRow[], defs: readonly FieldDef[]): string | null {
  const taken = new Set(liveFieldDefs(defs).map((d) => d.name.toLocaleLowerCase("ru")));
  for (const r of rows) {
    if (r.shared) continue;
    const label = cleanFieldLabel(r.label);
    if (!label) {
      if (r.value.trim()) return "Назовите поле";
      continue;
    }
    const key = label.toLocaleLowerCase("ru");
    if (r.added && taken.has(key)) return `Поле «${label}» уже есть`;
    taken.add(key);
  }
  return null;
}
