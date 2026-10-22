"use client";

// Email + password sign-in in the frame of mockups/Login.dc.html. A password (not an emailed
// link or code) works inside the iOS home-screen app and needs no custom SMTP; email is only
// used for password resets.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Collapse } from "@/components/ui/Collapse";
import { cx } from "@/components/ui/cx";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured, normalizeEmail, prefillEmail, publicAllowedEmail } from "@/lib/supabase/config";
import {
  authErrorField,
  authErrorMessage,
  EMAIL_RE,
  EXISTING_ACCOUNT,
  MIN_PASSWORD_LENGTH,
  NOT_ALLOWED,
  newPasswordProblem,
  type AuthField,
} from "./messages";
import { PasswordField } from "./PasswordField";
import { checkSession, passesEmailHint, rememberSignedIn } from "./session";
import {
  AUTH_CARD,
  AUTH_FOOTNOTE,
  AUTH_LABEL,
  AUTH_LINKS,
  AUTH_MAIN,
  AUTH_PANEL,
  AUTH_PANEL_BODY,
  AUTH_PANEL_HEAD,
  AUTH_PANEL_TEXT,
  AUTH_PRIMARY,
  AUTH_PRIMARY_BUTTON,
  AuthMark,
} from "./AuthFrame";

export { CardGlyph } from "./AuthFrame";

type Mode = "signin" | "signup" | "reset";

const TITLES: Record<Mode, string> = {
  signin: "ВХОД",
  signup: "НОВЫЙ АККАУНТ",
  reset: "СБРОС ПАРОЛЯ",
};

const NOTICES: Record<string, string> = {
  expired: "Ссылка не сработала или устарела. Запросите сброс пароля ещё раз.",
};

const online = () => typeof navigator === "undefined" || navigator.onLine !== false;

interface FieldErrorState {
  text: string;
  field: AuthField;
}

const FIELD_IDS: Record<AuthField, string> = { email: "login-email", password: "login-password", repeat: "login-repeat" };
const errorId = (field: AuthField) => `login-error-${field}`;

/**
 * The error under its field (MOTION-SPEC U2): opens with Collapse (height --dur-move, fade
 * --dur-enter) and keeps its words while it closes. No shake, no red flood.
 */
function FieldError({ field, error, last }: { field: AuthField; error: FieldErrorState | null; last: FieldErrorState | null }) {
  return (
    <Collapse open={error?.field === field}>
      <p id={errorId(field)} role="alert" className="m-0 pt-2 text-[13px] leading-[18px] text-again">
        {last?.field === field ? last.text : ""}
      </p>
    </Collapse>
  );
}

