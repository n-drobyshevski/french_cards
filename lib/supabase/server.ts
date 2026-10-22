// Server Supabase client for Server Components, Server Functions and Route Handlers.
// Create one per request. proxy.ts keeps the session cookies fresh; writes from a Server
// Component are ignored because Next does not allow setting cookies there.
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { decideAiAccess, getSupabaseConfig, type AiAccess } from "./config";

export async function createSupabaseServerClient(): Promise<SupabaseClient | null> {
  const config = getSupabaseConfig();
  if (!config) return null;
  const cookieStore = await cookies();
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component: proxy.ts refreshes the cookies instead.
        }
      },
    },
  });
}

export interface VerifiedUser {
  id: string;
  email: string | null;
}

/** The signed-in user from a verified JWT (getClaims), or null. */
export async function getVerifiedUser(): Promise<VerifiedUser | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims?.sub) return null;
    return { id: data.claims.sub, email: typeof data.claims.email === "string" ? data.claims.email : null };
  } catch {
    return null;
  }
}

/**
 * Same rule proxy.ts applies to /api/ai/*; route handlers call it again so they never rely
 * on proxy coverage alone.
 */
export async function checkAiAccess(): Promise<AiAccess & { user: VerifiedUser | null }> {
  const configured = getSupabaseConfig() !== null;
  const user = configured ? await getVerifiedUser() : null;
  const access = decideAiAccess({
    configured,
    email: user?.email ?? null,
    allowedEmail: process.env.ALLOWED_EMAIL,
    nodeEnv: process.env.NODE_ENV,
  });
  return { ...access, user };
}
