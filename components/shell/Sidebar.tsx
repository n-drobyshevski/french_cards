"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useRef, useState } from "react";
import { FolderFormSheet } from "@/components/library/FolderFormSheet";
import { ThemeActions, type ThemeActionsTarget } from "@/components/library/ThemeActions";
import { useLongPress } from "@/components/library/use-long-press";
import { nWords } from "@/components/library/format";
import { useAddSheetActions } from "@/components/providers/AddSheetContext";
import { AppMark } from "@/components/ui/AppMark";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icons";
import { FlatKey } from "@/components/ui/Kbd";
import { useSnackbar } from "@/components/ui/Snackbar";
import { useLayoutClass } from "@/lib/use-media";
import { navKeyForPath, resolveNavKey, type NavKey, type ShellData, type ShellTheme } from "./data";
import { useThemeDrop } from "./dnd";
import { ActiveBar, DropLight, dropClasses, PendingTick, useSidebarSyncLine } from "./NavParts";
import { useShortcutsEnabled } from "./ShellContext";

// Expanded sidebar (≥ 1200, DESKTOP-SPEC §2 «Expanded sidebar»): text only, paper, 1px right rule.

const rowClass =
  "hover-fade relative flex shrink-0 items-center rounded-[4px] pr-2 pl-3 text-ink no-underline hoverable:bg-hover focus-visible:outline-offset-[-2px]";

function NavLink({
  href,
  label,
  active,
  count,
  countTone = "muted",
}: {
  href: string;
  label: string;
  active: boolean;
  count?: number | null;
  countTone?: "ink" | "muted";
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(rowClass, "h-9 text-[14px]", active ? "font-semibold" : "font-medium")}
    >
      {active && <ActiveBar edge="sidebar" />}
      <PendingTick />
      <span className="flex-1">{label}</span>
      {count != null && (
        <span
          className={cx(
            "font-mono text-[12px] tabular-nums",
            countTone === "ink" ? "font-medium text-ink" : "font-normal text-muted",
          )}
        >
          {count}
        </span>
      )}
    </Link>
  );
}

/** A theme in the sidebar: a right click, a long press or the context-menu key opens its actions (`onMenu`). */
function ThemeRow({ theme, active, onMenu }: { theme: ShellTheme; active: boolean; onMenu?: (element: HTMLElement) => void }) {
  const drop = useThemeDrop({ id: theme.id, name: theme.name });
  const inbox = theme.id === null;
  const ref = useRef<HTMLAnchorElement>(null);
  const press = useLongPress(() => {
    if (ref.current) onMenu?.(ref.current);
  });
  return (
    <Link
      ref={ref}
      href={theme.href}
      aria-current={active ? "page" : undefined}
      aria-label={`${theme.name}, ${nWords(theme.count)}`}
      aria-haspopup={onMenu ? "menu" : undefined}
      data-theme-target={theme.id ?? "inbox"}
      {...drop.dropProps}
      {...(onMenu ? press : {})}
      className={cx(rowClass, "isolate h-11 gap-2.5", onMenu && "select-none [-webkit-touch-callout:none]", dropClasses(drop.dragging, drop.over))}
    >
      <DropLight />
      {active && <ActiveBar edge="sidebar" />}
      <PendingTick />
      <span
        aria-hidden="true"
        className={cx("size-2 shrink-0 rounded-[1px]", inbox && "border border-dashed border-muted")}
        style={inbox ? undefined : { background: theme.color ?? undefined }}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-serif text-[16px] leading-5 font-medium">{theme.name}</span>
        {theme.guide && (
          <span lang="fr" className="truncate font-serif text-[12px] leading-4 text-muted italic">
            {theme.guide}
          </span>
        )}
      </span>
      <span
        aria-hidden="true"
        className={cx(
          "font-mono text-[12px] tabular-nums",
          drop.over ? "text-ink" : inbox && theme.count > 0 ? "font-medium text-red" : "text-muted",
        )}
      >
        {drop.over ? `+${drop.count || ""}` : theme.count}
      </span>
    </Link>
  );
}

function SyncButton() {
  const { line, busy, sync } = useSidebarSyncLine();
  if (!line) return null;
  return (
    <button
      type="button"
      disabled={!line.canSync && !busy}
      aria-busy={busy || undefined}
      aria-label={`${line.text}${line.detail ? `. ${line.detail}` : ""}. Синхронизировать сейчас`}
      title={line.detail ?? "Синхронизировать сейчас"}
      onClick={sync}
      className="hover-fade flex h-6 shrink-0 items-center gap-1.5 rounded-[4px] bg-transparent pr-2 pl-3 text-left text-[12px] text-muted hoverable:bg-hover focus-visible:outline-offset-[-2px] disabled:cursor-default"
    >
      {line.dot && (
        <span aria-hidden="true" className={cx("size-1.5 shrink-0 rounded-full", line.dot === "again" ? "bg-again" : "bg-muted")} />
      )}
      <span className={cx("truncate", line.dot === "again" && "text-again")}>{line.text}</span>
    </button>
  );
}

