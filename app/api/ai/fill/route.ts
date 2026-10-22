// POST /api/ai/fill — «Заполнить автоматически» in the word card: the one-line origin, or the
// conjugation of a verb the device's dictionary (Lexique) does not know. JSON in, JSON out.
// Request: { field: "origin" | "conjugation", fr, ru?, pos?, model? } → FillResponse { field, value }.
import { generateText, Output } from "ai";
import { guardAiRequest, jsonError, limitAiRequest, NO_STORE } from "@/lib/ai/auth";
import { finalizeConjugation, finalizeOrigin } from "@/lib/ai/fill";
import { cachedInstructions, modelFor, modelIdFor, providerOptionsFor } from "@/lib/ai/model";
import { FILL_CONJUGATION_SYSTEM, FILL_ORIGIN_SYSTEM, fillUserPrompt } from "@/lib/ai/prompts";
import {
  FillConjugationModelSchema,
  FillOriginModelSchema,
  FillRequestSchema,
  type FillConjugationModel,
  type FillOriginModel,
  type FillResponse,
} from "@/lib/ai/schemas";

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
  const parsed = FillRequestSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "bad_request", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  const { field, fr, ru, pos, model } = parsed.data;
  const limited = limitAiRequest("fill", guard);
  if (limited) return limited;

  const common = {
    model: modelFor("fill", model),
    prompt: fillUserPrompt({ fr, ru: ru ?? null, pos: pos ?? null }),
    providerOptions: providerOptionsFor(modelIdFor("fill", model)),
    abortSignal: req.signal,
  };
  try {
    let value: FillResponse["value"];
    if (field === "origin") {
      const { output } = await generateText({
        ...common,
        instructions: cachedInstructions(FILL_ORIGIN_SYSTEM),
        output: Output.object({ schema: FillOriginModelSchema, name: "origin" }),
        maxOutputTokens: 300,
      });
      value = finalizeOrigin(output as FillOriginModel);
    } else {
      const { output } = await generateText({
        ...common,
        instructions: cachedInstructions(FILL_CONJUGATION_SYSTEM),
        output: Output.object({ schema: FillConjugationModelSchema, name: "conjugation" }),
        maxOutputTokens: 1200,
      });
      value = finalizeConjugation(output as FillConjugationModel);
    }
    const response: FillResponse = { field, value };
    return Response.json(response, { headers: NO_STORE });
  } catch (error) {
    if (req.signal.aborted) return jsonError(499, "aborted");
    console.error("[ai/fill]", error);
    return jsonError(502, "upstream_error");
  }
}
