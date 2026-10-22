"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useRef } from "react";
import { db } from "@/lib/db";
import { listFolders } from "@/lib/folders";
import type { Folder, ReviewState, Word } from "@/lib/types";
import { wordSchedule, type WordSchedule } from "./format";

export interface LibraryWord {
  word: Word;
  schedule: WordSchedule;
  /** Live folder the word is in; undefined = «Входящие». */
  folder?: Folder;
}

export interface LibraryWords {
  folders: Folder[];
  words: LibraryWord[];
}

/**
 * Live words with their row status. `folderId`: undefined = all, null = «Входящие» (including
 * words whose folder is gone), otherwise one folder. Newest first. Undefined while loading,
 * null while `enabled` is false.
 */
export function useLibraryWords(folderId?: string | null, enabled = true): LibraryWords | null | undefined {
  // The previous result, so unchanged rows keep their identity across re-reads (memoised rows skip).
  const last = useRef<LibraryWords | null>(null);
  return useLiveQuery(async () => {
    if (!enabled) return null;
    const now = new Date();
    // Plain toArray() is one getAll, shared by every live query of the table (a filter walks a cursor).
    const [folders, words, states] = await Promise.all([
      listFolders(),
      folderId === undefined || folderId === null ? db.words.toArray() : db.words.where("folder_id").equals(folderId).toArray(),
      db.review_state.toArray(),
    ]);
    const byId = new Map(folders.map((f) => [f.id, f]));
    const statesByWord = new Map<string, ReviewState[]>();
    for (const s of states) {
      if (s.deleted_at !== null) continue;
      const list = statesByWord.get(s.word_id);
      if (list) list.push(s);
      else statesByWord.set(s.word_id, [s]);
    }
    const rows: LibraryWord[] = [];
    for (const word of words) {
      if (word.deleted_at !== null) continue;
      const folder = word.folder_id !== null ? byId.get(word.folder_id) : undefined;
      if (folderId === null && folder) continue;
      rows.push({ word, folder, schedule: wordSchedule(statesByWord.get(word.id) ?? [], now, !!word.muted) });
    }
    rows.sort((a, b) => b.word.created_at.localeCompare(a.word.created_at));
    const result = shareLibraryWords(last.current, { folders, words: rows });
    last.current = result;
    return result;
  }, [folderId, enabled]);
}

/**
 * `next`, reusing every folder and row of `prev` whose values are unchanged, and `prev` itself (or
 * its arrays) when nothing changed. Compared by value: restores and undos can bring back older rows.
 */
export function shareLibraryWords(prev: LibraryWords | null, next: LibraryWords): LibraryWords {
  if (!prev) return next;
  const oldFolders = new Map(prev.folders.map((f) => [f.id, f]));
  const folders = sameItems(
    prev.folders,
    next.folders.map((f) => {
      const old = oldFolders.get(f.id);
      return old && sameRecord(old, f) ? old : f;
    }),
  );
  const shared = new Map(folders.map((f) => [f.id, f]));
  const oldRows = new Map(prev.words.map((r) => [r.word.id, r]));
  const words = sameItems(
    prev.words,
    next.words.map((r) => {
      const folder = r.folder && shared.get(r.folder.id);
      const old = oldRows.get(r.word.id);
      if (old && old.folder === folder && sameSchedule(old.schedule, r.schedule) && sameRecord(old.word, r.word)) return old;
      return folder === r.folder ? r : { ...r, folder };
    }),
  );
  return folders === prev.folders && words === prev.words ? prev : { folders, words };
}

/** `prev` when `next` holds the same items in the same order. */
function sameItems<T>(prev: T[], next: T[]): T[] {
  return prev.length === next.length && next.every((x, i) => x === prev[i]) ? prev : next;
}

function sameSchedule(a: WordSchedule, b: WordSchedule): boolean {
  return a.status === b.status && a.dueLabel === b.dueLabel && a.tone === b.tone && a.due === b.due && a.nextDue === b.nextDue;
}

/** Same own keys and values; arrays and objects (tags, examples) by their JSON. */
function sameRecord(a: object, b: object): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) {
    const x = (a as Record<string, unknown>)[k];
    const y = (b as Record<string, unknown>)[k];
    if (x === y) continue;
    if (typeof x !== "object" || typeof y !== "object" || x === null || y === null || JSON.stringify(x) !== JSON.stringify(y)) return false;
  }
  return true;
}
