// Supabase settings shared by the browser client, the server client and proxy.ts.
// NEXT_PUBLIC_* values must be read with literal property access so Next inlines them.

export interface SupabaseConfig {
  url: string;
  key: string;
}

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  return url && key ? { url, key } : null;
}

/** False means local-only mode: no login gate and no sync. */
export const isSupabaseConfigured = (): boolean => getSupabaseConfig() !== null;

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/**
 * Checks an email against an allow-list (one address, or several separated by commas).
 * An empty allow-list allows nobody, so a missing env var fails closed.
 */
export function isAllowedEmail(email: string | null | undefined, allowList: string | null | undefined): boolean {
  if (!email || !allowList) return false;
  const wanted = normalizeEmail(email);
  return allowList.split(",").some((entry) => normalizeEmail(entry) === wanted);
}

/** Client-side hint only; the real check is ALLOWED_EMAIL on the server. Empty = no hint. */
export const publicAllowedEmail = (): string => process.env.NEXT_PUBLIC_ALLOWED_EMAIL?.trim() ?? "";

export type AiAccess = { ok: true } | { ok: false; status: 401 | 403; error: string };

/**
 * Who may call /api/ai/*. With Supabase configured: a verified user whose email matches
 * ALLOWED_EMAIL. In local-only mode: anyone, but only outside production.
 */
export function decideAiAccess(input: {
  configured: boolean;
  email: string | null;
  allowedEmail: string | undefined;
  nodeEnv: string | undefined;
}): AiAccess {
  if (!input.configured) {
    return input.nodeEnv === "production"
      ? { ok: false, status: 403, error: "local_only_mode" }
      : { ok: true };
  }
  if (!input.email) return { ok: false, status: 401, error: "unauthenticated" };
  if (!isAllowedEmail(input.email, input.allowedEmail)) return { ok: false, status: 401, error: "forbidden_email" };
  return { ok: true };
}
