// POST /api/ai/enrich — slang level, part of speech and an example for cards the learner typed
// (manual form, «Список», quick save, library backfill). JSON in, JSON out.
// Request: { words: [{id, fr, ru, note?}] (≤50), folders?: [{slug,name,description}], fields?: [{id,name,hint}] (≤10) } →
// EnrichResponse { results: [{id, pos, gender, slang_level, verlan, example_fr, example_ru, confidence,
// folder, folder_alternatives, new_folder, custom: [{id, value}]}] }. Without `folders` no theme is picked
// (folder null); without `fields` custom is empty.
// Scope "level" («Определить уровень языка»): { scope: "level", words (≤ LEVEL_CHUNK_MAX), anchors?: [{fr, level}] (≤60) }
// → LevelResponse { levels: [{id, cefr: "A1"…"C2" | null}] }: a CEFR level rated against the anchors, null for
// argot, vulgar words, verlan and words the model can't place.
import { generateText, Output } from "ai";
import { guardAiRequest, jsonError, limitAiRequest, NO_STORE } from "@/lib/ai/auth";
import { refFor } from "@/lib/ai/classify";
import { LEVEL_CHUNK_MAX } from "@/lib/ai/constants";
import { fieldRefMap, finalizeEnrichment, finalizeLevels } from "@/lib/ai/enrich";
import { cachedInstructions, modelFor, modelIdFor, providerOptionsFor } from "@/lib/ai/model";
import { ENRICH_SYSTEM, enrichUserPrompt, LEVEL_SYSTEM, levelUserPrompt } from "@/lib/ai/prompts";
import {
  buildEnrichmentSchema,
  buildLevelSchema,
  EnrichRequestSchema,
  type EnrichmentModel,
  type EnrichResponse,
  type LevelModel,
  type LevelResponse,
} from "@/lib/ai/schemas";

export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  const guard = await guardAiRequest(req);
  if (guard instanceof Response) return guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "bad_request", "invalid JSON");
  }
  const parsed = EnrichRequestSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "bad_request", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  const { words, folders, fields = [], model, scope, anchors = [] } = parsed.data;
  if (scope === "level" && words.length > LEVEL_CHUNK_MAX) return jsonError(400, "bad_request", [`words: at most ${LEVEL_CHUNK_MAX} with scope level`]);
  const limited = limitAiRequest("enrich", guard);
  if (limited) return limited;

  if (scope === "level") {
    try {
      const { output } = await generateText({
        model: modelFor("enrich", model),
        instructions: cachedInstructions(LEVEL_SYSTEM),
        prompt: levelUserPrompt({ anchors, words: words.map((w, i) => ({ ref: refFor(i), fr: w.fr, ru: w.ru, note: w.note ?? null })) }),
        output: Output.object({ schema: buildLevelSchema(), name: "levels" }),
        providerOptions: providerOptionsFor(modelIdFor("enrich", model)),
        maxOutputTokens: 2000,
        abortSignal: req.signal,
      });
      const response: LevelResponse = { levels: finalizeLevels(output as LevelModel, words) };
      return Response.json(response, { headers: NO_STORE });
    } catch (error) {
      if (req.signal.aborted) return jsonError(499, "aborted");
      console.error("[ai/enrich level]", error);
      return jsonError(502, "upstream_error");
    }
  }

  const fieldRefs = [...fieldRefMap(fields).keys()];
  try {
    const { output } = await generateText({
      model: modelFor("enrich", model),
      instructions: cachedInstructions(ENRICH_SYSTEM),
      prompt: enrichUserPrompt({
        words: words.map((w, i) => ({ ref: refFor(i), fr: w.fr, ru: w.ru, note: w.note ?? null })),
        folders,
        fields: fields.map((f, i) => ({ ref: fieldRefs[i], name: f.name, hint: f.hint ?? null })),
      }),
      output: Output.object({ schema: buildEnrichmentSchema(folders ? folders.map((f) => f.slug) : null, fieldRefs), name: "cards" }),
      providerOptions: providerOptionsFor(modelIdFor("enrich", model)),
      // Custom fields add up to ten short values per word.
      maxOutputTokens: fields.length > 0 ? 16000 : 8000,
      abortSignal: req.signal,
    });
    const folderRefs = folders ? folders.map((f) => ({ slug: f.slug, name: f.name })) : null;
    const response: EnrichResponse = { results: finalizeEnrichment(output as EnrichmentModel, words, folderRefs, fields) };
    return Response.json(response, { headers: NO_STORE });
  } catch (error) {
    if (req.signal.aborted) return jsonError(499, "aborted");
    console.error("[ai/enrich]", error);
    return jsonError(502, "upstream_error");
  }
}
