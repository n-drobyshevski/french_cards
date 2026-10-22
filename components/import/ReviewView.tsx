"use client";

import { useState } from "react";
import { bottomBarRef } from "@/components/ui/bottom-clearance";
import { Button } from "@/components/ui/Button";
import { Header } from "@/components/ui/Header";
import { Icon } from "@/components/ui/Icons";
import { cx } from "@/components/ui/cx";
import type { NewFolderProposal } from "@/lib/ai/schemas";
import { findDuplicate } from "@/lib/text";
import type { Folder } from "@/lib/types";
import { FolderPicker } from "./FolderPicker";
import { ImportRowItem, RowEditor } from "./ImportRowItem";
import {
  allAddableChecked,
  applyFolderToChecked,
  canAdd,
  checkedRows,
  commonChoice,
  fragmentsRu,
  setAllChecked,
  updateRow,
  wordsRu,
  type FolderChoice,
  type ImportRow,
} from "./rows";

export interface ReviewViewProps {
  rows: ImportRow[];
  onRowsChange: (update: (rows: ImportRow[]) => ImportRow[]) => void;
  folders: readonly Folder[];
  proposals: readonly NewFolderProposal[];
  thumbs: readonly string[];
  tiles: number;
  /** The stream did not finish: stopped, or the connection dropped. */
  incomplete: "stopped" | "cut" | null;
  saving: boolean;
  onAdd: () => void;
  /** Start over with other screenshots. */
  onRestart: () => void;
}

function ScreenshotStrip({ thumbs, tiles }: { thumbs: readonly string[]; tiles: number }) {
  const [open, setOpen] = useState(false);
  if (thumbs.length === 0) return null;
  return (
    <div className="shrink-0 border-y border-rule">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-14 w-full items-center gap-3 bg-transparent p-0 text-left text-ink"
      >
        <span aria-hidden="true" className="h-10 w-7 shrink-0 overflow-hidden rounded-[2px] border border-rule bg-surface">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumbs[0]} alt="" className="size-full object-cover object-top" />
        </span>
        <span className="text-[15px] leading-5 font-medium">{thumbs.length > 1 ? "Скриншоты" : "Скриншот"}</span>
        <Icon name={open ? "chevron" : "chevron-right"} size={14} strokeWidth={2} className="-ml-1.5 text-muted" />
        {tiles > 1 && <span className="meta ml-auto leading-4 whitespace-nowrap">{fragmentsRu(tiles)}</span>}
      </button>
      {open && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-3">
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
      )}
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
export function incompleteNotice(incomplete: ReviewViewProps["incomplete"]): string | null {
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
  tiles,
  incomplete,
  saving,
  onAdd,
  onRestart,
}: ReviewViewProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerTarget>(null);
  const [lastPicker, setLastPicker] = useState<Exclude<PickerTarget, null>>({ kind: "all" });

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

  const notice = incompleteNotice(incomplete);

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
              className="h-11 bg-transparent px-2 text-[15px] font-medium whitespace-nowrap text-ink active:text-muted"
            >
              {allChecked ? "Снять все" : "Выбрать все"}
            </button>
          ) : undefined
        }
      />

      <main className="flex flex-1 flex-col px-4 pt-2 pb-4">
        <ScreenshotStrip thumbs={thumbs} tiles={tiles} />

        {notice && (
          <div className="mt-4 flex items-start justify-between gap-3 text-[13px] leading-5 text-muted">
            <p className="m-0">{notice}</p>
            <button
              type="button"
              onClick={onRestart}
              className="relative inline-flex h-5 shrink-0 items-center gap-1 bg-transparent p-0 text-[13px] font-medium text-ink underline decoration-1 underline-offset-[3px] before:absolute before:-inset-3 before:content-['']"
            >
              <Icon name="spark" size={14} strokeWidth={1.5} className="shrink-0" />
              Распознать заново
            </button>
          </div>
        )}

        <div className="mt-6 flex items-baseline justify-between border-b border-ink pb-2 font-mono text-[11px] leading-4 tracking-[.06em] text-muted">
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

      <div
        ref={bottomBarRef}
        className={cx(
          "sticky bottom-(--shell-bottom) z-10 flex items-center gap-3 border-t border-rule bg-surface px-4 pt-3 pb-3",
          // Extend the bar's background under the home indicator.
          "after:absolute after:inset-x-0 after:top-full after:h-(--shell-bottom) after:bg-surface after:content-['']",
        )}
      >
        <button
          type="button"
          aria-haspopup="dialog"
          disabled={selected === 0}
          onClick={() => openPicker({ kind: "all" })}
          className="flex h-11 shrink-0 items-center bg-transparent p-0 disabled:opacity-40"
        >
          <span className="inline-flex h-[30px] items-center gap-1 rounded-chip border border-rule bg-surface pr-2 pl-2.5 text-[13px] leading-4 whitespace-nowrap text-ink">
            Тема для всех
            <Icon name="chevron" size={14} className="text-muted" />
          </span>
        </button>
        <Button className="min-w-0 flex-1" disabled={selected === 0} loading={saving} onClick={onAdd}>
          {selected === 0 ? "Ничего не отмечено" : `Добавить ${wordsRu(selected)}`}
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
