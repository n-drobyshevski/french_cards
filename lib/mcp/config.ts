// Settings for the Claude connector (app/api/mcp/[key]/route.ts). The connector is authless: its
// URL carries MCP_SECRET, and every read and write runs with the Supabase secret key for the one
// MCP_USER_ID. Anything missing or malformed turns the endpoint off (404), so it fails closed.
import { createHash, timingSafeEqual } from "node:crypto";
import { getSupabaseConfig, type SupabaseConfig } from "@/lib/supabase/config";

/** Shorter secrets are refused: the URL is the only credential. */
export const MIN_SECRET_LENGTH = 32;
/** Study-day boundaries for study_summary when MCP_TIMEZONE is unset. */
export const DEFAULT_TIMEZONE = "Europe/Paris";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface McpConfig {
  secret: string;
  /** auth.users id whose rows the connector reads and writes. */
  userId: string;
  supabaseUrl: string;
  /** Supabase secret key (`sb_secret_…`): bypasses RLS, so every query filters on userId. */
  secretKey: string;
  /** IANA zone of the user's device, for «сегодня». */
  timeZone: string;
}

/** MCP_SECRET, MCP_USER_ID, SUPABASE_SECRET_KEY and the optional MCP_TIMEZONE (process.env by default). */
export type McpEnv = Record<string, string | undefined>;

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * A Supabase secret key: `sb_secret_…`, or a legacy service_role JWT. A publishable or anon key
 * would run under RLS, where the connector (no user session) sees an empty library.
 */
export function isSecretKey(key: string): boolean {
  if (key.startsWith("sb_secret_")) return true;
  const parts = key.split(".");
  if (parts.length !== 3) return false;
  try {
    return (JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { role?: unknown })?.role === "service_role";
  } catch {
    return false;
  }
}

/** The connector's settings, or null when it is off (local-only mode, or any value missing or invalid). */
export function getMcpConfig(
  env: McpEnv = process.env,
  supabase: SupabaseConfig | null = getSupabaseConfig(),
): McpConfig | null {
  if (!supabase) return null;
  const secret = env.MCP_SECRET?.trim() ?? "";
  const userId = env.MCP_USER_ID?.trim() ?? "";
  const secretKey = env.SUPABASE_SECRET_KEY?.trim() ?? "";
  if (secret.length < MIN_SECRET_LENGTH || !UUID_RE.test(userId) || !isSecretKey(secretKey)) return null;
  const zone = env.MCP_TIMEZONE?.trim();
  const timeZone = zone && isValidTimeZone(zone) ? zone : DEFAULT_TIMEZONE;
  return { secret, userId: userId.toLowerCase(), supabaseUrl: supabase.url, secretKey, timeZone };
}

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();

/** Constant-time comparison of the URL key with the secret (hashing first evens out the lengths). */
export function secretMatches(key: string, secret: string): boolean {
  if (secret.length < MIN_SECRET_LENGTH || !key) return false;
  return timingSafeEqual(digest(key), digest(secret));
}

/** The config when `key` (the URL segment) opens the connector; null means answer 404. */
export function resolveMcpAccess(key: string, env?: McpEnv, supabase?: SupabaseConfig | null): McpConfig | null {
  const config = getMcpConfig(env, supabase);
  return config && secretMatches(key, config.secret) ? config : null;
}
