"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAddSheet } from "@/components/providers/AddSheetContext";
import { bottomBarRef } from "@/components/ui/bottom-clearance";
import { Button, IconButton, buttonClasses } from "@/components/ui/Button";
import { Header } from "@/components/ui/Header";
import { Icon } from "@/components/ui/Icons";
import { Sheet, SheetCloseButton, SheetTitle } from "@/components/ui/Sheet";
import { useSnackbar } from "@/components/ui/Snackbar";
import { Toggle } from "@/components/ui/Toggle";
import { deleteFolder, getFolder, getLibraryStats, restoreFolder, updateFolder } from "@/lib/folders";
import { getSessionCounts } from "@/lib/session";
import type { Folder } from "@/lib/types";
import { useLayoutClass } from "@/lib/use-media";
import { DeskPlaceholder } from "./DeskPlaceholder";
import { FolderFormSheet } from "./FolderFormSheet";
import { LibraryDesk } from "./LibraryDesk";
import { nWords, reviewHref } from "./format";
import { useLibraryWords } from "./useLibraryWords";
import { WordList } from "./WordList";

/** The route segment for «Входящие». */
export const INBOX_SEGMENT = "inbox";

/**
 * /library/[id]: a theme (or «Входящие») with its words, stats and «Повторить тему». Phones get
 * the list below; from 768 up the desktop table (LibraryDesk).
 */
export function FolderScreen({ id }: { id: string }) {
  const layout = useLayoutClass();
  if (layout !== "compact") return <LibraryDesk scope={id === INBOX_SEGMENT ? { kind: "inbox" } : { kind: "folder", id }} />;
  return (
    <>
      <div className="contents md:hidden">
        <PhoneFolder id={id} />
      </div>
      <DeskPlaceholder title={id === INBOX_SEGMENT ? "Входящие" : ""} />
    </>
  );
}

