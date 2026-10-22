// Daily keep-alive (vercel.json cron): one trivial query so the free Supabase project is never
// paused for inactivity. Vercel sends `Authorization: Bearer $CRON_SECRET`.
import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/config";

function authorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const given = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const noStore = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  if (!authorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401, headers: noStore });
  }

  const config = getSupabaseConfig();
  if (!config) return Response.json({ ok: true, skipped: "supabase_not_configured" }, { headers: noStore });

  const supabase = createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const started = performance.now();
  const { data, error } = await supabase.rpc("ping");
  const ms = Math.round(performance.now() - started);

  if (error || data !== 1) {
    return Response.json({ ok: false, error: error?.message ?? "unexpected_response", ms }, { status: 502, headers: noStore });
  }
  return Response.json({ ok: true, ms }, { headers: noStore });
}
