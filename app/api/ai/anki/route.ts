// POST /api/ai/anki — cards from the notes of an imported Anki deck (lib/anki/enrich.ts). JSON in, JSON out.
// Request: { notes: [{ref, fields: [{name, text}] (≤8), tags}] (≤25), folders?: [{slug,name,description}],
// fields?: [{id,name,hint}] (≤10), model? } →
// AnkiResponse { items: [{ref, skip, fr_field, used_fields, custom: [{id, value}], fr, ru, …VocabItem}] } in note
// order; notes the model left out get no item. Without `folders` every card goes to INBOX or a proposed new theme.
import { generateText, Output } from "ai";
import { ankiRefMap, finalizeAnki } from "@/lib/ai/anki";
import { fieldRefMap } from "@/lib/ai/enrich";
import { guardAiRequest, jsonError, limitAiRequest, NO_STORE } from "@/lib/ai/auth";
import { cachedInstructions, modelFor, providerOptions } from "@/lib/ai/model";
import { ANKI_SYSTEM, ankiUserPrompt } from "@/lib/ai/prompts";
import { AnkiRequestSchema, buildAnkiSchema, type AnkiModel, type AnkiResponse } from "@/lib/ai/schemas";

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
  const parsed = AnkiRequestSchema.safeParse(body);
  if (!parsed.success)
    return jsonError(
      400,
      "bad_request",
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    );
  const { notes, folders = [], fields = [], model } = parsed.data;
  const limited = limitAiRequest("anki", guard);
  if (limited) return limited;

  const refs = ankiRefMap(notes);
  const fieldRefs = [...fieldRefMap(fields).keys()];
  try {
    const { output } = await generateText({
      model: modelFor("anki", model),
      instructions: cachedInstructions(ANKI_SYSTEM),
      prompt: ankiUserPrompt({
        notes: [...refs].map(([ref, n]) => ({ ref, fields: n.fields, tags: n.tags })),
        folders,
        fields: fields.map((f, i) => ({ ref: fieldRefs[i], name: f.name, hint: f.hint ?? null })),
      }),
      output: Output.object({ schema: buildAnkiSchema(folders.map((f) => f.slug), fieldRefs), name: "cards" }),
      providerOptions,
      maxOutputTokens: fields.length > 0 ? 16000 : 10000,
      abortSignal: req.signal,
    });
    const folderRefs = folders.map((f) => ({ slug: f.slug, name: f.name }));
    const response: AnkiResponse = { items: finalizeAnki(output as AnkiModel, refs, folderRefs, fields) };
    return Response.json(response, { headers: NO_STORE });
  } catch (error) {
    if (req.signal.aborted) return jsonError(499, "aborted");
    console.error("[ai/anki]", error);
    return jsonError(502, "upstream_error");
  }
}
