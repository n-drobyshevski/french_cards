// Screenshot → vocabulary rows: prepares the images (lib/image-prep.ts), posts them to
// /api/ai/extract and streams the NDJSON rows into React state. «Стоп» aborts the request and
// keeps the rows already received. A 413 answer is retried automatically with stronger compression.
import { useCallback, useEffect, useRef, useState } from "react";
import { readNdjson } from "@/lib/ai/ndjson";
import type { AiErrorBody, ExtractLine, FolderInput, ModelTierInput, VocabItem } from "@/lib/ai/schemas";
import { ImagePrepError, PREP_LEVELS, prepareImages, type ImagePrepErrorCode, type PreparedBatch } from "@/lib/image-prep";

export const EXTRACT_URL = "/api/ai/extract";

export type ExtractPhase =
  | "idle"
  | "preparing" // decoding / tiling / encoding on the device
  | "uploading" // request sent, waiting for the first line
  | "streaming" // rows arriving
  | "done" // finished normally (possibly with 0 rows)
  | "stopped" // aborted by «Стоп» after some rows arrived
  | "error";

export type ExtractErrorCode =
  | ImagePrepErrorCode
  | "offline"
  | "network"
  | "unauthenticated"
  | "forbidden"
  | "rate_limited"
  | "not_configured"
  | "unsupported_image"
  | "bad_request"
  | "upstream"
  | "unknown";

export interface ExtractError {
  code: ExtractErrorCode;
  /** Russian, ready to show. */
  message: string;
  /** Seconds, for rate_limited. */
  retryAfter?: number;
  /**
   * Rate limited: the one automatic retry happens at this time (ms, Date.now); the screen counts
   * down to it. Unset once that retry has been used or cancelled.
   */
  retryAt?: number;
  /** Worth offering «Повторить» with the same screenshots. */
  retryable: boolean;
}

export interface ExtractState {
  phase: ExtractPhase;
  items: VocabItem[];
  /** Picked screenshots and the tiles they were cut into (0 until prepared). */
  images: number;
  tiles: number;
  /** Compression level used for the last upload (0 = normal). */
  level: number;
  error: ExtractError | null;
  /** Rows were received but the stream did not finish (error or cut connection). */
  incomplete: boolean;
}

export const INITIAL_EXTRACT_STATE: ExtractState = {
  phase: "idle",
  items: [],
  images: 0,
  tiles: 0,
  level: 0,
  error: null,
  incomplete: false,
};

export class ExtractHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: AiErrorBody | null,
    readonly retryAfter: number | undefined,
  ) {
    super(`extract failed: ${status} ${body?.error ?? ""}`.trim());
    this.name = "ExtractHttpError";
  }
}

const plainSeconds = (n: number) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} секунду`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} секунды`;
  return `${n} секунд`;
};

/** Maps a failed HTTP response to a Russian, user-facing error. */
export function errorFromResponse(status: number, body: AiErrorBody | null, retryAfter?: number): ExtractError {
  const code = body?.error;
  if (status === 401 && code === "forbidden_email") {
    return { code: "forbidden", message: "Распознавание недоступно для этого аккаунта.", retryable: false };
  }
  if (status === 401) return { code: "unauthenticated", message: "Войдите, чтобы распознавать скриншоты.", retryable: false };
  if (status === 403) return { code: "forbidden", message: "Распознавание доступно только после входа.", retryable: false };
  if (status === 413) return { code: "too_large", message: "Скриншот слишком большой даже после сжатия.", retryable: false };
  if (status === 415) {
    return { code: "unsupported_image", message: "Формат не поддерживается: подходят PNG, JPEG и WebP.", retryable: false };
  }
  if (status === 429) {
    const wait = retryAfter && retryAfter > 0 ? Math.ceil(retryAfter) : undefined;
    return {
      code: "rate_limited",
      message: wait ? `Слишком часто. Попробуйте через ${plainSeconds(wait)}.` : "Слишком часто. Попробуйте чуть позже.",
      retryAfter: wait,
      retryable: true,
    };
  }
  if (status === 503 && code === "not_configured") {
    return { code: "not_configured", message: "Распознавание сейчас недоступно.", retryable: false };
  }
  if (status === 400) return { code: "bad_request", message: "Не удалось отправить скриншот.", retryable: false };
  if (status >= 500) return { code: "upstream", message: "Сервер не ответил. Попробуйте ещё раз.", retryable: true };
  return { code: "unknown", message: "Что-то пошло не так. Попробуйте ещё раз.", retryable: true };
}

export function errorFromPrep(error: ImagePrepError): ExtractError {
  // Picking the same files again would fail the same way.
  return { code: error.code, message: error.message, retryable: false };
}

