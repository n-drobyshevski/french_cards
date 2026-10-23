"use client";

import Link, { useLinkStatus } from "next/link";
import { useLongPress } from "@/components/library/use-long-press";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icons";
import { SkeletonBar } from "@/components/ui/Skeleton";
import type { ExerciseSet } from "@/lib/types";
import { EXERCISE_PLAY_HREF } from "./exercise-request";
import { nQuestions, shortDate, type TileState } from "./list-format";

const TILE = "relative flex h-[152px] flex-col overflow-hidden rounded-card px-3 pt-[15px] pb-3 text-ink no-underline";

/** The 2px progress line; the ink run while the player's route is still loading (as the theme tiles). */
function ProgressLine({ progress }: { progress: number }) {
  const { pending } = useLinkStatus();
  return (
    <span aria-hidden="true" data-link-pending={pending ? "" : undefined} className="relative mt-2 block h-0.5 overflow-hidden bg-surface-2">
      <span className="block h-0.5 bg-ink" style={{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }} />
      {pending && (
        <span className="link-pending absolute inset-0 bg-surface-2">
          <span className="motion-loop absolute inset-y-0 w-8 bg-ink animate-[ink-run_2000ms_linear_infinite]" />
        </span>
      )}
    </span>
  );
}

export interface SetTileProps {
  set: ExerciseSet;
  state: TileState;
  /** «Люди, Эмоции», «Своя тема · +3 слова». */
  themes: string;
  /** Hand the set to the player (runs before the navigation). */
  onStart: () => void;
  /** Long press, right click or the context-menu key. */
  onMenu: () => void;
}

/**
 * A set as a card-catalog tile (Exercise-List-B): title, «12 ВОПРОСОВ», the themes, the state
 * («НОВЫЙ» in red with a 3px red band, «ПРЕРВАНО 5/8», «7/10») with the date, and a 2px progress
 * line. From 768 up a focused tile (J / K) shows «Начать ↵» in place of the date.
 */
export function SetTile({ set, state, themes, onStart, onMenu }: SetTileProps) {
  const longPress = useLongPress(onMenu);
  const total = set.items.length;
  return (
    <Link
      href={EXERCISE_PLAY_HREF}
      data-set-tile={set.id}
      onClick={onStart}
      {...longPress}
      aria-label={`${set.title}: ${nQuestions(total)}, ${themes}. ${state.label}`}
      className={cx(
        TILE,
        "group border border-rule bg-surface select-none [-webkit-touch-callout:none] active:bg-surface-2 has-[[data-link-pending]]:bg-surface-2",
        "outline-none focus-visible:shadow-[0_0_0_2px_var(--paper),0_0_0_4px_var(--ink)]",
      )}
    >
      {state.fresh && <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px] bg-red" />}
      <span className="line-clamp-2 min-h-12 font-serif text-[19px] leading-6 font-medium">{set.title}</span>
      <span className="meta mt-1.5 leading-4 tabular-nums">{nQuestions(total)}</span>
      <span className="meta truncate leading-4">{themes}</span>
      <span className="meta mt-auto flex items-baseline justify-between gap-2 leading-4 tabular-nums">
        <span className={cx("font-medium whitespace-nowrap", state.tone === "new" ? "text-red" : "text-ink")}>{state.label}</span>
        <span className="md:group-focus-visible:hidden">{shortDate(set.created_at)}</span>
        <span
          aria-hidden="true"
          className="-my-2 hidden h-8 items-center gap-1.5 rounded-btn bg-ink px-2.5 font-sans text-[13px] font-medium tracking-normal text-on-ink normal-case md:group-focus-visible:inline-flex"
        >
          Начать
          <span className="inline-flex h-[18px] items-center rounded-[3px] border border-on-ink/40 px-1 font-mono text-[11px]">↵</span>
        </span>
      </span>
      <ProgressLine progress={state.progress} />
    </Link>
  );
}

/** The dashed last cell: «+ Попросить набор · в чате Claude» (desktop with the panel: «· справа»). */
export function RequestTile({ onClick, side = false }: { onClick: () => void; side?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[152px] flex-col items-center justify-center gap-2 rounded-card border border-dashed border-boundary bg-transparent p-3 text-center text-ink active:bg-surface-2 hoverable:bg-hover-surface"
    >
      <Icon name="plus" size={20} strokeWidth={1.5} />
      <span className="text-[15px] leading-5 font-medium">Попросить набор</span>
      <span className="meta leading-4">{side ? "в чате Claude · справа" : "в чате Claude"}</span>
    </button>
  );
}

/** A tile's frame with flat bars: the set on its way from the chat, or the first read. */
export function SetTileSkeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cx(TILE, "border border-rule bg-surface", className)}>
      <SkeletonBar width="78%" className="mt-2" />
      <SkeletonBar width="52%" className="mt-2.5" />
      <SkeletonBar width="44%" height={6} className="mt-[18px]" />
      <SkeletonBar width="60%" height={6} className="mt-2" />
      <span className="mt-auto block h-0.5 bg-surface-2" />
    </div>
  );
}
