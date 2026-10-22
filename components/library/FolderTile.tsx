"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/Icons";
import type { FolderStats, FolderWithStats } from "@/lib/folders";
import { folderHref, nWords } from "./format";
import { useLongPress } from "./use-long-press";

const TILE = "relative flex flex-col overflow-hidden rounded-card px-3 pt-[15px] pb-3 text-ink no-underline";

/**
 * Card-catalog drawer label: 3px band in the theme ink, name, counts and a mastery line.
 * `samples`: also preview the theme's newest words (the phone library). `onLongPress`: a held
 * finger (or the context-menu key) opens the theme's actions instead of the theme.
 */
export function FolderTile({
  folder,
  samples = false,
  onLongPress,
}: {
  folder: FolderWithStats;
  samples?: boolean;
  onLongPress?: () => void;
}) {
  const { total, due, mastery } = folder.stats;
  const pct = Math.round(mastery * 100);
  const preview = samples ? folder.stats.samples : [];
  const longPress = useLongPress(() => onLongPress?.());
  return (
    <Link
      href={folderHref(folder.id)}
      aria-label={`${folder.name}: ${nWords(total)}${due ? `, ${due} к повторению` : ""}, выучено ${pct} %`}
      {...(onLongPress ? longPress : {})}
      className={`${TILE} ${samples ? "h-[116px]" : "h-24"} border border-rule bg-surface select-none active:bg-surface-2 [-webkit-touch-callout:none]`}
    >
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px]" style={{ background: folder.color }} />
      <span className="truncate font-serif text-[19px] leading-6 font-medium">{folder.name}</span>
      <span className="meta mt-1">
        {total}
        {due > 0 && (
          <>
            {" · "}
            <span className="text-ink">{due} к повт.</span>
          </>
        )}
      </span>
      {samples && (
        <span lang="fr" aria-hidden="true" className="mt-1.5 truncate font-serif text-[14px] leading-[18px] text-muted italic">
          {preview.length > 0 ? preview.join(", ") : "пока пусто"}
        </span>
      )}
      <span aria-hidden="true" className="mt-auto block h-0.5 bg-surface-2">
        <span className="block h-0.5" style={{ width: `${pct}%`, background: folder.color }} />
      </span>
    </Link>
  );
}

/** «Входящие»: unsorted tray, dashed, count in red ink. */
export function InboxTile({ stats }: { stats: FolderStats }) {
  return (
    <Link
      href={folderHref(null)}
      aria-label={`Входящие: ${nWords(stats.total)} без темы, нужно разобрать`}
      className={`${TILE} h-24 border border-dashed border-muted bg-transparent active:bg-surface-2`}
    >
      <span className="font-serif text-[19px] leading-6 font-medium">Входящие</span>
      <span className="meta mt-1 font-medium text-red">{stats.total} без темы</span>
      <span className="mt-auto text-[12px] leading-4 text-muted">нужно разобрать</span>
    </Link>
  );
}

export function NewFolderTile({ onClick, tall = false }: { onClick: () => void; tall?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex ${tall ? "h-[116px]" : "h-24"} items-center justify-center gap-2 rounded-card border border-dashed border-muted bg-transparent px-3 text-[13px] text-muted active:bg-surface-2`}
    >
      <Icon name="plus" size={16} />
      Новая тема
    </button>
  );
}

export function TileSkeleton({ tall = false }: { tall?: boolean }) {
  return <div aria-hidden="true" className={`${tall ? "h-[116px]" : "h-24"} rounded-card border border-rule bg-surface`} />;
}
