// «Свои поля»: pure helpers shared by the app and the server (no Dexie). A word's values live in
// `custom_fields`; shared definitions (FieldDef) live in their own synced table (lib/custom-fields.ts).
import type { CustomFieldValue, FieldDef, Word } from "../types";

/** Shared definitions at most. */
export const MAX_FIELD_DEFS = 10;
/** Values per word at most (shared and one-off together). */
export const MAX_WORD_FIELDS = 12;
export const FIELD_LABEL_MAX = 40;
export const FIELD_HINT_MAX = 200;
export const FIELD_VALUE_MAX = 300;

const clip = (s: string | null | undefined, max: number): string => (s ?? "").replace(/\s+/g, " ").trim().slice(0, max).trim();

export const cleanFieldLabel = (s: string | null | undefined) => clip(s, FIELD_LABEL_MAX);
export const cleanFieldValue = (s: string | null | undefined) => clip(s, FIELD_VALUE_MAX);

const sameLabel = (a: string, b: string) => a.toLocaleLowerCase("ru") === b.toLocaleLowerCase("ru");

/** Identity of a value: its definition, or (one-off) its label. */
export const fieldKey = (f: Pick<CustomFieldValue, "field_id" | "label">) =>
  f.field_id ? `id:${f.field_id}` : `label:${f.label.toLocaleLowerCase("ru")}`;

/** Trimmed, without empty labels or values and without repeats (the first wins), capped. */
export function cleanCustomFields(list: readonly Partial<CustomFieldValue>[] | null | undefined): CustomFieldValue[] {
  const out: CustomFieldValue[] = [];
  const seen = new Set<string>();
  for (const f of list ?? []) {
    if (!f || typeof f !== "object") continue;
    const label = cleanFieldLabel(f.label);
    const value = cleanFieldValue(f.value);
    if (!label || !value) continue;
    const field: CustomFieldValue = { field_id: typeof f.field_id === "string" && f.field_id ? f.field_id : null, label, value };
    const key = fieldKey(field);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(field);
    if (out.length === MAX_WORD_FIELDS) break;
  }
  return out;
}

/** Live definitions in their order. */
export function liveFieldDefs<T extends Pick<FieldDef, "deleted_at" | "sort" | "name">>(defs: readonly T[]): T[] {
  return defs.filter((d) => d.deleted_at === null).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "ru"));
}

/** The live definition with this name (case-insensitive), if any. */
export function fieldDefByName<T extends Pick<FieldDef, "name" | "deleted_at">>(defs: readonly T[], name: string): T | undefined {
  const n = cleanFieldLabel(name);
  return defs.find((d) => d.deleted_at === null && sameLabel(d.name, n));
}

export interface ShownField {
  /** Stable key for lists and edits (see fieldKey). */
  key: string;
  field_id: string | null;
  /** The definition's current name, or the one-off label. */
  label: string;
  /** "" for an empty shared field (only with `withEmpty`). */
  value: string;
  /** A shared field (has a live definition). */
  shared: boolean;
  hint: string | null;
}

/**
 * The word's fields for display: shared ones in definition order (with their current names), then
 * one-off ones, and values whose definition was deleted, under their stored label. `withEmpty` adds
 * the shared fields the word has no value for (editing).
 */
export function fieldsForDisplay(
  word: Pick<Word, "custom_fields">,
  defs: readonly FieldDef[],
  { withEmpty = false }: { withEmpty?: boolean } = {},
): ShownField[] {
  const values = cleanCustomFields(word.custom_fields);
  const live = liveFieldDefs(defs);
  const liveIds = new Set(live.map((d) => d.id));
  const out: ShownField[] = [];
  for (const def of live) {
    const v = values.find((f) => f.field_id === def.id);
    if (!v && !withEmpty) continue;
    out.push({ key: `id:${def.id}`, field_id: def.id, label: def.name, value: v?.value ?? "", shared: true, hint: def.hint });
  }
  for (const v of values) {
    if (v.field_id && liveIds.has(v.field_id)) continue;
    out.push({ key: fieldKey(v), field_id: null, label: v.label, value: v.value, shared: false, hint: null });
  }
  return out;
}

/**
 * The list with one field set (a shared one by `field_id`, a one-off one by label); an empty value
 * removes it. A value whose definition was deleted is addressed as one-off (field_id null) by label.
 */
export function withFieldValue(
  list: readonly CustomFieldValue[] | null | undefined,
  field: { field_id: string | null; label: string },
  value: string | null,
): CustomFieldValue[] {
  const label = cleanFieldLabel(field.label);
  const clean = cleanFieldValue(value);
  const current = cleanCustomFields(list);
  let at: number;
  if (field.field_id) at = current.findIndex((f) => f.field_id === field.field_id);
  else {
    at = current.findIndex((f) => f.field_id === null && sameLabel(f.label, label));
    if (at < 0) at = current.findIndex((f) => sameLabel(f.label, label));
  }
  const next = [...current];
  if (!clean || !label) {
    if (at >= 0) next.splice(at, 1);
    return next;
  }
  // A one-off edit of a value whose definition was deleted keeps its field_id (it comes back with the definition).
  const fieldId = field.field_id ?? (at >= 0 ? current[at].field_id : null);
  const entry: CustomFieldValue = { field_id: fieldId, label, value: clean };
  if (at >= 0) next[at] = entry;
  else next.push(entry);
  return cleanCustomFields(next);
}

/** Shared fields marked for the automatic fill that the word has no value for yet. */
export function emptyAutoFields(word: Pick<Word, "custom_fields">, defs: readonly FieldDef[]): FieldDef[] {
  const filled = new Set(cleanCustomFields(word.custom_fields).map((f) => f.field_id));
  return liveFieldDefs(defs).filter((d) => d.ai_fill && !filled.has(d.id));
}

/** The values as text for search. */
export const customFieldsText = (word: Pick<Word, "custom_fields">) => (word.custom_fields ?? []).map((f) => f.value).join(" ");
