"use client";

import { useState } from "react";
import { bottomBarRef } from "@/components/ui/bottom-clearance";
import { Button } from "@/components/ui/Button";
import { Header } from "@/components/ui/Header";
import { Icon } from "@/components/ui/Icons";
import { StatusLine } from "@/components/ui/StatusLine";
import { cx } from "@/components/ui/cx";
import type { NewFolderProposal } from "@/lib/ai/schemas";
import { findDuplicate } from "@/lib/text";
import type { Folder } from "@/lib/types";
import { FolderPicker } from "./FolderPicker";
import { ImportRowItem, RowEditor } from "./ImportRowItem";
import { importStage, ShotSummary } from "./ProcessingView";
import {
  allAddableChecked,
  applyFolderToChecked,
  canAdd,
  checkedRows,
  commonChoice,
  setAllChecked,
  updateRow,
  wordsRu,
  type FolderChoice,
  type ImportRow,
} from "./rows";
import { AnkiReviewSummary } from "./AnkiViews";
import { CrossfadeText } from "./SwapLabel";

export interface ReviewViewProps {
  rows: ImportRow[];
  onRowsChange: (update: (rows: ImportRow[]) => ImportRow[]) => void;
  folders: readonly Folder[];
  proposals: readonly NewFolderProposal[];
  thumbs: readonly string[];
  /** Screenshots picked and the tiles they were cut into. */
  images: number;
  tiles: number;
  /** The stream did not finish: stopped, or the connection dropped. */
  incomplete: "stopped" | "cut" | null;
  saving: boolean;
  onAdd: () => void;
  /** Start over with other screenshots. */
  onRestart: () => void;
  /** Anki import: the deck replaces the screenshots above the rows. */
  deck?: { title: string; line: string };
}

/** The screenshots at full width under the summary, opened from its thumbnail. */
function ScreenshotGallery({ thumbs }: { thumbs: readonly string[] }) {
  return (
    <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
      {thumbs.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt={thumbs.length > 1 ? `Скриншот ${i + 1}` : "Скриншот"}
          className="max-h-[360px] w-auto max-w-[240px] shrink-0 rounded-chip border border-rule bg-surface object-contain object-top"
        />
      ))}
    </div>
  );
}

type PickerTarget = { kind: "row"; key: string } | { kind: "all" } | null;

/**
 * Applies an edit to a row (the user has checked it, so it is no longer amber and gets checked),
 * then looks the corrected word up in the library again.
 */
export async function saveRowEdit(
  row: ImportRow,
  patch: Partial<ImportRow>,
  onRowsChange: ReviewViewProps["onRowsChange"],
): Promise<void> {
  const frChanged = patch.fr !== undefined && patch.fr !== row.fr;
  onRowsChange((rs) => updateRow(rs, row.key, { ...patch, warn: false, checked: true }));
  if (!frChanged && !row.duplicate) return;
  // The corrected word may (or may no longer) be in the library.
  const duplicate = (await findDuplicate(patch.fr ?? row.fr)) ?? null;
  onRowsChange((rs) => updateRow(rs, row.key, duplicate ? { duplicate, checked: false } : { duplicate: null, checked: true }));
}

/** Line shown above the rows when the stream did not finish. */
export function incompleteNotice(incomplete: ReviewViewProps["incomplete"], deck = false): string | null {
  if (incomplete === "stopped" && deck) return "Дополнение остановлено — здесь то, что успели.";
  if (incomplete === "stopped") return "Распознавание остановлено — здесь то, что успели найти.";
  if (incomplete === "cut") return "Распознано не всё: связь прервалась.";
  return null;
}

