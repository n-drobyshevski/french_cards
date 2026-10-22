import Link from "next/link";
import { Icon } from "@/components/ui/Icons";
import type { FolderStats, FolderWithStats } from "@/lib/folders";
import { folderHref, nWords } from "./format";

const TILE = "relative flex h-24 flex-col overflow-hidden rounded-card px-3 pt-[15px] pb-3 text-ink no-underline";

/** Card-catalog drawer label: 3px band in the theme ink, name, counts and a mastery line. */
export function FolderTile({ folder }: { folder: FolderWithStats }) {
  const { total, due, mastery } = folder.stats;
  const pct = Math.round(mastery * 100);
  return (
    <Link
      href={folderHref(folder.id)}
      aria-label={`${folder.name}: ${nWords(total)}${due ? `, ${due} к повторению` : ""}, выучено ${pct} %`}
      className={`${TILE} border border-rule bg-surface active:bg-surface-2`}
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
      className={`${TILE} border border-dashed border-muted bg-transparent active:bg-surface-2`}
    >
      <span className="font-serif text-[19px] leading-6 font-medium">Входящие</span>
      <span className="meta mt-1 font-medium text-red">{stats.total} без темы</span>
      <span className="mt-auto text-[12px] leading-4 text-muted">нужно разобрать</span>
    </Link>
  );
}

export function NewFolderTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-24 items-center justify-center gap-2 rounded-card border border-dashed border-muted bg-transparent px-3 text-[13px] text-muted active:bg-surface-2"
    >
      <Icon name="plus" size={16} />
      Новая тема
    </button>
  );
}

export function TileSkeleton() {
  return <div aria-hidden="true" className="h-24 rounded-card border border-rule bg-surface" />;
}
