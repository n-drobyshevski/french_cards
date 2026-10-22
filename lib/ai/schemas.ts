// Zod schemas for /api/ai/*: what the model must output (structured outputs) and what the
// routes accept. Model schemas follow Anthropic's structured-output rules: no length/number
// bounds, every field required (`.nullable()` instead of optional), enums for closed sets.
// Limits live in `.describe()` text and are enforced by slicing on the server.
// Client code imports only types from here (erased at build); plain values live in ./constants.
import { z } from "zod";
import { ANKI_CHUNK_MAX, ANKI_FIELD_CHARS, ANKI_FIELDS_MAX, ANKI_TAGS_MAX, type AnkiItem } from "@/lib/anki/types";
import { FIELD_HINT_MAX, FIELD_LABEL_MAX, MAX_FIELD_DEFS } from "@/lib/core/custom-fields";
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
  CONTEXT_EXAMPLES_MAX,
  CONTEXT_MEANINGS_MAX,
  EXAMPLE_KINDS,
  LOOKUP_SYNONYMS_MAX,
  LOOKUP_TRANSLATIONS_MAX,
  type ConjTense,
  type ExampleKind,
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

/** Short refs for the learner's custom fields in one request (f1, f2…), mapped back to definition ids on the server. */
export const fieldRefFor = (index: number) => `f${index + 1}`;

/** «Свои поля» to fill: one entry per listed field. Only in the schema when fields were sent. */
const customShape = (fieldRefs: readonly string[]) =>
  z
    .array(
      z.object({
        field: z.enum(fieldRefs as [string, ...string[]]).describe("The custom field ref from the user message, e.g. f1."),
        value: z
          .string()
          .nullable()
          .describe("The value, following the field's name and hint, short (at most about 150 characters). Null when nothing sensible fits or you are unsure."),
      }),
    )
    .describe("One entry per custom field listed in the user message, in that order.");

export interface CustomModel {
  field: string;
  value: string | null;
}

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
export function buildEnrichmentSchema(slugs: readonly string[] | null = null, fieldRefs: readonly string[] = []) {
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
  let item: z.ZodObject = base;
  if (slugs !== null) {
    const folder = folderEnum(slugs);
    item = item.extend({
      folder: folder.describe("Best theme slug from the list; NEW when new_folder fits better than every existing theme; INBOX when unsure."),
      folder_alternatives: z.array(folder).describe("Up to 2 other plausible theme slugs from the list, best first. Never repeats folder."),
      new_folder: newFolderShape(),
    });
  }
  if (fieldRefs.length > 0) item = item.extend({ custom: customShape(fieldRefs) });
  return z.object({ items: z.array(item as z.ZodType).describe("Exactly one entry per input word, in input order.") });
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
  /** Only when custom fields were sent. */
  custom?: CustomModel[];
}
export interface EnrichmentModel {
  items: EnrichmentItemModel[];
}

/**
 * One Anki note turned into a card (or skipped). Same fields as a screenshot row, read from the
 * note's fields instead of an image; provenance is derived on the server from ru_suggested.
 */
function ankiItemBase(slugs: readonly string[]) {
  const folder = folderEnum(slugs);
  return z.object({
    ref: z.string().describe("The note ref from the input, e.g. n3."),
    skip: z.boolean().describe("True when the note is not French vocabulary (grammar rule, empty, another language); the other fields may then be minimal."),
    fr_field: z.string().nullable().describe("Name of the note field the French term was read from, exactly as given; null when skipped."),
    fr: z.string().describe("French dictionary form (article + noun, infinitive with se for pronominal verbs, masculine singular adjective, or the expression). Empty when skipped."),
    fr_as_seen: z
      .string()
      .nullable()
      .describe("The French text as written in the note when it differs from fr (conjugated, plural, feminine, no article, typo); null when identical."),
    ru: z.string().describe("Russian side: the note's own Russian translation cleaned up, otherwise your translation, 1-3 equivalents. Empty when skipped."),
    ru_suggested: z.boolean().describe("True when the note has no Russian translation and you wrote ru yourself."),
    note: z
      .string()
      .nullable()
      .describe("Short Russian usage note (at most 120 characters); holds the note's original non-Russian gloss, e.g. «англ.: car». Null if nothing useful."),
    example_fr: z.string().nullable().describe("The note's French example sentence when it has one, otherwise one short natural sentence, or null."),
    example_ru: z.string().nullable().describe("Russian translation of example_fr (copied from the note when present there), or null when example_fr is null."),
    pos: posField(),
    gender: genderField(),
    slang_level: slangField(),
    verlan: z.boolean().describe("True if the word is verlan."),
    confidence: confidenceField(),
    issue: z
      .string()
      .nullable()
      .describe("Short Russian remark when something is off (why the note is skipped, likely typo, doubtful translation in the note); otherwise null."),
    folder: folder.describe("Best theme slug from the list; NEW to use new_folder; INBOX when unsure or skipped."),
    new_folder: newFolderShape(),
    used_fields: z
      .array(z.string())
      .describe(
        "Names of the note fields whose text went into fr, ru, note, the example or a custom value (fr_field included), exactly as given; empty when skipped.",
      ),
  });
}

