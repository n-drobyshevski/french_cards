// Zod schemas for /api/ai/*: what the model must output (structured outputs) and what the
// routes accept. Model schemas follow Anthropic's structured-output rules: no length/number
// bounds, every field required (`.nullable()` instead of optional), enums for closed sets.
// Limits live in `.describe()` text and are enforced by slicing on the server.
// Client code imports only types from here (erased at build); plain values live in ./constants.
import { z } from "zod";
import type { Confidence, Gender, PartOfSpeech, SlangLevel } from "@/lib/types";
import {
  ASSIGN_CHUNK_MAX,
  CONFIDENCE_VALUES,
  ENRICH_CHUNK_MAX,
  EXAMPLE_AVOID_MAX,
  FOLDER_INBOX,
  FOLDER_NEW,
  GENDER_VALUES,
  MODEL_TIERS,
  POS_VALUES,
  PROVENANCE_VALUES,
  SLANG_CODES,
  SUGGEST_MAX,
  SUGGEST_REGISTERS,
  type Provenance,
  type SlangCode,
} from "./constants";

export * from "./constants";

const slangField = () =>
  z
    .enum(SLANG_CODES)
    .describe(
      "Register: neutral = standard French; fam = familier, casual everyday speech; arg = argot / street or youth slang; vulg = vulgar, coarse or insulting.",
    );
const posField = () => z.enum(POS_VALUES).describe("Part of speech. Use expression for idioms and multi-word phrases.");
const genderField = () => z.enum(GENDER_VALUES).describe("Grammatical gender for nouns (mf = both); none for every other part of speech.");
const confidenceField = () =>
  z.enum(CONFIDENCE_VALUES).describe("high = sure of meaning and translation; med = plausible but ambiguous; low = a guess.");

const newFolderShape = () =>
  z
    .object({
      slug: z.string().describe("Latin lowercase kebab-case id, e.g. transport. At most 40 characters."),
      name: z.string().describe("Russian theme name, 1-2 words, e.g. «Транспорт»."),
      description: z.string().describe("One short Russian sentence: which words belong in this theme."),
    })
    .nullable()
    .describe("A new theme to offer when no existing folder fits well; otherwise null.");

/** The `folder` enum for one request: existing slugs + NEW + INBOX. */
export function folderEnum(slugs: readonly string[]) {
  const values = [...new Set(slugs.filter((s) => s !== FOLDER_NEW && s !== FOLDER_INBOX)), FOLDER_NEW, FOLDER_INBOX];
  return z.enum(values as [string, ...string[]]);
}

/** One suggestion for the add sheet («Варианты»). Built per request because `folder` is an enum of the user's slugs. */
export function buildSuggestionSchema(slugs: readonly string[]) {
  const folder = folderEnum(slugs);
  return z.object({
    fr: z
      .string()
      .describe("French dictionary form: nouns with article (la thune, l'oseille), verbs in the infinitive (se casser), adjectives masculine singular."),
    ru: z.string().describe("1-3 Russian equivalents in the same register, comma-separated, lowercase."),
    note: z.string().nullable().describe("Short Russian usage note (at most 120 characters): nuance, synonyms, verlan origin. Null if nothing useful."),
    example_fr: z.string().nullable().describe("One short natural French example sentence, or null."),
    example_ru: z.string().nullable().describe("Russian translation of example_fr, or null when example_fr is null."),
    pos: posField(),
    gender: genderField(),
    slang_level: slangField(),
    verlan: z.boolean().describe("True if the word is verlan (syllables inverted), e.g. keuf, meuf, relou, chelou, vénère."),
    folder: folder.describe("Best theme slug from the list; NEW when new_folder fits better than every existing theme; INBOX when unsure."),
    folder_alternatives: z.array(folder).describe("Up to 2 other plausible theme slugs from the list, best first. Never repeats folder."),
    new_folder: newFolderShape(),
    confidence: confidenceField(),
  });
}
export type SuggestionModel = z.infer<ReturnType<typeof buildSuggestionSchema>>;

