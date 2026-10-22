// POST /api/ai/classify — the two passes of «Разложить по темам». JSON in, JSON out.
// mode "taxonomy": { words:[{id,fr,ru,folder?}], folders:[{slug,name,description,locked,created_by}] } → TaxonomyResponse
// mode "assign":   { words:[{id,fr,ru,note?}] (≤150), folders:[{slug,name,description}], examples?:[{fr,ru,folder}] } → AssignResponse
import { generateText, Output } from "ai";
import { guardAiRequest, jsonError, limitAiRequest, NO_STORE } from "@/lib/ai/auth";
import { finalizeAssignments, finalizeTaxonomy, refFor } from "@/lib/ai/classify";
import { cachedInstructions, modelFor, modelIdFor, providerOptionsFor } from "@/lib/ai/model";
import { ASSIGN_SYSTEM, assignUserPrompt, TAXONOMY_SYSTEM, taxonomyUserPrompt } from "@/lib/ai/prompts";
import {
  buildAssignmentSchema,
  buildTaxonomySchema,
  ClassifyRequestSchema,
  type AssignResponse,
  type TaxonomyResponse,
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
  const parsed = ClassifyRequestSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "bad_request", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  const input = parsed.data;
  const limited = limitAiRequest("classify", guard);
  if (limited) return limited;

  try {
    if (input.mode === "taxonomy") {
      const { output } = await generateText({
        model: modelFor("classify", input.model),
        instructions: cachedInstructions(TAXONOMY_SYSTEM),
        prompt: taxonomyUserPrompt({
          folders: input.folders,
          words: input.words.map((w, i) => ({ ref: refFor(i), fr: w.fr, ru: w.ru, folder: w.folder ?? null })),
        }),
        output: Output.object({ schema: buildTaxonomySchema(input.folders.map((f) => f.slug)), name: "taxonomy" }),
        providerOptions: providerOptionsFor(modelIdFor("classify", input.model)),
        maxOutputTokens: 6000,
        abortSignal: req.signal,
      });
      const response: TaxonomyResponse = finalizeTaxonomy(output, input.folders, input.words);
      return Response.json(response, { headers: NO_STORE });
    }

    const slugs = input.folders.map((f) => f.slug);
    const known = new Set(slugs);
    const { output } = await generateText({
      model: modelFor("classify", input.model),
      instructions: cachedInstructions(ASSIGN_SYSTEM),
      prompt: assignUserPrompt({
        folders: input.folders,
        examples: input.examples.filter((e) => known.has(e.folder)),
        words: input.words.map((w, i) => ({ ref: refFor(i), fr: w.fr, ru: w.ru, note: w.note ?? null })),
      }),
      output: Output.object({ schema: buildAssignmentSchema(slugs), name: "assignments" }),
      providerOptions: providerOptionsFor(modelIdFor("classify", input.model)),
      maxOutputTokens: 8000,
      abortSignal: req.signal,
    });
    const response: AssignResponse = { assignments: finalizeAssignments(output, input.words, slugs) };
    return Response.json(response, { headers: NO_STORE });
  } catch (error) {
    if (req.signal.aborted) return jsonError(499, "aborted");
    console.error(`[ai/classify:${input.mode}]`, error);
    return jsonError(502, "upstream_error");
  }
}
