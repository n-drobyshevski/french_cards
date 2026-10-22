// «Свои поля»: the shared definitions (synced table `field_defs`). Values live on the words
// (`custom_fields`); a deleted definition leaves them in place, shown under their stored label.
import { useLiveQuery } from "dexie-react-hooks";
import { cleanFieldLabel, FIELD_HINT_MAX, liveFieldDefs, MAX_FIELD_DEFS } from "./core/custom-fields";
import { db } from "./db";
import { newId } from "./id";
import type { FieldDef } from "./types";

export * from "./core/custom-fields";

export type FieldDefDraft = Pick<FieldDef, "name" | "hint" | "ai_fill">;

const sameName = (a: string, b: string) => a.toLocaleLowerCase("ru") === b.toLocaleLowerCase("ru");
const cleanHint = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, FIELD_HINT_MAX) || null;

export class FieldDefError extends Error {}

export async function listFieldDefs(): Promise<FieldDef[]> {
  return liveFieldDefs(await db.field_defs.toArray());
}

const NO_DEFS: FieldDef[] = [];

/** Live definitions, in order; [] while loading. */
export function useFieldDefs(): FieldDef[] {
  return useLiveQuery(() => listFieldDefs(), []) ?? NO_DEFS;
}

function checkName(name: string, others: readonly FieldDef[]): string {
  const clean = cleanFieldLabel(name);
  if (!clean) throw new FieldDefError("Введите название поля");
  if (others.some((d) => sameName(d.name, clean))) throw new FieldDefError(`Поле «${clean}» уже есть`);
  return clean;
}

export async function createFieldDef(draft: FieldDefDraft, now: Date = new Date()): Promise<FieldDef> {
  return db.transaction("rw", db.field_defs, async () => {
    const live = liveFieldDefs(await db.field_defs.toArray());
    if (live.length >= MAX_FIELD_DEFS) throw new FieldDefError(`Не больше ${MAX_FIELD_DEFS} полей`);
    const def: FieldDef = {
      id: newId(),
      name: checkName(draft.name, live),
      hint: cleanHint(draft.hint),
      ai_fill: draft.ai_fill,
      sort: (live.at(-1)?.sort ?? 0) + 1,
      updated_at: now.toISOString(),
      deleted_at: null,
    };
    await db.field_defs.put(def);
    return def;
  });
}

export async function updateFieldDef(id: string, draft: FieldDefDraft, now: Date = new Date()): Promise<FieldDef> {
  return db.transaction("rw", db.field_defs, async () => {
    const current = await db.field_defs.get(id);
    if (!current || current.deleted_at !== null) throw new FieldDefError("Поле не найдено");
    const others = liveFieldDefs(await db.field_defs.toArray()).filter((d) => d.id !== id);
    const next: FieldDef = {
      ...current,
      name: checkName(draft.name, others),
      hint: cleanHint(draft.hint),
      ai_fill: draft.ai_fill,
      updated_at: now.toISOString(),
    };
    await db.field_defs.put(next);
    return next;
  });
}

/** Soft-deletes a definition; words keep their values. Undo with `restoreFieldDef`. */
export async function deleteFieldDef(id: string, now: Date = new Date()): Promise<FieldDef | null> {
  return db.transaction("rw", db.field_defs, async () => {
    const current = await db.field_defs.get(id);
    if (!current || current.deleted_at !== null) return null;
    const iso = now.toISOString();
    await db.field_defs.put({ ...current, deleted_at: iso, updated_at: iso });
    return current;
  });
}

export async function restoreFieldDef(def: FieldDef, now: Date = new Date()): Promise<void> {
  const current = await db.field_defs.get(def.id);
  await db.field_defs.put({ ...(current ?? def), deleted_at: null, updated_at: now.toISOString() });
}

/** Moves a definition one place up (-1) or down (+1); renumbers the order. */
export async function moveFieldDef(id: string, step: -1 | 1, now: Date = new Date()): Promise<void> {
  await db.transaction("rw", db.field_defs, async () => {
    const live = liveFieldDefs(await db.field_defs.toArray());
    const from = live.findIndex((d) => d.id === id);
    const to = from + step;
    if (from < 0 || to < 0 || to >= live.length) return;
    const order = [...live];
    [order[from], order[to]] = [order[to], order[from]];
    const iso = now.toISOString();
    await db.field_defs.bulkPut(order.flatMap((d, i) => (d.sort === i + 1 ? [] : [{ ...d, sort: i + 1, updated_at: iso }])));
  });
}
