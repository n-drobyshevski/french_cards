"use client";

// Email OTP sign-in per mockups/Login.dc.html: step 1 asks for the email, step 2 takes the
// 6-digit code. A code (not a magic link) keeps sign-in inside the iOS home-screen app.
import { isAuthApiError, isAuthError, isAuthRetryableFetchError } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured, normalizeEmail } from "@/lib/supabase/config";
import { OTP_LENGTH, OtpInput } from "./OtpInput";
import { checkSession, passesEmailHint, rememberSignedIn } from "./session";

type Step = "email" | "code";

const RESEND_SECONDS = 60;
// The PWA may be reloaded while the user reads the code in Mail; resume step 2 for a while.
const PENDING_KEY = "kartochki.login.pending";
const PENDING_TTL_MS = 60 * 60_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const emptyDigits = () => Array<string>(OTP_LENGTH).fill("");

interface Pending {
  email: string;
  sentAt: number;
}

function readPending(): Pending | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const pending = JSON.parse(raw) as Pending;
    if (typeof pending.email !== "string" || typeof pending.sentAt !== "number") return null;
    return Date.now() - pending.sentAt < PENDING_TTL_MS ? pending : null;
  } catch {
    return null;
  }
}

function writePending(pending: Pending | null): void {
  try {
    if (pending) localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    else localStorage.removeItem(PENDING_KEY);
  } catch {}
}

const NOT_ALLOWED = "С этого адреса войти нельзя.";

function messageFor(error: unknown, phase: "send" | "verify"): string {
  if ((typeof navigator !== "undefined" && navigator.onLine === false) || isAuthRetryableFetchError(error)) {
    return "Нет сети. Проверьте подключение и попробуйте ещё раз.";
  }
  const code = isAuthError(error) ? error.code : undefined;
  const status = isAuthApiError(error) ? error.status : undefined;
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || status === 429) {
    return "Слишком много попыток. Подождите минуту и попробуйте снова.";
  }
  if (code === "signup_disabled" || code === "email_address_not_authorized" || code === "otp_disabled") return NOT_ALLOWED;
  if (code === "email_address_invalid" || code === "validation_failed") {
    return phase === "send" ? "Проверьте адрес почты." : "Код не подошёл. Проверьте цифры.";
  }
  if (code === "otp_expired" || phase === "verify") return "Код неверный или устарел. Проверьте цифры или запросите новый.";
  return "Не получилось отправить код. Попробуйте ещё раз.";
}

const formatSeconds = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function CardGlyph() {
  return (
    <svg aria-hidden="true" width="20" height="28" viewBox="0 0 20 28" fill="none" className="shrink-0">
      <rect x="0.75" y="0.75" width="18.5" height="26.5" rx="1.5" className="stroke-ink" strokeWidth="1.5" />
      <path d="M0.75 7.5h18.5" className="stroke-red" strokeWidth="2" />
    </svg>
  );
}

