// POST /api/ai/lookup — «Контекст», the dictionary part: translations by share, synonyms by
// register and the conjugation of a verb. JSON in, JSON out.
// Request: { q, model? } → LookupResponse.
import { generateText, Output } from "ai";
import { finalizeLookup } from "@/lib/ai/context";
import { guardAiRequest, jsonError, limitAiRequest, NO_STORE } from "@/lib/ai/auth";
import { cachedInstructions, modelFor, modelIdFor, providerOptionsFor } from "@/lib/ai/model";
import { detectDirection } from "@/lib/ai/normalize";
import { LOOKUP_SYSTEM, lookupUserPrompt } from "@/lib/ai/prompts";
import { LookupModelSchema, LookupRequestSchema, type LookupModel } from "@/lib/ai/schemas";

export const maxDuration = 30;

export async function POST(req: Request): Promise<Response> {
  const guard = await guardAiRequest(req);
  if (guard instanceof Response) return guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "bad_request", "invalid JSON");
  }
  const parsed = LookupRequestSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "bad_request", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  const { q, model } = parsed.data;
  const limited = limitAiRequest("lookup", guard);
  if (limited) return limited;

  try {
    const { output } = await generateText({
      model: modelFor("lookup", model),
      instructions: cachedInstructions(LOOKUP_SYSTEM),
      prompt: lookupUserPrompt({ q, direction: detectDirection(q) }),
      output: Output.object({ schema: LookupModelSchema, name: "lookup" }),
      providerOptions: providerOptionsFor(modelIdFor("lookup", model)),
      maxOutputTokens: 2000,
      abortSignal: req.signal,
    });
    return Response.json(finalizeLookup(output as LookupModel, q), { headers: NO_STORE });
  } catch (error) {
    if (req.signal.aborted) return jsonError(499, "aborted");
    console.error("[ai/lookup]", error);
    return jsonError(502, "upstream_error");
  }
}
