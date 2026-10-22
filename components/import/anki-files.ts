// Which picked or dropped files go to the Anki import instead of the screenshot reader.

export const ANKI_ACCEPT = ".apkg,.colpkg,.txt,.csv,.tsv";

export function isAnkiFile(file: Pick<File, "name">): boolean {
  return /\.(apkg|colpkg|txt|csv|tsv)$/i.test(file.name);
}

/** The deck file among dropped/pasted files (the first one; screenshots win only when there is none). */
export function ankiFileOf<T extends Pick<File, "name">>(files: readonly T[]): T | null {
  return files.find(isAnkiFile) ?? null;
}
