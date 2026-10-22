"use client";

// Rows that leave or come back because of what the user just did (MOTION-SPEC §5.10, L7, L10, D8).
// A delete, a move or a drop marks its word ids here before the write; any word list that then
// loses one of them keeps it on screen, closed by its height (`--dur-move`), instead of letting it
// vanish. «Отменить» marks the ids as returning, so the row opens again where it was. Lists filtered
// by typing or by sync from another device are not marked, so their rows still change at once.
import { useEffect, useRef, useState } from "react";
import { tokenMs } from "@/lib/motion";

/** A mark older than this is ignored (the write and the live query take a few frames, not seconds). */
const MARK_MS = 2_000;

const leaving = new Map<string, number>();
const returning = new Map<string, number>();

function fresh(marks: Map<string, number>, id: string): boolean {
  const at = marks.get(id);
  if (at === undefined) return false;
  if (Date.now() - at <= MARK_MS) return true;
  marks.delete(id);
  return false;
}

/** Call before writing a delete / move: these rows close instead of vanishing. */
export function markLeaving(ids: Iterable<string>): void {
  const now = Date.now();
  for (const id of ids) {
    leaving.set(id, now);
    returning.delete(id);
  }
}

/** Call before an undo restores rows: they open again (Collapse) where they were. */
export function markReturning(ids: Iterable<string>): void {
  const now = Date.now();
  for (const id of ids) {
    returning.set(id, now);
    leaving.delete(id);
  }
}

/** True for a row that is coming back after «Отменить» (open it with Collapse `appear`). */
export function isReturning(id: string): boolean {
  return fresh(returning, id);
}

export interface ListEntry<T> {
  id: string;
  item: T;
  /** No longer in the list: render it closed (height → 0), not interactive, hidden from assistive tech. */
  leaving: boolean;
  /** Back after «Отменить»: open it from 0. */
  returning: boolean;
}

function build<T>(items: readonly T[], previous: readonly ListEntry<T>[], idOf: (item: T) => string): ListEntry<T>[] {
  const present = new Set<string>();
  for (const item of items) present.add(idOf(item));
  // Rows that left since the last list and were marked (or were already closing), after the row they followed.
  const after = new Map<string | null, ListEntry<T>[]>();
  let anchor: string | null = null;
  for (const entry of previous) {
    if (present.has(entry.id)) {
      anchor = entry.id;
      continue;
    }
    if (!entry.leaving && !fresh(leaving, entry.id)) continue;
    const ghost: ListEntry<T> = entry.leaving ? entry : { ...entry, leaving: true, returning: false };
    const list = after.get(anchor);
    if (list) list.push(ghost);
    else after.set(anchor, [ghost]);
  }
  const entries: ListEntry<T>[] = [...(after.get(null) ?? [])];
  for (const item of items) {
    const id = idOf(item);
    entries.push({ id, item, leaving: false, returning: fresh(returning, id) });
    const trailing = after.get(id);
    if (trailing) entries.push(...trailing);
  }
  return entries;
}

/**
 * The list to render: `items`, plus the rows that just left it because they were marked with
 * markLeaving(), each kept at its old place for the length of its close (`--dur-move`) and then
 * dropped. Order and identity otherwise follow `items`.
 */
export function useLeavingList<T>(items: readonly T[], idOf: (item: T) => string): ListEntry<T>[] {
  const [state, setState] = useState(() => ({ items, entries: build(items, [], idOf) }));
  let entries = state.entries;
  if (state.items !== items) {
    entries = build(items, state.entries, idOf);
    setState({ items, entries });
  }

  // Each closing row is dropped once its close has run.
  const timers = useRef(new Map<string, number>());
  useEffect(() => {
    for (const entry of state.entries) {
      if (!entry.leaving || timers.current.has(entry.id)) continue;
      const id = entry.id;
      timers.current.set(
        id,
        window.setTimeout(() => {
          timers.current.delete(id);
          leaving.delete(id);
          setState((s) => ({ ...s, entries: s.entries.filter((e) => e.id !== id || !e.leaving) }));
        }, tokenMs("--dur-move", 200) + 60),
      );
    }
  }, [state.entries]);
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) window.clearTimeout(timer);
      pending.clear();
    };
  }, []);

  return entries;
}
