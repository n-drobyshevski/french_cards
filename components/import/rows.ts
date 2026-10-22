// Review-list model for the screenshot import: one row per extracted item, with the user's
// edits, selection and theme choice. Pure functions (no Dexie) so they are unit-tested.
import type { NewFolderProposal, VocabItem } from "@/lib/ai/schemas";
import { NEW_FOLDER_MIN_WORDS } from "@/lib/ai/schemas";
import type { Confidence, Folder, Gender, PartOfSpeech, SlangLevel, Word } from "@/lib/types";
import type { NewWordInput } from "@/lib/words";

/** Where a row goes: «Входящие», an existing theme, or a theme proposed with the rows. */
export type FolderChoice =
  | { kind: "inbox" }
  | { kind: "folder"; id: string }
  | { kind: "new"; slug: string; name: string; description: string };

export interface ImportRow {
  key: string;
  fr: string;
  ru: string;
  note: string | null;
  frAsSeen: string | null;
  pos: PartOfSpeech;
  gender: Gender;
  slang_level: SlangLevel;
  verlan: boolean;
  confidence: Confidence;
  /** Translation was not on the screenshot (shown as «ДОГАДКА») and the user has not edited it. */
  ruGuess: boolean;
  /** Short remark from the reader, e.g. «текст обрезан справа». */
  issue: string | null;
  /** Amber row until the user has checked it. */
  warn: boolean;
  /** The library already has this word. */
  duplicate: Word | null;
  checked: boolean;
  folder: FolderChoice;
  /** "auto" while the theme is the automatic pick; "user" once changed by hand. */
  folderSource: "auto" | "user";
}

export const INBOX: FolderChoice = { kind: "inbox" };

/** Distinct new themes the reader proposed, in first-seen order. */
export function proposalsOf(items: readonly VocabItem[]): NewFolderProposal[] {
  const out = new Map<string, NewFolderProposal>();
  for (const it of items) if (it.new_folder && !out.has(it.new_folder.slug)) out.set(it.new_folder.slug, it.new_folder);
  return [...out.values()];
}

/** How many rows were put in each proposed new theme. */
function newFolderVotes(items: readonly VocabItem[]): Map<string, number> {
  const votes = new Map<string, number>();
  for (const it of items) {
    if (it.folder === "NEW" && it.new_folder) votes.set(it.new_folder.slug, (votes.get(it.new_folder.slug) ?? 0) + 1);
  }
  return votes;
}

const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase("ru") === b.trim().toLocaleLowerCase("ru");

/**
 * The automatic theme for an item. A proposed new theme is used only when at least
 * NEW_FOLDER_MIN_WORDS rows go there (otherwise «Входящие»); one whose name already exists
 * maps to that folder.
 */
export function autoFolderChoice(
  item: Pick<VocabItem, "folder" | "new_folder">,
  folders: readonly Pick<Folder, "id" | "slug" | "name">[],
  votes: ReadonlyMap<string, number>,
): FolderChoice {
  if (item.folder === "INBOX") return INBOX;
  if (item.folder === "NEW") {
    const proposal = item.new_folder;
    if (!proposal) return INBOX;
    const existing = folders.find((f) => sameName(f.name, proposal.name) || f.slug === proposal.slug);
    if (existing) return { kind: "folder", id: existing.id };
    return (votes.get(proposal.slug) ?? 0) >= NEW_FOLDER_MIN_WORDS ? { kind: "new", ...proposal } : INBOX;
  }
  const folder = folders.find((f) => f.slug === item.folder);
  return folder ? { kind: "folder", id: folder.id } : INBOX;
}

export function isWarn(item: Pick<VocabItem, "confidence" | "issue">): boolean {
  return item.confidence === "low" || !!item.issue;
}

/**
 * Rows for the review list. Duplicates and doubtful rows start unchecked. With automatic
 * sorting off (Settings «Раскладывать по темам автоматически») every row starts in «Входящие».
 */
export function buildRows(
  items: readonly VocabItem[],
  folders: readonly Pick<Folder, "id" | "slug" | "name">[],
  duplicates: ReadonlyMap<string, Word>,
  { autoSort = true }: { autoSort?: boolean } = {},
): ImportRow[] {
  const votes = newFolderVotes(items);
  return items.map((it, i) => {
    const duplicate = duplicates.get(it.fr) ?? null;
    const warn = isWarn(it);
    return {
      key: `r${i}`,
      fr: it.fr,
      ru: it.ru,
      note: it.note,
      frAsSeen: it.fr_as_seen,
      pos: it.pos,
      gender: it.gender,
      slang_level: it.slang_level,
      verlan: it.verlan,
      confidence: it.confidence,
      ruGuess: it.ru_suggested,
      issue: it.issue,
      warn,
      duplicate,
      checked: !duplicate && !warn && canAdd({ fr: it.fr, ru: it.ru, duplicate }),
      folder: autoSort ? autoFolderChoice(it, folders, votes) : INBOX,
      folderSource: "auto",
    };
  });
}

