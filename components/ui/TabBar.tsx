"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { useAddSheet } from "@/components/providers/AddSheetContext";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icons";

export type TabId = "review" | "library";

/** Which tab a path belongs to. Settings sits under «Библиотека» like in the mockups. */
export function tabForPath(pathname: string | null): TabId | null {
  if (!pathname) return null;
  if (pathname.startsWith("/library") || pathname.startsWith("/settings")) return "library";
  if (pathname === "/" || pathname.startsWith("/done")) return "review";
  return null;
}

/** Routes that are full-screen flows without the tab bar. */
export function hidesTabBar(pathname: string | null): boolean {
  return !!pathname && pathname.startsWith("/import");
}

/** Height the bar takes, including its 1px top rule and the home-indicator inset. */
export const TAB_BAR_HEIGHT = "calc(61px + env(safe-area-inset-bottom))";

const itemClass =
  "relative flex h-[60px] flex-col items-center justify-center gap-1 bg-transparent text-[12px] leading-4 no-underline";

function TabMarker() {
  return <span aria-hidden="true" className="absolute inset-x-0 -top-px h-0.5 bg-red" />;
}

function TabLink({ href, icon, label, active }: { href: string; icon: IconName; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(itemClass, active ? "font-semibold text-ink" : "font-medium text-muted active:text-ink")}
    >
      {active && <TabMarker />}
      <Icon name={icon} size={20} strokeWidth={1.5} />
      <span>{label}</span>
    </Link>
  );
}

function Bar({ active }: { active: TabId | null }) {
  const addSheet = useAddSheet();
  return (
    <nav
      data-tabbar=""
      aria-label="Основная навигация"
      className="fixed inset-x-0 bottom-0 z-30 mx-auto grid w-full max-w-[440px] grid-cols-3 border-t border-rule bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <TabLink href="/" icon="cards" label="Повторение" active={active === "review"} />
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={addSheet.isOpen}
        onClick={() => addSheet.open()}
        className={cx(itemClass, "font-medium text-muted active:text-ink")}
      >
        <Icon name="plus" size={20} strokeWidth={1.5} />
        <span>Добавить</span>
      </button>
      <TabLink href="/library" icon="library" label="Библиотека" active={active === "library"} />
    </nav>
  );
}

function RoutedBar() {
  const pathname = usePathname();
  if (hidesTabBar(pathname)) return null;
  return <Bar active={tabForPath(pathname)} />;
}

/**
 * Bottom tab bar: Повторение / Добавить / Библиотека. «Добавить» opens the quick-add sheet.
 * usePathname can suspend while prerendering dynamic routes, so the bar renders without an
 * active tab until the path is known.
 */
export function TabBar() {
  return (
    <Suspense fallback={<Bar active={null} />}>
      <RoutedBar />
    </Suspense>
  );
}