/** One vocabulary row read from screenshots. */
export function buildVocabItemSchema(slugs: readonly string[]) {
  const folder = folderEnum(slugs);
  return z.object({
    fr: z.string().describe("French dictionary form (article + noun, infinitive, masculine singular adjective, or the expression)."),
    fr_as_seen: z
      .string()
      .nullable()
      .describe("The exact text on the image when it differs from fr (conjugated, plural, misspelt, SMS spelling); null when identical."),
    ru: z.string().describe("Russian translation: copied from the image when present there, otherwise your own, 1-3 equivalents."),
    ru_suggested: z.boolean().describe("True when the Russian translation is not on the image and you wrote it yourself."),
    note: z.string().nullable().describe("Short Russian usage note (at most 120 characters), or null."),
    example_fr: z
      .string()
      .nullable()
      .describe("One short natural French example sentence with the word in the sense used on the image, or null."),
    example_ru: z.string().nullable().describe("Russian translation of example_fr, or null when example_fr is null."),
    pos: posField(),
    gender: genderField(),
    slang_level: slangField(),
    verlan: z.boolean().describe("True if the word is verlan."),
    provenance: z
      .enum(PROVENANCE_VALUES)
      .describe("pair = French and Russian both shown together; fr_only = only French shown; ru_only = only Russian shown; in_text = picked from running text (chat, post, subtitles)."),
    confidence: confidenceField(),
    issue: z
      .string()
      .nullable()
      .describe("Short Russian remark when something is off (illegible, likely typo, wrong translation on the image); otherwise null."),
    folder: folder.describe("Best theme slug from the list; NEW to use new_folder; INBOX when unsure."),
    new_folder: newFolderShape(),
  });
}
export type VocabItemModel = z.infer<ReturnType<typeof buildVocabItemSchema>>;

/** Pass A of the re-sort: the proposed set of themes. */
export function buildTaxonomySchema(existingSlugs: readonly string[]) {
  const values: [string, ...string[]] = [FOLDER_NEW, ...new Set(existingSlugs.filter((s) => s !== FOLDER_NEW))];
  return z.object({
    folders: z
      .array(
        z.object({
          existing: z.enum(values).describe("Slug of the current folder this entry keeps or refines, or NEW for a new theme."),
          name: z.string().describe("Russian theme name, 1-2 words. Must stay unchanged for protected folders."),
          description: z.string().describe("One short Russian sentence: what belongs in the theme."),
          examples: z.array(z.string()).describe("Up to 8 word refs (w1, w2, …) that belong here. A NEW theme needs at least 3."),
        }),
      )
      .describe("8 to 25 themes in total, protected folders included."),
  });
}
export type TaxonomyModel = z.infer<ReturnType<typeof buildTaxonomySchema>>;

/** Pass B of the re-sort: one theme per word. */
export function buildAssignmentSchema(slugs: readonly string[]) {
  const values: [string, ...string[]] = [FOLDER_INBOX, ...new Set(slugs.filter((s) => s !== FOLDER_INBOX))];
  return z.object({
    assignments: z
      .array(
        z.object({
          ref: z.string().describe("The word ref from the input, e.g. w12."),
          folder: z.enum(values).describe("Theme slug, or INBOX when no theme fits."),
          confidence: confidenceField(),
        }),
      )
      .describe("Exactly one entry per input word, in input order."),
  });
}
export type AssignmentModel = z.infer<ReturnType<typeof buildAssignmentSchema>>;

/**
 * Slang level, part of speech and an example for cards the learner wrote themselves; with
 * `slugs` (the learner's themes) also a theme pick, as for suggestions.
 */
export function buildEnrichmentSchema(slugs: readonly string[] | null = null) {
  const base = z.object({
    ref: z.string().describe("The word ref from the input, e.g. w3."),
    pos: posField(),
    gender: genderField(),
    slang_level: slangField(),
    verlan: z.boolean().describe("True if the word is verlan (syllables inverted), e.g. keuf, meuf, relou, chelou, vénère."),
    example_fr: z
      .string()
      .nullable()
      .describe("One short natural French example sentence using the word in the sense of its Russian side, or null."),
    example_ru: z.string().nullable().describe("Russian translation of example_fr in the same register, or null when example_fr is null."),
    confidence: confidenceField(),
  });
  let item: z.ZodType = base;
  if (slugs !== null) {
    const folder = folderEnum(slugs);
    item = base.extend({
      folder: folder.describe("Best theme slug from the list; NEW when new_folder fits better than every existing theme; INBOX when unsure."),
      folder_alternatives: z.array(folder).describe("Up to 2 other plausible theme slugs from the list, best first. Never repeats folder."),
      new_folder: newFolderShape(),
    });
  }
  return z.object({ items: z.array(item).describe("Exactly one entry per input word, in input order.") });
}

