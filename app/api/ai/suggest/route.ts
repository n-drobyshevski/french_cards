// POST /api/ai/suggest — up to 3 suggestions for the add sheet, streamed as NDJSON.
// Request: { q, direction: "auto"|"fr"|"ru", folders: [{slug,name,description}], model?: "fast"|"accurate",
// max?: 1–3, register?: "slang"|"any"|"neutral", notes?: boolean } (preferences from Settings «ИИ»).
// Response lines: {type:"meta",direction} · {type:"suggestion",index,suggestion} × ≤3 ·
// then {type:"done",count} or {type:"error",error}. See lib/ai/schemas.ts for the types.
import { Output, streamText } from "ai";
import { guardAiRequest, jsonError, limitAiRequest } from "@/lib/ai/auth";
import { cachedInstructions, modelFor, providerOptions } from "@/lib/ai/model";
import { ndjsonResponse } from "@/lib/ai/ndjson";
import { dedupeKey, detectDirection, normalizeSuggestion } from "@/lib/ai/normalize";
import { SUGGEST_SYSTEM, suggestUserPrompt } from "@/lib/ai/prompts";
import { buildSuggestionSchema, SuggestRequestSchema, type SuggestLine } from "@/lib/ai/schemas";

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
  const parsed = SuggestRequestSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "bad_request", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));

  const limited = limitAiRequest("suggest", guard);
  if (limited) return limited;

  const { q, folders, model, max, register, notes } = parsed.data;
  const direction = parsed.data.direction === "auto" ? detectDirection(q) : parsed.data.direction;
  const folderRefs = folders.map((f) => ({ slug: f.slug, name: f.name }));

  const stop = new AbortController();
  const abortSignal = AbortSignal.any([req.signal, stop.signal]);
  let failure: unknown = null;

  const result = streamText({
    model: modelFor("suggest", model),
    instructions: cachedInstructions(SUGGEST_SYSTEM),
    prompt: suggestUserPrompt({ q, direction, folders, max, register, notes }),
    output: Output.array({ element: buildSuggestionSchema(folders.map((f) => f.slug)), name: "suggestions" }),
    providerOptions,
    maxOutputTokens: 1500,
    abortSignal,
    onError({ error }) {
      failure = error;
    },
  });

  async function* lines(): AsyncGenerator<SuggestLine> {
    yield { type: "meta", direction };
    let count = 0;
    const seen = new Set<string>();
    try {
      for await (const raw of result.elementStream) {
        const suggestion = normalizeSuggestion(raw, folderRefs);
        if (!suggestion) continue;
        if (!notes) suggestion.note = null;
        const key = dedupeKey(suggestion.fr);
        if (seen.has(key)) continue;
        seen.add(key);
        yield { type: "suggestion", index: count, suggestion };
        count++;
        if (count >= max) {
          stop.abort();
          break;
        }
      }
    } catch (error) {
      failure ??= error;
    }
    if (failure && count < max && !req.signal.aborted) {
      console.error("[ai/suggest]", failure);
      yield { type: "error", error: "upstream_error" };
      return;
    }
    yield { type: "done", count };
  }

  return ndjsonResponse(lines, { onCancel: () => stop.abort() });
}
