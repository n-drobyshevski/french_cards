// Sends stray hosts to the production domain and stray reset codes to /auth/confirm, refreshes
// Supabase session cookies on navigation and guards /api/ai/*. Signed-out page visits are not
// redirected here: the app shell is offline-first and AuthGate decides on the client, where a
// cached session can keep working without a network. /api/mcp/* (the Claude connector) is not
// matched: it checks its own secret, and a canonical-host 308 would break its POSTs.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { canonicalRedirect, strayAuthCodeRedirect } from "@/lib/proxy-redirects";
import { decideAiAccess, getSupabaseConfig } from "@/lib/supabase/config";

export async function proxy(request: NextRequest) {
  const canonical = canonicalRedirect(request);
  if (canonical) return NextResponse.redirect(canonical, 308);
  const strayCode = getSupabaseConfig() ? strayAuthCodeRedirect(request) : null;
  if (strayCode) return NextResponse.redirect(strayCode);

  const isAi = request.nextUrl.pathname.startsWith("/api/ai/");
  const supabaseConfig = getSupabaseConfig();

  if (!supabaseConfig) {
    if (!isAi) return NextResponse.next();
    const access = decideAiAccess({
      configured: false,
      email: null,
      allowedEmail: process.env.ALLOWED_EMAIL,
      nodeEnv: process.env.NODE_ENV,
    });
    return access.ok ? NextResponse.next() : NextResponse.json({ error: access.error }, { status: access.status });
  }

  // Nothing to refresh for visitors without a session cookie.
  const hasSessionCookie = request.cookies.getAll().some((c) => c.name.startsWith("sb-"));
  if (!isAi && !hasSessionCookie) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseConfig.url, supabaseConfig.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  // getClaims() verifies the JWT and refreshes an expiring session through setAll.
  let email: string | null = null;
  let verified = false;
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (!error && data?.claims?.sub) {
      verified = true;
      email = typeof data.claims.email === "string" ? data.claims.email : null;
    }
  } catch {
    verified = false;
  }

  if (!isAi) return response;

  const access = decideAiAccess({
    configured: true,
    email: verified ? email : null,
    allowedEmail: process.env.ALLOWED_EMAIL,
    nodeEnv: process.env.NODE_ENV,
  });
  if (access.ok) return response;

  const denied = NextResponse.json({ error: access.error }, { status: access.status });
  for (const cookie of response.cookies.getAll()) denied.cookies.set(cookie);
  denied.headers.set("Cache-Control", "private, no-store");
  return denied;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|serwist/|sw\\.js|swe-worker|manifest\\.webmanifest|favicon\\.ico|icons/|lexique/|api/cron/|api/mcp/|.*\\.(?:svg|png|jpe?g|gif|webp|avif|ico|txt|xml|json|webmanifest|woff2?|js|css|map)$).*)",
  ],
};
