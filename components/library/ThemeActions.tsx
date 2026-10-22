"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteFolder, getFolder, getFolderStats, listFolders, restoreFolder, updateFolder } from "@/lib/folders";
import { getSessionCounts } from "@/lib/session";
import type { Folder } from "@/lib/types";
import { DisbandSheet, disbandMessage } from "./DisbandSheet";
import { FolderFormSheet } from "./FolderFormSheet";
import { folderHref, nWords, practiceHref, reviewHref } from "./format";
import { Menu, MenuCheckboxItem, MenuItem, MenuSeparator, type MenuAnchor } from "./Menu";
import { THEME_PAUSE_CAPTION, useThemePause } from "./theme-pause";
import { useUndoSnackbar } from "./undo";

// Desktop actions on a theme — the phone's FolderMenuSheet as a menu (DESKTOP-SPEC §3 «menu»):
// the theme page's «⋯» and a right click / long press on a sidebar theme show the same items.

export interface ThemeMenuItemsProps {
  folder: Folder;
  /** Live words in the theme: practice and «Расформировать» are offered when there are any. */
  words: number;
  /** «Открыть тему» and «Повторить тему N» (from the sidebar; the theme page shows those itself). */
  navigation?: boolean;
  /** Cards to review now (navigation only). */
  cards?: number | null;
  onNavigate: (href: string) => void;
  onEdit: () => void;
  onDisband: () => void;
  onDelete: () => void;
}

/** The items of a theme's menu, inside a <Menu>. */
export function ThemeMenuItems({ folder, words, navigation = false, cards, onNavigate, onEdit, onDisband, onDelete }: ThemeMenuItemsProps) {
  const setPaused = useThemePause();
  return (
    <>
      {navigation && (
        <>
          <MenuItem icon="chevron-right" onSelect={() => onNavigate(folderHref(folder.id))}>
            Открыть тему
          </MenuItem>
          {!!cards && (
            <MenuItem icon="cards" trail={<span className="font-mono text-[12px] text-muted tabular-nums">{cards}</span>} onSelect={() => onNavigate(reviewHref(folder.id))}>
              Повторить тему
            </MenuItem>
          )}
        </>
      )}
      {words > 0 && !folder.muted && (
        <MenuItem icon="refresh" caption={`${nWords(words)} вперемешку, не влияет на расписание.`} onSelect={() => onNavigate(practiceHref(folder.id))}>
          Тренировка всей темы
        </MenuItem>
      )}
      <MenuItem icon="pencil" shortcut={navigation ? undefined : "F2"} onSelect={onEdit}>
        Название, описание и цвет
      </MenuItem>
      <MenuCheckboxItem
        checked={folder.locked}
        onCheckedChange={(locked) => void updateFolder(folder.id, { locked })}
        caption="Раскладка по темам не переименует её и не будет забирать из неё слова."
      >
        Закрепить тему
      </MenuCheckboxItem>
      <MenuCheckboxItem checked={!!folder.muted} onCheckedChange={(muted) => void setPaused(folder, muted)} caption={THEME_PAUSE_CAPTION}>
        На паузе
      </MenuCheckboxItem>
      <MenuSeparator />
      {words > 0 && (
        <MenuItem icon="spark" caption="Удалить тему, а слова разложить по другим темам." onSelect={onDisband}>
          Расформировать…
        </MenuItem>
      )}
      <MenuItem icon="trash" danger caption="Слова из удалённой темы попадут во «Входящие»." onSelect={onDelete}>
        Удалить тему
      </MenuItem>
    </>
  );
}

export interface ThemeActionsTarget {
  folderId: string;
  anchor: MenuAnchor;
}

/**
 * A theme's menu with its own dialogs («Название, описание и цвет», «Расформировать») and the
 * delete undo, for places outside the theme page (the sidebar). Leaving a theme that is removed
 * goes to «Библиотека» only when its page is open.
 */
export function ThemeActions({ target, onClose }: { target: ThemeActionsTarget | null; onClose: () => void }) {
  const router = useRouter();
  const showUndo = useUndoSnackbar();
  // The dialogs outlive the menu: keep the theme of the last menu.
  const [folderId, setFolderId] = useState<string | null>(null);
  if (target && target.folderId !== folderId) setFolderId(target.folderId);
  const [editing, setEditing] = useState(false);
  const [disbanding, setDisbanding] = useState(false);
  const open = !!target;

  const folder = useLiveQuery(async () => (folderId ? ((await getFolder(folderId)) ?? null) : null), [folderId]);
  const otherColors = useLiveQuery(async () => (await listFolders()).filter((f) => f.id !== folderId).map((f) => f.color), [folderId]);
  const counts = useLiveQuery(async () => {
    if (!folderId || !open) return null;
    const [stats, session] = await Promise.all([getFolderStats(folderId), getSessionCounts({ folderId })]);
    return { words: stats.total, cards: session.due + session.new };
  }, [folderId, open]);

  // Read at the time of the action (the shell renders outside <Suspense>, so no usePathname here).
  const leaveIfOpen = (f: Folder) => {
    if (window.location.pathname === folderHref(f.id)) router.push("/library");
  };
  const remove = async (f: Folder) => {
    const moves = await deleteFolder(f.id);
    leaveIfOpen(f);
    showUndo({
      message: moves.length ? `Тема «${f.name}» удалена · ${nWords(moves.length)} во «Входящих»` : `Тема «${f.name}» удалена`,
      undo: () => void restoreFolder(f.id, moves),
    });
  };

  return (
    <>
      {folder && (
        <Menu open={open} anchor={target?.anchor ?? null} onClose={onClose} label={`Действия с темой «${folder.name}»`} width={320} exactWidth>
          <ThemeMenuItems
            folder={folder}
            words={counts?.words ?? 0}
            navigation
            cards={counts?.cards}
            onNavigate={(href) => router.push(href)}
            onEdit={() => setEditing(true)}
            onDisband={() => setDisbanding(true)}
            onDelete={() => void remove(folder)}
          />
        </Menu>
      )}
      {folder && (
        <FolderFormSheet open={editing} onOpenChange={setEditing} folder={folder} usedColors={otherColors} />
      )}
      {folder && (
        <DisbandSheet
          open={disbanding}
          onOpenChange={setDisbanding}
          folder={folder}
          onDisbanded={(moves) => {
            leaveIfOpen(folder);
            showUndo({ message: disbandMessage(folder.name, moves), undo: () => void restoreFolder(folder.id, moves) });
          }}
        />
      )}
    </>
  );
}
