// NDJSON (one JSON object per line) used by /api/ai/suggest and /api/ai/extract.
// Both sides live here: `ndjsonResponse` for route handlers, `readNdjson` for client hooks.

export const NDJSON_CONTENT_TYPE = "application/x-ndjson; charset=utf-8";

/**
 * Streams the lines yielded by `produce`. `onCancel` runs when the client disconnects so the
 * handler can abort the model call. Errors thrown by `produce` end the stream quietly; the
 * producer is expected to yield its own `{type:"error"}` line first.
 */
export function ndjsonResponse<T>(
  produce: () => AsyncIterable<T>,
  opts: { onCancel?: () => void; headers?: Record<string, string> } = {},
): Response {
  const encoder = new TextEncoder();
  let iterator: AsyncIterator<T> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      iterator ??= produce()[Symbol.asyncIterator]();
      try {
        const { value, done } = await iterator.next();
        if (done) controller.close();
        else controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
      } catch {
        controller.close();
      }
    },
    async cancel() {
      opts.onCancel?.();
      await iterator?.return?.();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": NDJSON_CONTENT_TYPE,
      "Cache-Control": "private, no-store",
      "X-Accel-Buffering": "no",
      ...opts.headers,
    },
  });
}

/** Parses an NDJSON response body line by line. Blank or malformed lines are skipped. */
export async function* readNdjson<T = unknown>(response: Response, signal?: AbortSignal): AsyncGenerator<T> {
  if (!response.body) return;
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  try {
    while (true) {
      if (signal?.aborted) return;
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        try {
          yield JSON.parse(line) as T;
        } catch {
          // A partial or garbled line: skip it rather than drop the rest.
        }
      }
    }
    const rest = buffer.trim();
    if (rest) {
      try {
        yield JSON.parse(rest) as T;
      } catch {
        // ignore trailing garbage
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}
