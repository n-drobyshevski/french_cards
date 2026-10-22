// Lands links from Supabase emails (password reset, email confirmation). Handles both the
// PKCE `?code=` redirect the default templates produce and `?token_hash=&type=` from custom
// templates, then sends the browser on to a same-origin `next` path.
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/components/auth/messages";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const OTP_TYPES: readonly EmailOtpType[] = ["recovery", "signup", "email", "invite", "magiclink", "email_change"];

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = safeNextPath(params.get("next"));
  const failed = NextResponse.redirect(new URL("/login?link=expired", request.url));

  const supabase = await createSupabaseServerClient();
  if (!supabase) return failed;

  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;

  try {
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) return failed;
    } else if (tokenHash && type && OTP_TYPES.includes(type)) {
      const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
      if (error) return failed;
    } else {
      return failed;
    }
  } catch {
    return failed;
  }

  return NextResponse.redirect(new URL(next, request.url));
}
