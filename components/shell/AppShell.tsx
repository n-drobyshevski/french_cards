"use client";

import type { ReactNode } from "react";
import { Icon } from "@/components/ui/Icons";
import { GlobalKeys } from "./GlobalKeys";
import { useShellData } from "./NavParts";
import { Rail } from "./Rail";
import { ShellProvider, useShortcutsEnabled } from "./ShellContext";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { Sidebar } from "./Sidebar";
import { setSidebarHidden } from "./sidebar-state";

/** 32×32 button at the content's top-left while the nav column is hidden with `[` (CSS shows it). */
function RevealButton() {
  const shortcuts = useShortcutsEnabled();
  return (
    <button
      type="button"
      data-shell-reveal=""
      aria-label="Показать боковую панель"
      title={shortcuts ? "Показать боковую панель ([)" : "Показать боковую панель"}
      aria-keyshortcuts={shortcuts ? "[" : undefined}
      onClick={() => {
        setSidebarHidden(false);
        requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-shell-nav] a, [data-shell-nav] button")?.focus());
      }}
      className="fixed top-[calc(12px+env(safe-area-inset-top))] left-3 z-30 hidden size-8 items-center justify-center rounded-[4px] bg-transparent text-ink hoverable:bg-hover"
    >
      <Icon name="sidebar" size={20} strokeWidth={1.5} />
    </button>
  );
}

/**
 * Desktop shell around the pages. Phones (< 768): just the page column (the layout keeps the
 * 440px column and the tab bar). 768–1199: rail 72 + content; ≥ 1200: sidebar 248 + content.
 *
 * Content width: until a screen has its own desktop layout it stays a centred 560px column. A
 * screen that lays itself out for the full content area marks its root with `data-wide`.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const data = useShellData();
  return (
    <ShellProvider>
      <Sidebar data={data} />
      <Rail data={data} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col md:pt-[env(safe-area-inset-top)]">
        <RevealButton />
        <div className="flex min-h-0 flex-1 flex-col md:mx-auto md:w-full md:max-w-[560px] md:has-[[data-wide]]:max-w-none">
          {children}
        </div>
      </div>
      <GlobalKeys />
      <ShortcutsDialog />
    </ShellProvider>
  );
}
