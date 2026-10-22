// Russian messages for Supabase auth errors and the password rules shared by the login and
// reset screens. Kept free of React so it can be unit-tested.
import { isAuthApiError, isAuthError, isAuthRetryableFetchError } from "@supabase/supabase-js";

export type AuthPhase = "signin" | "signup" | "reset" | "update";

export const NOT_ALLOWED = "С этого адреса войти нельзя.";
export const EXISTING_ACCOUNT = "Аккаунт с этой почтой уже есть. Войдите или нажмите «Забыли пароль?».";
export const MIN_PASSWORD_LENGTH = 8;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function authErrorMessage(error: unknown, phase: AuthPhase, online = true): string {
  if (!online || isAuthRetryableFetchError(error)) return "Нет сети. Проверьте подключение и попробуйте ещё раз.";
  const code = isAuthError(error) ? error.code : undefined;
  const status = isAuthApiError(error) ? error.status : undefined;
  if (code === "over_email_send_rate_limit") return "Письмо уже отправлено. Новое можно запросить чуть позже.";
  if (code === "over_request_rate_limit" || status === 429) return "Слишком много попыток. Подождите минуту и попробуйте снова.";
  if (code === "signup_disabled" || code === "email_address_not_authorized" || code === "email_provider_disabled") return NOT_ALLOWED;
  if (code === "invalid_credentials") return "Неверная почта или пароль.";
  if (code === "email_not_confirmed") return "Почта не подтверждена. Откройте ссылку из письма и войдите снова.";
  if (code === "user_already_exists" || code === "email_exists") return EXISTING_ACCOUNT;
  if (code === "weak_password") return `Пароль слишком простой. Нужно не меньше ${MIN_PASSWORD_LENGTH} символов, лучше с цифрами.`;
  if (code === "same_password") return "Новый пароль совпадает со старым.";
  if (code === "email_address_invalid" || code === "validation_failed") return "Проверьте адрес почты.";
  if (code === "session_not_found" || code === "session_expired" || code === "refresh_token_not_found") {
    return "Ссылка устарела. Запросите сброс пароля ещё раз.";
  }
  switch (phase) {
    case "signin":
      return "Не получилось войти. Попробуйте ещё раз.";
    case "signup":
      return "Не получилось создать аккаунт. Попробуйте ещё раз.";
    case "reset":
      return "Не получилось отправить письмо. Попробуйте ещё раз.";
    case "update":
      return "Не получилось сохранить пароль. Попробуйте ещё раз.";
  }
}

/** Returns an error message for a new password (and its repeat), or null when it is fine. */
export function newPasswordProblem(password: string, repeat: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Пароль — не меньше ${MIN_PASSWORD_LENGTH} символов.`;
  if (password !== repeat) return "Пароли не совпадают.";
  return null;
}

/** Only same-origin absolute paths may be used as a post-confirmation redirect. */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

const RECOVERY_WINDOW_MS = 60 * 60_000;

/** True when a session came from a password-reset email sent within the last hour. */
export function isRecoverySession(user: { recovery_sent_at?: string } | null | undefined, now = Date.now()): boolean {
  const sentAt = user?.recovery_sent_at ? Date.parse(user.recovery_sent_at) : NaN;
  return Number.isFinite(sentAt) && now - sentAt >= 0 && now - sentAt < RECOVERY_WINDOW_MS;
}
