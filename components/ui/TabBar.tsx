"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState } from "react";
import { useAddSheet } from "@/components/providers/AddSheetContext";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icons";

export type TabId = "review" | "context" | "library";

/** Which tab a path belongs to. Settings sits under «Библиотека» like in the mockups. */
export function tabForPath(pathname: string | null): TabId | null {
  if (!pathname) return null;
  if (pathname.startsWith("/library") || pathname.startsWith("/settings")) return "library";
  if (pathname === "/" || pathname.startsWith("/done")) return "review";
  if (pathname.startsWith("/context")) return "context";
  return null;
}

/** Routes that are full-screen flows without the tab bar. */
export function hidesTabBar(pathname: string | null): boolean {
  return !!pathname && pathname.startsWith("/import");
}

/** Height the bar takes, including its 1px top rule and the home-indicator inset. */
export const TAB_BAR_HEIGHT = "calc(61px + env(safe-area-inset-bottom))";

// Press (N1): the label tints in --dur-instant and settles back in --dur-quick.
const itemClass =
  "relative flex h-[60px] touch-manipulation flex-col items-center justify-center gap-1 bg-transparent text-[12px] leading-4 no-underline transition-colors duration-(--dur-quick) ease-press active:duration-(--dur-instant)";

/** Grid column of each tab (Повторение · Добавить · Контекст · Библиотека). */
const COLUMN: Record<TabId, number> = { review: 0, context: 2, library: 3 };

/**
 * One shared 2px red marker over the bar's top rule (N1). Between tabs it moves with translateX
 * (--dur-move --ease-standard; jumps under reduced motion); it mounts in place when a tab first
 * becomes known.
 */
function TabMarker({ tab }: { tab: TabId }) {
  return (
    <span
      aria-hidden="true"
      data-tab-marker=""
      className="pointer-events-none absolute -top-px left-0 h-0.5 w-1/4 bg-red motion-safe:[transition:transform_var(--dur-move)_var(--ease-standard)]"
      style={{ transform: `translateX(${COLUMN[tab] * 100}%)` }}
    />
  );
}

function TabLink({
  href,
  icon,
  label,
  active,
  current,
  onTap,
}: {
  href: string;
  icon: IconName;
  label: string;
  /** Looks active: the route's tab, or the one just tapped while its route loads. */
  active: boolean;
  /** The route's tab (aria-current). */
  current: boolean;
  onTap: () => void;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      onNavigate={onTap}
      className={cx(itemClass, active ? "font-semibold text-ink" : "font-medium text-muted active:text-ink")}
    >
      <Icon name={icon} size={20} strokeWidth={1.5} />
      <span>{label}</span>
    </Link>
  );
}

function Bar({ active, pathname = null }: { active: TabId | null; pathname?: string | null }) {
  const addSheet = useAddSheet();
  // Optimistic (N1): a tapped tab shows as active at once and holds until the route commits; it
  // is dropped as soon as the path changes, so the committed route takes over.
  const [tapped, setTapped] = useState<{ tab: TabId; from: string | null } | null>(null);
  if (tapped && tapped.from !== pathname) setTapped(null);
  const shown = tapped && tapped.from === pathname ? tapped.tab : active;
  const tap = (tab: TabId) => () => setTapped({ tab, from: pathname });
  return (
    <nav
      data-tabbar=""
      aria-label="Основная навигация"
      className="fixed inset-x-0 bottom-0 z-30 mx-auto grid w-full max-w-[440px] grid-cols-4 border-t border-rule bg-surface pb-[env(safe-area-inset-bottom)] [view-transition-name:tab-bar] md:hidden"
    >
      {shown && <TabMarker tab={shown} />}
      <TabLink href="/" icon="cards" label="Повторение" active={shown === "review"} current={active === "review"} onTap={tap("review")} />
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
      <TabLink
        href="/context"
        icon="search"
        label="Контекст"
        active={shown === "context"}
        current={active === "context"}
        onTap={tap("context")}
      />
      <TabLink
        href="/library"
        icon="library"
        label="Библиотека"
        active={shown === "library"}
        current={active === "library"}
        onTap={tap("library")}
      />
    </nav>
  );
}

function RoutedBar() {
  const pathname = usePathname();
  if (hidesTabBar(pathname)) return null;
  return <Bar active={tabForPath(pathname)} pathname={pathname} />;
}

/**
 * Bottom tab bar: Повторение / Добавить / Контекст / Библиотека. «Добавить» opens the quick-add sheet.
 * Phones only: from 768 up the rail/sidebar (components/shell) replaces it.
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
