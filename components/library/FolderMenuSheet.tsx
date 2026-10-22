"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icons";
import { Sheet, SheetCloseButton, SheetTitle } from "@/components/ui/Sheet";
import { Toggle } from "@/components/ui/Toggle";
import { updateFolder } from "@/lib/folders";
import { getSessionCounts } from "@/lib/session";
import type { Folder } from "@/lib/types";
import { folderHref, reviewHref } from "./format";

const ROW = "flex h-[52px] items-center gap-3 border-t border-rule bg-transparent text-left text-[15px] no-underline active:bg-surface-2";

export interface FolderMenuSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folder: Folder;
  /** Also offer «Открыть тему» and «Повторить тему» (the library's long-press menu). */
  navigation?: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

/**
 * Actions on a theme: open and review it (from the library), edit, pin, delete. The theme screen
 * opens it from «⋯», the phone library from a long press on the theme tile.
 */
export function FolderMenuSheet({ open, onOpenChange, folder, navigation = false, onEdit, onDelete }: FolderMenuSheetProps) {
  const lockLabelId = `lock-${folder.id}`;
  const cards = useLiveQuery(async () => {
    if (!open || !navigation) return null;
    const c = await getSessionCounts({ folderId: folder.id });
    return c.due + c.new;
  }, [open, navigation, folder.id]);
  return (
    <Sheet open={open} onOpenChange={onOpenChange} description="Действия с темой">
      <div className="flex h-11 items-center justify-between pr-1 pl-4">
        <SheetTitle className="min-w-0 truncate">{folder.name}</SheetTitle>
        <SheetCloseButton />
      </div>
      <div className="mt-2 flex flex-col px-4 pb-4">
        {navigation && (
          <>
            <Link href={folderHref(folder.id)} onClick={() => onOpenChange(false)} className={cx(ROW, "text-ink")}>
              <Icon name="chevron-right" size={18} />
              Открыть тему
            </Link>
            {cards ? (
              <Link href={reviewHref(folder.id)} onClick={() => onOpenChange(false)} className={cx(ROW, "text-ink")}>
                <Icon name="cards" size={18} />
                <span className="flex-1">Повторить тему</span>
                <span className="font-mono text-[13px] tracking-[.04em] text-muted">{cards}</span>
              </Link>
            ) : (
              <p className={cx(ROW, "m-0 text-muted active:bg-transparent")}>
                <Icon name="cards" size={18} />
                <span className="flex-1">Повторить тему</span>
                <span className="text-[12px]">{cards === 0 ? "нечего повторять" : ""}</span>
              </p>
            )}
          </>
        )}
        <button type="button" onClick={onEdit} className={cx(ROW, "text-ink")}>
          <Icon name="pencil" size={18} />
          Название, описание и цвет
        </button>
        <div className="flex items-center gap-3 border-t border-rule py-1.5">
          <span className="flex min-w-0 flex-1 flex-col">
            <span id={lockLabelId} className="text-[15px] leading-5">
              Закрепить тему
            </span>
            <span className="text-[12px] leading-4 text-muted">
              Раскладка по темам не переименует её и не будет забирать из неё слова.
            </span>
          </span>
          <Toggle
            checked={folder.locked}
            onCheckedChange={(locked) => void updateFolder(folder.id, { locked })}
            aria-labelledby={lockLabelId}
          />
        </div>
        <button type="button" onClick={onDelete} className={cx(ROW, "font-medium text-again")}>
          <Icon name="trash" size={18} />
          Удалить тему
        </button>
        <p className="m-0 text-[12px] leading-4 text-muted">Слова из удалённой темы попадут во «Входящие».</p>
      </div>
    </Sheet>
  );
}