/** A row can be added when both sides are filled and the word is not in the library yet. */
export function canAdd(row: Pick<ImportRow, "fr" | "ru" | "duplicate">): boolean {
  return !row.duplicate && row.fr.trim() !== "" && row.ru.trim() !== "";
}

export function checkedRows(rows: readonly ImportRow[]): ImportRow[] {
  return rows.filter((r) => r.checked && canAdd(r));
}

export function updateRow(rows: readonly ImportRow[], key: string, patch: Partial<ImportRow>): ImportRow[] {
  return rows.map((r) => {
    if (r.key !== key) return r;
    const next = { ...r, ...patch };
    if (!canAdd(next)) next.checked = false;
    return next;
  });
}

/** «Выбрать все» / «Снять все»: only rows that can be added are affected. */
export function setAllChecked(rows: readonly ImportRow[], checked: boolean): ImportRow[] {
  return rows.map((r) => (canAdd(r) ? { ...r, checked } : { ...r, checked: false }));
}

export function allAddableChecked(rows: readonly ImportRow[]): boolean {
  const addable = rows.filter(canAdd);
  return addable.length > 0 && addable.every((r) => r.checked);
}

/** «Тема для всех»: puts every checked row in `choice` (a manual choice). */
export function applyFolderToChecked(rows: readonly ImportRow[], choice: FolderChoice): ImportRow[] {
  return rows.map((r) => (r.checked && canAdd(r) ? { ...r, folder: choice, folderSource: "user" } : r));
}

/** Stable string key for a choice, for pickers. */
export function choiceKey(choice: FolderChoice): string {
  if (choice.kind === "inbox") return "inbox";
  if (choice.kind === "folder") return `f:${choice.id}`;
  return `n:${choice.slug}`;
}

export function choiceFromKey(
  key: string,
  folders: readonly Pick<Folder, "id">[],
  proposals: readonly NewFolderProposal[],
): FolderChoice | null {
  if (key === "inbox") return INBOX;
  if (key.startsWith("f:")) {
    const id = key.slice(2);
    return folders.some((f) => f.id === id) ? { kind: "folder", id } : null;
  }
  if (key.startsWith("n:")) {
    const p = proposals.find((x) => x.slug === key.slice(2));
    return p ? { kind: "new", ...p } : null;
  }
  return null;
}

/** The choice every checked row shares, or null when they differ (or none is checked). */
export function commonChoice(rows: readonly ImportRow[]): FolderChoice | null {
  const keys = new Set(checkedRows(rows).map((r) => choiceKey(r.folder)));
  if (keys.size !== 1) return null;
  return checkedRows(rows)[0].folder;
}

/** Display name of a choice. A folder deleted in the meantime reads as «Входящие». */
export function choiceName(choice: FolderChoice, folders: readonly Pick<Folder, "id" | "name">[]): string {
  if (choice.kind === "new") return choice.name;
  if (choice.kind === "folder") return folders.find((f) => f.id === choice.id)?.name ?? "Входящие";
  return "Входящие";
}

/** New themes the checked rows need created, without repeats. */
export function newFoldersNeeded(rows: readonly ImportRow[]): Extract<FolderChoice, { kind: "new" }>[] {
  const out = new Map<string, Extract<FolderChoice, { kind: "new" }>>();
  for (const r of checkedRows(rows)) if (r.folder.kind === "new" && !out.has(r.folder.slug)) out.set(r.folder.slug, r.folder);
  return [...out.values()];
}

/**
 * The word to save for a row. `folderId` is the resolved theme (null = «Входящие»).
 * Automatic picks keep the reader's confidence; manual ones are marked as placed by the user.
 */
export function toWordInput(row: ImportRow, folderId: string | null): NewWordInput {
  const manual = row.folderSource === "user";
  return {
    fr: row.fr,
    ru: row.ru,
    note: row.note,
    pos: row.pos,
    gender: row.gender,
    slang_level: row.slang_level,
    verlan: row.verlan,
    folder_id: folderId,
    folder_source: manual ? "user" : "auto",
    folder_confidence: folderId === null || manual ? null : row.confidence,
    source: "screenshot",
  };
}

/** «1 слово», «3 слова», «5 слов». */
export function pluralRu(n: number, forms: readonly [one: string, few: string, many: string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

export const wordsRu = (n: number) => `${n} ${pluralRu(n, ["слово", "слова", "слов"])}`;
export const fragmentsRu = (n: number) => `${n} ${pluralRu(n, ["фрагмент", "фрагмента", "фрагментов"])}`;
export const screenshotsRu = (n: number) => `${n} ${pluralRu(n, ["скриншот", "скриншота", "скриншотов"])}`;
