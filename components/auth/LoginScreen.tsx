"use client";

// Email + password sign-in in the frame of mockups/Login.dc.html. A password (not an emailed
// link or code) works inside the iOS home-screen app and needs no custom SMTP; email is only
// used for password resets.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured, normalizeEmail, publicAllowedEmail } from "@/lib/supabase/config";
import { authErrorMessage, EMAIL_RE, EXISTING_ACCOUNT, MIN_PASSWORD_LENGTH, NOT_ALLOWED, newPasswordProblem } from "./messages";
import { PasswordField } from "./PasswordField";
import { checkSession, passesEmailHint, rememberSignedIn } from "./session";
import { APP_NAME } from "@/lib/brand";

type Mode = "signin" | "signup" | "reset";

const TITLES: Record<Mode, string> = {
  signin: "ВХОД",
  signup: "НОВЫЙ АККАУНТ",
  reset: "СБРОС ПАРОЛЯ",
};

const NOTICES: Record<string, string> = {
  expired: "Ссылка не сработала или устарела. Запросите сброс пароля ещё раз.",
};

export function CardGlyph() {
  return (
    <svg aria-hidden="true" width="20" height="28" viewBox="0 0 20 28" fill="none" className="mt-2 shrink-0">
      <rect x="0.75" y="0.75" width="18.5" height="26.5" rx="1.5" className="stroke-ink" strokeWidth="1.5" />
      <path d="M0.75 7.5h18.5" className="stroke-red" strokeWidth="2" />
    </svg>
  );
}

const online = () => typeof navigator === "undefined" || navigator.onLine !== false;

export function LoginScreen() {
  const router = useRouter();
  const configured = isSupabaseConfigured();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState(() => publicAllowedEmail().split(",")[0]?.trim() ?? "");
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
    <main className="flex min-h-dvh flex-col bg-paper px-4 pt-28 pb-[max(28px,env(safe-area-inset-bottom))] text-ink">
      <div className="flex items-start gap-3">
        <CardGlyph />
        <h1 className="m-0 font-serif text-[40px] leading-[44px] font-medium tracking-[-0.015em] text-balance">{APP_NAME}</h1>
      </div>

      {!configured ? (
        <>
          <section className="mt-12 overflow-hidden rounded-[6px] border border-rule bg-surface">
            <div className="flex h-[46px] items-center border-b-2 border-red px-4 font-mono text-[11px] leading-4 tracking-[.06em] text-muted">
              ВХОД НЕ НУЖЕН
            </div>
            <p className="px-4 py-6 text-[15px] leading-[22px] text-muted">
              Синхронизация выключена: все слова и прогресс хранятся только на этом устройстве.
            </p>
          </section>
          <Link
            href="/"
            className="mt-4 flex h-[52px] shrink-0 items-center justify-center rounded-[6px] bg-ink text-[15px] font-medium tracking-[.01em] text-on-ink"
          >
            Открыть карточки
          </Link>
        </>
      ) : (
        <form onSubmit={onSubmit} noValidate className="contents">
          <section aria-labelledby="login-title" className="mt-12 overflow-hidden rounded-[6px] border border-rule bg-surface">
            <div className="flex h-[46px] items-center border-b-2 border-red px-4 font-mono text-[11px] leading-4 tracking-[.06em] text-muted">
              <span id="login-title">{TITLES[mode]}</span>
            </div>

            <div className="flex flex-col gap-4 px-4 pt-6 pb-5">
              {notice && (
                <p role="status" className="m-0 rounded-[4px] border border-rule bg-surface-2 px-3 py-2 text-[13px] leading-[18px] text-ink">
                  {notice}
                </p>
              )}

              <div>
                <label htmlFor="login-email" className="block text-[13px] leading-[18px] text-muted">
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
                  className="mt-2 h-12 w-full rounded-[4px] border border-rule bg-surface px-3 text-[17px] text-ink caret-ink outline-none placeholder:text-muted/70 focus:border-ink focus:shadow-[inset_0_0_0_1px_var(--ink)] focus-visible:outline-none disabled:opacity-60"
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

          <button
            type="submit"
            disabled={busy}
            className="mt-4 flex h-[52px] w-full shrink-0 cursor-pointer items-center justify-center rounded-[6px] bg-ink text-[15px] font-medium tracking-[.01em] text-on-ink disabled:cursor-default disabled:opacity-40"
          >
            {primaryLabel}
          </button>

          <div className="mt-2 flex items-center justify-between gap-3">
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

      <p className="mt-auto max-w-[300px] pt-8 text-xs leading-4 text-muted">
        Вход по паролю работает и в приложении на главном экране iPhone.
      </p>
    </main>
  );
}

function TextButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-11 cursor-pointer text-[13px] font-medium whitespace-nowrap text-ink underline decoration-rule underline-offset-4 disabled:opacity-60"
    >
      {children}
    </button>
  );
}
