"use client";

// Email + password sign-in in the frame of mockups/Login.dc.html. A password (not an emailed
// link or code) works inside the iOS home-screen app and needs no custom SMTP; email is only
// used for password resets.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured, normalizeEmail, prefillEmail, publicAllowedEmail } from "@/lib/supabase/config";
import { authErrorMessage, EMAIL_RE, EXISTING_ACCOUNT, MIN_PASSWORD_LENGTH, NOT_ALLOWED, newPasswordProblem } from "./messages";
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

export function LoginScreen() {
  const router = useRouter();
  const configured = isSupabaseConfigured();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState(() => prefillEmail(publicAllowedEmail()));
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
      setError("Введите пароль.");
      return;
    }
    if (mode === "signup") {
      const problem = newPasswordProblem(password, repeat);
      if (problem) {
        setError(problem);
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
          setError(EXISTING_ACCOUNT);
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
      setError(authErrorMessage(err, mode === "reset" ? "reset" : mode, online()));
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void submit();
  }

  const primaryLabel = busy
    ? mode === "reset"
      ? "Отправляем…"
      : "Входим…"
    : mode === "signin"
      ? "Войти"
      : mode === "signup"
        ? "Создать аккаунт"
        : "Отправить ссылку";

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
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "login-error" : undefined}
                  className="mt-2 h-12 w-full rounded-[4px] border border-rule bg-surface px-3 text-[17px] text-ink caret-ink outline-none placeholder:text-muted/70 focus:border-ink focus:shadow-[inset_0_0_0_1px_var(--ink)] focus-visible:outline-none disabled:opacity-60 md:h-11 md:border-boundary md:px-[11px] md:text-[15px] md:placeholder:text-muted"
                />
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
                  describedBy={error ? "login-error" : undefined}
                />
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
                  describedBy={error ? "login-error" : undefined}
                />
              )}

              {mode === "reset" && (
                <p className="m-0 text-[13px] leading-[18px] text-muted">
                  Пришлём ссылку для нового пароля. Откройте её в этом же браузере.
                </p>
              )}

              {error && (
                <p id="login-error" role="alert" className="m-0 text-[13px] leading-[18px] text-again">
                  {error}
                </p>
              )}
            </div>
          </section>

          <button type="submit" disabled={busy} aria-busy={busy || undefined} className={AUTH_PRIMARY}>
            {primaryLabel}
          </button>

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
