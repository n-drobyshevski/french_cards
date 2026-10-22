// The filled form's state: built from a picked suggestion or empty for manual entry, then
// turned into a save request. Pure (no Dexie), so it is unit-tested.
import type { Suggestion } from "@/lib/ai/schemas";
import type { Confidence, Folder, Gender, PartOfSpeech, SlangLevel, WordSource } from "@/lib/types";
import { folderSource, foldersForSuggestion, INBOX_CHOICE, type FolderChoice, type SuggestionFolders } from "./folder-choice";
import type { SaveRequest } from "./save";

export interface WordDraft {
  fr: string;
  ru: string;
  note: string;
  example_fr: string;
  example_ru: string;
  pos: PartOfSpeech;
  gender: Gender;
  slang_level: SlangLevel;
  verlan: boolean;
  /** Level still as detected (shows «определён автоматически»). */
  slang_auto: boolean;
  both_directions: boolean;
  folder: FolderChoice;
  /** The user tapped a theme chip. */
  folder_touched: boolean;
  /** Automatic theme picks when the draft came from a suggestion. */
  auto: (SuggestionFolders & { confidence: Confidence }) | null;
  source: WordSource;
}

/**
 * Draft for a picked suggestion. With automatic sorting on (Settings «Раскладывать по темам
 * автоматически») its theme is preselected; with it off the word starts in «Входящие» and the
 * user picks a theme from the full list.
 */
export function draftFromSuggestion(
  s: Suggestion,
  folders: readonly Pick<Folder, "id" | "slug" | "name">[],
  { autoSort = true }: { autoSort?: boolean } = {},
): WordDraft {
  const picks = foldersForSuggestion(s, folders);
  return {
    fr: s.fr,
    ru: s.ru,
    note: s.note ?? "",
    example_fr: s.example_fr ?? "",
    example_ru: s.example_ru ?? "",
    pos: s.pos,
    gender: s.gender,
    slang_level: s.slang_level,
    verlan: s.verlan,
    slang_auto: true,
    both_directions: true,
    folder: autoSort ? picks.auto : INBOX_CHOICE,
    folder_touched: false,
    auto: autoSort ? { ...picks, confidence: s.confidence } : null,
    source: "suggest",
  };
}

export function manualDraft(init: { fr?: string; ru?: string; folder?: FolderChoice } = {}): WordDraft {
  return {
    fr: init.fr ?? "",
    ru: init.ru ?? "",
    note: "",
    example_fr: "",
    example_ru: "",
    pos: "other",
    gender: "none",
    slang_level: 0,
    verlan: false,
    slang_auto: false,
    both_directions: true,
    folder: init.folder ?? INBOX_CHOICE,
    folder_touched: init.folder !== undefined && init.folder.kind !== "inbox",
    auto: null,
    source: "manual",
  };
}

export interface DraftErrors {
  fr?: string;
  ru?: string;
}

export function validateDraft(d: Pick<WordDraft, "fr" | "ru">): DraftErrors {
  const errors: DraftErrors = {};
  if (!d.fr.trim()) errors.fr = "Нужно французское слово";
  if (!d.ru.trim()) errors.ru = "Нужен перевод";
  return errors;
}

export const hasErrors = (e: DraftErrors) => Boolean(e.fr || e.ru);

/** Save request for the draft: kept automatic theme → folder_source "auto", anything chosen → "user". */
export function draftToSaveRequest(d: WordDraft): SaveRequest {
  const { folder_source, kept_auto } = folderSource(d.folder, d.auto?.auto ?? null, d.folder_touched);
  return {
    words: [
      {
        fr: d.fr,
        ru: d.ru,
        note: d.note,
        example_fr: d.example_fr,
        example_ru: d.example_fr.trim() ? d.example_ru : null,
        pos: d.pos,
        gender: d.pos === "noun" ? d.gender : "none",
        slang_level: d.slang_level,
        verlan: d.verlan,
        source: d.source,
        both_directions: d.both_directions,
      },
    ],
    folder: d.folder,
    folderSource: folder_source,
    folderConfidence: kept_auto && d.auto ? d.auto.confidence : null,
    newFolderCreatedBy: kept_auto ? "auto" : "user",
  };
}