export interface EnrichmentItemModel {
  ref: string;
  pos: PartOfSpeech;
  gender: Gender;
  slang_level: SlangCode;
  verlan: boolean;
  example_fr: string | null;
  example_ru: string | null;
  confidence: Confidence;
  /** Only when themes were sent. */
  folder?: string;
  folder_alternatives?: string[];
  new_folder?: { slug: string; name: string; description: string } | null;
}
export interface EnrichmentModel {
  items: EnrichmentItemModel[];
}

// ---------------------------------------------------------------------------------------
// Request schemas (validated on the server only; never sent to the model, so bounds are fine)

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,47})$/;
const slugInput = z.string().regex(SLUG_RE, "invalid slug");
const shortText = (max: number) => z.string().trim().max(max);

export const FolderInputSchema = z.object({
  slug: slugInput,
  name: shortText(60).min(1),
  description: shortText(300).nullable().optional(),
});
export type FolderInput = z.infer<typeof FolderInputSchema>;

const foldersInput = (max: number) =>
  z
    .array(FolderInputSchema)
    .max(max)
    .refine((list) => new Set(list.map((f) => f.slug)).size === list.length, "duplicate folder slug");

export const SuggestRequestSchema = z.object({
  q: z
    .string()
    .transform((s) => s.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1).max(80)),
  direction: z.enum(["auto", "fr", "ru"]).default("auto"),
  folders: foldersInput(60).default([]),
  model: z.enum(MODEL_TIERS).default("fast"),
  /** How many suggestions to return (1–3). */
  max: z.number().int().min(1).max(SUGGEST_MAX).default(SUGGEST_MAX),
  register: z.enum(SUGGEST_REGISTERS).default("any"),
  /** false: no usage notes. */
  notes: z.boolean().default(true),
});
export type SuggestRequest = z.input<typeof SuggestRequestSchema>;

export const ExtractFoldersSchema = foldersInput(60);

const wordId = z.string().min(1).max(64);

export const TaxonomyFolderInputSchema = FolderInputSchema.extend({
  locked: z.boolean().default(false),
  created_by: z.enum(["user", "auto"]).default("auto"),
});
export type TaxonomyFolderInput = z.infer<typeof TaxonomyFolderInputSchema>;

export const TaxonomyRequestSchema = z.object({
  mode: z.literal("taxonomy"),
  model: z.enum(MODEL_TIERS).default("fast"),
  words: z
    .array(
      z.object({
        id: wordId,
        fr: shortText(120).min(1),
        ru: shortText(160),
        folder: slugInput.nullable().optional(),
      }),
    )
    .min(1)
    .max(4000),
  folders: z
    .array(TaxonomyFolderInputSchema)
    .max(60)
    .refine((list) => new Set(list.map((f) => f.slug)).size === list.length, "duplicate folder slug"),
});
export type TaxonomyRequest = z.input<typeof TaxonomyRequestSchema>;

export const AssignRequestSchema = z.object({
  mode: z.literal("assign"),
  model: z.enum(MODEL_TIERS).default("fast"),
  words: z
    .array(
      z.object({
        id: wordId,
        fr: shortText(120).min(1),
        ru: shortText(160),
        note: shortText(300).nullable().optional(),
      }),
    )
    .min(1)
    .max(ASSIGN_CHUNK_MAX),
  folders: foldersInput(40).refine((list) => list.length > 0, "at least one folder"),
  examples: z
    .array(z.object({ fr: shortText(120).min(1), ru: shortText(160), folder: slugInput }))
    .max(80)
    .default([]),
});
export type AssignRequest = z.input<typeof AssignRequestSchema>;

export const ClassifyRequestSchema = z.discriminatedUnion("mode", [TaxonomyRequestSchema, AssignRequestSchema]);

/** POST /api/ai/example: one more example for a card, unlike the ones it already has. */
export const ExampleRequestSchema = z.object({
  model: z.enum(MODEL_TIERS).default("fast"),
  fr: shortText(120).min(1),
  ru: shortText(160).min(1),
  note: shortText(300).nullable().optional(),
  avoid: z.array(shortText(300)).max(EXAMPLE_AVOID_MAX).default([]),
});
export type ExampleRequest = z.input<typeof ExampleRequestSchema>;

