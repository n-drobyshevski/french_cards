// Saving from the add sheet: resolves the theme (creating a new one if chosen), adds the
// word(s), and undoes both for the snackbar's «Отменить».
import { db } from "@/lib/db";
import { createFolder, deleteFolder, getFolder, listFolders } from "@/lib/folders";
import type { Confidence, Folder, Word } from "@/lib/types";
import { addWords, softDeleteWords, type NewWordInput } from "@/lib/words";
import type { FolderChoice } from "./folder-choice";

export interface ResolvedFolder {
  folderId: string | null;
  /** Set when this save created the folder (undo removes it again if it is left empty). */
  created: Folder | null;
}

/** Turns a choice into a folder id, creating a proposed theme on the spot. */
export async function resolveFolderChoice(choice: FolderChoice, createdBy: Folder["created_by"]): Promise<ResolvedFolder> {
  if (choice.kind === "inbox") return { folderId: null, created: null };
  if (choice.kind === "folder") {
    const folder = await getFolder(choice.id);
    return { folderId: folder ? folder.id : null, created: null };
  }
  const name = choice.name.replace(/\s+/g, " ").trim();
  const existing = (await listFolders()).find((f) => f.name.toLocaleLowerCase("ru") === name.toLocaleLowerCase("ru"));
  if (existing) return { folderId: existing.id, created: null };
  const created = await createFolder({ name, description: choice.description, created_by: createdBy });
  return { folderId: created.id, created };
}

export interface SaveRequest {
  words: NewWordInput[];
  folder: FolderChoice;
  folderSource: Word["folder_source"];
  /** Confidence of the automatic pick, when it was kept. */
  folderConfidence: Confidence | null;
  /** created_by for a theme created by this save. */
  newFolderCreatedBy: Folder["created_by"];
}

export interface SaveResult {
  words: Word[];
  createdFolder: Folder | null;
}

export async function saveWords(req: SaveRequest): Promise<SaveResult> {
  const { folderId, created } = await resolveFolderChoice(req.folder, req.newFolderCreatedBy);
  try {
    const words = await addWords(
      req.words.map((w) => ({
        ...w,
        folder_id: folderId,
        folder_source: req.folderSource,
        folder_confidence: folderId === null ? null : req.folderConfidence,
      })),
    );
    return { words, createdFolder: created };
  } catch (error) {
    if (created) await deleteFolder(created.id).catch(() => {});
    throw error;
  }
}

/** Undo for the snackbar: removes the words, and the theme this save created if nothing else is in it. */
export async function undoSave(result: SaveResult): Promise<void> {
  await softDeleteWords(result.words.map((w) => w.id));
  const folder = result.createdFolder;
  if (!folder) return;
  const left = await db.words
    .where("folder_id")
    .equals(folder.id)
    .filter((w) => w.deleted_at === null)
    .count();
  if (left === 0) await deleteFolder(folder.id);
}
