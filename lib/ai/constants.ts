// Plain constants and literal types shared by the AI routes and the client. No zod here, so
// client code that only needs a limit or a folder sentinel never bundles the schemas; schemas.ts
// re-exports everything for the routes.
import type { Confidence, Gender, PartOfSpeech } from "@/lib/types";

export const FOLDER_NEW = "NEW" as const;
export const FOLDER_INBOX = "INBOX" as const;

export const POS_VALUES = ["noun", "verb", "adj", "adv", "expression", "other"] as const satisfies readonly PartOfSpeech[];
export const GENDER_VALUES = ["m", "f", "mf", "none"] as const satisfies readonly Gender[];
export const CONFIDENCE_VALUES = ["high", "med", "low"] as const satisfies readonly Confidence[];
/** Model-facing slang codes; index = SlangLevel (0 нейтр. · 1 fam. · 2 arg. · 3 vulg.). */
export const SLANG_CODES = ["neutral", "fam", "arg", "vulg"] as const;
export type SlangCode = (typeof SLANG_CODES)[number];
export const PROVENANCE_VALUES = ["pair", "fr_only", "ru_only", "in_text"] as const;
export type Provenance = (typeof PROVENANCE_VALUES)[number];

export const SUGGEST_MAX = 3;
/** Settings «Модель»: fast = Haiku, accurate = Sonnet. */
export const MODEL_TIERS = ["fast", "accurate"] as const;
export type ModelTierInput = (typeof MODEL_TIERS)[number];
/** Settings «Регистр вариантов»: slang first, a spread (default), or the neutral word first. */
export const SUGGEST_REGISTERS = ["slang", "any", "neutral"] as const;
export type SuggestRegister = (typeof SUGGEST_REGISTERS)[number];
export const EXTRACT_MAX_ITEMS = 60;
export const FOLDER_ALTERNATIVES_MAX = 2;
export const TAXONOMY_MIN = 8;
export const TAXONOMY_MAX = 25;
export const NEW_FOLDER_MIN_WORDS = 3;
export const ASSIGN_CHUNK_MAX = 150;
export const ENRICH_CHUNK_MAX = 50;

/** How many existing examples the client may list for «другой пример» to avoid. */
export const EXAMPLE_AVOID_MAX = 6;

// «Контекст» (/api/ai/lookup, /api/ai/context).
export const LOOKUP_TRANSLATIONS_MAX = 5;
export const LOOKUP_SYNONYMS_MAX = 8;
export const CONTEXT_EXAMPLES_MAX = 8;
/** Translations the client sends to /api/ai/context so each example can say which sense it shows. */
export const CONTEXT_MEANINGS_MAX = LOOKUP_TRANSLATIONS_MAX;
export const CONJ_TENSES = ["present", "passe_compose", "imparfait", "futur"] as const;
export type ConjTense = (typeof CONJ_TENSES)[number];
/** /api/ai/fill: the built-in word fields «Заполнить автоматически» can ask for. */
export const FILL_FIELDS = ["origin", "conjugation"] as const;
export type FillField = (typeof FILL_FIELDS)[number];
export const EXAMPLE_KINDS = ["forum", "song", "article", "subtitles", "social", "book", "other"] as const;
export type ExampleKind = (typeof EXAMPLE_KINDS)[number];
