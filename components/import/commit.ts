// Saves the checked import rows: creates the proposed themes they use, adds the words in one
// transaction, and returns what is needed to undo the whole import.
import { createFolder, deleteFolder, listFolders } from "@/lib/folders";
import { findDuplicates, normalizeLemma } from "@/lib/text";
import type { Folder, Word } from "@/lib/types";
import { addWords, softDeleteWords } from "@/lib/words";
import { checkedRows, newFoldersNeeded, toWordInput, type FolderChoice, type ImportRow } from "./rows";

export interface ImportCommit {
  words: Word[];
  /** Themes created for this import (removed again on undo). */
  createdFolders: string[];
  /** Checked rows left out because the library (or an earlier row) already has the word. */
  skipped: number;
}

const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase("ru") === b.trim().toLocaleLowerCase("ru");

export async function commitImport(rows: readonly ImportRow[], now: Date = new Date()): Promise<ImportCommit> {
  const chosen = checkedRows(rows);
  if (chosen.length === 0) return { words: [], createdFolders: [], skipped: 0 };

  // The library may have changed while the list was open, and edits may have made two rows equal.
  const dups = await findDuplicates(chosen.map((r) => r.fr));
  const seen = new Set<string>();
  const fresh = chosen.filter((r) => {
    if (dups.has(r.fr)) return false;
    const key = normalizeLemma(r.fr);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (fresh.length === 0) return { words: [], createdFolders: [], skipped: chosen.length };

  let live: Folder[] = await listFolders();
  const created: string[] = [];
  const newIds = new Map<string, string>();
  for (const proposal of newFoldersNeeded(fresh)) {
    const existing = live.find((f) => sameName(f.name, proposal.name));
    if (existing) {
      newIds.set(proposal.slug, existing.id);
      continue;
    }
    try {
      const folder = await createFolder({ name: proposal.name, description: proposal.description, created_by: "auto" }, now);
      created.push(folder.id);
      newIds.set(proposal.slug, folder.id);
      live = [...live, folder];
    } catch {
      // Created elsewhere in the meantime (sync): use that one.
      live = await listFolders();
      const again = live.find((f) => sameName(f.name, proposal.name));
      if (again) newIds.set(proposal.slug, again.id);
    }
  }

  const liveIds = new Set(live.map((f) => f.id));
  const resolve = (choice: FolderChoice): string | null => {
    if (choice.kind === "folder") return liveIds.has(choice.id) ? choice.id : null;
    if (choice.kind === "new") return newIds.get(choice.slug) ?? null;
    return null;
  };

  try {
    const words = await addWords(
      fresh.map((r) => toWordInput(r, resolve(r.folder))),
      now,
    );
    return { words, createdFolders: created, skipped: chosen.length - fresh.length };
  } catch (error) {
    for (const id of created) await deleteFolder(id, now).catch(() => {});
    throw error;
  }
}

/** «Отменить»: removes the imported words and the themes created for them. */
export async function undoImport(commit: ImportCommit, now: Date = new Date()): Promise<void> {
  await softDeleteWords(
    commit.words.map((w) => w.id),
    now,
  );
  for (const id of commit.createdFolders) await deleteFolder(id, now);
}
