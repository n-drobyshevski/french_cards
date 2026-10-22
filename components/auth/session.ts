"use client";

// Client-side session helpers shared by AuthGate, the login screen and Settings.
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isAllowedEmail, isSupabaseConfigured, publicAllowedEmail } from "@/lib/supabase/config";
import { syncNow } from "@/lib/sync";

// Remembers that this device had a valid session, so the app keeps working offline after the
// access token expires and cannot be refreshed.
const MARKER_KEY = "kartochki.auth.email";

export function rememberSignedIn(email: string | null | undefined): void {
  try {
    localStorage.setItem(MARKER_KEY, email ?? "");
  } catch {}
}

export function forgetSignedIn(): void {
  try {
    localStorage.removeItem(MARKER_KEY);
  } catch {}
}

export function hadSessionOnDevice(): boolean {
  try {
    return localStorage.getItem(MARKER_KEY) !== null;
  } catch {
    return false;
  }
}

/** Client-side hint from NEXT_PUBLIC_ALLOWED_EMAIL; true when no hint is configured. */
export function passesEmailHint(email: string | null | undefined): boolean {
  const hint = publicAllowedEmail();
  return !hint || isAllowedEmail(email, hint);
}

export type AuthStatus = "local" | "loading" | "signed_in" | "signed_out" | "offline";

export interface AuthUserState {
  status: AuthStatus;
  email: string | null;
}

export type SessionCheck =
  | { kind: "local" }
  | { kind: "signed_in"; email: string | null }
  | { kind: "offline"; email: string | null }
  | { kind: "signed_out" };

/**
 * Reads the session from the cookie store (no network unless the token needs a refresh).
 * When the refresh fails for lack of network on a device that was signed in, reports
 * `offline` so the app keeps working.
 */
export async function checkSession(): Promise<SessionCheck> {
  const client = getSupabaseBrowserClient();
  if (!client) return { kind: "local" };
  let email: string | null = null;
  let networkTrouble = typeof navigator !== "undefined" && navigator.onLine === false;
  try {
    const { data, error } = await client.auth.getSession();
    if (data.session) return { kind: "signed_in", email: data.session.user.email ?? null };
    networkTrouble ||= isAuthRetryableFetchError(error);
  } catch (err) {
    networkTrouble ||= isAuthRetryableFetchError(err) || err instanceof TypeError;
  }
  if (networkTrouble && hadSessionOnDevice()) {
    try {
      email = localStorage.getItem(MARKER_KEY) || null;
    } catch {}
    return { kind: "offline", email };
  }
  return { kind: "signed_out" };
}

/** Current account for display (Settings: «Синхронизация · n.d…@pm.me»). */
export function useAuthUser(): AuthUserState {
  const [state, setState] = useState<AuthUserState>(() =>
    isSupabaseConfigured() ? { status: "loading", email: null } : { status: "local", email: null },
  );

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    let active = true;
    const refresh = () =>
      void checkSession().then((check) => {
        if (!active) return;
        if (check.kind === "signed_in" || check.kind === "offline") setState({ status: check.kind, email: check.email });
        else setState({ status: check.kind, email: null });
      });
    refresh();
    const { data } = client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") setTimeout(refresh, 0);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return state;
}

/**
 * Signs out on this device only. Tries a last sync first (up to 4 s) so recent changes are not
 * stranded; local data stays on the device. AuthGate then redirects to /login.
 */
export async function signOut(): Promise<void> {
  const client = getSupabaseBrowserClient();
  if (!client) return;
  await Promise.race([syncNow().catch(() => undefined), new Promise((resolve) => setTimeout(resolve, 4_000))]);
  forgetSignedIn();
  await client.auth.signOut({ scope: "local" });
}
