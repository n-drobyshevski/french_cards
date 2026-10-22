// Redirect decisions made in proxy.ts before anything else, kept here so they can be unit-tested.

interface RequestLike {
  nextUrl: URL;
  headers: Headers;
}

/**
 * Production has several hostnames (frenchcards.vercel.app plus team aliases). Session cookies
 * and the PKCE verifier for reset links are per host, so everyone is sent to the one production
 * domain. Vercel exposes it as VERCEL_PROJECT_PRODUCTION_URL; previews and local runs are left alone.
 */
export function canonicalRedirect(request: RequestLike, env: Record<string, string | undefined> = process.env): URL | null {
  const canonical = env.VERCEL_PROJECT_PRODUCTION_URL;
  const host = request.headers.get("host");
  if (env.VERCEL_ENV !== "production" || !canonical || !host || host === canonical) return null;
  return new URL(request.nextUrl.pathname + request.nextUrl.search, `https://${canonical}`);
}

/**
 * When Supabase can't use our redirect_to it falls back to the Site URL, so a reset link can land
 * on any page as `?code=…`. Hand it to /auth/confirm, which exchanges it.
 */
export function strayAuthCodeRedirect(request: RequestLike): URL | null {
  const { pathname, searchParams } = request.nextUrl;
  if (!searchParams.get("code") || pathname.startsWith("/auth/") || pathname.startsWith("/api/")) return null;
  const url = new URL("/auth/confirm", request.nextUrl);
  url.searchParams.set("code", searchParams.get("code")!);
  return url;
}