function PhoneFolder({ id }: { id: string }) {
  const folderId = id === INBOX_SEGMENT ? null : id;
  const router = useRouter();
  const snackbar = useSnackbar();
  const addSheet = useAddSheet();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const meta = useLiveQuery(async () => {
    const [folder, lib, counts] = await Promise.all([
      folderId === null ? Promise.resolve(null) : getFolder(folderId),
      getLibraryStats(),
      getSessionCounts({ folderId }),
    ]);
    const stats = folderId === null ? lib.inbox : lib.folders.find((f) => f.id === folderId)?.stats;
    return {
      folder: folder === undefined ? ("missing" as const) : folder,
      stats,
      cards: counts.due + counts.new,
      colors: lib.folders.map((f) => f.color),
    };
  }, [folderId]);
  const words = useLibraryWords(folderId);

  if (meta?.folder === "missing") {
    return (
      <main className="flex flex-1 flex-col">
        <Header eyebrow="Библиотека / тема" back="/library" backLabel="Назад в библиотеку" />
        <div className="flex flex-1 flex-col items-start px-4 pt-6">
          <h1 className="m-0 font-serif text-[28px] leading-9 font-medium">Тема не найдена</h1>
          <p className="m-0 mt-2 text-[15px] leading-[22px] text-muted">Возможно, её удалили на другом устройстве.</p>
          <Link href="/library" className={buttonClasses({ variant: "secondary", className: "mt-6" })}>
            В библиотеку
          </Link>
        </div>
      </main>
    );
  }

  const folder = meta?.folder ?? null;
  const name = folderId === null ? "Входящие" : (folder?.name ?? "");
  const stats = meta?.stats;
  const pct = Math.round((stats?.mastery ?? 0) * 100);
  const items = words?.words;

  const remove = async (f: Folder) => {
    setMenuOpen(false);
    const moves = await deleteFolder(f.id);
    router.push("/library");
    snackbar.show({
      message: moves.length ? `Тема «${f.name}» удалена · ${nWords(moves.length)} во «Входящих»` : `Тема «${f.name}» удалена`,
      actionLabel: "Отменить",
      onAction: () => void restoreFolder(f.id, moves),
    });
  };

  return (
    <main className="flex flex-1 flex-col">
      <Header
        eyebrow="Библиотека / тема"
        back="/library"
        backLabel="Назад в библиотеку"
        actions={
          folder ? (
            <IconButton icon="more" label="Ещё действия с темой" onClick={() => setMenuOpen(true)} />
          ) : undefined
        }
      />

      <div className="flex flex-1 flex-col px-4">
        <div className="mt-2 flex min-h-10 items-center gap-3">
          <h1 className="m-0 min-w-0 font-serif text-[32px] leading-10 font-medium tracking-[-0.015em] break-words">{name}</h1>
          {folder && folder.locked && <span className="meta shrink-0 rounded-chip border border-rule px-1.5 leading-5">закреплена</span>}
        </div>
        <p className="meta m-0 mt-2 min-h-4">
          {stats && (
            <>
              {folderId === null ? `${nWords(stats.total)} без темы` : nWords(stats.total)}
              {stats.due > 0 && (
                <>
                  {" · "}
                  <span className="font-medium text-red">{stats.due} к повторению</span>
                </>
              )}
            </>
          )}
        </p>

        {stats && stats.total > 0 && (
          <div className="mt-3 flex h-4 items-center gap-3">
            <span
              role="progressbar"
              aria-label="Выучено"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              className="block h-0.5 flex-1 bg-rule"
            >
              <span className="block h-0.5" style={{ width: `${pct}%`, background: folder?.color ?? "var(--ink)" }} />
            </span>
            <span className="meta text-ink">{pct} % выучено</span>
          </div>
        )}

        {items && items.length > 0 && words && (
          <>
            <div aria-hidden="true" className="meta mt-6 flex justify-between border-b border-ink pb-2">
              <span>Слово</span>
              <span>Уровень · показ</span>
            </div>
            <WordList items={items} folders={words.folders} label={`Слова темы «${name}»`} />
          </>
        )}

        {items && items.length === 0 && (
          <div className="mt-8 flex flex-col items-start gap-4 border-t border-rule pt-6">
            <p className="m-0 text-[15px] leading-[22px] text-muted">
              {folderId === null ? "Здесь пусто — все слова разложены по темам." : "В этой теме пока нет слов."}
            </p>
            <Button variant="secondary" size="md" icon="plus" onClick={() => addSheet.open()}>
              Добавить слово
            </Button>
          </div>
        )}

        {items === undefined && (
          <div aria-hidden="true" className="mt-6 flex flex-col border-t border-ink">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex h-16 flex-col justify-center gap-2 border-b border-rule">
                <span className="h-3.5 w-32 rounded-[2px] bg-surface-2" />
                <span className="h-2.5 w-20 rounded-[2px] bg-surface-2" />
              </div>
            ))}
          </div>
        )}

        {/* «Повторить тему» stays above the tab bar */}
        {items && items.length > 0 && meta && (
          <div ref={bottomBarRef} className="sticky bottom-(--shell-bottom) z-[2] -mx-4 mt-auto border-t border-rule bg-paper p-4">
            <Link href={reviewHref(folderId)} className={buttonClasses({ block: true })}>
              Повторить тему
              <span className="font-mono text-[13px] tracking-[.04em]">{meta.cards}</span>
            </Link>
          </div>
        )}
      </div>

      {folder && (
        <>
          <FolderMenuSheet
            open={menuOpen}
            onOpenChange={setMenuOpen}
            folder={folder}
            onEdit={() => {
              setMenuOpen(false);
              setEditOpen(true);
            }}
            onDelete={() => void remove(folder)}
          />
          <FolderFormSheet
            open={editOpen}
            onOpenChange={setEditOpen}
            folder={folder}
            usedColors={meta?.colors.filter((c) => c !== folder.color)}
          />
        </>
      )}
    </main>
  );
}

function FolderMenuSheet({
  open,
  onOpenChange,
  folder,
  onEdit,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folder: Folder;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const lockLabelId = `lock-${folder.id}`;
  return (
    <Sheet open={open} onOpenChange={onOpenChange} description="Действия с темой">
      <div className="flex h-11 items-center justify-between pr-1 pl-4">
        <SheetTitle className="min-w-0 truncate">{folder.name}</SheetTitle>
        <SheetCloseButton />
      </div>
      <div className="mt-2 flex flex-col px-4 pb-4">
        <button
          type="button"
          onClick={onEdit}
          className="flex h-[52px] items-center gap-3 border-t border-rule bg-transparent text-left text-[15px] text-ink active:bg-surface-2"
        >
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
        <button
          type="button"
          onClick={onDelete}
          className="flex h-[52px] items-center gap-3 border-t border-rule bg-transparent text-left text-[15px] font-medium text-again active:bg-surface-2"
        >
          <Icon name="trash" size={18} />
          Удалить тему
        </button>
        <p className="m-0 text-[12px] leading-4 text-muted">Слова из удалённой темы попадут во «Входящие».</p>
      </div>
    </Sheet>
  );
}
