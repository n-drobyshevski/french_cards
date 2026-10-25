"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { nWords } from "@/components/library/format";
import { useAddSheetActions } from "@/components/providers/AddSheetContext";
import { CardGlyph } from "@/components/ui/AppMark";
import { cx } from "@/components/ui/cx";
import { Icon, type IconName } from "@/components/ui/Icons";
import { useLayoutClass } from "@/lib/use-media";
import { INBOX_NAME, navKeyForPath, themeHref, unplayedLabel, useUnplayedSets, type NavKey, type ShellData } from "./data";
import { useThemeDrop } from "./dnd";
import { ActiveBar, DropLight, dropClasses, PendingTick, useSidebarSyncLine } from "./NavParts";
import { useShortcutsEnabled } from "./ShellContext";

// Medium rail (768–1199, DESKTOP-SPEC §2 «Medium rail»): 72px, icons with 11px labels.

const itemClass =
  "hover-fade relative mx-1 flex shrink-0 flex-col items-center justify-center gap-1 rounded-[4px] text-[11px] leading-4 whitespace-nowrap text-ink no-underline hoverable:bg-hover focus-visible:outline-offset-[-2px]";

function RailIcon({ icon, count, countTone = "ink", dot }: { icon: IconName; count?: number | null; countTone?: "ink" | "red"; dot?: "muted" | "again" | null }) {
  return (
    <span className="relative flex">
      <Icon name={icon} size={20} strokeWidth={1.5} />
      {count != null && count > 0 && (
        <span
          aria-hidden="true"
          className={cx(
            "absolute -top-1 left-full ml-0.5 font-mono text-[10px] leading-3 font-medium tabular-nums",
            countTone === "red" ? "text-red" : "text-ink",
          )}
        >
          {count}
        </span>
      )}
      {dot && (
        <span
          aria-hidden="true"
          className={cx("absolute -top-0.5 -right-0.5 size-1.5 rounded-full", dot === "again" ? "bg-again" : "bg-muted")}
        />
      )}
    </span>
  );
}

function RailLink({
  href,
  icon,
  label,
  active,
  count,
  ariaLabel,
}: {
  href: string;
  icon: IconName;
  label: string;
  active: boolean;
  count?: number | null;
  ariaLabel?: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      aria-label={ariaLabel}
      className={cx(itemClass, "h-16", active ? "font-semibold" : "font-medium")}
    >
      {active && <ActiveBar edge="rail" />}
      <PendingTick edge="rail" />
      <RailIcon icon={icon} count={count} />
      <span>{label}</span>
    </Link>
  );
}

function InboxLink({ count, active }: { count: number | null; active: boolean }) {
  const drop = useThemeDrop({ id: null, name: INBOX_NAME });
  return (
    <Link
      href={themeHref(null)}
      aria-current={active ? "page" : undefined}
      aria-label={count == null ? INBOX_NAME : `${INBOX_NAME}, ${nWords(count)}`}
      data-theme-target="inbox"
      {...drop.dropProps}
      className={cx(itemClass, "isolate h-16", active ? "font-semibold" : "font-medium", dropClasses(drop.dragging, drop.over))}
    >
      <DropLight />
      {active && <ActiveBar edge="rail" />}
      <PendingTick edge="rail" />
      {drop.over ? (
        <span className="flex h-5 items-center font-mono text-[12px] text-ink">+{drop.count || ""}</span>
      ) : (
        <RailIcon icon="inbox" count={count} countTone="red" />
      )}
      <span>{INBOX_NAME}</span>
    </Link>
  );
}

function SettingsLink({ active, dot = null, status }: { active: boolean; dot?: "muted" | "again" | null; status?: string }) {
  return (
    <Link
      href="/settings"
      aria-current={active ? "page" : undefined}
      aria-label={dot && status ? `Настройки. ${status}` : undefined}
      className={cx(itemClass, "h-12", active ? "font-semibold" : "font-medium")}
    >
      {active && <ActiveBar edge="rail" />}
      <PendingTick edge="rail" />
      <RailIcon icon="gear" dot={dot} />
      <span>Настройки</span>
    </Link>
  );
}

/** «Настройки» with a 6px dot over the gear for «нет сети» / «ошибка» (nothing at rest). */
function SyncedSettingsLink({ active }: { active: boolean }) {
  const { line } = useSidebarSyncLine();
  return <SettingsLink active={active} dot={line?.dot} status={line ? [line.text, line.detail].filter(Boolean).join(". ") : undefined} />;
}

function RailView({ data, active }: { data: ShellData | undefined; active: NavKey | null }) {
  const addSheet = useAddSheetActions();
  const shortcuts = useShortcutsEnabled();
  const layout = useLayoutClass();
  const library = active === "library" || !!active?.startsWith("theme:");
  const unplayed = useUnplayedSets();

  return (
    <nav
      data-shell-nav=""
      aria-label="Разделы"
      className="sticky top-0 hidden h-dvh w-[72px] shrink-0 flex-col overflow-y-auto border-r border-rule bg-paper pt-[calc(16px+var(--safe-top))] pb-3 md:flex xl:hidden"
    >
      <div className="flex h-5 shrink-0 justify-center">
        <CardGlyph size="rail" />
      </div>
      <button
        type="button"
        aria-label="Добавить слово"
        title={shortcuts ? "Добавить слово (N)" : "Добавить слово"}
        aria-haspopup="dialog"
        aria-keyshortcuts={shortcuts ? "N" : undefined}
        onClick={() => addSheet.open()}
        className="group mx-auto mt-3.5 -mb-0.5 flex size-11 shrink-0 items-center justify-center rounded-btn bg-transparent text-ink"
      >
        <span className="hover-fade flex size-10 items-center justify-center rounded-btn border border-boundary pointer-fine:group-hover:bg-hover">
          <Icon name="plus" size={20} strokeWidth={1.5} />
        </span>
      </button>

      <div className="mt-6 flex shrink-0 flex-col">
        <RailLink
          href="/"
          icon="cards"
          label="Повторение"
          active={active === "review"}
          count={data?.due ?? null}
          ariaLabel={data?.due ? `Повторение, ${data.due} к повторению` : undefined}
        />
        <RailLink
          href="/exercises"
          icon="exercise"
          label="Упражнения"
          active={active === "exercises"}
          count={unplayed ?? null}
          ariaLabel={unplayed ? `Упражнения, ${unplayedLabel(unplayed)}` : undefined}
        />
        <RailLink href="/library" icon="library" label="Библиотека" active={library} />
        <RailLink href="/progress" icon="chart" label="Прогресс" active={active === "progress"} />
        <RailLink href="/context" icon="search" label="Контекст" active={active === "context"} />
        <RailLink href="/import" icon="image" label="Импорт" active={active === "import"} />
        <InboxLink count={data?.inbox.count ?? null} active={active === "inbox"} />
      </div>

      <div className="mt-auto flex shrink-0 flex-col pt-4">
        {layout === "medium" ? <SyncedSettingsLink active={active === "settings"} /> : <SettingsLink active={active === "settings"} />}
      </div>
    </nav>
  );
}

function RoutedRail({ data }: { data: ShellData | undefined }) {
  const pathname = usePathname();
  return <RailView data={data} active={navKeyForPath(pathname)} />;
}

/** Rail 72px for 768–1199: «Добавить», Повторение / Упражнения / Библиотека / Прогресс / Контекст / Импорт / Входящие, «Настройки». */
export function Rail({ data }: { data: ShellData | undefined }) {
  return (
    <Suspense fallback={<RailView data={data} active={null} />}>
      <RoutedRail data={data} />
    </Suspense>
  );
}
