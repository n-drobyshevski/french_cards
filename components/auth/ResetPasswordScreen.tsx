"use client";

// Second half of «Забыли пароль?»: /auth/confirm has exchanged the emailed link for a
// session, so the user can set a new password here.
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { CardGlyph } from "./LoginScreen";
import { authErrorMessage, MIN_PASSWORD_LENGTH, newPasswordProblem } from "./messages";
import { PasswordField } from "./PasswordField";
import { checkSession, rememberSignedIn } from "./session";

type State = "checking" | "ready" | "no_session" | "done";

export function ResetPasswordScreen() {
  const [state, setState] = useState<State>("checking");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void checkSession().then((check) => {
      if (active) setState(check.kind === "signed_in" ? "ready" : "no_session");
    });
    return () => {
      active = false;
    };
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const client = getSupabaseBrowserClient();
    if (!client || busy) return;
    const problem = newPasswordProblem(password, repeat);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { data, error: updateError } = await client.auth.updateUser({ password });
      if (updateError) throw updateError;
      rememberSignedIn(data.user?.email);
      setState("done");
    } catch (err) {
      setError(authErrorMessage(err, "update", typeof navigator === "undefined" || navigator.onLine !== false));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col bg-paper px-4 pt-28 pb-[max(28px,env(safe-area-inset-bottom))] text-ink">
      <div className="flex items-center gap-3">
        <CardGlyph />
        <h1 className="m-0 font-serif text-[40px] leading-[44px] font-medium tracking-[-0.015em]">Карточки</h1>
      </div>

      <section aria-labelledby="reset-title" className="mt-12 overflow-hidden rounded-[6px] border border-rule bg-surface">
        <div className="flex h-[46px] items-center border-b-2 border-red px-4 font-mono text-[11px] leading-4 tracking-[.06em] text-muted">
          <span id="reset-title">НОВЫЙ ПАРОЛЬ</span>
        </div>

        {state === "checking" && <p className="m-0 px-4 py-6 text-[15px] leading-[22px] text-muted">Проверяем ссылку…</p>}

        {state === "no_session" && (
          <p className="m-0 px-4 py-6 text-[15px] leading-[22px] text-muted">
            Ссылка устарела или открыта в другом браузере. Запросите сброс пароля ещё раз.
          </p>
        )}

        {state === "done" && (
          <p role="status" className="m-0 px-4 py-6 text-[15px] leading-[22px] text-ink">
            Пароль обновлён. В приложении на главном экране войдите с новым паролем.
          </p>
        )}

        {state === "ready" && (
          <form id="reset-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4 px-4 pt-6 pb-5">
            <PasswordField
              id="reset-password"
              label={`Новый пароль (от ${MIN_PASSWORD_LENGTH} символов)`}
              value={password}
              onChange={(v) => {
                setPassword(v);
                setError(null);
              }}
              autoComplete="new-password"
              enterKeyHint="next"
              disabled={busy}
              describedBy={error ? "reset-error" : undefined}
            />
            <PasswordField
              id="reset-repeat"
              label="Повторите пароль"
              value={repeat}
              onChange={(v) => {
                setRepeat(v);
                setError(null);
              }}
              autoComplete="new-password"
              enterKeyHint="go"
              disabled={busy}
              describedBy={error ? "reset-error" : undefined}
            />
            {error && (
              <p id="reset-error" role="alert" className="m-0 text-[13px] leading-[18px] text-again">
                {error}
              </p>
            )}
          </form>
        )}
      </section>

      {state === "ready" ? (
        <button
          type="submit"
          form="reset-form"
          disabled={busy}
          className="mt-4 flex h-[52px] w-full shrink-0 cursor-pointer items-center justify-center rounded-[6px] bg-ink text-[15px] font-medium tracking-[.01em] text-on-ink disabled:cursor-default disabled:opacity-40"
        >
          {busy ? "Сохраняем…" : "Сохранить пароль"}
        </button>
      ) : state !== "checking" ? (
        <Link
          href={state === "done" ? "/" : "/login"}
          className="mt-4 flex h-[52px] shrink-0 items-center justify-center rounded-[6px] bg-ink text-[15px] font-medium tracking-[.01em] text-on-ink"
        >
          {state === "done" ? "Открыть карточки" : "Ко входу"}
        </Link>
      ) : null}
    </main>
  );
}
