// Server-side clean-up of model output before it reaches the client: trims text, maps slang
// codes to levels, keeps folder picks inside the user's slugs, slices to the documented limits.
// Pure functions without server-only imports, so they are unit-testable.
import type { SlangLevel } from "@/lib/types";
import {
  FOLDER_ALTERNATIVES_MAX,
  FOLDER_INBOX,
  FOLDER_NEW,
  SLANG_CODES,
  type NewFolderProposal,
  type SlangCode,
  type Suggestion,
  type SuggestionModel,
  type VocabItem,
  type VocabItemModel,
} from "./schemas";

const CYRILLIC = /[Ѐ-ӿ]/;

/** "ru" when the text contains Cyrillic letters, otherwise "fr". */
export function detectDirection(text: string): "fr" | "ru" {
  return CYRILLIC.test(text) ? "ru" : "fr";
}

export function slangLevelFromCode(code: SlangCode | string): SlangLevel {
  const i = SLANG_CODES.indexOf(code as SlangCode);
  if (i >= 0) return i as SlangLevel;
  const n = Number(code);
  return Number.isInteger(n) && n >= 0 && n <= 3 ? (n as SlangLevel) : 0;
}

/** Trimmed, single-spaced text capped at `max` characters; empty becomes null. */
export function cleanText(value: string | null | undefined, max: number): string | null {
  if (value == null) return null;
  const s = value.replace(/\s+/g, " ").trim();
  if (!s) return null;
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k",
  л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts",
  ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

/** Same rules as lib/text.ts `slugify` (kept separate so server routes don't import Dexie). */
export function toSlug(input: string): string {
  const latin = Array.from(
    input
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}+/gu, "")
      .normalize("NFC")
      .replace(/œ/g, "oe")
      .replace(/æ/g, "ae"),
  )
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join("");
  return latin
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/, "");
}

export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  const root = base || "tema";
  if (!taken.has(root)) return root;
  for (let i = 2; ; i++) {
    const candidate = `${root.slice(0, 44)}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export interface FolderRef {
  slug: string;
  name: string;
}

/**
 * Validates a proposed new folder. If its name matches an existing folder, returns that
 * folder's slug instead (`existing`), so the client never creates a duplicate theme.
 */
export function normalizeNewFolder(
  proposal: { slug: string; name: string; description: string } | null,
  folders: readonly FolderRef[],
): { folder: NewFolderProposal | null; existing: string | null } {
  if (!proposal) return { folder: null, existing: null };
  const name = cleanText(proposal.name, 40);
  if (!name) return { folder: null, existing: null };
  const lower = name.toLocaleLowerCase("ru");
  const same = folders.find((f) => f.name.toLocaleLowerCase("ru") === lower);
  if (same) return { folder: null, existing: same.slug };
  const taken = new Set(folders.map((f) => f.slug));
  const slug = uniqueSlug(toSlug(proposal.slug) || toSlug(name), taken);
  return {
    folder: { slug, name: name.charAt(0).toLocaleUpperCase("ru") + name.slice(1), description: cleanText(proposal.description, 200) ?? "" },
    existing: null,
  };
}

interface FolderPick {
  folder: string;
  new_folder: NewFolderProposal | null;
}

function pickFolder(rawFolder: string, rawNew: SuggestionModel["new_folder"], folders: readonly FolderRef[]): FolderPick {
  const slugs = new Set(folders.map((f) => f.slug));
  const { folder: newFolder, existing } = normalizeNewFolder(rawNew, folders);
  if (rawFolder === FOLDER_NEW) {
    if (newFolder) return { folder: FOLDER_NEW, new_folder: newFolder };
    if (existing) return { folder: existing, new_folder: null };
    return { folder: FOLDER_INBOX, new_folder: null };
  }
  if (slugs.has(rawFolder)) return { folder: rawFolder, new_folder: newFolder };
  return { folder: FOLDER_INBOX, new_folder: newFolder };
}

export function normalizeSuggestion(raw: SuggestionModel, folders: readonly FolderRef[]): Suggestion | null {
  const fr = cleanText(raw.fr, 120);
  const ru = cleanText(raw.ru, 160);
  if (!fr || !ru) return null;
  const { folder, new_folder } = pickFolder(raw.folder, raw.new_folder, folders);
  const slugs = new Set(folders.map((f) => f.slug));
  const alternatives = [...new Set(raw.folder_alternatives)]
    .filter((s) => slugs.has(s) && s !== folder)
    .slice(0, FOLDER_ALTERNATIVES_MAX);
  const example_fr = cleanText(raw.example_fr, 200);
  return {
    fr,
    ru,
    note: cleanText(raw.note, 160),
    example_fr,
    example_ru: example_fr ? cleanText(raw.example_ru, 200) : null,
    pos: raw.pos,
    gender: raw.pos === "noun" ? raw.gender : "none",
    slang_level: slangLevelFromCode(raw.slang_level),
    verlan: raw.verlan,
    folder,
    folder_alternatives: alternatives,
    new_folder,
    confidence: raw.confidence,
  };
}

export function normalizeVocabItem(raw: VocabItemModel, folders: readonly FolderRef[]): VocabItem | null {
  const fr = cleanText(raw.fr, 120);
  const ru = cleanText(raw.ru, 160);
  if (!fr || !ru) return null;
  const { folder, new_folder } = pickFolder(raw.folder, raw.new_folder, folders);
  const asSeen = cleanText(raw.fr_as_seen, 120);
  const example_fr = cleanText(raw.example_fr, 200);
  return {
    fr,
    fr_as_seen: asSeen && asSeen.toLowerCase() !== fr.toLowerCase() ? asSeen : null,
    ru,
    // With only French on the image the translation is necessarily ours.
    ru_suggested: raw.provenance === "fr_only" || raw.provenance === "in_text" ? true : raw.ru_suggested,
    note: cleanText(raw.note, 160),
    example_fr,
    example_ru: example_fr ? cleanText(raw.example_ru, 200) : null,
    pos: raw.pos,
    gender: raw.pos === "noun" ? raw.gender : "none",
    slang_level: slangLevelFromCode(raw.slang_level),
    verlan: raw.verlan,
    provenance: raw.provenance,
    confidence: raw.confidence,
    issue: cleanText(raw.issue, 120),
    folder,
    new_folder,
  };
}

/** Duplicate key for model rows: lowercase, unified apostrophes, leading article dropped. */
export function dedupeKey(fr: string): string {
  const s = fr
    .normalize("NFC")
    .toLowerCase()
    .replace(/[’‘ʼ`´]/g, "'")
    .replace(/\s+/g, " ")
    .replace(/[\s.!?…,;:]+$/, "")
    .trim();
  return s.replace(/^(?:(?:les|le|la|un|une|des)\s+|l')(?=\S)/, "") || s;
}
