"use client";

import Link, { useLinkStatus } from "next/link";
import { ViewTransition, type ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icons";
import { SKELETON_WIDTHS, SkeletonBar } from "@/components/ui/Skeleton";
import type { FolderWithStats } from "@/lib/folders";
import { folderHref, nWords } from "./format";
import { NAV_FORWARD, THEME_MORPH, themeMorphName } from "./NavSlide";
import { useLongPress } from "./use-long-press";

/** One ruled row of the phone library: 52px including its hairline (mockups/L-Library-B). */
export const DRAWER_ROW = "relative flex h-[52px] shrink-0 items-center gap-2.5 text-ink no-underline";

/** «01»: the drawer's place in the table of contents. */
export const drawerNumber = (index: number) => String(index + 1).padStart(2, "0");

/**
 * The row's hairline is its mastery line: the 1px rule, and over it a 2px run in the theme ink up
 * to the learned share. `draw`: the run draws to its value (left → right, --dur-rule-draw, linear),
 * once per visit. While the theme's route is still loading (L6, §3.1) the row holds its pressed tint
 * (`data-link-pending`, at once) and, after --link-pending-delay, the line becomes the ink run: a
 * 32px ink segment crossing the rule (a still mark under reduced motion).
 */
function MasteryLine({ id, pct, color, draw }: { id: string; pct: number; color: string; draw: boolean }) {
  const { pending } = useLinkStatus();
  return (
    <ViewTransition name={themeMorphName("line", id)} share={THEME_MORPH} default="none">
      <span aria-hidden="true" data-link-pending={pending ? "" : undefined} className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden">
        <span className="absolute inset-x-0 bottom-0 h-px bg-rule" />
        {pct > 0 && (
          <span
            className={cx("absolute bottom-0 left-0 h-0.5 origin-left", draw && "animate-[rule-draw_var(--dur-rule-draw)_linear_120ms_both]")}
            style={{ width: `${pct}%`, background: color }}
          />
        )}
        {pending && (
          <span className="link-pending absolute inset-0 bg-rule">
            <span className="motion-loop absolute inset-y-0 w-8 animate-[ink-run_2000ms_linear_infinite] bg-ink" />
          </span>
        )}
      </span>
    </ViewTransition>
  );
}

/**
 * A theme as a card-catalogue drawer (D2 B): a 3×14 tick in the theme ink (a tick, not a left
 * border), the mono course number, the name in Newsreader 19 and the word count; a red ▪ before the
 * count when something is due. «На паузе»: the name goes muted and the label takes the count's place.
 * A held finger (or the context-menu key) opens the theme's actions instead of the theme; the theme
 * page's «⋯» is the visible way to the same sheet. A theme without words shows no number.
 */
export function DrawerRow({
  folder,
  index,
  draw = false,
  onLongPress,
}: {
  folder: FolderWithStats;
  index: number;
  /** Draw the mastery line in (the first view this visit). */
  draw?: boolean;
  onLongPress?: () => void;
}) {
  const { total, due, mastery } = folder.stats;
  const paused = !!folder.muted;
  const pct = Math.round(mastery * 100);
  const longPress = useLongPress(() => onLongPress?.());
  return (
    <Link
      href={folderHref(folder.id)}
      transitionTypes={NAV_FORWARD}
      aria-label={`${folder.name}: ${nWords(total)}${paused ? ", на паузе" : due ? `, ${due} к повторению` : ""}, выучено ${pct} %`}
      {...(onLongPress ? longPress : {})}
      className={cx(DRAWER_ROW, "select-none active:bg-surface-2 has-[[data-link-pending]]:bg-surface-2 [-webkit-touch-callout:none]")}
    >
      <span aria-hidden="true" className="h-3.5 w-[3px] shrink-0" style={{ background: folder.color }} />
      <span aria-hidden="true" className="min-w-5 shrink-0 font-mono text-[12px] leading-4 tracking-[.02em] text-muted tabular-nums">
        {drawerNumber(index)}
      </span>
      <span className={cx("flex min-w-0 flex-1 font-serif text-[19px] leading-6 font-medium", paused && "text-muted")}>
        {/* Hugs the text, so the morph into the page title scales the words, not a row-wide box. */}
        <ViewTransition name={themeMorphName("name", folder.id)} share={THEME_MORPH} default="none">
          <span className="min-w-0 max-w-full truncate">{folder.name}</span>
        </ViewTransition>
      </span>
      <span aria-hidden="true" className="flex min-w-10 shrink-0 items-center justify-end gap-2 font-mono text-[12px] leading-4 text-muted tabular-nums">
        {paused ? (
          <span className="text-[11px] tracking-[.06em] uppercase">на паузе</span>
        ) : (
          <>
            {due > 0 && <span className="size-1.5 shrink-0 bg-red" />}
            {total > 0 && total}
          </>
        )}
      </span>
      <MasteryLine id={folder.id} pct={pct} color={folder.color} draw={draw} />
    </Link>
  );
}

/** A plain ruled row of the drawer list («Все слова»): name, mono count, ›. */
export function PlainRow({ label, count, ariaLabel, onClick }: { label: ReactNode; count?: number; ariaLabel: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className={cx(DRAWER_ROW, "w-full border-b border-rule bg-transparent text-left active:bg-surface-2")}
    >
      <span className="min-w-0 flex-1 truncate font-serif text-[19px] leading-6 font-medium">{label}</span>
      {count !== undefined && count > 0 && <span className="font-mono text-[12px] leading-4 text-muted tabular-nums">{count}</span>}
      <Icon name="chevron-right" size={16} className="-mr-0.5 shrink-0 text-muted" />
    </button>
  );
}

/** «+ Новая тема»: a 44px dashed row after the last drawer (dashed: not yet on record). */
export function NewDrawerRow({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 shrink-0 items-center gap-2 border-b border-dashed border-rule-dashed bg-transparent text-left text-[14px] leading-5 text-muted active:bg-surface-2"
    >
      <Icon name="plus" size={16} className="shrink-0" />
      Новая тема
    </button>
  );
}

/** A drawer row's frame with flat bars for its number, name and count (MOTION-SPEC §3.3: static). */
export function DrawerSkeleton({ index = 0, className }: { index?: number; className?: string }) {
  const [a] = SKELETON_WIDTHS[index % SKELETON_WIDTHS.length];
  return (
    <div aria-hidden="true" className={cx(DRAWER_ROW, "border-b border-rule", className)}>
      <span className="h-3.5 w-[3px] shrink-0 bg-surface-2" />
      <SkeletonBar width={14} height={6} />
      <SkeletonBar width={a + 48} />
      <span className="flex-1" />
      <SkeletonBar width={16} height={6} />
    </div>
  );
}