export const ExampleModelSchema = z.object({
  example_fr: z.string().nullable().describe("One short natural French sentence using the word in the given sense; null if none fits."),
  example_ru: z.string().nullable().describe("Its Russian translation in the same register; null when example_fr is null."),
});
export type ExampleModel = z.infer<typeof ExampleModelSchema>;

export interface ExampleResponse {
  /** null when the model had nothing new to offer. */
  example: { fr: string; ru: string | null } | null;
}

export const EnrichRequestSchema = z.object({
  words: z
    .array(
      z.object({
        id: wordId,
        fr: shortText(120).min(1),
        ru: shortText(160).min(1),
        note: shortText(300).nullable().optional(),
      }),
    )
    .min(1)
    .max(ENRICH_CHUNK_MAX)
    .refine((list) => new Set(list.map((w) => w.id)).size === list.length, "duplicate word id"),
  /** The learner's themes: when present, each result also gets a theme pick. */
  folders: foldersInput(60).optional(),
  model: z.enum(MODEL_TIERS).default("fast"),
});
export type EnrichRequest = z.input<typeof EnrichRequestSchema>;

// ---------------------------------------------------------------------------------------
// Wire types: what the routes send back after server-side normalization.

export interface NewFolderProposal {
  slug: string;
  name: string;
  description: string;
}

/** A normalized suggestion. `folder` is an existing slug, "NEW" (then `new_folder` is set) or "INBOX". */
export interface Suggestion {
  fr: string;
  ru: string;
  note: string | null;
  example_fr: string | null;
  example_ru: string | null;
  pos: PartOfSpeech;
  gender: Gender;
  slang_level: SlangLevel;
  verlan: boolean;
  folder: string;
  folder_alternatives: string[];
  new_folder: NewFolderProposal | null;
  confidence: Confidence;
}

/** A normalized screenshot row. */
export interface VocabItem {
  fr: string;
  fr_as_seen: string | null;
  ru: string;
  ru_suggested: boolean;
  note: string | null;
  example_fr: string | null;
  example_ru: string | null;
  pos: PartOfSpeech;
  gender: Gender;
  slang_level: SlangLevel;
  verlan: boolean;
  provenance: Provenance;
  confidence: Confidence;
  issue: string | null;
  folder: string;
  new_folder: NewFolderProposal | null;
}

export type SuggestLine =
  | { type: "meta"; direction: "fr" | "ru" }
  | { type: "suggestion"; index: number; suggestion: Suggestion }
  | { type: "done"; count: number }
  | { type: "error"; error: string };

export type ExtractLine =
  | { type: "meta"; images: number }
  | { type: "item"; index: number; item: VocabItem }
  | { type: "done"; count: number }
  | { type: "error"; error: string };

export interface TaxonomyFolderResult {
  slug: string;
  name: string;
  description: string;
  /** keep = existing folder unchanged; update = existing auto folder renamed/redescribed; new = to create. */
  status: "keep" | "update" | "new";
  /** Word ids the model gave as examples (a new theme always has ≥3). */
  example_ids: string[];
}

export interface TaxonomyResponse {
  folders: TaxonomyFolderResult[];
  /** Existing auto folders (not locked, not user-created) that the proposal drops. */
  removed: string[];
}

export interface AssignmentResult {
  id: string;
  folder: string; // slug or "INBOX"
  confidence: Confidence;
}

export interface AssignResponse {
  assignments: AssignmentResult[];
}

/** Detected fields for one word sent to /api/ai/enrich. */
export interface EnrichResult {
  id: string;
  pos: PartOfSpeech;
  gender: Gender;
  slang_level: SlangLevel;
  verlan: boolean;
  example_fr: string | null;
  example_ru: string | null;
  confidence: Confidence;
  /** Theme pick (slug, "NEW" with `new_folder`, or "INBOX"); null when no themes were sent. */
  folder: string | null;
  folder_alternatives: string[];
  new_folder: NewFolderProposal | null;
}

export interface EnrichResponse {
  results: EnrichResult[];
}

export interface AiErrorBody {
  error: string;
  details?: unknown;
}
