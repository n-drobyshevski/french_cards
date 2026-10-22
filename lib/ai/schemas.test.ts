import { asSchema } from "ai";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AssignRequestSchema,
  buildAssignmentSchema,
  buildEnrichmentSchema,
  buildSuggestionSchema,
  buildTaxonomySchema,
  buildVocabItemSchema,
  ClassifyRequestSchema,
  ENRICH_CHUNK_MAX,
  EnrichRequestSchema,
  FOLDER_INBOX,
  FOLDER_NEW,
  SuggestRequestSchema,
  TaxonomyRequestSchema,
} from "./schemas";

type Json = Record<string, unknown>;

const FORBIDDEN = ["minLength", "maxLength", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "maxItems", "pattern", "default", "format"];

/** Every constraint Anthropic structured outputs reject, plus "all properties required, no extras". */
function violations(schema: unknown, path = "$"): string[] {
  if (Array.isArray(schema)) return schema.flatMap((s, i) => violations(s, `${path}[${i}]`));
  if (!schema || typeof schema !== "object") return [];
  const node = schema as Json;
  const out: string[] = [];
  for (const key of FORBIDDEN) if (key in node) out.push(`${path}: ${key}`);
  if (typeof node.minItems === "number" && node.minItems > 1) out.push(`${path}: minItems ${node.minItems}`);
  if (node.type === "object" || node.properties) {
    if (node.additionalProperties !== false) out.push(`${path}: additionalProperties must be false`);
    const props = Object.keys((node.properties as Json) ?? {});
    const required = new Set((node.required as string[]) ?? []);
    for (const p of props) if (!required.has(p)) out.push(`${path}.${p}: not required`);
  }
  if ("$ref" in node) out.push(`${path}: $ref (recursive/defs not expected)`);
  for (const [key, value] of Object.entries(node)) {
    if (key === "enum" || key === "required") continue;
    out.push(...violations(value, `${path}.${key}`));
  }
  return out;
}

const SLUGS = ["povsednevnoe", "dengi", "eda"];
const modelSchemas: Record<string, z.ZodType> = {
  suggestion: buildSuggestionSchema(SLUGS),
  suggestionNoFolders: buildSuggestionSchema([]),
  vocabItem: buildVocabItemSchema(SLUGS),
  taxonomy: buildTaxonomySchema(SLUGS),
  taxonomyEmpty: buildTaxonomySchema([]),
  assignment: buildAssignmentSchema(SLUGS),
  enrichment: buildEnrichmentSchema(),
};

describe("model output schemas", () => {
  for (const [name, schema] of Object.entries(modelSchemas)) {
    it(`${name}: z.toJSONSchema has no unsupported constraints`, () => {
      expect(violations(z.toJSONSchema(schema))).toEqual([]);
    });
    it(`${name}: the schema the AI SDK sends has no unsupported constraints`, async () => {
      expect(violations(await asSchema(schema).jsonSchema)).toEqual([]);
    });
  }

  it("the walker catches what it should", () => {
    const bad = z.object({ a: z.string().min(1).max(5), n: z.number().min(0), list: z.array(z.string()).min(2).max(3), o: z.string().optional() });
    const found = violations(z.toJSONSchema(bad));
    expect(found.some((v) => v.includes("minLength"))).toBe(true);
    expect(found.some((v) => v.includes("maxLength"))).toBe(true);
    expect(found.some((v) => v.includes("minimum"))).toBe(true);
    expect(found.some((v) => v.includes("minItems 2"))).toBe(true);
    expect(found.some((v) => v.includes("maxItems"))).toBe(true);
    expect(found.some((v) => v.includes("o: not required"))).toBe(true);
  });

  it("folder enums are built per request with NEW and INBOX", () => {
    const json = z.toJSONSchema(modelSchemas.suggestion) as Json;
    const folder = (json.properties as Json).folder as Json;
    expect(folder.enum).toEqual([...SLUGS, FOLDER_NEW, FOLDER_INBOX]);
    const empty = (z.toJSONSchema(modelSchemas.suggestionNoFolders) as Json).properties as Json;
    expect((empty.folder as Json).enum).toEqual([FOLDER_NEW, FOLDER_INBOX]);
    const assign = z.toJSONSchema(modelSchemas.assignment) as Json;
    const items = ((assign.properties as Json).assignments as Json).items as Json;
    expect(((items.properties as Json).folder as Json).enum).toEqual([FOLDER_INBOX, ...SLUGS]);
  });

  it("slang_level and confidence are enums, nullable fields are required", () => {
    const suggestionSchema = buildSuggestionSchema(SLUGS);
    const parsed = suggestionSchema.parse({
      fr: "la thune",
      ru: "бабки",
      note: null,
      example_fr: null,
      example_ru: null,
      pos: "noun",
      gender: "f",
      slang_level: "arg",
      verlan: false,
      folder: "dengi",
      folder_alternatives: [],
      new_folder: null,
      confidence: "high",
    });
    expect(parsed.slang_level).toBe("arg");
    expect(suggestionSchema.safeParse({ ...parsed, slang_level: 2 }).success).toBe(false);
    expect(suggestionSchema.safeParse({ ...parsed, folder: "unknown" }).success).toBe(false);
    const withoutNote: Record<string, unknown> = { ...parsed };
    delete withoutNote.note;
    expect(suggestionSchema.safeParse(withoutNote).success).toBe(false);
  });
});

