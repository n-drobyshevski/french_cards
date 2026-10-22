import { describe, expect, it } from "vitest";
import { DEFAULT_TIMEZONE, getMcpConfig, MIN_SECRET_LENGTH, resolveMcpAccess, secretMatches } from "./config";

const SECRET = "s3cr3t-s3cr3t-s3cr3t-s3cr3t-s3cr3t-0123";
const USER = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
const env = { MCP_SECRET: SECRET, MCP_USER_ID: USER, SUPABASE_SECRET_KEY: "sb_secret_x" };
const supabase = { url: "https://example.supabase.co", key: "sb_publishable_x" };
const jwt = (payload: object) => ["e30", Buffer.from(JSON.stringify(payload)).toString("base64url"), "sig"].join(".");

describe("getMcpConfig", () => {
  it("reads a complete config", () => {
    expect(getMcpConfig({ ...env, MCP_TIMEZONE: "America/Montreal" }, supabase)).toEqual({
      secret: SECRET,
      userId: USER,
      supabaseUrl: supabase.url,
      secretKey: "sb_secret_x",
      timeZone: "America/Montreal",
    });
  });

  it("fails closed: missing or short secret, bad user id, no secret key, local-only mode", () => {
    expect(getMcpConfig({ ...env, MCP_SECRET: undefined }, supabase)).toBeNull();
    expect(getMcpConfig({ ...env, MCP_SECRET: "x".repeat(MIN_SECRET_LENGTH - 1) }, supabase)).toBeNull();
    expect(getMcpConfig({ ...env, MCP_SECRET: `  ${"x".repeat(MIN_SECRET_LENGTH - 2)}  ` }, supabase)).toBeNull();
    expect(getMcpConfig({ ...env, MCP_USER_ID: "me@example.com" }, supabase)).toBeNull();
    expect(getMcpConfig({ ...env, SUPABASE_SECRET_KEY: " " }, supabase)).toBeNull();
    // A publishable (or anon) key would run under RLS and see an empty library.
    expect(getMcpConfig({ ...env, SUPABASE_SECRET_KEY: supabase.key }, supabase)).toBeNull();
    expect(getMcpConfig({ ...env, SUPABASE_SECRET_KEY: jwt({ role: "anon" }) }, supabase)).toBeNull();
    expect(getMcpConfig({ ...env, SUPABASE_SECRET_KEY: "not-a-key" }, supabase)).toBeNull();
    expect(getMcpConfig(env, null)).toBeNull();
  });

  it("accepts a legacy service_role key", () => {
    expect(getMcpConfig({ ...env, SUPABASE_SECRET_KEY: jwt({ role: "service_role" }) }, supabase)).not.toBeNull();
  });

  it("falls back to the default zone for an unknown one", () => {
    expect(getMcpConfig({ ...env, MCP_TIMEZONE: "Mars/Olympus" }, supabase)?.timeZone).toBe(DEFAULT_TIMEZONE);
  });
});

describe("secretMatches / resolveMcpAccess", () => {
  it("accepts only the exact secret", () => {
    expect(secretMatches(SECRET, SECRET)).toBe(true);
    expect(secretMatches(`${SECRET}x`, SECRET)).toBe(false);
    expect(secretMatches(SECRET.slice(0, -1), SECRET)).toBe(false);
    expect(secretMatches("", SECRET)).toBe(false);
    expect(secretMatches("short", "short")).toBe(false);
  });

  it("gives the config for the right key and null (404) otherwise", () => {
    expect(resolveMcpAccess(SECRET, env, supabase)?.userId).toBe(USER);
    expect(resolveMcpAccess("wrong-key", env, supabase)).toBeNull();
    expect(resolveMcpAccess(SECRET, env, null)).toBeNull();
    expect(resolveMcpAccess(SECRET, { ...env, MCP_SECRET: "" }, supabase)).toBeNull();
  });
});