export function LoginScreen() {
  const router = useRouter();
  const configured = isSupabaseConfigured();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState(() => prefillEmail(publicAllowedEmail()));
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setFieldError] = useState<FieldErrorState | null>(null);
  // The last error, so a closing one keeps its words.
  const [lastError, setLastError] = useState<FieldErrorState | null>(null);
  if (error && error !== lastError) setLastError(error);
  const [notice, setNotice] = useState<string | null>(null);
  const setError = (text: string | null, field: AuthField = "email") => setFieldError(text === null ? null : { text, field });

  // Why /auth/confirm sent us back, if it did. Read after mount (the page is prerendered), but
  // without waiting for the session check, which can be slow while the service worker installs.
  useEffect(() => {
    const key = new URLSearchParams(window.location.search).get("link");
    if (!key || !NOTICES[key]) return;
    const id = setTimeout(() => setNotice(NOTICES[key]), 0);
    return () => clearTimeout(id);
  }, []);

  // Already signed in: go to the app.
  useEffect(() => {
    if (!configured) return;
    let active = true;
    void checkSession().then((check) => {
      if (active && check.kind === "signed_in" && passesEmailHint(check.email)) router.replace("/");
    });
    return () => {
      active = false;
    };
  }, [configured, router]);

  useEffect(() => {
    document.getElementById(email ? "login-password" : "login-email")?.focus();
    // Focus once per mode switch; typing must not move focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // An error sends focus back to its field (U2); after the mode focus, so it wins.
  useEffect(() => {
    if (error) document.getElementById(FIELD_IDS[error.field])?.focus();
  }, [error]);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
    setPassword("");
    setRepeat("");
  }

  function checkedEmail(): string | null {
    const address = normalizeEmail(email);
    if (!EMAIL_RE.test(address)) {
      setError("Проверьте адрес почты.");
      return null;
    }
    if (!passesEmailHint(address)) {
      setError(NOT_ALLOWED);
      return null;
    }
    return address;
  }

  async function finishSignIn(sessionEmail: string | null | undefined) {
    const client = getSupabaseBrowserClient();
    if (!passesEmailHint(sessionEmail)) {
      await client?.auth.signOut({ scope: "local" });
      setError(NOT_ALLOWED);
      return;
    }
    rememberSignedIn(sessionEmail ?? normalizeEmail(email));
    router.replace("/");
  }

  async function submit() {
    const client = getSupabaseBrowserClient();
    if (!client || busy) return;
    setError(null);
    setNotice(null);
    const address = checkedEmail();
    if (!address) return;

    if (mode === "signin" && !password) {
      setError("Введите пароль.", "password");
      return;
    }
    if (mode === "signup") {
      const problem = newPasswordProblem(password, repeat);
      if (problem) {
        setError(problem, password.length < MIN_PASSWORD_LENGTH ? "password" : "repeat");
        return;
      }
    }

    setBusy(true);
    try {
      if (mode === "signin") {
        const { data, error: signInError } = await client.auth.signInWithPassword({ email: address, password });
        if (signInError || !data.session) throw signInError ?? new Error("no_session");
        await finishSignIn(data.session.user.email);
      } else if (mode === "signup") {
        const { data, error: signUpError } = await client.auth.signUp({ email: address, password });
        if (signUpError) throw signUpError;
        if (data.session) {
          await finishSignIn(data.session.user.email);
        } else if (data.user && (data.user.identities?.length ?? 0) === 0) {
          // Supabase answers a sign-up for an existing email with a user without identities.
          switchMode("signin");
          setError(EXISTING_ACCOUNT, "email");
        } else {
          switchMode("signin");
          setNotice("Аккаунт создан. Подтвердите почту по ссылке из письма, затем войдите.");
        }
      } else {
        const redirectTo = `${window.location.origin}/auth/confirm?next=/auth/reset`;
        const { error: resetError } = await client.auth.resetPasswordForEmail(address, { redirectTo });
        if (resetError) throw resetError;
        switchMode("signin");
        setNotice(`Письмо со ссылкой для сброса отправлено на ${address}. Откройте его на этом устройстве.`);
      }
    } catch (err) {
      const phase = mode === "reset" ? "reset" : mode;
      const text = authErrorMessage(err, phase, online());
      setError(text, authErrorField(text, phase));
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void submit();
  }

  const primaryLabel = mode === "signin" ? "Войти" : mode === "signup" ? "Создать аккаунт" : "Отправить ссылку";
  // U1: the network is certain, so the label swaps at once; the button keeps the wider label's width.
  const pendingLabel = mode === "reset" ? "Отправляем…" : "Входим…";

  const clearError = () => {
    if (error) setError(null);
  };

  return (
    <main className={AUTH_MAIN}>
      <AuthMark />

      {!configured ? (
        <div className={AUTH_CARD}>
          <section className={AUTH_PANEL}>
            <div className={AUTH_PANEL_HEAD}>ВХОД НЕ НУЖЕН</div>
            <p className={`${AUTH_PANEL_TEXT} text-muted`}>
              Синхронизация выключена: все слова и прогресс хранятся только на этом устройстве.
            </p>
          </section>
          <Link href="/" className={`${AUTH_PRIMARY} md:mb-6`}>
            Открыть карточки
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className={AUTH_CARD}>
          <section aria-labelledby="login-title" className={AUTH_PANEL}>
            <div className={AUTH_PANEL_HEAD}>
              <span id="login-title">{TITLES[mode]}</span>
            </div>

            <div className={AUTH_PANEL_BODY}>
              {notice && (
                <p role="status" className="m-0 rounded-[4px] border border-rule bg-surface-2 px-3 py-2 text-[13px] leading-[18px] text-ink">
                  {notice}
                </p>
              )}

              <div>
                <label htmlFor="login-email" className={AUTH_LABEL}>
                  Почта
                </label>
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint={mode === "reset" ? "send" : "next"}
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearError();
                  }}
                  disabled={busy}
                  aria-invalid={error?.field === "email" || undefined}
                  aria-describedby={error?.field === "email" ? errorId("email") : undefined}
                  className={cx(
                    "mt-2 h-12 w-full rounded-[4px] border bg-surface px-3 text-[17px] text-ink caret-ink outline-none placeholder:text-muted/70 focus-visible:outline-none disabled:opacity-60 md:h-11 md:px-[11px] md:text-[15px] md:placeholder:text-muted",
                    error?.field === "email"
                      ? "border-again focus:shadow-[inset_0_0_0_1px_var(--again)]"
                      : "border-rule focus:border-ink focus:shadow-[inset_0_0_0_1px_var(--ink)] md:border-boundary",
                  )}
                />
                <FieldError field="email" error={error} last={lastError} />
              </div>

              {mode !== "reset" && (
                <PasswordField
                  id="login-password"
                  label={mode === "signup" ? `Пароль (от ${MIN_PASSWORD_LENGTH} символов)` : "Пароль"}
                  value={password}
                  onChange={(v) => {
                    setPassword(v);
                    clearError();
                  }}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  enterKeyHint={mode === "signup" ? "next" : "go"}
                  disabled={busy}
                  invalid={error?.field === "password"}
                  describedBy={error?.field === "password" ? errorId("password") : undefined}
                >
                  <FieldError field="password" error={error} last={lastError} />
                </PasswordField>
              )}

              {mode === "signup" && (
                <PasswordField
                  id="login-repeat"
                  label="Повторите пароль"
                  value={repeat}
                  onChange={(v) => {
                    setRepeat(v);
                    clearError();
                  }}
                  autoComplete="new-password"
                  enterKeyHint="go"
                  disabled={busy}
                  invalid={error?.field === "repeat"}
                  describedBy={error?.field === "repeat" ? errorId("repeat") : undefined}
                >
                  <FieldError field="repeat" error={error} last={lastError} />
                </PasswordField>
              )}

              {mode === "reset" && (
                <p className="m-0 text-[13px] leading-[18px] text-muted">
                  Пришлём ссылку для нового пароля. Откройте её в этом же браузере.
                </p>
              )}
            </div>
          </section>

          <Button type="submit" block pending={busy} pendingLabel={pendingLabel} pendingDelay={0} className={AUTH_PRIMARY_BUTTON}>
            {primaryLabel}
          </Button>

          <div className={AUTH_LINKS}>
            {mode === "signin" ? (
              <>
                <TextButton onClick={() => switchMode("reset")} disabled={busy}>
                  Забыли пароль?
                </TextButton>
                <TextButton onClick={() => switchMode("signup")} disabled={busy}>
                  Создать аккаунт
                </TextButton>
              </>
            ) : (
              <TextButton onClick={() => switchMode("signin")} disabled={busy}>
                ← Уже есть пароль — войти
              </TextButton>
            )}
          </div>
        </form>
      )}

      <p className={AUTH_FOOTNOTE}>Вход по паролю работает и в приложении на главном экране iPhone.</p>
    </main>
  );
}

function TextButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-11 cursor-pointer text-[13px] font-medium whitespace-nowrap text-ink underline decoration-rule underline-offset-4 disabled:opacity-60 md:h-8 md:rounded-[4px] md:px-2 md:text-[14px] md:no-underline md:hoverable:bg-hover-surface"
    >
      {children}
    </button>
  );
}
