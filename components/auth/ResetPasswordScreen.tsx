"use client";

// Second half of «Забыли пароль?»: /auth/confirm has exchanged the emailed link for a
// session, so the user can set a new password here.
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  AUTH_CARD,
  AUTH_MAIN,
  AUTH_PANEL,
  AUTH_PANEL_BODY,
  AUTH_PANEL_HEAD,
  AUTH_PANEL_TEXT,
  AUTH_PRIMARY,
  AUTH_PRIMARY_BUTTON,
  AuthMark,
} from "./AuthFrame";
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
    <main className={AUTH_MAIN}>
      <AuthMark />

      <div className={AUTH_CARD}>
        <section aria-labelledby="reset-title" className={AUTH_PANEL}>
          <div className={AUTH_PANEL_HEAD}>
            <span id="reset-title">НОВЫЙ ПАРОЛЬ</span>
          </div>

          {state === "checking" && <p className={`${AUTH_PANEL_TEXT} text-muted md:pb-6`}>Проверяем ссылку…</p>}

          {state === "no_session" && (
            <p className={`${AUTH_PANEL_TEXT} text-muted`}>
              Ссылка устарела или открыта в другом браузере. Запросите сброс пароля ещё раз.
            </p>
          )}

          {state === "done" && (
            <p role="status" className={`${AUTH_PANEL_TEXT} text-ink`}>
              Пароль обновлён. В приложении на главном экране войдите с новым паролем.
            </p>
          )}

          {state === "ready" && (
            <form id="reset-form" onSubmit={onSubmit} noValidate className={AUTH_PANEL_BODY}>
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
          <Button
            type="submit"
            form="reset-form"
            block
            pending={busy}
            pendingLabel="Сохраняем…"
            pendingDelay={0}
            className={`${AUTH_PRIMARY_BUTTON} md:mb-6`}
          >
            Сохранить пароль
          </Button>
        ) : state !== "checking" ? (
          <Link href={state === "done" ? "/" : "/login"} className={`${AUTH_PRIMARY} md:mb-6`}>
            {state === "done" ? "Открыть карточки" : "Ко входу"}
          </Link>
        ) : null}
      </div>
    </main>
  );
}
