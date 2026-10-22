// Gate for every /api/ai/* handler, and the only one (proxy.ts passes these requests through): a
// Supabase user whose email is in ALLOWED_EMAIL (or local-only mode outside production) and a check
// that an Anthropic key is configured. After validating the body, handlers take a rate-limit token (invalid requests are free).
import { checkAiAccess } from "@/lib/supabase/server";
import { isAiConfigured } from "./model";
import { clientKey, rateLimit, type RateLimitedRoute } from "./rate-limit";

export interface AiCaller {
  /** Supabase user id, or null in local-only mode. */
  userId: string | null;
  /** Rate-limit key (user id or IP). */
  key: string;
}

export const NO_STORE = { "Cache-Control": "private, no-store" } as const;

export function jsonError(status: number, error: string, details?: unknown): Response {
  return Response.json(details === undefined ? { error } : { error, details }, { status, headers: NO_STORE });
}

/** Resolves the caller or returns the 401/403 Response to send. */
export async function requireAiUser(req: Request): Promise<AiCaller | Response> {
  let access: Awaited<ReturnType<typeof checkAiAccess>>;
  try {
    access = await checkAiAccess();
  } catch {
    return jsonError(401, "unauthenticated");
  }
  if (!access.ok) return jsonError(access.status, access.error);
  const userId = access.user?.id ?? null;
  return { userId, key: clientKey(req, userId) };
}

/** Auth + configuration check. Returns the caller, or a Response to return as is. */
export async function guardAiRequest(req: Request): Promise<AiCaller | Response> {
  const caller = await requireAiUser(req);
  if (caller instanceof Response) return caller;
  if (!isAiConfigured()) return jsonError(503, "not_configured");
  return caller;
}

/** Takes a rate-limit token for a validated request; returns the 429 Response when over the limit. */
export function limitAiRequest(route: RateLimitedRoute, caller: AiCaller): Response | null {
  return rateLimit(route, caller.key);
}
