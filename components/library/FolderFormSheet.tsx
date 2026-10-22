"use client";

import { useId, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Kbd } from "@/components/ui/Kbd";
import { DialogChrome, Sheet, SheetCloseButton, SheetTitle } from "@/components/ui/Sheet";
import { cx } from "@/components/ui/cx";
import { useFormatKeys } from "@/lib/key-names";
import { useLayoutClass } from "@/lib/use-media";
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
  const desktop = useLayoutClass() !== "compact";
  const onDone = (saved: Folder, created: boolean) => {
    onSaved?.(saved, created);
    onOpenChange(false);
  };
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      onClosed={() => setFormKey((k) => k + 1)}
      dialogWidth={440}
      header={desktop ? <DialogChrome label="Тема" title={folder ? "Изменить тему" : "Новая тема"} /> : undefined}
      description={folder ? "Название, описание и цвет темы" : "Название, описание и цвет новой темы"}
    >
      {desktop ? (
        <DeskFolderForm key={`${formKey}:${folder?.id ?? "new"}`} folder={folder ?? null} usedColors={usedColors} onDone={onDone} onCancel={() => onOpenChange(false)} />
      ) : (
        <FolderForm key={`${formKey}:${folder?.id ?? "new"}`} folder={folder ?? null} usedColors={usedColors} onDone={onDone} />
      )}
    </Sheet>
  );
}

interface FormProps {
  folder: Folder | null;
  usedColors: readonly string[];
  onDone: (folder: Folder, created: boolean) => void;
}

/** Name, description and colour with validation and saving; shared by both layouts. */
function useFolderForm({ folder, usedColors, onDone }: FormProps) {
  const [name, setName] = useState(folder?.name ?? "");
  const [description, setDescription] = useState(folder?.description ?? "");
  const [color, setColor] = useState<string>(
    () => folder?.color ?? FOLDER_COLORS.find((c) => !usedColors.includes(c)) ?? FOLDER_COLORS[0],
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const palette = folder && !FOLDER_COLORS.includes(folder.color as (typeof FOLDER_COLORS)[number]) ? [folder.color, ...FOLDER_COLORS] : FOLDER_COLORS;

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (saving) return;
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
  return { name, setName, description, setDescription, color, setColor, error, setError, saving, palette, submit };
}

/** Desktop dialog (D-Theme-New): fields, 28px swatches, footer with Esc / ⌘↵. */
function DeskFolderForm({ onCancel, ...props }: FormProps & { onCancel: () => void }) {
  const id = useId();
  const keys = useFormatKeys();
  const f = useFolderForm(props);
  const { folder, usedColors } = props;
  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void f.submit();
    }
  };
  const field =
    "box-border rounded-[4px] border border-boundary bg-surface px-3 text-ink outline-none placeholder:text-muted focus:border-2 focus:border-ink focus:px-[11px]";
  return (
    <form onSubmit={(e) => void f.submit(e)} onKeyDown={onKeyDown} noValidate className="flex flex-col">
      <div className="flex flex-col px-6 pt-6 pb-6">
        <label htmlFor={`${id}-name`} className="text-[13px] leading-5 text-muted">
          Название
        </label>
        <input
          id={`${id}-name`}
          autoFocus
          value={f.name}
          onChange={(e) => {
            f.setName(e.target.value);
            f.setError(null);
          }}
          maxLength={40}
          autoComplete="off"
          aria-invalid={f.error ? true : undefined}
          aria-describedby={f.error ? `${id}-error` : undefined}
          placeholder="Например, Транспорт"
          className={cx(field, "mt-1.5 h-11 font-serif text-[18px] placeholder:font-sans placeholder:text-[15px]")}
        />
        {f.error && (
          <p id={`${id}-error`} role="alert" className="m-0 mt-1.5 text-[12px] leading-4 text-again">
            {f.error}
          </p>
        )}
        <label htmlFor={`${id}-desc`} className="mt-4 text-[13px] leading-5 text-muted">
          Описание
        </label>
        <textarea
          id={`${id}-desc`}
          value={f.description}
          onChange={(e) => f.setDescription(e.target.value)}
          maxLength={200}
          rows={3}
          aria-describedby={`${id}-desc-hint`}
          placeholder="Что сюда попадает"
          className={cx(field, "mt-1.5 resize-none py-2.5 text-[14px] leading-[22px] focus:py-[9px]")}
        />
        <p id={`${id}-desc-hint`} className="m-0 mt-1.5 text-[12px] leading-4 text-muted">
          По описанию новые слова раскладываются в эту тему.
        </p>
        <span id={`${id}-color`} className="mt-4 text-[13px] leading-5 text-muted">
          Цвет
        </span>
        <Swatches id={id} palette={f.palette} color={f.color} setColor={f.setColor} usedColors={usedColors} folder={folder} desktop />
      </div>
      <div className="flex h-16 items-center justify-end gap-4 border-t border-rule px-6">
        <button
          type="button"
          onClick={onCancel}
          aria-keyshortcuts="Escape"
          className="inline-flex h-10 items-center gap-2 rounded-[6px] bg-transparent px-2 text-[14px] font-medium text-ink hoverable:bg-hover-surface"
        >
          Отмена
          <Kbd aria-hidden="true">Esc</Kbd>
        </button>
        <button
          type="submit"
          aria-busy={f.saving || undefined}
          aria-keyshortcuts="Meta+Enter Control+Enter"
          className="inline-flex h-10 items-center gap-2.5 rounded-[6px] border border-ink bg-ink px-4 text-[14px] font-medium text-on-ink"
        >
          {folder ? "Сохранить" : "Создать тему"}
          <Kbd tone="ink" aria-hidden="true">
            {keys("Mod+Enter")}
          </Kbd>
        </button>
      </div>
    </form>
  );
}

function Swatches({
  id,
  palette,
  color,
  setColor,
  usedColors,
  folder,
  desktop = false,
}: {
  id: string;
  palette: readonly string[];
  color: string;
  setColor: (c: string) => void;
  usedColors: readonly string[];
  folder: Folder | null;
  desktop?: boolean;
}) {
  return (
    <div role="radiogroup" aria-labelledby={`${id}-color`} className={desktop ? "mt-2 grid w-fit grid-cols-7 gap-2" : "mt-1 -ml-2 flex flex-wrap"}>
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
            className={desktop ? "flex size-7 items-center justify-center rounded-[4px] bg-transparent p-0" : "flex size-11 items-center justify-center bg-transparent"}
          >
            {desktop ? (
              <span
                aria-hidden="true"
                className={cx("size-7 rounded-[4px]", selected && "outline-2 outline-offset-2 outline-ink")}
                style={{ background: c }}
              />
            ) : (
              <span
                aria-hidden="true"
                className={cx(
                  "flex size-7 items-start overflow-hidden rounded-chip border bg-surface",
                  selected ? "border-2 border-ink" : "border-rule",
                )}
              >
                <span className="h-1.5 w-full" style={{ background: c }} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function FolderForm(props: FormProps) {
  const id = useId();
  const { folder, usedColors } = props;
  const { name, setName, description, setDescription, color, setColor, error, setError, saving, palette, submit } = useFolderForm(props);

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col px-4 pb-4">
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
      <Swatches id={id} palette={palette} color={color} setColor={setColor} usedColors={usedColors} folder={folder} />

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
