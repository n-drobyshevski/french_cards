import type { ReactNode } from "react";
import { AUTH_INIT_SCRIPT } from "@/components/auth/auth-init";
import { AuthGate } from "@/components/auth/AuthGate";
import { AppProviders } from "@/components/providers/AppProviders";
import { InstallHint } from "@/components/pwa/InstallHint";
import { AppShell } from "@/components/shell/AppShell";
import { TabBar } from "@/components/ui/TabBar";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * App shell. Phones (< 768): a centered 440px column with safe-area paddings and the bottom tab bar.
 * From 768 up: nav column (rail, or the sidebar from 1200) + content, no tab bar (components/shell).
 * `--shell-bottom` is the space the shell keeps clear at the bottom (tab bar + home indicator,
 * or just the home indicator on full-screen routes and on desktop); sticky bottom bars should sit at it.
 * Pages own their 16px side gutter and top spacing and render their own <main>.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col pt-[env(safe-area-inset-top)] pb-(--shell-bottom) [--shell-bottom:env(safe-area-inset-bottom)] max-md:[&:has([data-tabbar])]:[--shell-bottom:calc(61px+env(safe-area-inset-bottom))] md:max-w-none md:flex-row md:pt-0">
      {/* Signed out with no cached session: off to /login before the app paints (U3). */}
      {isSupabaseConfigured() && <script dangerouslySetInnerHTML={{ __html: AUTH_INIT_SCRIPT }} />}
      <AppProviders>
        <AuthGate>
          <AppShell>{children}</AppShell>
          <TabBar />
          <InstallHint />
        </AuthGate>
      </AppProviders>
    </div>
  );
}