/** «Найдено N слов»: check, fix and file the extracted words, then add them in one go. */
export function ReviewView({
  rows,
  onRowsChange,
  folders,
  proposals,
  thumbs,
  images,
  tiles,
  incomplete,
  saving,
  onAdd,
  onRestart,
  deck,
}: ReviewViewProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerTarget>(null);
  const [lastPicker, setLastPicker] = useState<Exclude<PickerTarget, null>>({ kind: "all" });
  const [gallery, setGallery] = useState(false);

  const selected = checkedRows(rows).length;
  const allChecked = allAddableChecked(rows);
  const anyAddable = rows.some(canAdd);

  const openPicker = (target: Exclude<PickerTarget, null>) => {
    setLastPicker(target);
    setPicker(target);
  };
  const target = picker ?? lastPicker;
  const pickerRow = target.kind === "row" ? rows.find((r) => r.key === target.key) : undefined;

  const pick = (choice: FolderChoice) => {
    if (target.kind === "all") onRowsChange((rs) => applyFolderToChecked(rs, choice));
    else onRowsChange((rs) => updateRow(rs, target.key, { folder: choice, folderSource: "user" }));
  };

  const saveEdit = async (row: ImportRow, patch: Partial<ImportRow>) => {
    setEditing(null);
    await saveRowEdit(row, patch, onRowsChange);
  };

  const stage = importStage({
    phase: incomplete === "stopped" ? "stopped" : "done",
    rows: rows.length,
    complete: true,
    incomplete: incomplete === "cut",
    tiles,
  });

  return (
    <>
      <Header
        title={`Найдено ${wordsRu(rows.length)}`}
        fallbackHref="/library"
        actions={
          anyAddable ? (
            <button
              type="button"
              onClick={() => onRowsChange((rs) => setAllChecked(rs, !allChecked))}
              className="h-11 animate-[fade-in_var(--dur-quick)_var(--ease-enter)] bg-transparent px-2 text-[15px] font-medium whitespace-nowrap text-ink active:text-muted"
            >
              {allChecked ? "Снять все" : "Выбрать все"}
            </button>
          ) : undefined
        }
      />

      {/* The same top as while the words were read (I3): the list below keeps its place. */}
      <main className="flex flex-1 flex-col px-4 pt-2 pb-4">
        {deck ? (
          <AnkiReviewSummary title={deck.title} line={incompleteNotice(incomplete, true) ?? deck.line} />
        ) : (
          <>
            <ShotSummary stage={stage} thumbs={thumbs} images={images} tiles={tiles} onThumb={() => setGallery((v) => !v)} thumbOpen={gallery} />
            {gallery && <ScreenshotGallery thumbs={thumbs} />}
          </>
        )}

        <div className="relative mt-3">
          <StatusLine text={deck ? `Готово · ${wordsRu(rows.length)}` : stage.status} active={false} announce={deck ? undefined : stage.announce} />
          {incomplete && (
            <button
              type="button"
              onClick={onRestart}
              className="absolute top-0 right-0 inline-flex h-5 items-center gap-1 bg-paper p-0 pl-2 text-[13px] leading-5 font-medium text-ink underline decoration-1 underline-offset-[3px] before:absolute before:-inset-3 before:content-['']"
            >
              <Icon name="spark" size={14} strokeWidth={1.5} className="shrink-0" />
              {deck ? "Дополнить заново" : "Распознать заново"}
            </button>
          )}
        </div>

        <div className="meta mt-4 flex items-baseline justify-between border-b border-ink pb-2 leading-4">
          <span aria-live="polite">
            ОТМЕЧЕНО <span className="font-medium text-ink">{selected}</span> ИЗ {rows.length}
          </span>
          <span aria-hidden="true">УРОВЕНЬ · ТЕМА</span>
        </div>

        <ul aria-label="Найденные слова" className="m-0 flex list-none flex-col p-0">
          {rows.map((row) =>
            editing === row.key ? (
              <RowEditor
                key={row.key}
                row={row}
                onSave={(patch) => void saveEdit(row, patch)}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <ImportRowItem
                key={row.key}
                row={row}
                folders={folders}
                onToggle={() => onRowsChange((rs) => updateRow(rs, row.key, { checked: !row.checked }))}
                onEdit={() => setEditing(row.key)}
                onPickFolder={() => openPicker({ kind: "row", key: row.key })}
              />
            ),
          )}
        </ul>
      </main>

      {/* The footer rises in as the review takes over from the stream (I3). */}
      <div
        ref={bottomBarRef}
        className={cx(
          "sticky bottom-(--shell-bottom) z-10 flex animate-[enter-pop_var(--dur-enter)_var(--ease-enter)] items-center gap-3 border-t border-rule bg-surface px-4 pt-3 pb-3",
          // Extend the bar's background under the home indicator.
          "after:absolute after:inset-x-0 after:top-full after:h-(--shell-bottom) after:bg-surface after:content-['']",
        )}
      >
        {/* While «Добавляем…» is pending the sibling is blocked but keeps its look (MOTION-SPEC §3.5). */}
        <button
          type="button"
          aria-haspopup="dialog"
          disabled={selected === 0}
          aria-disabled={saving || undefined}
          onClick={() => !saving && openPicker({ kind: "all" })}
          className={cx("flex h-11 shrink-0 items-center bg-transparent p-0 disabled:opacity-40", saving && "pointer-events-none")}
        >
          <span className="inline-flex h-[30px] items-center gap-1 rounded-chip border border-rule bg-surface pr-2 pl-2.5 text-[13px] leading-4 whitespace-nowrap text-ink">
            Тема для всех
            <Icon name="chevron" size={14} className="text-muted" />
          </span>
        </button>
        <Button className="min-w-0 flex-1" disabled={selected === 0} pending={saving} pendingLabel="Добавляем…" onClick={onAdd}>
          <CrossfadeText text={selected === 0 ? "Ничего не отмечено" : `Добавить ${wordsRu(selected)}`} />
        </Button>
      </div>

      <FolderPicker
        open={picker !== null}
        onOpenChange={(open) => {
          if (!open) setPicker(null);
        }}
        title={target.kind === "all" ? "Тема для всех" : "Тема"}
        subtitle={target.kind === "all" ? `Отмечено: ${wordsRu(selected)}` : pickerRow?.fr}
        subtitleLang={target.kind === "all" ? undefined : "fr"}
        folders={folders}
        proposals={proposals}
        selected={target.kind === "all" ? commonChoice(rows) : (pickerRow?.folder ?? null)}
        onPick={pick}
      />
    </>
  );
}
