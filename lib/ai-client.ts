// The client half of the JSON /api/ai/* routes (enrich, anki): one POST, waiting out 429s with
// Retry-After, and the route's error mapped to a code the screens turn into a Russian message.
import type { AiErrorBody } from "./ai/schemas";

export type AiClientErrorCode = "offline" | "auth" | "unavailable" | "rate_limited" | "upstream" | "aborted";

/** A failed request; `message` is ready to show. Each feature subclasses it with its own wording. */
export class AiClientError extends Error {
  constructor(
    public readonly code: AiClientErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AiClientError";
  }
}

export interface AiPostOptions {
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  /** Retries after a 429, waiting for Retry-After (capped). */
  retries?: number;
  /** Injected for tests. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Called before waiting out a 429, with the seconds it will wait (for a countdown). */
  onRetry?: (seconds: number) => void;
}

/** Longest wait for one Retry-After, in seconds. */
export const RETRY_AFTER_MAX_SEC = 20;

const sleepFor = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });

/** POSTs `body` as JSON to `url` and returns the parsed response; errors come from `fail(code)`. */
export async function postAiJson<T>(
  url: string,
  body: unknown,
  fail: (code: AiClientErrorCode) => AiClientError,
  opts: AiPostOptions = {},
): Promise<T> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? sleepFor;
  let retries = opts.retries ?? 3;
  for (;;) {
    if (opts.signal?.aborted) throw fail("aborted");
    let res: Response;
    try {
      res = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: opts.signal,
      });
    } catch {
      if (opts.signal?.aborted) throw fail("aborted");
      throw fail(typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "upstream");
    }
    if (res.ok) return (await res.json()) as T;
    if (res.status === 429 && retries > 0) {
      retries--;
      const after = Number(res.headers.get("Retry-After"));
      const seconds = Math.min(RETRY_AFTER_MAX_SEC, Number.isFinite(after) && after > 0 ? after : 3);
      opts.onRetry?.(seconds);
      try {
        await sleep(seconds * 1000, opts.signal);
      } catch (error) {
        if (opts.signal?.aborted) throw fail("aborted");
        throw error;
      }
      continue;
    }
    let error = "";
    try {
      error = ((await res.json()) as AiErrorBody).error ?? "";
    } catch {
      // not JSON
    }
    if (res.status === 401) throw fail("auth");
    if (res.status === 403 || res.status === 503 || error === "not_configured") throw fail("unavailable");
    if (res.status === 429) throw fail("rate_limited");
    if (res.status === 499) throw fail("aborted");
    throw fail("upstream");
  }
}