export const UPSTREAM_ERROR: ExtractError = {
  code: "upstream",
  message: "Не удалось распознать скриншот. Попробуйте ещё раз.",
  retryable: true,
};

const OFFLINE_ERROR: ExtractError = {
  code: "offline",
  message: "Нет сети. Распознавание работает только онлайн.",
  retryable: true,
};

const NETWORK_ERROR: ExtractError = {
  code: "network",
  message: "Не удалось связаться с сервером. Проверьте соединение.",
  retryable: true,
};

/** The multipart body: `images` repeated (top to bottom) and `folders` as a JSON string. */
/** Settings «ИИ» for screenshots. */
export interface ExtractPreferences {
  model?: ModelTierInput;
  /** false: no usage notes. */
  notes?: boolean;
}

export function extractFormData(
  batch: Pick<PreparedBatch, "tiles">,
  folders: readonly FolderInput[],
  prefs: ExtractPreferences = {},
): FormData {
  const form = new FormData();
  for (const tile of batch.tiles) form.append("images", tile.blob, tile.name);
  if (folders.length > 0) form.append("folders", JSON.stringify(folders));
  if (prefs.model && prefs.model !== "fast") form.append("model", prefs.model);
  if (prefs.notes === false) form.append("notes", "false");
  return form;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;

/** Folders in the shape the route accepts (invalid slugs dropped, long text trimmed, ≤60). */
export function foldersForExtract(
  folders: readonly { slug: string; name: string; description?: string | null }[],
): FolderInput[] {
  const seen = new Set<string>();
  const out: FolderInput[] = [];
  for (const f of folders) {
    const name = f.name.trim().slice(0, 60);
    if (!SLUG_RE.test(f.slug) || seen.has(f.slug) || !name) continue;
    seen.add(f.slug);
    out.push({ slug: f.slug, name, description: f.description?.trim().slice(0, 300) || null });
    if (out.length === 60) break;
  }
  return out;
}

async function readErrorBody(res: Response): Promise<AiErrorBody | null> {
  try {
    const body = (await res.json()) as unknown;
    return body && typeof body === "object" && typeof (body as AiErrorBody).error === "string" ? (body as AiErrorBody) : null;
  } catch {
    return null;
  }
}

/**
 * Posts prepared tiles and yields the response lines. Throws ExtractHttpError for a non-2xx
 * answer and lets fetch/abort errors through.
 */
export async function* streamExtract(
  batch: Pick<PreparedBatch, "tiles">,
  folders: readonly FolderInput[],
  { signal, fetchImpl = fetch, prefs }: { signal?: AbortSignal; fetchImpl?: typeof fetch; prefs?: ExtractPreferences } = {},
): AsyncGenerator<ExtractLine> {
  const res = await fetchImpl(EXTRACT_URL, { method: "POST", body: extractFormData(batch, folders, prefs), signal });
  if (!res.ok) {
    const retry = Number(res.headers.get("Retry-After"));
    throw new ExtractHttpError(res.status, await readErrorBody(res), Number.isFinite(retry) && retry > 0 ? retry : undefined);
  }
  yield* readNdjson<ExtractLine>(res, signal);
}

/** Wait before the automatic retry when a 429 carries no Retry-After (seconds). */
export const RATE_LIMIT_DEFAULT_WAIT = 10;

function clearTimer(timer: { current: number | undefined }): void {
  window.clearTimeout(timer.current);
  timer.current = undefined;
}

const isAbort = (e: unknown) =>
  (e instanceof DOMException && e.name === "AbortError") || (e instanceof ImagePrepError && e.code === "aborted");

export interface UseExtract {
  state: ExtractState;
  /** Prepares and uploads the screenshots, streaming rows into `state.items`. Replaces any run in progress. */
  start: (files: readonly File[], folders: readonly FolderInput[], prefs?: ExtractPreferences) => Promise<void>;
  /** «Стоп»: aborts; keeps received rows (phase "stopped"), or goes back to idle when there are none. */
  stop: () => void;
  /** Rate limited: drops the scheduled automatic retry; the error stays with «Повторить». */
  cancelRetry: () => void;
  /** Back to idle, dropping rows and errors. */
  reset: () => void;
}

export function useExtract({ fetchImpl }: { fetchImpl?: typeof fetch } = {}): UseExtract {
  const [state, setState] = useState<ExtractState>(INITIAL_EXTRACT_STATE);
  const controller = useRef<AbortController | null>(null);
  const run = useRef(0);
  const itemsRef = useRef<VocabItem[]>([]);
  const retryTimer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      controller.current?.abort();
      window.clearTimeout(retryTimer.current);
    },
    [],
  );

  const runExtract = useCallback(
    async function attempt(
      files: readonly File[],
      folders: readonly FolderInput[],
      prefs: ExtractPreferences | undefined,
      /** The automatic retry after a 429: reuses the prepared tiles (the bar never goes back). */
      retry?: { batch: PreparedBatch; level: number },
    ): Promise<void> {
      clearTimer(retryTimer);
      controller.current?.abort();
      const ctrl = new AbortController();
      controller.current = ctrl;
      const id = ++run.current;
      const live = () => run.current === id && !ctrl.signal.aborted;
      const update = (patch: Partial<ExtractState> | ((s: ExtractState) => Partial<ExtractState>)) => {
        if (run.current !== id) return;
        setState((s) => ({ ...s, ...(typeof patch === "function" ? patch(s) : patch) }));
      };

      itemsRef.current = [];
      setState(
        retry
          ? { ...INITIAL_EXTRACT_STATE, phase: "uploading", images: files.length, tiles: retry.batch.tiles.length, level: retry.level }
          : { ...INITIAL_EXTRACT_STATE, phase: "preparing", images: files.length },
      );

      for (let level = retry?.level ?? 0; level < PREP_LEVELS.length; level++) {
        let batch: PreparedBatch;
        try {
          batch = retry && level === retry.level ? retry.batch : await prepareImages(files, { level, signal: ctrl.signal });
        } catch (e) {
          if (!live() || isAbort(e)) return;
          update({ phase: "error", error: e instanceof ImagePrepError ? errorFromPrep(e) : errorFromPrep(new ImagePrepError("decode")) });
          return;
        }
        if (!live()) return;
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          update({ phase: "error", error: OFFLINE_ERROR, tiles: batch.tiles.length, level });
          return;
        }
        update({ phase: "uploading", tiles: batch.tiles.length, level });

        let finished = false;
        let failed = false;
        try {
          for await (const line of streamExtract(batch, folders, { signal: ctrl.signal, fetchImpl, prefs })) {
            if (!live()) return;
            if (line.type === "meta") {
              update({ phase: "streaming" });
            } else if (line.type === "item") {
              itemsRef.current = [...itemsRef.current, line.item];
              update({ phase: "streaming", items: itemsRef.current });
            } else if (line.type === "done") {
              finished = true;
            } else if (line.type === "error") {
              failed = true;
            }
          }
        } catch (e) {
          if (!live() || isAbort(e)) return;
          if (e instanceof ExtractHttpError) {
            if (e.status === 413 && level < PREP_LEVELS.length - 1) continue;
            const error = errorFromResponse(e.status, e.body, e.retryAfter);
            if (error.code === "rate_limited" && !retry) {
              // No silent wait (MOTION-SPEC §3.8): the screen counts down, then one automatic retry.
              const wait = (error.retryAfter ?? RATE_LIMIT_DEFAULT_WAIT) * 1000;
              update({ phase: "error", error: { ...error, retryAt: Date.now() + wait } });
              retryTimer.current = window.setTimeout(() => {
                retryTimer.current = undefined;
                if (run.current === id) void attempt(files, folders, prefs, { batch, level });
              }, wait);
              return;
            }
            update({ phase: "error", error });
            return;
          }
          // Network failure: before any row it is an error; after some rows keep them.
          if (itemsRef.current.length === 0) {
            update({ phase: "error", error: navigator.onLine === false ? OFFLINE_ERROR : NETWORK_ERROR });
          } else {
            update({ phase: "done", incomplete: true });
          }
          return;
        }
        if (!live()) return;
        const count = itemsRef.current.length;
        if (finished && !failed) update({ phase: "done", incomplete: false });
        else if (count > 0) update({ phase: "done", incomplete: true });
        else update({ phase: "error", error: UPSTREAM_ERROR });
        if (controller.current === ctrl) controller.current = null;
        return;
      }
    },
    [fetchImpl],
  );

  const start = useCallback(
    (files: readonly File[], folders: readonly FolderInput[], prefs?: ExtractPreferences) => runExtract(files, folders, prefs),
    [runExtract],
  );

  const cancelRetry = useCallback(() => {
    if (retryTimer.current === undefined) return;
    clearTimer(retryTimer);
    setState((s) => (s.error?.retryAt ? { ...s, error: { ...s.error, retryAt: undefined } } : s));
  }, []);

  const stop = useCallback(() => {
    clearTimer(retryTimer);
    run.current++;
    controller.current?.abort();
    controller.current = null;
    const items = itemsRef.current;
    setState((s) =>
      items.length > 0
        ? { ...s, phase: "stopped", items, incomplete: true }
        : { ...INITIAL_EXTRACT_STATE },
    );
  }, []);

  const reset = useCallback(() => {
    clearTimer(retryTimer);
    run.current++;
    controller.current?.abort();
    controller.current = null;
    itemsRef.current = [];
    setState(INITIAL_EXTRACT_STATE);
  }, []);

  return { state, start, stop, cancelRetry, reset };
}
