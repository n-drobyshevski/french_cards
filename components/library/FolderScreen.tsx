"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createElement, useEffect, useState } from "react";
import { useAddSheetActions } from "@/components/providers/AddSheetContext";
import { bottomBarRef } from "@/components/ui/bottom-clearance";
import { Button, IconButton, buttonClasses } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { Header } from "@/components/ui/Header";
import { SkeletonRow } from "@/components/ui/Skeleton";
import { useSnackbar } from "@/components/ui/Snackbar";
import { deleteFolder, getFolder, getLibraryStats, restoreFolder } from "@/lib/folders";
import { getSessionCounts } from "@/lib/session";
import type { Folder } from "@/lib/types";
import { useLayoutClass } from "@/lib/use-media";
import { DeskPlaceholder } from "./DeskPlaceholder";
import { cachedFolder, rememberLibrary, useRevealClass } from "./first-paint";
import { FolderFormSheet } from "./FolderFormSheet";
import { DisbandSheet, disbandMessage } from "./DisbandSheet";
import { FolderMenuSheet } from "./FolderMenuSheet";
import { NAV_BACK } from "./FolderTile";
import { useLibraryDesk } from "./lazy-desk";
import { nWords, practiceHref, reviewHref } from "./format";
import { useThemePause } from "./theme-pause";
import { useLibraryWords } from "./useLibraryWords";
import { WordList } from "./WordList";

/** The route segment for «Входящие». */
export const INBOX_SEGMENT = "inbox";

/**
 * /library/[id] from the URL. Read on the client, so a tap on a theme tile renders the page in the
 * same frame (no server round trip for the param); the server render shows FolderScreen without
 * an id (the frame only).
 */
export function FolderRoute() {
  const { id } = useParams<{ id: string }>();
  return <FolderScreen key={id} id={id} />;
}

/**
 * /library/[id]: a theme (or «Входящие») with its words, stats and «Повторить тему». Phones get
 * the list below; from 768 up the desktop table (LibraryDesk). `id` null: not known yet (the
 * static shell), only the frame is drawn.
 */
export function FolderScreen({ id }: { id: string | null }) {
  const layout = useLayoutClass();
  const wantsDesk = layout !== "compact" && id !== null;
  const desk = useLibraryDesk(wantsDesk);
  if (desk && id !== null) return createElement(desk, { scope: id === INBOX_SEGMENT ? { kind: "inbox" } : { kind: "folder", id } });
  // Until the desk's chunk is in, the placeholder stays where it is (same element, no restart).
  return (
    <>
      {/* A real box, not `contents`: the library ⇄ theme slide (NavSlide, L6) snapshots it. */}
      <div className="flex min-w-0 flex-1 flex-col md:hidden">{!wantsDesk && <PhoneFolder id={id} />}</div>
      <DeskPlaceholder
        title={id === INBOX_SEGMENT ? "Входящие" : id !== null ? (cachedFolder(id)?.name ?? "") : ""}
        scope={id === null ? "unknown" : id === INBOX_SEGMENT ? "inbox" : "folder"}
      />
    </>
  );
}

