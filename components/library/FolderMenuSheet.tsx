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
import { folderHref, nWords, practiceHref, reviewHref } from "./format";
import { THEME_PAUSE_CAPTION, useThemePause } from "./theme-pause";

const ROW = "flex h-[52px] items-center gap-3 border-t border-rule bg-transparent text-left text-[15px] no-underline active:bg-surface-2";

export interface FolderMenuSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folder: Folder;
  /** Also offer «Открыть тему» and «Повторить тему» (the library's long-press menu). */
  navigation?: boolean;
  /** Live words in the theme: «Тренировка всей темы» is offered when there are any. */
  words?: number;
  onEdit: () => void;
  /** «Расформировать»: offered when the theme has words. */
  onDisband?: () => void;
  onDelete: () => void;
}

/**
 * Actions on a theme: open and review it (from the library), practise all of it, edit, pin, pause, disband, delete. The theme screen
 * opens it from «⋯», the phone library from a long press on the theme tile.
 */
export function FolderMenuSheet({ open, onOpenChange, folder, navigation = false, words = 0, onEdit, onDisband, onDelete }: FolderMenuSheetProps) {
  const lockLabelId = `lock-${folder.id}`;
  const pauseLabelId = `pause-${folder.id}`;
  const setPaused = useThemePause();
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
            {!!cards && (
              <Link href={reviewHref(folder.id)} onClick={() => onOpenChange(false)} className={cx(ROW, "text-ink")}>
                <Icon name="cards" size={18} />
                <span className="flex-1">Повторить тему</span>
                <span className="font-mono text-[13px] tracking-[.04em] text-muted">{cards}</span>
              </Link>
            )}
          </>
        )}
        {words > 0 && !folder.muted && (
          <Link
            href={practiceHref(folder.id)}
            onClick={() => onOpenChange(false)}
            aria-label="Тренировка всей темы"
            aria-describedby={`practice-${folder.id}`}
            className={cx(ROW, "h-auto min-h-[52px] py-2 text-ink")}
          >
            <Icon name="refresh" size={18} className="shrink-0" />
            <span className="flex min-w-0 flex-col">
              <span className="leading-5">Тренировка всей темы</span>
              <span id={`practice-${folder.id}`} className="text-[12px] leading-4 text-muted">
                {nWords(words)} вперемешку, не влияет на расписание.
              </span>
            </span>
          </Link>
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
        <div className="flex items-center gap-3 border-t border-rule py-1.5">
          <span className="flex min-w-0 flex-1 flex-col">
            <span id={pauseLabelId} className="text-[15px] leading-5">
              На паузе
            </span>
            <span className="text-[12px] leading-4 text-muted">{THEME_PAUSE_CAPTION}</span>
          </span>
          <Toggle checked={!!folder.muted} onCheckedChange={(muted) => void setPaused(folder, muted)} aria-labelledby={pauseLabelId} />
        </div>
        {onDisband && (
          <button
            type="button"
            onClick={onDisband}
            aria-label="Расформировать"
            aria-describedby={`disband-${folder.id}`}
            className={cx(ROW, "h-auto min-h-[52px] py-2 text-ink")}
          >
            <Icon name="spark" size={18} strokeWidth={1.5} className="shrink-0" />
            <span className="flex min-w-0 flex-col">
              <span className="leading-5">Расформировать</span>
              <span id={`disband-${folder.id}`} className="text-[12px] leading-4 text-muted">
                Удалить тему, а слова разложить по другим темам.
              </span>
            </span>
          </button>
        )}
        <button type="button" onClick={onDelete} className={cx(ROW, "font-medium text-again")}>
          <Icon name="trash" size={18} />
          Удалить тему
        </button>
        <p className="m-0 text-[12px] leading-4 text-muted">Слова из удалённой темы попадут во «Входящие».</p>
      </div>
    </Sheet>
  );
}
