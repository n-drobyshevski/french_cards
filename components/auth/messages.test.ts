import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { authErrorMessage, EXISTING_ACCOUNT, isRecoverySession, NOT_ALLOWED, newPasswordProblem, safeNextPath } from "./messages";

const apiError = (code: string, status = 400) => new AuthApiError("x", status, code);

describe("authErrorMessage", () => {
  it("maps Supabase error codes to Russian messages", () => {
    expect(authErrorMessage(apiError("invalid_credentials"), "signin")).toBe("Неверная почта или пароль.");
    expect(authErrorMessage(apiError("signup_disabled", 422), "signup")).toBe(NOT_ALLOWED);
    expect(authErrorMessage(apiError("user_already_exists", 422), "signup")).toBe(EXISTING_ACCOUNT);
    expect(authErrorMessage(apiError("weak_password", 422), "signup")).toMatch(/слишком простой/);
    expect(authErrorMessage(apiError("over_request_rate_limit", 429), "signin")).toMatch(/Слишком много попыток/);
    expect(authErrorMessage(apiError("email_not_confirmed"), "signin")).toMatch(/не подтверждена/);
  });

  it("reports offline and network failures", () => {
    expect(authErrorMessage(new Error("boom"), "signin", false)).toMatch(/Нет сети/);
    expect(authErrorMessage(new AuthRetryableFetchError("fetch failed", 0), "reset")).toMatch(/Нет сети/);
  });

  it("falls back to a phase-specific message", () => {
    expect(authErrorMessage(new Error("?"), "signin")).toMatch(/войти/);
    expect(authErrorMessage(new Error("?"), "update")).toMatch(/сохранить пароль/);
  });
});

describe("newPasswordProblem", () => {
  it("requires 8+ characters and a matching repeat", () => {
    expect(newPasswordProblem("short", "short")).toMatch(/не меньше 8/);
    expect(newPasswordProblem("long enough", "long enougH")).toBe("Пароли не совпадают.");
    expect(newPasswordProblem("long enough", "long enough")).toBeNull();
  });
});

describe("safeNextPath", () => {
  it("keeps same-origin paths and rejects everything else", () => {
    expect(safeNextPath("/auth/reset")).toBe("/auth/reset");
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath("javascript:alert(1)", "/login")).toBe("/login");
  });
});

describe("isRecoverySession", () => {
  const now = Date.parse("2026-10-22T07:20:00Z");
  it("is true only for a reset email sent within the last hour", () => {
    expect(isRecoverySession({ recovery_sent_at: "2026-10-22T07:18:33Z" }, now)).toBe(true);
    expect(isRecoverySession({ recovery_sent_at: "2026-10-22T05:00:00Z" }, now)).toBe(false);
    expect(isRecoverySession({}, now)).toBe(false);
    expect(isRecoverySession(null, now)).toBe(false);
  });
});
