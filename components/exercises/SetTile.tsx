"use client";

import Link, { useLinkStatus } from "next/link";
import { useLongPress } from "@/components/library/use-long-press";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icons";
import { SessionStrip } from "@/components/ui/SessionStrip";
import { SkeletonBar } from "@/components/ui/Skeleton";
import { setLevelLabel } from "@/lib/core/exercises";
import type { ExerciseSet } from "@/lib/types";
import { EXERCISE_PLAY_HREF } from "./exercise-request";
import {
  nQuestions,
  plural,
  shortDate,
  type TileLines,
  type TileState,
} from "./list-format";
import { CopyGlyph } from "./RequestBuilder";

const TILE =
  "relative flex h-[152px] flex-col overflow-hidden rounded-card px-3 pt-[15px] pb-3 text-ink no-underline max-md:h-[156px] max-md:pt-4";

/** The 2px progress line; the ink run while the player's route is still loading (as the theme tiles). */
function ProgressLine({
  progress,
  className,
}: {
  progress: number;
  className?: string;
}) {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden="true"
      data-link-pending={pending ? "" : undefined}
      className={cx(
        "relative mt-2 block h-0.5 overflow-hidden bg-surface-2",
        className,
      )}
    >
      <span className="block h-0.5 bg-ink" style={{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }} />
      {pending && (
        <span className="link-pending absolute inset-0 bg-surface-2">
          <span className="motion-loop absolute inset-y-0 w-8 bg-ink animate-[ink-run_2000ms_linear_infinite]" />
        </span>
      )}
    </span>
  );
}

/** Phones: no progress line; only the ink run along the bottom edge while the player's route loads. */
function PendingLine({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      aria-hidden="true"
      data-link-pending=""
      className={cx(
        "link-pending absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-surface-2",
        className,
      )}
    >
      <span className="motion-loop absolute inset-y-0 w-8 bg-ink animate-[ink-run_2000ms_linear_infinite]" />
    </span>
  );
}

export interface SetTileProps {
  set: ExerciseSet;
  state: TileState;
  /** «Люди, Эмоции», «Своя тема · +3 слова». */
  themes: string;
  /** Phones (E1 A): the italic line and the name's middle (tileLines). */
  lines: TileLines;
  /** Below 768: the tile's name follows the phone tile (from useMediaQuery; the look is CSS). */
  phone: boolean;
  /** Hand the set to the player (runs before the navigation). */
  onStart: () => void;
  /** Long press, right click or the context-menu key. */
  onMenu: () => void;
}

/**
 * A set as a card-catalog tile (Exercise-List-B): title, «12 ВОПРОСОВ», the themes, the state
 * («НОВЫЙ» in red with a 3px red band, «ПРЕРВАНО 5/8», «7/10») with the date, and a 2px progress
 * line. Phones (E1 A, X-List-A): only what is needed — the title in Newsreader 20, the kind and
 * the themes in italics (left out when the title says them), then «8 ВОПРОСОВ» under a set not played
 * yet (with the red band), or the last run's ticks and «7/8». From 768 up a focused tile (J / K)
 * shows «Начать ↵» in place of the date.
 */
export function SetTile({
  set,
  state,
  themes,
  lines,
  phone,
  onStart,
  onMenu,
}: SetTileProps) {
  const longPress = useLongPress(onMenu);
  const total = set.items.length;
  // «12 ВОПРОСОВ · B1» (pick L2 A; «≈B1» when the level came from «Авто»).
  const level = setLevelLabel(set);
  const count = level ? `${nQuestions(total)} · ${level}` : nQuestions(total);
  return (
    <Link
      href={EXERCISE_PLAY_HREF}
      data-set-tile={set.id}
      onClick={onStart}
      {...longPress}
      aria-label={
        phone
          ? `${set.title}: ${lines.spoken}. ${state.said}`
          : `${set.title}: ${nQuestions(total)}${level ? `, уровень ${level.replace("≈", "примерно ")}` : ""}, ${themes}. ${state.label}`
      }
      className={cx(
        TILE,
        "group border border-rule bg-surface select-none [-webkit-touch-callout:none] active:bg-surface-2 has-[[data-link-pending]]:bg-surface-2",
        "outline-none focus-visible:shadow-[0_0_0_2px_var(--paper),0_0_0_4px_var(--ink)]",
      )}
    >
      {state.fresh && (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-[3px] bg-red"
        />
      )}
      {/* Phones (E1 A): the title, the italic kind and themes, then the size or the last run. */}
      <span
        className={cx(
          "font-serif text-[20px] leading-6 font-medium tracking-[-0.01em] [text-wrap:balance] md:hidden",
          lines.text ? "line-clamp-2" : "line-clamp-4",
        )}
      >
        {set.title}
      </span>
      {lines.text && (
        <span className="mt-1 line-clamp-2 font-serif text-[15px] leading-[19px] text-muted italic md:hidden">
          {lines.text}
        </span>
      )}
      {state.marks.length > 0 ? (
        <span className="mt-auto flex h-4 shrink-0 items-center gap-2.5 md:hidden">
          <SessionStrip
            size="ticks"
            marks={state.marks}
            label={false}
            className="flex-1"
          />
          <span className="shrink-0 font-mono text-[12px] leading-4 font-medium tracking-[.04em] tabular-nums">
            {state.short}
          </span>
        </span>
      ) : (
        <span className="meta mt-auto shrink-0 leading-4 tabular-nums md:hidden">
          {count}
        </span>
      )}
      <PendingLine className="md:hidden" />

      <span className="line-clamp-2 min-h-12 font-serif text-[19px] leading-6 font-medium max-md:hidden">{set.title}</span>
      <span className="meta mt-1.5 leading-4 tabular-nums max-md:hidden">{count}</span>
      <span className="meta truncate leading-4 max-md:hidden">{themes}</span>
      <span className="meta mt-auto flex items-baseline justify-between gap-2 leading-4 tabular-nums max-md:hidden">
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
      <ProgressLine progress={state.progress} className="max-md:hidden" />
    </Link>
  );
}

