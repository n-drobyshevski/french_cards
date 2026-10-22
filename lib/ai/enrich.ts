// Post-processing for /api/ai/enrich. The model sees short refs (w1, w2…) instead of word ids and
// (f1, f2…) instead of custom field ids; this maps them back, cleans the text, keeps theme picks
// inside the learner's slugs and keeps one result per word. Words the model skipped get no result
// (the client leaves them as they are).
import { cleanFieldValue } from "@/lib/core/custom-fields";
import { refMap } from "./classify";
import { cleanText, pickAlternatives, pickFolder, slangLevelFromCode, type FolderRef } from "./normalize";
import { fieldRefFor, type CustomFill, type CustomModel, type EnrichmentModel, type EnrichResult } from "./schemas";

/** Short field ref (f1…) → the definition id it stands for. */
export function fieldRefMap(fields: readonly { id: string }[]): Map<string, string> {
  return new Map(fields.map((f, i) => [fieldRefFor(i), f.id]));
}

/** Values a model writes when it has nothing to say. */
const NOTHING = /^(?:null|none|n\/a|[-—–?]+)$/i;

/**
 * The model's custom values as {definition id, value}: unknown refs, repeats (the first wins) and
 * empty or placeholder values are dropped; values are cut to FIELD_VALUE_MAX.
 */
export function finalizeCustom(raw: readonly CustomModel[] | null | undefined, fieldRefs: ReadonlyMap<string, string>): CustomFill[] {
  const out: CustomFill[] = [];
  const seen = new Set<string>();
  for (const c of raw ?? []) {
    const id = typeof c?.field === "string" ? fieldRefs.get(c.field.trim()) : undefined;
    if (!id || seen.has(id)) continue;
    const value = cleanFieldValue(c.value);
    if (!value || NOTHING.test(value)) continue;
    seen.add(id);
    out.push({ id, value });
  }
  return out;
}

/** `folders` = the themes sent with the request, or null when no theme was asked for; `fields` = the custom fields sent. */
export function finalizeEnrichment(
  raw: EnrichmentModel,
  words: readonly { id: string }[],
  folders: readonly FolderRef[] | null = null,
  fields: readonly { id: string }[] = [],
): EnrichResult[] {
  const refs = refMap(words);
  const fieldRefs = fieldRefMap(fields);
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
      custom: finalizeCustom(item.custom, fieldRefs),
    });
  }
  return words.flatMap((w) => byId.get(w.id) ?? []);
}
