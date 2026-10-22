// The filled form's state: built from a picked suggestion or empty for manual entry, then
// turned into a save request. Pure (no Dexie), so it is unit-tested.
import type { EnrichResult, Suggestion } from "@/lib/ai/schemas";
import { cleanExamples } from "@/lib/examples";
import type { Confidence, Folder, Gender, PartOfSpeech, SlangLevel, WordSource } from "@/lib/types";
import { folderSource, foldersForSuggestion, INBOX_CHOICE, type FolderChoice, type SuggestionFolders } from "./folder-choice";
import type { SaveRequest } from "./save";

export interface WordDraft {
  fr: string;
  ru: string;
  note: string;
  example_fr: string;
  example_ru: string;
  /** Examples after the first («+ Ещё пример»). */
  extra_examples: { fr: string; ru: string }[];
  pos: PartOfSpeech;
  gender: Gender;
  slang_level: SlangLevel;
  verlan: boolean;
  /** Level still as detected (shows «определён автоматически»). */
  slang_auto: boolean;
  /** The user set the level or verlan by hand: detection leaves them alone. */
  slang_touched: boolean;
  /** The example was filled automatically and not edited since. */
  example_auto: boolean;
  /** The user typed in the example fields: detection leaves them alone. */
  example_touched: boolean;
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
  { autoSort = true, slang = true, examples = true }: { autoSort?: boolean; slang?: boolean; examples?: boolean } = {},
): WordDraft {
  const picks = foldersForSuggestion(s, folders);
  return {
    fr: s.fr,
    ru: s.ru,
    note: s.note ?? "",
    // Settings «Подбирать примеры» / «Определять уровень сленга» off: the user fills these in.
    example_fr: examples ? (s.example_fr ?? "") : "",
    example_ru: examples ? (s.example_ru ?? "") : "",
    pos: s.pos,
    gender: s.gender,
    slang_level: slang ? s.slang_level : 0,
    verlan: slang ? s.verlan : false,
    slang_auto: slang,
    slang_touched: false,
    example_auto: false,
    example_touched: false,
    extra_examples: [],
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
    slang_touched: false,
    example_auto: false,
    example_touched: false,
    extra_examples: [],
    both_directions: true,
    folder: init.folder ?? INBOX_CHOICE,
    folder_touched: init.folder !== undefined && init.folder.kind !== "inbox",
    auto: null,
    source: "manual",
  };
}

/** A manual draft waits for detection while both sides are filled. Key = what was asked for. */
export function enrichKey(d: Pick<WordDraft, "fr" | "ru" | "source">): string | null {
  if (d.source !== "manual") return null;
  const fr = d.fr.replace(/\s+/g, " ").trim();
  const ru = d.ru.replace(/\s+/g, " ").trim();
  return fr && ru ? `${fr}\u0001${ru}` : null;
}

/** What Settings «ИИ» let detection fill in (themes are governed by sending the themes at all). */
export interface DraftEnrichPreferences {
  slang: boolean;
  examples: boolean;
}

/** Fields detection may still fill: what the user has not set by hand. */
export function enrichScope(d: WordDraft) {
  return {
    slang: !d.slang_touched,
    example: !d.example_touched && (!d.example_fr.trim() || d.example_auto),
    pos: true,
    // Saved before any theme was picked: file it afterwards (existing themes only).
    folder: !d.folder_touched && d.auto === null,
  };
}

/**
 * Applies a detection result to the untouched fields of a manual draft. A theme pick (when the
 * request carried the themes) works like a suggestion's: preselected with its alternatives and
 * proposal, unless the user already chose a theme.
 */
export function applyEnrichment(
  d: WordDraft,
  r: EnrichResult,
  folders: readonly Pick<Folder, "id" | "slug" | "name">[] = [],
  prefs: DraftEnrichPreferences = { slang: true, examples: true },
): WordDraft {
  const own = enrichScope(d);
  const scope = { ...own, slang: own.slang && prefs.slang, example: own.example && prefs.examples };
  const next: WordDraft = { ...d, pos: r.pos, gender: r.gender };
  if (r.folder !== null && !d.folder_touched) {
    const picks = foldersForSuggestion({ folder: r.folder, folder_alternatives: r.folder_alternatives, new_folder: r.new_folder }, folders);
    next.folder = picks.auto;
    next.auto = { ...picks, confidence: r.confidence };
  }
  if (scope.slang) Object.assign(next, { slang_level: r.slang_level, verlan: r.verlan, slang_auto: true });
  if (scope.example) {
    Object.assign(
      next,
      r.example_fr
        ? { example_fr: r.example_fr, example_ru: r.example_ru ?? "", example_auto: true }
        : d.example_auto
          ? { example_fr: "", example_ru: "", example_auto: false }
          : {},
    );
  }
  return next;
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
        extra_examples: cleanExamples(d.extra_examples),
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
