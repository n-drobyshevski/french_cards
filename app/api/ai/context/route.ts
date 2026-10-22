// POST /api/ai/context — «Контекст», real sentences from the web for a French headword.
// Two calls: the first searches the web and quotes what it finds (each quote cited); the second,
// without tools, picks sentences out of those cited snippets and translates them. The server
// keeps a sentence only when it is a verbatim part of a cited snippet, with that page's link.
// Request: { fr, meanings[], model? } → ContextResponse.
import { generateText, Output } from "ai";
import { finalizeContext, snippetsFromSources, type WebSource } from "@/lib/ai/context";
import { guardAiRequest, jsonError, limitAiRequest, NO_STORE } from "@/lib/ai/auth";
import { cachedInstructions, modelFor, modelIdFor, providerFor, providerOptionsFor } from "@/lib/ai/model";
import { CONTEXT_PICK_SYSTEM, CONTEXT_SEARCH_SYSTEM, contextPickPrompt, contextSearchPrompt } from "@/lib/ai/prompts";
import { ContextModelSchema, ContextRequestSchema, type ContextModel, type ContextResponse } from "@/lib/ai/schemas";

export const maxDuration = 60;

/** Web searches per run (each one is billed). */
const SEARCHES_MAX = 3;

export async function POST(req: Request): Promise<Response> {
  const guard = await guardAiRequest(req);
  if (guard instanceof Response) return guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "bad_request", "invalid JSON");
  }
  const parsed = ContextRequestSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "bad_request", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  const { fr, meanings, model } = parsed.data;
  const limited = limitAiRequest("context", guard);
  if (limited) return limited;

  try {
    const search = await generateText({
      model: modelFor("context", model),
      instructions: cachedInstructions(CONTEXT_SEARCH_SYSTEM),
      prompt: contextSearchPrompt({ fr, meanings }),
      tools: { web_search: providerFor().tools.webSearch_20250305({ maxUses: SEARCHES_MAX }) },
      providerOptions: providerOptionsFor(modelIdFor("context", model)),
      maxOutputTokens: 2500,
      abortSignal: req.signal,
    });
    const { snippets, pages } = snippetsFromSources(search.sources as WebSource[]);
    if (snippets.length === 0) {
      const empty: ContextResponse = { examples: [], sources: pages };
      return Response.json(empty, { headers: NO_STORE });
    }

    const { output } = await generateText({
      model: modelFor("context", model),
      instructions: cachedInstructions(CONTEXT_PICK_SYSTEM),
      prompt: contextPickPrompt({ fr, meanings, snippets }),
      output: Output.object({ schema: ContextModelSchema, name: "context" }),
      providerOptions: providerOptionsFor(modelIdFor("context", model)),
      maxOutputTokens: 3000,
      abortSignal: req.signal,
    });
    return Response.json(finalizeContext(output as ContextModel, snippets, { fr, meanings }, pages), { headers: NO_STORE });
  } catch (error) {
    if (req.signal.aborted) return jsonError(499, "aborted");
    console.error("[ai/context]", error);
    return jsonError(502, "upstream_error");
  }
}