function PhoneFolder({ id }: { id: string | null }) {
  const known = id !== null;
  const folderId = id === INBOX_SEGMENT ? null : id;
  const router = useRouter();
  const snackbar = useSnackbar();
  const setPaused = useThemePause();
  const addSheet = useAddSheetActions();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [disbandOpen, setDisbandOpen] = useState(false);
  // The tile that was tapped left its name and numbers here, so the first frame is the page (L6).
  const [cached] = useState(() => (id !== null ? cachedFolder(id) : undefined));

  const meta = useLiveQuery(async () => {
    if (!known) return undefined;
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
      lib,
    };
  }, [folderId, known]);
  const words = useLibraryWords(folderId, known);
  useEffect(() => {
    if (meta) rememberLibrary(meta.lib);
  }, [meta]);
  const listReveal = useRevealClass(!!words);

  if (meta?.folder === "missing") {
    return (
      <main className="flex flex-1 flex-col">
        <Header eyebrow="Библиотека / тема" back="/library" backLabel="Назад в библиотеку" backTransitionTypes={NAV_BACK} />
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
  const name = folderId === null && known ? "Входящие" : (folder?.name ?? cached?.name ?? "");
  const stats = meta?.stats ?? cached?.stats;
  const color = folder?.color ?? cached?.color ?? "var(--ink)";
  const locked = folder ? folder.locked : (cached?.locked ?? false);
  const paused = folder ? !!folder.muted : !!cached?.muted;
  const pct = Math.round((stats?.mastery ?? 0) * 100);
  const items = words?.words;
  // Until the words are read, expect what the tile showed (or words, when nothing is known).
  const expectWords = items ? items.length > 0 : stats ? stats.total > 0 : true;
  // «Повторить тему» when something is due or new, otherwise a practice round over the whole theme.
  const reviewable = meta ? meta.cards > 0 : stats ? stats.due + stats.fresh > 0 : true;

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
        backTransitionTypes={NAV_BACK}
        actions={
          known && folderId !== null ? (
            // Shown from the first frame; the menu opens once the theme is read.
            <IconButton icon="more" label="Ещё действия с темой" onClick={() => setMenuOpen(true)} />
          ) : undefined
        }
      />

      <div className="flex flex-1 flex-col px-4">
        <div className="mt-2 flex min-h-10 items-center gap-3">
          <h1 className="m-0 min-w-0 font-serif text-[32px] leading-10 font-medium tracking-[-0.015em] break-words">{name}</h1>
          {locked && <span className="meta shrink-0 rounded-chip border border-rule px-1.5 leading-5">закреплена</span>}
          {paused && <span className="meta shrink-0 rounded-chip border border-rule px-1.5 leading-5">на паузе</span>}
        </div>
        <p className="meta m-0 mt-2 min-h-4 tabular-nums">
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

        {/* Progress row: reserved until the numbers are known, gone for an empty theme */}
        {(!stats || stats.total > 0) && (
          <div className="mt-3 flex h-4 items-center gap-3">
            {stats && (
              <>
                <span
                  role="progressbar"
                  aria-label="Выучено"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={pct}
                  className="block h-0.5 flex-1 bg-rule"
                >
                  <span className="block h-0.5" style={{ width: `${pct}%`, background: color }} />
                </span>
                <span className="meta text-ink tabular-nums">{pct} % выучено</span>
              </>
            )}
          </div>
        )}

        {expectWords && (
          <div aria-hidden="true" className="meta mt-6 flex justify-between border-b border-ink pb-2">
            <span>Слово</span>
            <span>Сленг · ур. · показ</span>
          </div>
        )}

        {items && items.length > 0 && words && (
          <div className={listReveal}>
            <WordList items={items} folders={words.folders} label={`Слова темы «${name}»`} />
          </div>
        )}

        {items && items.length === 0 && (
          <div className={cx("mt-8 flex flex-col items-start gap-4 border-t border-rule pt-6", listReveal)}>
            <p className="m-0 text-[15px] leading-[22px] text-muted">
              {folderId === null ? "Здесь пусто — все слова разложены по темам." : "В этой теме пока нет слов."}
            </p>
            <Button variant="secondary" size="md" icon="plus" onClick={() => addSheet.open()}>
              Добавить слово
            </Button>
          </div>
        )}

        {items === undefined && expectWords && (
          // Reserved rows; skeletons only if the read is still pending at 300 ms.
          <div aria-hidden="true" className="delayed-in flex flex-col">
            {Array.from({ length: Math.min(8, Math.max(1, stats?.total ?? 5)) }, (_, i) => (
              <SkeletonRow key={i} index={i} height={64} meter fade />
            ))}
          </div>
        )}

        {/* «Повторить тему» stays above the tab bar; there from the first frame */}
        {expectWords && (
          <div ref={bottomBarRef} data-folder-footer="" className="sticky bottom-(--shell-bottom) z-[2] -mx-4 mt-auto border-t border-rule bg-paper p-4">
            {!known || (!stats && !meta) ? (
              <span aria-hidden="true" className={buttonClasses({ block: true, className: "invisible" })}>
                Повторить тему
              </span>
            ) : paused && folder ? (
              // «На паузе»: nothing to review or practise, so the way back.
              <Button variant="secondary" block onClick={() => void setPaused(folder, false)}>
                Вернуть в повторения
              </Button>
            ) : reviewable ? (
              <Link href={reviewHref(folderId)} className={buttonClasses({ block: true })}>
                Повторить тему
                <span className="min-w-[2ch] font-mono text-[13px] tracking-[.04em] tabular-nums">{meta?.cards}</span>
              </Link>
            ) : (
              // Nothing due: a practice round over the whole theme instead.
              <Link href={practiceHref(folderId)} className={buttonClasses({ block: true })}>
                Тренировка всей темы
                <span className="min-w-[2ch] font-mono text-[13px] tracking-[.04em] tabular-nums">{items?.length ?? stats?.total}</span>
              </Link>
            )}
          </div>
        )}
      </div>

      {folder && (
        <>
          <FolderMenuSheet
            open={menuOpen}
            onOpenChange={setMenuOpen}
            folder={folder}
            words={stats?.total ?? 0}
            onEdit={() => {
              setMenuOpen(false);
              setEditOpen(true);
            }}
            onDisband={
              stats && stats.total > 0
                ? () => {
                    setMenuOpen(false);
                    setDisbandOpen(true);
                  }
                : undefined
            }
            onDelete={() => void remove(folder)}
          />
          <DisbandSheet
            open={disbandOpen}
            onOpenChange={setDisbandOpen}
            folder={folder}
            onDisbanded={(moves) => {
              router.push("/library");
              snackbar.show({
                message: disbandMessage(folder.name, moves),
                actionLabel: "Отменить",
                onAction: () => void restoreFolder(folder.id, moves),
              });
            }}
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