/** The dashed last cell: «+ Попросить набор · в чате Claude» (desktop with the panel: «· справа»). */
export function RequestTile({ onClick, side = false, className }: { onClick: () => void; side?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(className, "flex h-[152px] flex-col items-center justify-center gap-2 rounded-card border border-dashed border-boundary bg-transparent p-3 text-center text-ink active:bg-surface-2 hoverable:bg-hover-surface")}
    >
      <Icon name="plus" size={20} strokeWidth={1.5} />
      <span className="text-[15px] leading-5 font-medium">Попросить набор</span>
      <span className="meta leading-4">{side ? "в чате Claude · справа" : "в чате Claude"}</span>
    </button>
  );
}

/**
 * Phones (E1 A): the grid's last cell, where the set will appear — «+ Новый набор · Claude напишет
 * его в чате», dashed; opens the request sheet. Replaces the header's «Попросить набор» on phones.
 */
export function NewSetTile({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-new-set-tile=""
      aria-label="Новый набор: Claude напишет его в чате. Выбрать темы"
      className={cx(
        "flex h-[156px] flex-col items-center justify-center gap-1.5 rounded-card border border-dashed border-boundary bg-transparent p-3 text-center text-ink active:bg-surface-2",
        className,
      )}
    >
      <Icon name="plus" size={20} strokeWidth={1.5} />
      <span className="text-[15px] leading-5 font-medium">Новый набор</span>
      <span className="text-[12px] leading-4 text-muted">
        Claude напишет его
        <br />в чате
      </span>
    </button>
  );
}

const SCOPE_TILE_TITLES = {
  difficult: "Трудные слова",
  due: "К повторению",
} as const;

/**
 * A ready-made request (Exercise-S-Quick-Tiles): «Трудные слова» / «К повторению», «9 слов · из всех
 * тем», dashed like «+ Попросить набор». A tap copies the request for that scope; nothing is sent.
 */
export function ScopeTile({
  scope,
  count,
  onClick,
  className,
}: {
  scope: keyof typeof SCOPE_TILE_TITLES;
  count: number;
  onClick: () => void;
  className?: string;
}) {
  const title = SCOPE_TILE_TITLES[scope];
  const words = `${count} ${plural(count, ["слово", "слова", "слов"])}`;
  return (
    <button
      type="button"
      onClick={onClick}
      data-scope-tile={scope}
      aria-label={`${title}: ${words} из всех тем. Скопировать запрос для Claude`}
      className={cx(TILE, "border border-dashed border-boundary bg-transparent text-left active:bg-surface-2 hoverable:bg-hover-surface", className)}
    >
      <span className="line-clamp-2 min-h-12 font-serif text-[19px] leading-6 font-medium">{title}</span>
      <span className="meta mt-1.5 leading-4 font-medium text-ink tabular-nums">{words}</span>
      <span className="meta leading-4">из всех тем</span>
      <span className="mt-auto flex h-5 items-center gap-1.5 text-[13px] leading-5 font-medium">
        <CopyGlyph size={16} />
        Запрос для Claude
      </span>
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

/**
 * Phones (proposals «Waiting» B): the set's place at the head of the grid while it is on its way
 * from the chat — the whole waiting state. The ink run moves along its top rule, it says «Ждём из
 * чата», and a tap syncs now (⟳ in its corner). Offline the run stops and it says «Придёт, когда
 * будет сеть» (every set on the device still plays).
 */
export function WaitingTile({
  online,
  refreshing = false,
  onRefresh,
  className,
}: {
  online: boolean;
  refreshing?: boolean;
  onRefresh: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      data-waiting-tile=""
      onClick={onRefresh}
      disabled={!online}
      aria-busy={refreshing || undefined}
      aria-label={online ? "Ждём набор из чата. Обновить" : "Ждём набор из чата: придёт, когда будет сеть"}
      className={cx(TILE, "border border-rule bg-surface text-left active:bg-surface-2 disabled:cursor-default disabled:active:bg-surface", className)}
    >
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-rule">
        {online && <span className="motion-loop absolute inset-y-0 w-8 bg-ink animate-[ink-run_2000ms_linear_infinite]" />}
      </span>
      <span className={cx("meta leading-4", online && "font-medium text-ink")}>{online ? "Ждём из чата" : "Придёт, когда будет сеть"}</span>
      <SkeletonBar width="78%" className="mt-3" />
      <SkeletonBar width="52%" className="mt-2.5" />
      {online && (
        <Icon name="refresh" size={18} strokeWidth={1.5} className={cx("mt-auto self-end text-muted", refreshing && "motion-safe:animate-spin")} />
      )}
    </button>
  );
}
