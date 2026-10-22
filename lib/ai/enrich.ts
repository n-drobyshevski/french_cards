// Post-processing for /api/ai/enrich. The model sees short refs (w1, w2…) instead of word ids;
// this maps them back, cleans the text, keeps theme picks inside the learner's slugs and keeps
// one result per word. Words the model skipped get no result (the client leaves them as they are).
import { refMap } from "./classify";
import { cleanText, pickAlternatives, pickFolder, slangLevelFromCode, type FolderRef } from "./normalize";
import type { EnrichmentModel, EnrichResult } from "./schemas";

/** `folders` = the themes sent with the request, or null when no theme was asked for. */
export function finalizeEnrichment(
  raw: EnrichmentModel,
  words: readonly { id: string }[],
  folders: readonly FolderRef[] | null = null,
): EnrichResult[] {
  const refs = refMap(words);
  const byId = new Map<string, EnrichResult>();
  for (const item of raw.items) {
    const word = refs.get(item.ref.trim());
    if (!word || byId.has(word.id)) continue;
    const example_fr = cleanText(item.example_fr, 200);
    const theme =
      folders === null
        ? { folder: null, new_folder: null }
        : pickFolder(item.folder ?? "INBOX", item.new_folder ?? null, folders);
    byId.set(word.id, {
      id: word.id,
      pos: item.pos,
      gender: item.pos === "noun" ? item.gender : "none",
      slang_level: slangLevelFromCode(item.slang_level),
      verlan: item.verlan,
      example_fr,
      example_ru: example_fr ? cleanText(item.example_ru, 200) : null,
      confidence: item.confidence,
      folder: theme.folder,
      folder_alternatives: folders === null || theme.folder === null ? [] : pickAlternatives(item.folder_alternatives ?? [], theme.folder, folders),
      new_folder: theme.new_folder,
    });
  }
  return words.flatMap((w) => byId.get(w.id) ?? []);
}
