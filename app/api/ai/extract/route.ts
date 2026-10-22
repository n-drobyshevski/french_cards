// POST /api/ai/extract — vocabulary rows from 1–4 screenshots, streamed as NDJSON as each row completes.
// Request: multipart/form-data with `images` (1–4 PNG/JPEG/WebP files, ≤1.5 MB each) and optional
// `folders` (JSON array of {slug,name,description}), `model` ("fast"|"accurate") and `notes` ("false" to
// switch usage notes off). Images are only held in memory for the call.
// Response lines: {type:"meta",images} · {type:"item",index,item} × ≤60 · {type:"done",count} | {type:"error",error}.
import { Output, streamText, type FilePart, type TextPart } from "ai";
import { guardAiRequest, jsonError, limitAiRequest } from "@/lib/ai/auth";
import { cachedInstructions, modelFor, modelIdFor, providerOptionsFor } from "@/lib/ai/model";
import { MAX_EXTRACT_BODY_BYTES, MAX_IMAGE_BYTES, MAX_IMAGES, readBodyWithLimit, sniffImageType } from "@/lib/ai/images";
import { ndjsonResponse } from "@/lib/ai/ndjson";
import { dedupeKey, normalizeVocabItem } from "@/lib/ai/normalize";
import { EXTRACT_SYSTEM, extractUserPrompt } from "@/lib/ai/prompts";
import {
  buildVocabItemSchema,
  EXTRACT_MAX_ITEMS,
  ExtractFoldersSchema,
  MODEL_TIERS,
  type ExtractLine,
  type FolderInput,
  type ModelTierInput,
} from "@/lib/ai/schemas";

export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  const guard = await guardAiRequest(req);
  if (guard instanceof Response) return guard;

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    return jsonError(400, "bad_request", "expected multipart/form-data");
  }

  let form: FormData;
  try {
    const body = await readBodyWithLimit(req, MAX_EXTRACT_BODY_BYTES);
    if (!body) return jsonError(413, "too_large");
    form = await new Response(body, { headers: { "content-type": contentType } }).formData();
  } catch {
    return jsonError(400, "bad_request", "invalid form data");
  }

  let folders: FolderInput[] = [];
  const foldersField = form.get("folders");
  if (foldersField != null) {
    if (typeof foldersField !== "string") return jsonError(400, "bad_request", "folders must be a JSON string");
    let json: unknown;
    try {
      json = JSON.parse(foldersField);
    } catch {
      return jsonError(400, "bad_request", "folders: invalid JSON");
    }
    const parsed = ExtractFoldersSchema.safeParse(json);
    if (!parsed.success) return jsonError(400, "bad_request", parsed.error.issues.map((i) => `folders.${i.path.join(".")}: ${i.message}`));
    folders = parsed.data;
  }

  const modelField = form.get("model") ?? "fast";
  if (typeof modelField !== "string" || !(MODEL_TIERS as readonly string[]).includes(modelField)) {
    return jsonError(400, "bad_request", "model must be fast or accurate");
  }
  const model = modelField as ModelTierInput;
  const notes = form.get("notes") !== "false";

  const files = form.getAll("images").filter((v): v is File => typeof v !== "string");
  if (files.length === 0) return jsonError(400, "bad_request", "no images");
  if (files.length > MAX_IMAGES) return jsonError(400, "bad_request", `at most ${MAX_IMAGES} images`);

  const images: FilePart[] = [];
  for (const [i, file] of files.entries()) {
    if (file.size > MAX_IMAGE_BYTES) return jsonError(413, "too_large", `image ${i + 1} exceeds 1.5 MB`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength > MAX_IMAGE_BYTES) return jsonError(413, "too_large", `image ${i + 1} exceeds 1.5 MB`);
    const mediaType = sniffImageType(bytes);
    if (!mediaType) return jsonError(415, "unsupported_image", `image ${i + 1} is not PNG, JPEG or WebP`);
    images.push({ type: "file", data: bytes, mediaType });
  }

  const limited = limitAiRequest("extract", guard);
  if (limited) return limited;

  const folderRefs = folders.map((f) => ({ slug: f.slug, name: f.name }));
  const stop = new AbortController();
  let failure: unknown = null;

  const content: (TextPart | FilePart)[] = [];
  images.forEach((image, i) => {
    if (images.length > 1) content.push({ type: "text", text: `Image ${i + 1} of ${images.length}:` });
    content.push(image);
  });
  content.push({ type: "text", text: extractUserPrompt({ imageCount: images.length, folders, notes }) });

  const result = streamText({
    model: modelFor("extract", model),
    instructions: cachedInstructions(EXTRACT_SYSTEM),
    messages: [{ role: "user", content }],
    output: Output.array({ element: buildVocabItemSchema(folders.map((f) => f.slug)), name: "vocabulary" }),
    providerOptions: providerOptionsFor(modelIdFor("extract", model)),
    maxOutputTokens: 16000,
    abortSignal: AbortSignal.any([req.signal, stop.signal]),
    onError({ error }) {
      failure = error;
    },
  });

  async function* lines(): AsyncGenerator<ExtractLine> {
    yield { type: "meta", images: images.length };
    let count = 0;
    let capped = false;
    const seen = new Set<string>();
    try {
      for await (const raw of result.elementStream) {
        const item = normalizeVocabItem(raw, folderRefs);
        if (!item) continue;
        if (!notes) item.note = null;
        const key = dedupeKey(item.fr);
        if (seen.has(key)) continue;
        seen.add(key);
        yield { type: "item", index: count, item };
        count++;
        if (count >= EXTRACT_MAX_ITEMS) {
          capped = true;
          stop.abort();
          break;
        }
      }
    } catch (error) {
      failure ??= error;
    }
    if (failure && !capped && !req.signal.aborted) {
      console.error("[ai/extract]", failure);
      yield { type: "error", error: "upstream_error" };
      return;
    }
    yield { type: "done", count };
  }

  return ndjsonResponse(lines, { onCancel: () => stop.abort() });
}
