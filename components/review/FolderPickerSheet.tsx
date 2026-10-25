"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { IconButton } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icons";
import { Sheet, SheetHeader } from "@/components/ui/Sheet";
import { useSnackbar } from "@/components/ui/Snackbar";
import { getLibraryStats, type FolderStats } from "@/lib/folders";
import {
  countSetCards,
  createReviewSet,
  deleteReviewSet,
  describeSet,
  restoreReviewSet,
  setChoice,
  setIdOf,
  setSessionFilter,
  updateReviewSet,
} from "@/lib/review-sets";
import { loadSessionData } from "@/lib/session";
import type { Direction, ReviewSet } from "@/lib/types";
import type { FolderChoice } from "./filter";
import { ReviewSetSheet } from "./ReviewSetSheet";

interface Option {
  value: FolderChoice;
  name: string;
  stats: FolderStats | undefined;
}

export interface FolderPickerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: FolderChoice;
  onChange: (value: FolderChoice) => void;
  /** «Мои наборы», in their order. */
  sets?: readonly ReviewSet[];
  /** The review direction, for each set's card count. */
  direction?: Direction;
}

function statsLine(stats: FolderStats | undefined): string {
  if (!stats) return "";
  if (stats.total > 0 && stats.paused === stats.total) return `${stats.total} · на паузе`;
  return stats.due > 0 ? `${stats.total} · ${stats.due} к повт.` : String(stats.total);
}

/** A set's count: due + new on the schedule, every card for practice. */
function setMeta(set: ReviewSet, count: number | undefined): { text: string; attention: boolean } {
  if (count === undefined) return { text: "", attention: false };
  if (set.mode === "practice") return { text: `${count} · тренировка`, attention: false };
  return { text: count > 0 ? `${count} к повт.` : "нечего повторять", attention: count > 0 };
}

const ROW = "flex w-full items-center gap-3 border-b border-rule bg-transparent text-left active:bg-surface-2";

/**
 * «Что повторять» (mockups: Повторение «C · Мои наборы»): saved sets on top (pick, edit, «Новый
 * набор»), then every theme with its word and due counts. The set editor is a sheet nested in this one.
 */
export function FolderPickerSheet({ open, onOpenChange, value, onChange, sets = [], direction }: FolderPickerSheetProps) {
  const snackbar = useSnackbar();
  const [editor, setEditor] = useState<{ open: boolean; set: ReviewSet | null }>({ open: false, set: null });
  const lib = useLiveQuery(() => (open ? getLibraryStats() : undefined), [open]);
  const folders = lib?.folders ?? [];

  const setsKey = JSON.stringify(sets);
  // The folder ids, not `lib`: a stats re-run with the same themes must not recount every set.
  const folderIdsKey = lib ? lib.folders.map((f) => f.id).join(",") : undefined;
  const counts = useLiveQuery(async () => {
    if (!open || folderIdsKey === undefined) return undefined;
    const live = new Set(folderIdsKey ? folderIdsKey.split(",") : []);
    // One read of the library for every set's count.
    const pre = await loadSessionData();
    const now = new Date();
    const entries = await Promise.all(
      sets.map(async (s) => [s.id, await countSetCards(setSessionFilter(s, direction, live, now), s.mode, now, pre)] as const),
    );
    return new Map(entries);
  }, [open, folderIdsKey, setsKey, direction]);

  const options: Option[] = [{ value: "all", name: "Все темы", stats: lib?.totals }];
  if (!lib || lib.inbox.total > 0 || value === "inbox") options.push({ value: "inbox", name: "Входящие", stats: lib?.inbox });
  for (const f of folders) options.push({ value: f.id, name: f.name, stats: f.stats });

  const pick = (choice: FolderChoice) => {
    onChange(choice);
    onOpenChange(false);
  };

  const editing = editor.set;
  const remove = async () => {
    if (!editing) return;
    const removed = await deleteReviewSet(editing.id);
    setEditor((e) => ({ ...e, open: false }));
    if (!removed) return;
    if (setIdOf(value) === editing.id) onChange("all");
    snackbar.show({
      message: `Набор «${editing.name}» удалён`,
      actionLabel: "Отменить",
      onAction: () => void restoreReviewSet(removed),
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} height="auto" title="Что повторять">
      {/* Phones: a grabber and a screen-reader-only ✕ (auto-height sheet, synthesis §2.9). */}
      <SheetHeader title="Что повторять" className="pt-2" />

      <h3 className="meta m-0 mx-4 mt-2 border-b border-ink pb-1.5 font-medium">Мои наборы</h3>
      <div role="radiogroup" aria-label="Мои наборы" className="px-4">
        {sets.map((s) => {
          const selected = value === setChoice(s.id);
          const meta = setMeta(s, counts?.get(s.id));
          return (
            <div key={s.id} className="flex items-center border-b border-rule">
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => pick(setChoice(s.id))}
                className={cx(ROW, "min-h-[60px] flex-1 flex-col items-stretch justify-center gap-0.5 border-b-0 py-2")}
              >
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className={cx("min-w-0 truncate font-serif text-[19px] leading-6", selected && "font-medium")}>{s.name}</span>
                  <span className={cx("meta shrink-0", meta.attention && "font-medium text-red")}>{meta.text}</span>
                </span>
                <span className="truncate text-[12px] leading-4 text-muted">{describeSet(s, folders)}</span>
              </button>
              <span className="flex w-6 shrink-0 justify-center">{selected && <Icon name="check" size={18} />}</span>
              <IconButton
                icon="pencil"
                label={`Изменить набор «${s.name}»`}
                iconSize={18}
                className="-mr-3 text-muted"
                onClick={() => setEditor({ open: true, set: s })}
              />
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => setEditor({ open: true, set: null })}
          className="flex h-12 w-full items-center gap-2.5 bg-transparent text-left text-[14px] font-medium text-ink active:bg-surface-2"
        >
          <Icon name="plus" size={16} />
          Новый набор
        </button>
      </div>

      <h3 className="meta m-0 mx-4 mt-2 border-b border-ink pb-1.5 font-medium">Темы</h3>
      <div role="radiogroup" aria-label="Тема для повторения" className="px-4 pb-4">
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <button key={o.value} type="button" role="radio" aria-checked={selected} onClick={() => pick(o.value)} className={cx(ROW, "h-12")}>
              <span className={cx("min-w-0 flex-1 truncate font-serif text-[19px] leading-6", selected ? "font-medium" : "")}>{o.name}</span>
              <span className={cx("meta shrink-0", o.stats && o.stats.due > 0 && "text-ink")}>{statsLine(o.stats)}</span>
              <span className="flex w-5 shrink-0 justify-end">{selected && <Icon name="check" size={18} />}</span>
            </button>
          );
        })}
      </div>

      <ReviewSetSheet
        open={editor.open}
        onOpenChange={(o) => setEditor((e) => ({ ...e, open: o }))}
        set={editing}
        folders={folders}
        direction={direction}
        onDelete={editing ? () => void remove() : undefined}
        onSave={async (draft) => {
          const saved = editing ? await updateReviewSet(editing.id, draft) : await createReviewSet(draft);
          setEditor((e) => ({ ...e, open: false }));
          if (saved) pick(setChoice(saved.id));
        }}
      />
    </Sheet>
  );
}
