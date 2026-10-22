// Which theme a new word goes to: the automatic pick from a suggestion, its alternatives,
// a proposed new theme, or anything the user taps. Pure helpers (no Dexie).
import { FOLDER_INBOX, FOLDER_NEW, NEW_FOLDER_MIN_WORDS } from "@/lib/ai/constants";
import type { EnrichResult, Suggestion } from "@/lib/ai/schemas";
import type { Folder } from "@/lib/types";

export type FolderChoice =
  | { kind: "inbox" }
  | { kind: "folder"; id: string }
  | { kind: "new"; name: string; description: string | null };

export const INBOX_CHOICE: FolderChoice = { kind: "inbox" };

/** Stable key for React lists and equality. A new theme is keyed by its lowercased name. */
export function choiceKey(choice: FolderChoice): string {
  switch (choice.kind) {
    case "inbox":
      return "inbox";
    case "folder":
      return `folder:${choice.id}`;
    case "new":
      return `new:${choice.name.toLocaleLowerCase("ru")}`;
  }
}

export const sameChoice = (a: FolderChoice | null, b: FolderChoice | null) => !!a && !!b && choiceKey(a) === choiceKey(b);

/** Display name: «Входящие», the folder name, or the proposed name. */
export function choiceName(choice: FolderChoice, folders: readonly Pick<Folder, "id" | "name">[]): string {
  if (choice.kind === "inbox") return "Входящие";
  if (choice.kind === "new") return choice.name;
  return folders.find((f) => f.id === choice.id)?.name ?? "Входящие";
}

export interface SuggestionFolders {
  /** The automatic pick. */
  auto: FolderChoice;
  /** Existing folders offered next to it (≤2, never the auto pick). */
  alternatives: FolderChoice[];
  /** «+ новая тема: X» when a new theme was proposed but is not the auto pick. */
  proposal: FolderChoice | null;
}

/**
 * Resolves a suggestion's `folder` (slug | NEW | INBOX), alternatives and `new_folder`
 * against the folders on this device. Unknown slugs fall back to «Входящие»; a proposed
 * theme whose name already exists becomes that folder.
 */
export function foldersForSuggestion(
  suggestion: Pick<Suggestion, "folder" | "folder_alternatives" | "new_folder">,
  folders: readonly Pick<Folder, "id" | "slug" | "name">[],
): SuggestionFolders {
  const bySlug = new Map(folders.map((f) => [f.slug, f]));
  const byName = new Map(folders.map((f) => [f.name.toLocaleLowerCase("ru"), f]));

  let proposal: FolderChoice | null = null;
  const nf = suggestion.new_folder;
  if (nf && nf.name.trim()) {
    const existing = byName.get(nf.name.trim().toLocaleLowerCase("ru")) ?? bySlug.get(nf.slug);
    proposal = existing ? { kind: "folder", id: existing.id } : { kind: "new", name: nf.name.trim(), description: nf.description?.trim() || null };
  }

  let auto: FolderChoice = INBOX_CHOICE;
  if (suggestion.folder === FOLDER_NEW) auto = proposal ?? INBOX_CHOICE;
  else if (suggestion.folder !== FOLDER_INBOX) {
    const f = bySlug.get(suggestion.folder);
    if (f) auto = { kind: "folder", id: f.id };
  }

  const seen = new Set([choiceKey(auto)]);
  const alternatives: FolderChoice[] = [];
  for (const slug of suggestion.folder_alternatives) {
    const f = bySlug.get(slug);
    if (!f) continue;
    const choice: FolderChoice = { kind: "folder", id: f.id };
    if (seen.has(choiceKey(choice))) continue;
    seen.add(choiceKey(choice));
    alternatives.push(choice);
    if (alternatives.length >= 2) break;
  }

  if (proposal && seen.has(choiceKey(proposal))) proposal = null;
  // A proposal that resolved to an existing folder is just another alternative.
  if (proposal?.kind === "folder") {
    alternatives.push(proposal);
    proposal = null;
  }
  return { auto, alternatives, proposal };
}

/** How the word is filed: kept automatic pick → "auto" (with the suggestion's confidence), anything chosen → "user". */
export function folderSource(
  chosen: FolderChoice,
  auto: FolderChoice | null,
  touched: boolean,
): { folder_source: "auto" | "user"; kept_auto: boolean } {
  const keptAuto = !touched || (auto !== null && sameChoice(chosen, auto));
  return { folder_source: keptAuto ? "auto" : "user", kept_auto: keptAuto && auto !== null };
}

/**
 * Automatic themes for pasted «Список» rows (null = not detected yet). Like a suggestion's pick,
 * but a proposed new theme is used only when at least NEW_FOLDER_MIN_WORDS rows go there, and a
 * low-confidence pick stays in «Входящие».
 */
export function listFolderChoices(
  results: readonly (EnrichResult | null)[],
  folders: readonly Pick<Folder, "id" | "slug" | "name">[],
): (FolderChoice | null)[] {
  const picks = results.map((r) =>
    r && r.folder !== null && r.confidence !== "low" ? foldersForSuggestion({ ...r, folder: r.folder }, folders).auto : r ? INBOX_CHOICE : null,
  );
  const votes = new Map<string, number>();
  for (const p of picks) if (p?.kind === "new") votes.set(choiceKey(p), (votes.get(choiceKey(p)) ?? 0) + 1);
  return picks.map((p) => (p?.kind === "new" && (votes.get(choiceKey(p)) ?? 0) < NEW_FOLDER_MIN_WORDS ? INBOX_CHOICE : p));
}
