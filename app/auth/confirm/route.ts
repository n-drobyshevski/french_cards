// Lands links from Supabase emails (password reset, email confirmation). Handles both the
// PKCE `?code=` redirect the default templates produce and `?token_hash=&type=` from custom
// templates, then sends the browser on to a same-origin `next` path. Without `next` (Supabase
// fell back to the Site URL and proxy.ts forwarded the code here), a recovery session goes to
// /auth/reset and anything else to the app.
import type { EmailOtpType, User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { isRecoverySession, safeNextPath } from "@/components/auth/messages";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const OTP_TYPES: readonly EmailOtpType[] = ["recovery", "signup", "email", "invite", "magiclink", "email_change"];

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const requestedNext = params.get("next");
  const failed = NextResponse.redirect(new URL("/login?link=expired", request.url));

  const supabase = await createSupabaseServerClient();
  if (!supabase) return failed;

  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;

  let user: User | null = null;
  try {
    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) return failed;
      user = data.user;
    } else if (tokenHash && type && OTP_TYPES.includes(type)) {
      const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
      if (error) return failed;
      user = data.user;
    } else {
      return failed;
    }
  } catch {
    return failed;
  }

  const fallback = type === "recovery" || isRecoverySession(user) ? "/auth/reset" : "/";
  return NextResponse.redirect(new URL(safeNextPath(requestedNext, fallback), request.url));
}