/** With `fieldRefs` (the learner's custom fields, f1…) each item also fills them. */
export function buildAnkiItemSchema(slugs: readonly string[], fieldRefs: readonly string[] = []) {
  const base = ankiItemBase(slugs);
  return fieldRefs.length > 0 ? base.extend({ custom: customShape(fieldRefs) }) : base;
}
export type AnkiItemModel = z.infer<ReturnType<typeof ankiItemBase>> & {
  /** Only when custom fields were sent. */
  custom?: CustomModel[];
};

/** /api/ai/anki model output: one entry per note. */
export function buildAnkiSchema(slugs: readonly string[], fieldRefs: readonly string[] = []) {
  return z.object({ items: z.array(buildAnkiItemSchema(slugs, fieldRefs)).describe("Exactly one entry per input note, in input order.") });
}
export interface AnkiModel {
  items: AnkiItemModel[];
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

/** A custom field («Свои поля») to fill: the definition id, its name and hint. */
export const CustomFieldInputSchema = z.object({
  id: z.string().min(1).max(64),
  name: shortText(FIELD_LABEL_MAX).min(1),
  hint: shortText(FIELD_HINT_MAX).nullable().optional(),
});
export type CustomFieldInput = z.input<typeof CustomFieldInputSchema>;

const customFieldsInput = () =>
  z
    .array(CustomFieldInputSchema)
    .max(MAX_FIELD_DEFS)
    .refine((list) => new Set(list.map((f) => f.id)).size === list.length, "duplicate field id");

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
  /** Custom fields to fill for each word (definitions marked for the automatic fill). */
  fields: customFieldsInput().optional(),
  model: z.enum(MODEL_TIERS).default("fast"),
});
export type EnrichRequest = z.input<typeof EnrichRequestSchema>;

/** POST /api/ai/anki: one chunk of notes from an Anki deck. `ref` is the AnkiNote id. */
export const AnkiRequestSchema = z.object({
  notes: z
    .array(
      z.object({
        ref: shortText(40).min(1),
        fields: z
          .array(z.object({ name: shortText(60).min(1), text: shortText(ANKI_FIELD_CHARS).min(1) }))
          .min(1)
          .max(ANKI_FIELDS_MAX),
        tags: z.array(shortText(60)).max(ANKI_TAGS_MAX).default([]),
      }),
    )
    .min(1)
    .max(ANKI_CHUNK_MAX)
    .refine((list) => new Set(list.map((n) => n.ref)).size === list.length, "duplicate note ref"),
  /** The learner's themes; without them every card goes to «Входящие» or a proposed new theme. */
  folders: foldersInput(60).optional(),
  /** Custom fields to fill for each card (definitions marked for the automatic fill). */
  fields: customFieldsInput().optional(),
  model: z.enum(MODEL_TIERS).default("fast"),
});
export type AnkiRequest = z.input<typeof AnkiRequestSchema>;
export type AnkiRequestNote = z.infer<typeof AnkiRequestSchema>["notes"][number];

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

/** A filled custom field: the definition id sent with the request and its value. */
export interface CustomFill {
  id: string;
  value: string;
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
  /** Filled custom fields, only those with a value (missing from older responses). */
  custom?: CustomFill[];
}

export interface EnrichResponse {
  results: EnrichResult[];
}

/** /api/ai/anki: one item per note the model returned, in note order (skips included). */
export interface AnkiResponse {
  items: AnkiItem[];
}

export interface AiErrorBody {
  error: string;
  details?: unknown;
}

// «Контекст»: a word looked up the way Reverso Context does it. /api/ai/lookup answers fast (the
// dictionary part: translations by share, synonyms by register; the conjugation is built on the device); /api/ai/context
// searches the web for real sentences that use the word, each tied to its source.


/** POST /api/ai/lookup: a French or Russian word or phrase. */
export const LookupRequestSchema = z.object({
  model: z.enum(MODEL_TIERS).default("fast"),
  q: shortText(80).min(1),
});
export type LookupRequest = z.input<typeof LookupRequestSchema>;

