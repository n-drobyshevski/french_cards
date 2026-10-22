"use client";

// Login gate for the app shell. Local-only mode: renders children as is. With Supabase:
// no session -> /login, except when offline on a device that was signed in before, where the
// app keeps working and sync resumes once the session can be refreshed. A device with no cached
// session at all never gets here: the (app) layout's pre-paint script (auth-init.ts) goes to
// /login first. A cached session that turns out invalid is replaced by the login screen in one
// frame, fading in over the app (--dur-quick), while the router moves to /login (MOTION-SPEC U3).
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { LoginScreen } from "./LoginScreen";
import { checkSession, forgetSignedIn, passesEmailHint, rememberSignedIn } from "./session";

export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    let active = true;

    const toLogin = () => {
      if (!active) return;
      forgetSignedIn();
      setRedirecting(true);
      router.replace("/login");
    };

    const verify = async () => {
      const check = await checkSession();
      if (!active) return;
      if (check.kind === "signed_in") {
        if (!passesEmailHint(check.email)) {
          await client.auth.signOut({ scope: "local" });
          toLogin();
          return;
        }
        rememberSignedIn(check.email);
        return;
      }
      if (check.kind === "signed_out") toLogin();
    };

    void verify();
    const { data } = client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") setTimeout(toLogin, 0);
    });
    const onOnline = () => void verify();
    window.addEventListener("online", onOnline);
    return () => {
      active = false;
      data.subscription.unsubscribe();
      window.removeEventListener("online", onOnline);
    };
  }, [router]);

  // The app stays mounted under the login screen (no blank frame, nothing remounts) until /login takes over.
  return (
    <>
      {children}
      {redirecting && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-paper animate-[fade-in_var(--dur-quick)_var(--ease-enter)]">
          <LoginScreen />
        </div>
      )}
    </>
  );
}
