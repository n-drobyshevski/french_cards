// Post-processing for /api/ai/classify. The model works with short refs (w1, w2…) instead of
// word UUIDs; these helpers map refs back and enforce the sorting rules in code:
// protected folders are never renamed or dropped, new themes need ≥3 words, 25 themes at most,
// low confidence stays in «Входящие».
import { cleanText, toSlug, uniqueSlug } from "./normalize";
import {
  FOLDER_INBOX,
  FOLDER_NEW,
  NEW_FOLDER_MIN_WORDS,
  TAXONOMY_MAX,
  type AssignmentModel,
  type AssignmentResult,
  type TaxonomyFolderInput,
  type TaxonomyFolderResult,
  type TaxonomyModel,
  type TaxonomyResponse,
} from "./schemas";

export const refFor = (index: number) => `w${index + 1}`;

export function refMap<T extends { id: string }>(words: readonly T[]): Map<string, T> {
  return new Map(words.map((w, i) => [refFor(i), w]));
}

const EXAMPLES_MAX = 12;

const isProtected = (f: TaxonomyFolderInput) => f.locked || f.created_by === "user";

export function finalizeTaxonomy(
  raw: TaxonomyModel,
  folders: readonly TaxonomyFolderInput[],
  words: readonly { id: string }[],
): TaxonomyResponse {
  const refs = refMap(words);
  const bySlug = new Map(folders.map((f) => [f.slug, f]));
  const exampleIds = (list: readonly string[]) =>
    [...new Set(list.map((r) => refs.get(r.trim())?.id).filter((id): id is string => Boolean(id)))].slice(0, EXAMPLES_MAX);

  const kept = new Map<string, TaxonomyFolderResult>();
  const created: TaxonomyFolderResult[] = [];
  const takenSlugs = new Set(folders.map((f) => f.slug));
  const takenNames = new Set<string>();

  for (const entry of raw.folders) {
    if (entry.existing !== FOLDER_NEW) {
      const current = bySlug.get(entry.existing);
      if (!current || kept.has(current.slug)) continue;
      const examples = exampleIds(entry.examples);
      if (isProtected(current)) {
        kept.set(current.slug, {
          slug: current.slug,
          name: current.name,
          description: current.description ?? "",
          status: "keep",
          example_ids: examples,
        });
      } else {
        const name = cleanText(entry.name, 40) ?? current.name;
        const description = cleanText(entry.description, 200) ?? current.description ?? "";
        const changed = name !== current.name || description !== (current.description ?? "");
        kept.set(current.slug, { slug: current.slug, name, description, status: changed ? "update" : "keep", example_ids: examples });
      }
      continue;
    }
    const name = cleanText(entry.name, 40);
    const examples = exampleIds(entry.examples);
    if (!name || examples.length < NEW_FOLDER_MIN_WORDS) continue;
    const display = name.charAt(0).toLocaleUpperCase("ru") + name.slice(1);
    const slug = uniqueSlug(toSlug(display), takenSlugs);
    takenSlugs.add(slug);
    created.push({ slug, name: display, description: cleanText(entry.description, 200) ?? "", status: "new", example_ids: examples });
  }

  // Protected folders are always part of the result, even if the model left them out.
  for (const f of folders) {
    if (isProtected(f) && !kept.has(f.slug)) {
      kept.set(f.slug, { slug: f.slug, name: f.name, description: f.description ?? "", status: "keep", example_ids: [] });
    }
  }

  // Names must stay distinct: a renamed or new theme may not take an existing name.
  const protectedResults: TaxonomyFolderResult[] = [];
  for (const f of folders) {
    const entry = kept.get(f.slug);
    if (entry && isProtected(f)) {
      protectedResults.push(entry);
      takenNames.add(entry.name.toLocaleLowerCase("ru"));
    }
  }
  const flexible: TaxonomyFolderResult[] = [];
  const candidates = [...folders.filter((f) => !isProtected(f) && kept.has(f.slug)).map((f) => kept.get(f.slug)!), ...created];
  for (const entry of candidates) {
    if (takenNames.has(entry.name.toLocaleLowerCase("ru"))) {
      if (entry.status === "new") continue;
      const original = bySlug.get(entry.slug)!;
      entry.name = original.name;
      entry.description = original.description ?? "";
      entry.status = "keep";
      if (takenNames.has(entry.name.toLocaleLowerCase("ru"))) continue;
    }
    takenNames.add(entry.name.toLocaleLowerCase("ru"));
    flexible.push(entry);
  }

  // Cap at TAXONOMY_MAX: protected folders always stay; the rest are ranked by example count.
  const room = Math.max(0, TAXONOMY_MAX - protectedResults.length);
  const chosen =
    flexible.length <= room
      ? flexible
      : flexible
          .map((r, i) => ({ r, i }))
          .sort((a, b) => b.r.example_ids.length - a.r.example_ids.length || a.i - b.i)
          .slice(0, room)
          .sort((a, b) => a.i - b.i)
          .map((x) => x.r);
  const final = [...protectedResults, ...chosen];

  const finalSlugs = new Set(final.map((r) => r.slug));
  const removed = folders.filter((f) => !isProtected(f) && !finalSlugs.has(f.slug)).map((f) => f.slug);
  return { folders: final, removed };
}

export function finalizeAssignments(
  raw: AssignmentModel,
  words: readonly { id: string }[],
  slugs: readonly string[],
): AssignmentResult[] {
  const refs = refMap(words);
  const valid = new Set(slugs);
  const byId = new Map<string, AssignmentResult>();
  for (const a of raw.assignments) {
    const word = refs.get(a.ref.trim());
    if (!word || byId.has(word.id)) continue;
    const folder = a.confidence !== "low" && valid.has(a.folder) ? a.folder : FOLDER_INBOX;
    byId.set(word.id, { id: word.id, folder, confidence: a.confidence });
  }
  // Every input word gets an answer; ones the model skipped stay in «Входящие».
  return words.map((w) => byId.get(w.id) ?? { id: w.id, folder: FOLDER_INBOX, confidence: "low" });
}
