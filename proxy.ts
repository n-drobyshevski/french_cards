// Sends stray hosts to the production domain and stray reset codes to /auth/confirm, and refreshes
// Supabase session cookies on document navigations. /api/ai/* is gated by each route handler
// (guardAiRequest), so it passes straight through. Signed-out page visits are not redirected here:
// the app shell is offline-first and AuthGate decides on the client, where a cached session can keep
// working without a network.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { canonicalRedirect, isBackgroundRequest, strayAuthCodeRedirect } from "@/lib/proxy-redirects";
import { getSupabaseConfig } from "@/lib/supabase/config";

export async function proxy(request: NextRequest) {
  const canonical = canonicalRedirect(request);
  if (canonical) return NextResponse.redirect(canonical, 308);
  const supabaseConfig = getSupabaseConfig();
  const strayCode = supabaseConfig ? strayAuthCodeRedirect(request) : null;
  if (strayCode) return NextResponse.redirect(strayCode);

  // The AI routes verify the caller themselves; a second getClaims here only added a round trip.
  if (request.nextUrl.pathname.startsWith("/api/ai/")) return NextResponse.next();
  if (!supabaseConfig || isBackgroundRequest(request)) return NextResponse.next();

  // Nothing to refresh for visitors without a session cookie.
  const hasSessionCookie = request.cookies.getAll().some((c) => c.name.startsWith("sb-"));
  if (!hasSessionCookie) return NextResponse.next();

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
  try {
    await supabase.auth.getClaims();
  } catch {
    // An unverifiable session is left as is; AuthGate handles it on the client.
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|serwist/|sw\\.js|swe-worker|manifest\\.webmanifest|favicon\\.ico|icons/|lexique/|api/cron/|.*\\.(?:svg|png|jpe?g|gif|webp|avif|ico|txt|xml|json|webmanifest|woff2?|js|css|map)$).*)",
  ],
};