export const LookupModelSchema = z.object({
  found: z.boolean().describe("false when the query is not French or Russian language at all (gibberish, a name, a URL); every other field is then empty."),
  fr: z.string().describe("The French headword in dictionary form (see FORMS). For a Russian query: the most common spoken French equivalent."),
  pos: posField(),
  gender: genderField(),
  slang_level: slangField(),
  verlan: z.boolean().describe("true only for verlan forms."),
  note: z.string().nullable().describe("Optional Russian note, at most about 120 characters: verlan origin, a neutral gloss, a typical construction. Null when nothing is worth saying."),
  translations: z
    .array(
      z.object({
        ru: z.string().describe("One Russian equivalent (a word or a short phrase), lowercase, in the same register."),
        share: z.number().describe("Rough share of real usage this sense covers, a whole number of percent; all shares add up to about 100."),
      }),
    )
    .describe(`Distinct senses, most frequent first, at most ${LOOKUP_TRANSLATIONS_MAX}.`),
  synonyms: z
    .array(
      z.object({
        fr: z.string().describe("A French synonym or near-synonym in dictionary form."),
        ru: z.string().describe("Its Russian equivalent, one or two words."),
        slang_level: slangField(),
      }),
    )
    .describe(`Up to ${LOOKUP_SYNONYMS_MAX} synonyms across registers (neutral to vulg), never the headword itself.`),
});
export type LookupModel = z.infer<typeof LookupModelSchema>;

export interface LookupTranslation {
  ru: string;
  /** Whole percent, 1–100. */
  share: number;
}

export interface LookupSynonym {
  fr: string;
  ru: string;
  slang_level: SlangLevel;
}

/** Built on the device (lib/conjugation.ts), never by the model. */
export interface Conjugation {
  auxiliary: "avoir" | "être";
  remark: string | null;
  /** Six forms each, with their pronouns (je, tu, il/elle, nous, vous, ils/elles). */
  tenses: Record<ConjTense, string[]>;
}

export interface LookupResponse {
  /** false: not a word we can look up (the screen says so; nothing else is filled). */
  found: boolean;
  /** The query as sent, and the language it was typed in. */
  q: string;
  direction: "fr" | "ru";
  fr: string;
  pos: PartOfSpeech;
  gender: Gender;
  slang_level: SlangLevel;
  verlan: boolean;
  note: string | null;
  translations: LookupTranslation[];
  synonyms: LookupSynonym[];
  conjugation: Conjugation | null;
}

/** POST /api/ai/context: real sentences from the web for a French headword. */
export const ContextRequestSchema = z.object({
  model: z.enum(MODEL_TIERS).default("fast"),
  fr: shortText(120).min(1),
  /** The lookup's translations, so each example can name the sense it shows. */
  meanings: z.array(shortText(60)).max(CONTEXT_MEANINGS_MAX).default([]),
});
export type ContextRequest = z.input<typeof ContextRequestSchema>;

/** The second (structuring) call: picks sentences out of the numbered web snippets. */
export const ContextModelSchema = z.object({
  examples: z
    .array(
      z.object({
        snippet: z.number().describe("The number of the snippet the sentence comes from."),
        fr: z.string().describe("ONE French sentence copied exactly, character for character, from that snippet. Never rewrite, shorten inside, fix or join sentences."),
        hit: z.string().describe("The exact form of the headword as it appears in fr (kiffe, kiffé, s'est cassé, la thune), copied from fr."),
        ru: z.string().describe("A natural Russian translation of the whole sentence in the same register."),
        meaning: z.string().nullable().describe("Which of the listed senses the sentence shows, copied exactly from the list; null when none fits."),
        kind: z.enum(EXAMPLE_KINDS).describe("What the source is: forum, song (lyrics), article (press, blog), subtitles (film or series), social (posts, comments), book, other."),
      }),
    )
    .describe(`Up to ${CONTEXT_EXAMPLES_MAX} sentences, the most natural and varied first; empty when no snippet really uses the headword.`),
});
export type ContextModel = z.infer<typeof ContextModelSchema>;

export interface ContextExample {
  fr: string;
  ru: string;
  /** The headword's form inside `fr` (for highlighting); always a substring of `fr`. */
  hit: string;
  /** One of the request's meanings, or null. */
  meaning: string | null;
  /** "tatoeba": a sentence from the free Tatoeba corpus (lib/tatoeba.ts), not the web search. */
  kind: ExampleKind | "tatoeba";
  url: string;
  /** Host without www., for the source line. */
  domain: string;
  title: string | null;
}

export interface ContextResponse {
  examples: ContextExample[];
  /** Distinct pages the search looked at. */
  sources: number;
  /** On the device: true once the paid web search ran for this query (its examples follow Tatoeba's). */
  web?: boolean;
}