export function LoginScreen() {
  const router = useRouter();
  const configured = isSupabaseConfigured();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [digits, setDigits] = useState<string[]>(emptyDigits);
  const [busy, setBusy] = useState<null | "sending" | "verifying">(null);
  const [error, setError] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);

  // Already signed in: go to the app. Otherwise resume a code that was just sent.
  useEffect(() => {
    if (!configured) return;
    let active = true;
    void checkSession().then((check) => {
      if (!active) return;
      if (check.kind === "signed_in" && passesEmailHint(check.email)) {
        router.replace("/");
        return;
      }
      const pending = readPending();
      if (pending) {
        setEmail(pending.email);
        setSentAt(pending.sentAt);
        setNow(Date.now());
        setStep("code");
      }
    });
    return () => {
      active = false;
    };
  }, [configured, router]);

  useEffect(() => {
    if (sentAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [sentAt]);

  useEffect(() => {
    const target = document.getElementById(step === "code" ? "otp-0" : "login-email");
    target?.focus();
  }, [step]);

  const resendIn = sentAt === null ? 0 : Math.max(0, Math.min(RESEND_SECONDS, Math.ceil(RESEND_SECONDS - (now - sentAt) / 1000)));

  async function sendCode(address: string): Promise<boolean> {
    const client = getSupabaseBrowserClient();
    if (!client) return false;
    setBusy("sending");
    setError(null);
    try {
      const { error: sendError } = await client.auth.signInWithOtp({ email: address, options: { shouldCreateUser: true } });
      if (sendError) {
        setError(messageFor(sendError, "send"));
        return false;
      }
    } catch (err) {
      setError(messageFor(err, "send"));
      return false;
    } finally {
      setBusy(null);
    }
    const at = Date.now();
    setSentAt(at);
    setNow(at);
    writePending({ email: address, sentAt: at });
    return true;
  }

  async function onSubmitEmail() {
    const address = normalizeEmail(email);
    if (!EMAIL_RE.test(address)) {
      setError("Проверьте адрес почты.");
      return;
    }
    if (!passesEmailHint(address)) {
      setError(NOT_ALLOWED);
      return;
    }
    setEmail(address);
    if (await sendCode(address)) {
      setDigits(emptyDigits());
      setStep("code");
    }
  }

  async function verify(code: string) {
    const client = getSupabaseBrowserClient();
    if (!client || busy || code.length !== OTP_LENGTH) return;
    setBusy("verifying");
    setError(null);
    try {
      const { data, error: verifyError } = await client.auth.verifyOtp({ email, token: code, type: "email" });
      if (verifyError || !data.session) throw verifyError ?? new Error("no_session");
      if (!passesEmailHint(data.session.user.email)) {
        await client.auth.signOut({ scope: "local" });
        setError(NOT_ALLOWED);
        setBusy(null);
        return;
      }
      rememberSignedIn(data.session.user.email ?? email);
      writePending(null);
      router.replace("/");
    } catch (err) {
      setError(messageFor(err, "verify"));
      setDigits(emptyDigits());
      setBusy(null);
      document.getElementById("otp-0")?.focus();
    }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    if (step === "email") void onSubmitEmail();
    else void verify(digits.join(""));
  }

  function changeEmail() {
    writePending(null);
    setSentAt(null);
    setDigits(emptyDigits());
    setError(null);
    setStep("email");
  }

  async function resend() {
    setDigits(emptyDigits());
    if (await sendCode(email)) document.getElementById("otp-0")?.focus();
  }

  const code = digits.join("");
  const primaryLabel =
    step === "email" ? (busy === "sending" ? "Отправляем…" : "Получить код") : busy === "verifying" ? "Проверяем…" : "Войти";
  const primaryDisabled = busy !== null || (step === "code" && code.length !== OTP_LENGTH);

  return (
    <main className="flex min-h-dvh flex-col bg-paper px-4 pt-28 pb-[max(28px,env(safe-area-inset-bottom))] text-ink">
      <div className="flex items-center gap-3">
        <CardGlyph />
        <h1 className="m-0 font-serif text-[40px] leading-[44px] font-medium tracking-[-0.015em]">Карточки</h1>
      </div>
      <p className="mt-2 ml-8 font-serif text-[19px] leading-7 text-muted italic">Слова, которые хочется запомнить.</p>

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
          <section aria-labelledby="otp-title" className="mt-12 overflow-hidden rounded-[6px] border border-rule bg-surface">
            <div className="flex h-[46px] items-center justify-between border-b-2 border-red px-4 font-mono text-[11px] leading-4 tracking-[.06em] text-muted">
              <span id="otp-title">ВХОД ПО КОДУ</span>
              <span>ШАГ {step === "email" ? 1 : 2} / 2</span>
            </div>

            {step === "email" ? (
              <div className="px-4 pt-6 pb-4">
                <label htmlFor="login-email" className="block text-[15px] leading-[22px] text-muted">
                  Почта, на которую придёт код
                </label>
                <input
                  id="login-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="send"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError(null);
                  }}
                  disabled={busy !== null}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "login-error" : undefined}
                  className={`mt-4 h-14 w-full rounded-[4px] border bg-surface px-3 text-[17px] text-ink caret-ink outline-none placeholder:text-muted/70 focus:border-ink focus:shadow-[inset_0_0_0_1px_var(--ink)] focus-visible:outline-none disabled:opacity-60 ${
                    error ? "border-again" : "border-rule"
                  }`}
                />
                {error && (
                  <p id="login-error" role="alert" className="mt-3 text-[13px] leading-[18px] text-again">
                    {error}
                  </p>
                )}
              </div>
            ) : (
              <>
                <div className="px-4 pt-6">
                  <label htmlFor="otp-0" className="block text-[15px] leading-[22px] text-muted">
                    Код отправлен на
                    <br />
                    <span className="font-medium break-all text-ink">{email}</span>
                  </label>
                  <div className="mt-4">
                    <OtpInput
                      digits={digits}
                      onChange={(next) => {
                        setDigits(next);
                        if (error) setError(null);
                      }}
                      onComplete={(full) => void verify(full)}
                      disabled={busy === "verifying"}
                      invalid={error !== null}
                      describedBy={error ? "login-error" : undefined}
                    />
                  </div>
                  {error && (
                    <p id="login-error" role="alert" className="mt-3 text-[13px] leading-[18px] text-again">
                      {error}
                    </p>
                  )}
                </div>

                <div className="mx-4 mt-4 flex h-11 items-center justify-between gap-3 border-t border-rule">
                  <button
                    type="button"
                    onClick={changeEmail}
                    disabled={busy !== null}
                    className="h-11 cursor-pointer text-[13px] font-medium whitespace-nowrap text-ink underline decoration-rule underline-offset-4 disabled:opacity-60"
                  >
                    Изменить почту
                  </button>
                  {resendIn > 0 ? (
                    <span className="text-xs leading-4 whitespace-nowrap text-muted" aria-live="off">
                      Отправить ещё раз через <span className="font-mono text-ink">{formatSeconds(resendIn)}</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void resend()}
                      disabled={busy !== null}
                      className="h-11 cursor-pointer text-[13px] font-medium whitespace-nowrap text-ink underline decoration-rule underline-offset-4 disabled:opacity-60"
                    >
                      {busy === "sending" ? "Отправляем…" : "Отправить ещё раз"}
                    </button>
                  )}
                </div>
              </>
            )}
          </section>

          <button
            type="submit"
            disabled={primaryDisabled}
            className="mt-4 flex h-[52px] w-full shrink-0 cursor-pointer items-center justify-center rounded-[6px] bg-ink text-[15px] font-medium tracking-[.01em] text-on-ink disabled:cursor-default disabled:opacity-40"
          >
            {primaryLabel}
          </button>
        </form>
      )}

      <p className="mt-auto max-w-[300px] pt-8 text-xs leading-4 text-muted">
        Код, а не ссылка — так вход работает и в приложении на главном экране iPhone.
      </p>
    </main>
  );
}