function SidebarView({ data, active }: { data: ShellData | undefined; active: NavKey | null }) {
  const addSheet = useAddSheetActions();
  const shortcuts = useShortcutsEnabled();
  const snackbar = useSnackbar();
  const router = useRouter();
  const layout = useLayoutClass();
  const [newTheme, setNewTheme] = useState(false);
  const [themeMenu, setThemeMenu] = useState<ThemeActionsTarget | null>(null);
  const key = resolveNavKey(active, data?.themes);

  return (
    <aside
      data-shell-nav=""
      aria-label="Разделы"
      className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col overflow-y-auto overscroll-contain border-r border-rule bg-paper px-3 pt-[calc(16px+var(--safe-top))] pb-3 xl:flex"
    >
      <div className="flex h-10 shrink-0 items-center px-2">
        <AppMark />
      </div>

      <button
        type="button"
        aria-label="Добавить слово"
        aria-haspopup="dialog"
        aria-keyshortcuts={shortcuts ? "N" : undefined}
        onClick={() => addSheet.open()}
        className={cx(rowClass, "mt-4 h-8 bg-transparent text-[14px] font-medium")}
      >
        <span className="flex-1 text-left">+ Новое слово</span>
        {shortcuts && <FlatKey aria-hidden="true">N</FlatKey>}
      </button>

      <nav aria-label="Основная навигация" className="mt-4 flex shrink-0 flex-col gap-0.5">
        <NavLink href="/" label="Повторение" active={key === "review"} count={data?.due || null} countTone="ink" />
        <NavLink href="/library" label="Библиотека" active={key === "library"} count={data?.total ?? null} />
        <NavLink href="/context" label="Контекст" active={key === "context"} />
        <NavLink href="/import" label="Импорт" active={key === "import"} />
      </nav>

      <div aria-hidden="true" className="mx-2 mt-4 h-px shrink-0 bg-rule" />

      <div className="mt-[11px] flex h-6 shrink-0 items-center pr-1 pl-3">
        <h2 className="m-0 flex-1 text-[13px] leading-5 font-medium">Темы</h2>
        <button
          type="button"
          aria-label="Новая тема"
          title="Новая тема"
          aria-haspopup="dialog"
          onClick={() => setNewTheme(true)}
          className="hover-fade inline-flex size-6 items-center justify-center rounded-[4px] bg-transparent text-ink hoverable:bg-hover"
        >
          <Icon name="plus" size={16} />
        </button>
      </div>

      <ul aria-label="Темы" className="m-0 mt-1 flex shrink-0 list-none flex-col p-0">
        {data &&
          [data.inbox, ...data.themes].map((theme) => (
            <li key={theme.id ?? "inbox"}>
              <ThemeRow
                theme={theme}
                active={theme.id === null ? key === "inbox" : key === `theme:${theme.id}`}
                onMenu={theme.id === null ? undefined : (element) => setThemeMenu({ folderId: theme.id!, anchor: { element } })}
              />
            </li>
          ))}
      </ul>

      <div className="mt-auto flex shrink-0 flex-col pt-4">
        <div aria-hidden="true" className="mx-2 mb-2 h-px bg-rule" />
        {layout === "expanded" && <SyncButton />}
        <NavLink href="/settings" label="Настройки" active={key === "settings"} />
      </div>

      <ThemeActions target={themeMenu} onClose={() => setThemeMenu(null)} />

      <FolderFormSheet
        open={newTheme}
        onOpenChange={setNewTheme}
        usedColors={data?.themes.map((t) => t.color ?? "")}
        onSaved={(folder) => {
          snackbar.show({ message: `Тема «${folder.name}» создана` });
          router.push(`/library/${encodeURIComponent(folder.id)}`);
        }}
      />
    </aside>
  );
}

function RoutedSidebar({ data }: { data: ShellData | undefined }) {
  const pathname = usePathname();
  return <SidebarView data={data} active={navKeyForPath(pathname)} />;
}

/**
 * Sidebar 248px from 1200 up: mark, «+ Новое слово», Повторение / Библиотека / Контекст / Импорт, themes
 * with guide words (drop targets for dragged words), sync line and «Настройки». Hidden with `[`.
 */
export function Sidebar({ data }: { data: ShellData | undefined }) {
  return (
    <Suspense fallback={<SidebarView data={data} active={null} />}>
      <RoutedSidebar data={data} />
    </Suspense>
  );
}
