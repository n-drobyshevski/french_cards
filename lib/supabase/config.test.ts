import { describe, expect, it } from "vitest";
import { decideAiAccess, isAllowedEmail } from "./config";

describe("isAllowedEmail", () => {
  it("matches case- and space-insensitively, and supports a comma list", () => {
    expect(isAllowedEmail(" N.Drobyshevski@PM.me ", "n.drobyshevski@pm.me")).toBe(true);
    expect(isAllowedEmail("b@x.io", "a@x.io, b@x.io")).toBe(true);
    expect(isAllowedEmail("c@x.io", "a@x.io,b@x.io")).toBe(false);
  });

  it("fails closed when either side is missing", () => {
    expect(isAllowedEmail("a@x.io", "")).toBe(false);
    expect(isAllowedEmail("a@x.io", undefined)).toBe(false);
    expect(isAllowedEmail(null, "a@x.io")).toBe(false);
  });
});

describe("decideAiAccess", () => {
  const base = { allowedEmail: "a@x.io", nodeEnv: "production" };

  it("local-only mode allows AI only outside production", () => {
    expect(decideAiAccess({ ...base, configured: false, email: null, nodeEnv: "development" })).toEqual({ ok: true });
    expect(decideAiAccess({ ...base, configured: false, email: null })).toMatchObject({ ok: false, status: 403 });
  });

  it("with Supabase requires a user whose email is ALLOWED_EMAIL", () => {
    expect(decideAiAccess({ ...base, configured: true, email: null })).toMatchObject({ ok: false, status: 401 });
    expect(decideAiAccess({ ...base, configured: true, email: "z@x.io" })).toMatchObject({ ok: false, status: 401 });
    expect(decideAiAccess({ ...base, configured: true, email: "A@x.io" })).toEqual({ ok: true });
    expect(decideAiAccess({ ...base, configured: true, email: "a@x.io", allowedEmail: undefined })).toMatchObject({ ok: false });
  });
});
