"use client";

import { useLiveQuery } from "dexie-react-hooks";
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
  return useLiveQuery(async () => {
    if (!enabled) return null;
    const now = new Date();
    const [folders, words, states] = await Promise.all([
      listFolders(),
      folderId === undefined || folderId === null
        ? db.words.filter((w) => w.deleted_at === null).toArray()
        : db.words.where("folder_id").equals(folderId).filter((w) => w.deleted_at === null).toArray(),
      db.review_state.filter((s) => s.deleted_at === null).toArray(),
    ]);
    const byId = new Map(folders.map((f) => [f.id, f]));
    const statesByWord = new Map<string, ReviewState[]>();
    for (const s of states) {
      const list = statesByWord.get(s.word_id);
      if (list) list.push(s);
      else statesByWord.set(s.word_id, [s]);
    }
    const rows: LibraryWord[] = [];
    for (const word of words) {
      const folder = word.folder_id !== null ? byId.get(word.folder_id) : undefined;
      if (folderId === null && folder) continue;
      rows.push({ word, folder, schedule: wordSchedule(statesByWord.get(word.id) ?? [], now) });
    }
    rows.sort((a, b) => b.word.created_at.localeCompare(a.word.created_at));
    return { folders, words: rows };
  }, [folderId, enabled]);
}
