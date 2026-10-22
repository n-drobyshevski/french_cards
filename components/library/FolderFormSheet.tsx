"use client";

import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Sheet, SheetCloseButton, SheetTitle } from "@/components/ui/Sheet";
import { cx } from "@/components/ui/cx";
import { createFolder, FOLDER_COLORS, updateFolder } from "@/lib/folders";
import type { Folder } from "@/lib/types";

export interface FolderFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit this folder; omit to create a new one. */
  folder?: Folder | null;
  /** Colors already used by other folders (shown first among the free ones). */
  usedColors?: readonly string[];
  onSaved?: (folder: Folder, created: boolean) => void;
}

/** «Новая тема» / «Изменить тему»: name, description and a color from the palette. */
export function FolderFormSheet({ open, onOpenChange, folder, usedColors = [], onSaved }: FolderFormSheetProps) {
  const [formKey, setFormKey] = useState(0);
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      onClosed={() => setFormKey((k) => k + 1)}
      description={folder ? "Название, описание и цвет темы" : "Название, описание и цвет новой темы"}
    >
      <FolderForm
        key={`${formKey}:${folder?.id ?? "new"}`}
        folder={folder ?? null}
        usedColors={usedColors}
        onDone={(saved, created) => {
          onSaved?.(saved, created);
          onOpenChange(false);
        }}
      />
    </Sheet>
  );
}

function FolderForm({
  folder,
  usedColors,
  onDone,
}: {
  folder: Folder | null;
  usedColors: readonly string[];
  onDone: (folder: Folder, created: boolean) => void;
}) {
  const id = useId();
  const [name, setName] = useState(folder?.name ?? "");
  const [description, setDescription] = useState(folder?.description ?? "");
  const [color, setColor] = useState<string>(
    () => folder?.color ?? FOLDER_COLORS.find((c) => !usedColors.includes(c)) ?? FOLDER_COLORS[0],
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const palette = folder && !FOLDER_COLORS.includes(folder.color as (typeof FOLDER_COLORS)[number]) ? [folder.color, ...FOLDER_COLORS] : FOLDER_COLORS;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("Введите название темы");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = folder
        ? await updateFolder(folder.id, { name, description, color })
        : await createFolder({ name, description, color, created_by: "user" });
      onDone(saved, !folder);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не получилось сохранить тему");
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col px-4 pb-4">
      <div className="flex h-11 items-center justify-between">
        <SheetTitle>{folder ? "Изменить тему" : "Новая тема"}</SheetTitle>
        <SheetCloseButton className="-mr-3" />
      </div>

      <label htmlFor={`${id}-name`} className="meta mt-4">
        Название
      </label>
      <input
        id={`${id}-name`}
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setError(null);
        }}
        maxLength={40}
        autoComplete="off"
        enterKeyHint="next"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        placeholder="Например, Транспорт"
        className="mt-2 h-12 rounded-chip border border-rule bg-surface px-3 font-serif text-[19px] text-ink outline-none placeholder:font-sans placeholder:text-[15px] placeholder:text-muted focus:border-ink focus:border-2 focus:px-[11px]"
      />

      <label htmlFor={`${id}-desc`} className="meta mt-5">
        Описание
      </label>
      <textarea
        id={`${id}-desc`}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={200}
        rows={2}
        aria-describedby={`${id}-desc-hint`}
        placeholder="Что сюда попадает"
        className="mt-2 resize-none rounded-chip border border-rule bg-surface px-3 py-2.5 text-[15px] leading-[22px] text-ink outline-none placeholder:text-muted focus:border-ink pointer-coarse:text-[16px]"
      />
      <p id={`${id}-desc-hint`} className="m-0 mt-1.5 text-[12px] leading-4 text-muted">
        По описанию новые слова раскладываются в эту тему.
      </p>

      <span id={`${id}-color`} className="meta mt-5">
        Цвет
      </span>
      <div role="radiogroup" aria-labelledby={`${id}-color`} className="mt-1 -ml-2 flex flex-wrap">
        {palette.map((c, i) => {
          const selected = c === color;
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`Цвет ${i + 1}${usedColors.includes(c) && c !== folder?.color ? ", уже есть у другой темы" : ""}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setColor(c)}
              onKeyDown={(e) => {
                const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
                if (!step) return;
                e.preventDefault();
                const next = palette[(i + step + palette.length) % palette.length];
                setColor(next);
                (e.currentTarget.parentElement?.children[(i + step + palette.length) % palette.length] as HTMLElement | undefined)?.focus();
              }}
              className="flex size-11 items-center justify-center bg-transparent"
            >
              <span
                aria-hidden="true"
                className={cx(
                  "flex size-7 items-start overflow-hidden rounded-chip border bg-surface",
                  selected ? "border-2 border-ink" : "border-rule",
                )}
              >
                <span className="h-1.5 w-full" style={{ background: c }} />
              </span>
            </button>
          );
        })}
      </div>

      {error && (
        <p id={`${id}-error`} role="alert" className="m-0 mt-3 text-[13px] leading-5 text-again">
          {error}
        </p>
      )}

      <Button type="submit" block loading={saving} className="mt-5">
        {folder ? "Сохранить" : "Создать тему"}
      </Button>
    </form>
  );
}
