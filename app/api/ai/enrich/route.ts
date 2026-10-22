// POST /api/ai/enrich — slang level, part of speech and an example for cards the learner typed
// (manual form, «Список», quick save, library backfill). JSON in, JSON out.
// Request: { words: [{id, fr, ru, note?}] (≤50), folders?: [{slug,name,description}] } →
// EnrichResponse { results: [{id, pos, gender, slang_level, verlan, example_fr, example_ru, confidence,
// folder, folder_alternatives, new_folder}] }. Without `folders` no theme is picked (folder null).
import { generateText, Output } from "ai";
import { guardAiRequest, jsonError, limitAiRequest, NO_STORE } from "@/lib/ai/auth";
import { refFor } from "@/lib/ai/classify";
import { finalizeEnrichment } from "@/lib/ai/enrich";
import { cachedInstructions, modelFor, providerOptions } from "@/lib/ai/model";
import { ENRICH_SYSTEM, enrichUserPrompt } from "@/lib/ai/prompts";
import { buildEnrichmentSchema, EnrichRequestSchema, type EnrichmentModel, type EnrichResponse } from "@/lib/ai/schemas";

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
  const { words, folders } = parsed.data;
  const limited = limitAiRequest("enrich", guard);
  if (limited) return limited;

  try {
    const { output } = await generateText({
      model: modelFor("enrich"),
      instructions: cachedInstructions(ENRICH_SYSTEM),
      prompt: enrichUserPrompt({
        words: words.map((w, i) => ({ ref: refFor(i), fr: w.fr, ru: w.ru, note: w.note ?? null })),
        folders,
      }),
      output: Output.object({ schema: buildEnrichmentSchema(folders ? folders.map((f) => f.slug) : null), name: "cards" }),
      providerOptions,
      maxOutputTokens: 8000,
      abortSignal: req.signal,
    });
    const folderRefs = folders ? folders.map((f) => ({ slug: f.slug, name: f.name })) : null;
    const response: EnrichResponse = { results: finalizeEnrichment(output as EnrichmentModel, words, folderRefs) };
    return Response.json(response, { headers: NO_STORE });
  } catch (error) {
    if (req.signal.aborted) return jsonError(499, "aborted");
    console.error("[ai/enrich]", error);
    return jsonError(502, "upstream_error");
  }
}