describe("request schemas", () => {
  it("suggest: trims q, defaults direction and folders", () => {
    const r = SuggestRequestSchema.parse({ q: "  se   cass " });
    expect(r).toEqual({ q: "se cass", direction: "auto", folders: [] });
  });

  it("suggest: rejects empty or long q, bad direction, bad slugs, duplicate slugs", () => {
    expect(SuggestRequestSchema.safeParse({ q: "   " }).success).toBe(false);
    expect(SuggestRequestSchema.safeParse({ q: "x".repeat(81) }).success).toBe(false);
    expect(SuggestRequestSchema.safeParse({ q: "ok", direction: "en" }).success).toBe(false);
    expect(SuggestRequestSchema.safeParse({ q: "ok", folders: [{ slug: "Деньги", name: "Деньги" }] }).success).toBe(false);
    expect(SuggestRequestSchema.safeParse({ q: "ok", folders: [{ slug: "NEW", name: "x" }] }).success).toBe(false);
    const dup = [
      { slug: "dengi", name: "Деньги" },
      { slug: "dengi", name: "Бабки" },
    ];
    expect(SuggestRequestSchema.safeParse({ q: "ok", folders: dup }).success).toBe(false);
  });

  it("classify: discriminates on mode and bounds chunk sizes", () => {
    const folders = [{ slug: "dengi", name: "Деньги", description: null }];
    const word = (i: number) => ({ id: `id-${i}`, fr: `mot${i}`, ru: `слово${i}` });
    expect(ClassifyRequestSchema.safeParse({ mode: "assign", words: [word(1)], folders }).success).toBe(true);
    expect(AssignRequestSchema.safeParse({ mode: "assign", words: Array.from({ length: 151 }, (_, i) => word(i)), folders }).success).toBe(false);
    expect(AssignRequestSchema.safeParse({ mode: "assign", words: [word(1)], folders: [] }).success).toBe(false);
    const tax = TaxonomyRequestSchema.parse({ mode: "taxonomy", words: [word(1)], folders });
    expect(tax.folders[0]).toMatchObject({ locked: false, created_by: "auto" });
    expect(ClassifyRequestSchema.safeParse({ mode: "other", words: [word(1)], folders }).success).toBe(false);
  });

  it("enrich: needs both sides, unique ids, at most a chunk", () => {
    const word = (i: number) => ({ id: `id-${i}`, fr: `mot${i}`, ru: `слово${i}` });
    expect(EnrichRequestSchema.safeParse({ words: [word(1)] }).success).toBe(true);
    expect(EnrichRequestSchema.safeParse({ words: [] }).success).toBe(false);
    expect(EnrichRequestSchema.safeParse({ words: [{ ...word(1), ru: " " }] }).success).toBe(false);
    expect(EnrichRequestSchema.safeParse({ words: [word(1), word(1)] }).success).toBe(false);
    expect(EnrichRequestSchema.safeParse({ words: Array.from({ length: ENRICH_CHUNK_MAX + 1 }, (_, i) => word(i)) }).success).toBe(false);
  });
});
