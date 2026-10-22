import type { ReactNode } from "react";
import { AuthGate } from "@/components/auth/AuthGate";
import { AppProviders } from "@/components/providers/AppProviders";
import { InstallHint } from "@/components/pwa/InstallHint";
import { TabBar } from "@/components/ui/TabBar";

/**
 * App shell: a centered 440px column with safe-area paddings and the bottom tab bar.
 * `--shell-bottom` is the space the shell keeps clear at the bottom (tab bar + home indicator,
 * or just the home indicator on full-screen routes); sticky bottom bars should sit at it.
 * Pages own their 16px side gutter and top spacing and render their own <main>.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col pt-[env(safe-area-inset-top)] pb-(--shell-bottom) [--shell-bottom:env(safe-area-inset-bottom)] [&:has([data-tabbar])]:[--shell-bottom:calc(61px+env(safe-area-inset-bottom))]">
      <AppProviders>
        <AuthGate>
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
          <TabBar />
          <InstallHint />
        </AuthGate>
      </AppProviders>
    </div>
  );
}
