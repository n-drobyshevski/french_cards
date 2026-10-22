// POST /api/ai/example — one more example sentence for a card, unlike the ones it already has
// («другой пример» ↻ and «+ Ещё пример»). JSON in, JSON out.
// Request: { fr, ru, note?, avoid: string[] (≤6), model? } → ExampleResponse { example: {fr, ru} | null }.
import { generateText, Output } from "ai";
import { guardAiRequest, jsonError, limitAiRequest, NO_STORE } from "@/lib/ai/auth";
import { finalizeExample } from "@/lib/ai/example";
import { cachedInstructions, modelFor, modelIdFor, providerOptionsFor } from "@/lib/ai/model";
import { EXAMPLE_SYSTEM, exampleUserPrompt } from "@/lib/ai/prompts";
import { ExampleModelSchema, ExampleRequestSchema, type ExampleModel, type ExampleResponse } from "@/lib/ai/schemas";

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
  const parsed = ExampleRequestSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "bad_request", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  const { fr, ru, note, avoid, model } = parsed.data;
  const limited = limitAiRequest("example", guard);
  if (limited) return limited;

  try {
    const { output } = await generateText({
      model: modelFor("example", model),
      instructions: cachedInstructions(EXAMPLE_SYSTEM),
      prompt: exampleUserPrompt({ fr, ru, note: note ?? null, avoid }),
      output: Output.object({ schema: ExampleModelSchema, name: "example" }),
      providerOptions: providerOptionsFor(modelIdFor("example", model)),
      maxOutputTokens: 400,
      abortSignal: req.signal,
    });
    const response: ExampleResponse = { example: finalizeExample(output as ExampleModel, avoid) };
    return Response.json(response, { headers: NO_STORE });
  } catch (error) {
    if (req.signal.aborted) return jsonError(499, "aborted");
    console.error("[ai/example]", error);
    return jsonError(502, "upstream_error");
  }
}
