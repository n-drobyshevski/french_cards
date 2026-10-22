"use client";

// Settings «Свои поля»: the shared fields every card gets on its back (lib/custom-fields.ts). One
// list for both layouts — phone rows open a bottom sheet (with «Выше» / «Ниже»), desktop rows a
// dialog, with ↑ / ↓ on the row itself. Deleting keeps the values on the words (undo in the snackbar).
import { useId, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button, IconButton } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icons";
import { Kbd } from "@/components/ui/Kbd";
import { DialogChrome, Sheet, SheetCloseButton, SheetTitle } from "@/components/ui/Sheet";
import { useSnackbar } from "@/components/ui/Snackbar";
import { Toggle } from "@/components/ui/Toggle";
import {
  createFieldDef,
  deleteFieldDef,
  FIELD_HINT_MAX,
  FIELD_LABEL_MAX,
  FieldDefError,
  MAX_FIELD_DEFS,
  moveFieldDef,
  restoreFieldDef,
  updateFieldDef,
  useFieldDefs,
  type FieldDefDraft,
} from "@/lib/custom-fields";
import { useFormatKeys } from "@/lib/key-names";
import type { FieldDef } from "@/lib/types";
import { CheckboxRow, DeskButtonRow, DeskSection } from "./DesktopControls";
import { SettingsButtonRow, SettingsSection } from "./SettingsList";

/** The note under the list (both layouts). */
const FOOTNOTE = "Поля появляются на обороте каждой карточки. Слово может хранить и свои, разовые поля.";
const FULL_NOTE = `Не больше ${MAX_FIELD_DEFS} полей. Удалите ненужное, чтобы добавить новое.`;
const DELETE_NOTE = "Уже заполненные значения останутся на карточках как разовые поля.";
const HINT_PLACEHOLDER = "Например: 2–3 синонима на французском";
const AUTO_CAPTION = "При добавлении слова и в «Дополнить карточки»";

const errorText = (e: unknown) => (e instanceof FieldDefError ? e.message : "Не получилось сохранить поле");

/** «авто»: the field is filled automatically. */
function AutoMark() {
  return (
    <span
      title="Заполняется автоматически"
      className="shrink-0 font-mono text-[11px] leading-4 tracking-[.06em] text-muted uppercase"
    >
      авто
    </span>
  );
}

interface Editor {
  open: boolean;
  /** null = «Новое поле». */
  def: FieldDef | null;
}

/** List state shared by both layouts: the editor, saving, deleting with undo, reordering. */
function useFieldDefsSection() {
  const defs = useFieldDefs();
  const toast = useSnackbar();
  const [editor, setEditor] = useState<Editor>({ open: false, def: null });

  const open = (def: FieldDef | null) => setEditor({ open: true, def });
  const close = () => setEditor((e) => ({ ...e, open: false }));
  const save = async (draft: FieldDefDraft) => {
    if (editor.def) await updateFieldDef(editor.def.id, draft);
    else await createFieldDef(draft);
    close();
  };
  const remove = async () => {
    if (!editor.def) return;
    const removed = await deleteFieldDef(editor.def.id);
    close();
    if (!removed) return;
    toast.show({ message: "Поле удалено", actionLabel: "Отменить", onAction: () => void restoreFieldDef(removed) });
  };
  const move = (id: string, step: -1 | 1) => {
    moveFieldDef(id, step).catch(() => toast.show({ message: "Не получилось переставить поле" }));
  };
  // The definition being edited as it is now (its place changes with «Выше» / «Ниже»).
  const current = editor.def ? (defs.find((d) => d.id === editor.def!.id) ?? editor.def) : null;
  const index = current ? defs.findIndex((d) => d.id === current.id) : -1;
  return { defs, editor, current, index, open, close, save, remove, move, setEditor };
}

/** «Свои поля» in the phone list (between «ИИ» and «Данные»). */
export function CustomFieldsSection() {
  const s = useFieldDefsSection();
  const full = s.defs.length >= MAX_FIELD_DEFS;
  return (
    <>
      <SettingsSection
        title="Свои поля"
        anchor="set-fields"
        footer={<p className="m-0 border-t border-rule pt-2 text-[12px] leading-4 text-muted">{full ? FULL_NOTE : FOOTNOTE}</p>}
      >
        {s.defs.map((def) => (
          <button
            key={def.id}
            type="button"
            aria-haspopup="dialog"
            onClick={() => s.open(def)}
            className="press-tint flex min-h-11 w-full items-center gap-2 bg-transparent py-2 text-left text-ink"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[15px] leading-5">{def.name}</span>
              {def.hint && <span className="truncate text-[12px] leading-4 text-muted">{def.hint}</span>}
            </span>
            {def.ai_fill && <AutoMark />}
            <Icon name="chevron-right" size={14} strokeWidth={2} className="shrink-0 text-muted" />
          </button>
        ))}
        {!full && (
          <SettingsButtonRow
            label="Добавить поле"
            aria-haspopup="dialog"
            onClick={() => s.open(null)}
            className="font-medium"
            trailing={<Icon name="plus" size={16} className="order-first shrink-0" />}
          />
        )}
      </SettingsSection>
      <FieldDefSheet
        open={s.editor.open}
        onOpenChange={(open) => s.setEditor((e) => ({ ...e, open }))}
        def={s.current}
        index={s.index}
        count={s.defs.length}
        onSave={s.save}
        onDelete={s.current ? () => void s.remove() : undefined}
        onMove={s.current ? (step) => s.move(s.current!.id, step) : undefined}
      />
    </>
  );
}

const moveBtn =
  "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[4px] border-0 bg-transparent p-0 text-muted hoverable:bg-hover hoverable:text-ink disabled:cursor-default disabled:text-boundary disabled:hover:bg-transparent";

/** «Свои поля» on the desktop settings page (DESK_SECTIONS `set-fields`). */
export function DeskCustomFieldsSection() {
  const s = useFieldDefsSection();
  const full = s.defs.length >= MAX_FIELD_DEFS;
  return (
    <DeskSection id="set-fields" title="Свои поля">
      {s.defs.map((def, i) => (
        <div key={def.id} className="flex min-h-11 items-center gap-1 border-b border-rule">
          <button
            type="button"
            aria-haspopup="dialog"
            aria-label={`Изменить поле «${def.name}»`}
            onClick={() => s.open(def)}
            className="-ml-2 flex min-h-[43px] min-w-0 flex-1 cursor-pointer items-center gap-4 rounded-[4px] border-0 bg-transparent px-2 py-1.5 text-left hoverable:bg-hover focus-visible:outline-offset-[-2px]"
          >
            <span className="w-[180px] shrink-0 truncate text-[15px] leading-5 text-ink">{def.name}</span>
            <span className="min-w-0 flex-1 truncate text-[13px] leading-5 text-muted">{def.hint ?? "Без подсказки"}</span>
            {def.ai_fill && <AutoMark />}
          </button>
          <span className="flex shrink-0 items-center">
            <button
              type="button"
              aria-label={`Поднять поле «${def.name}»`}
              title="Выше"
              disabled={i === 0}
              onClick={() => s.move(def.id, -1)}
              className={moveBtn}
            >
              <Icon name="chevron-up" size={16} />
            </button>
            <button
              type="button"
              aria-label={`Опустить поле «${def.name}»`}
              title="Ниже"
              disabled={i === s.defs.length - 1}
              onClick={() => s.move(def.id, 1)}
              className={cx(moveBtn, "-mr-2")}
            >
              <Icon name="chevron" size={16} />
            </button>
          </span>
        </div>
      ))}
      {!full && (
        <DeskButtonRow
          label={
            <span className="inline-flex items-center gap-2 font-medium">
              <Icon name="plus" size={16} />
              Добавить поле
            </span>
          }
          aria-haspopup="dialog"
          onClick={() => s.open(null)}
        />
      )}
      <p className="mt-3 mb-0 text-[12px] leading-4 text-muted">{full ? FULL_NOTE : FOOTNOTE}</p>
      <FieldDefSheet
        desktop
        open={s.editor.open}
        onOpenChange={(open) => s.setEditor((e) => ({ ...e, open }))}
        def={s.current}
        index={s.index}
        count={s.defs.length}
        onSave={s.save}
        onDelete={s.current ? () => void s.remove() : undefined}
      />
    </DeskSection>
  );
}

interface FieldDefSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = «Новое поле». */
  def: FieldDef | null;
  /** Its place in the list (for «Выше» / «Ниже»). */
  index: number;
  count: number;
  /** Throws FieldDefError with the message to show. */
  onSave: (draft: FieldDefDraft) => Promise<void>;
  onDelete?: () => void;
  /** Phone only: «Выше» / «Ниже» inside the sheet. */
  onMove?: (step: -1 | 1) => void;
  desktop?: boolean;
}

/** «Новое поле» / «Изменить поле»: a sheet on phones, a dialog from 768 up. */
export function FieldDefSheet({ open, onOpenChange, def, desktop = false, ...rest }: FieldDefSheetProps) {
  const [formKey, setFormKey] = useState(0);
  const title = def ? "Изменить поле" : "Новое поле";
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      onClosed={() => setFormKey((k) => k + 1)}
      dialogWidth={480}
      header={desktop ? <DialogChrome label="Свои поля" title={title} /> : undefined}
      description="Название поля, что в него писать и заполнять ли его автоматически"
      onOpenAutoFocus={desktop ? undefined : (e) => e.preventDefault()}
    >
      <FieldDefForm
        key={`${formKey}:${def?.id ?? "new"}`}
        def={def}
        desktop={desktop}
        title={title}
        onCancel={() => onOpenChange(false)}
        {...rest}
      />
    </Sheet>
  );
}

function FieldDefForm({
  def,
  desktop,
  title,
  index,
  count,
  onSave,
  onDelete,
  onMove,
  onCancel,
}: Omit<FieldDefSheetProps, "open" | "onOpenChange"> & { title: string; onCancel: () => void }) {
  const id = useId();
  const keys = useFormatKeys();
  const [name, setName] = useState(def?.name ?? "");
  const [hint, setHint] = useState(def?.hint ?? "");
  const [auto, setAuto] = useState(def?.ai_fill ?? false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({ name, hint, ai_fill: auto });
    } catch (e) {
      setError(errorText(e));
      setSaving(false);
    }
  };
  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submit();
    }
  };

  const errorLine = error && (
    <p
      id={`${id}-error`}
      role="alert"
      className={cx("m-0 mt-1.5 text-again", desktop ? "text-[12px] leading-4" : "text-[13px] leading-5")}
    >
      {error}
    </p>
  );
  const nameProps = {
    id: `${id}-name`,
    value: name,
    onChange: (e: { target: { value: string } }) => {
      setName(e.target.value);
      setError(null);
    },
    maxLength: FIELD_LABEL_MAX,
    autoComplete: "off",
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${id}-error` : undefined,
    placeholder: "Например, Синонимы",
  } as const;
  const hintProps = {
    id: `${id}-hint`,
    value: hint,
    onChange: (e: { target: { value: string } }) => setHint(e.target.value),
    maxLength: FIELD_HINT_MAX,
    rows: 2,
    "aria-describedby": `${id}-hint-note`,
    placeholder: HINT_PLACEHOLDER,
  } as const;
  const hintNote = (
    <p id={`${id}-hint-note`} className="m-0 mt-1.5 text-[12px] leading-4 text-muted">
      Подсказка для автоматического заполнения и для вас.
    </p>
  );

  if (desktop) {
    const field =
      "box-border rounded-[4px] border border-boundary bg-surface px-3 text-ink outline-none placeholder:text-muted focus:border-2 focus:border-ink focus:px-[11px]";
    return (
      <form onSubmit={(e) => void submit(e)} onKeyDown={onKeyDown} noValidate aria-label={title} className="flex flex-col">
        <div className="flex flex-col px-6 pt-6 pb-6">
          <label htmlFor={nameProps.id} className="text-[13px] leading-5 text-muted">
            Название
          </label>
          <input {...nameProps} autoFocus className={cx(field, "mt-1.5 h-11 text-[16px]")} />
          {errorLine}
          <label htmlFor={hintProps.id} className="mt-4 text-[13px] leading-5 text-muted">
            Что писать
          </label>
          <textarea {...hintProps} className={cx(field, "mt-1.5 resize-none py-2.5 text-[14px] leading-[22px] focus:py-[9px]")} />
          {hintNote}
          <div className="mt-3">
            <CheckboxRow label="Заполнять автоматически" caption={AUTO_CAPTION} checked={auto} onCheckedChange={setAuto} />
          </div>
          {onDelete && (
            <div className="mt-4 flex flex-col items-start gap-1">
              <button
                type="button"
                onClick={onDelete}
                className="-ml-1 inline-flex h-8 items-center gap-2 rounded-[4px] bg-transparent px-1 text-[14px] text-again hoverable:bg-hover-surface"
              >
                <Icon name="trash" size={14} />
                Удалить поле
              </button>
              <p className="m-0 text-[12px] leading-4 text-muted">{DELETE_NOTE}</p>
            </div>
          )}
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
            aria-busy={saving || undefined}
            aria-keyshortcuts="Meta+Enter Control+Enter"
            className="inline-flex h-10 items-center gap-2.5 rounded-[6px] border border-ink bg-ink px-4 text-[14px] font-medium text-on-ink"
          >
            Сохранить
            <Kbd tone="ink" aria-hidden="true">
              {keys("Mod+Enter")}
            </Kbd>
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate aria-label={title} className="flex flex-col px-4 pb-4">
      <div className="flex h-11 items-center justify-between">
        <SheetTitle>{title}</SheetTitle>
        <SheetCloseButton className="-mr-3" />
      </div>

      <label htmlFor={nameProps.id} className="meta mt-4">
        Название
      </label>
      <input
        {...nameProps}
        enterKeyHint="next"
        className="mt-2 h-12 rounded-chip border border-rule bg-surface px-3 text-[16px] text-ink outline-none placeholder:text-muted focus:border-2 focus:border-ink focus:px-[11px]"
      />
      {errorLine}

      <label htmlFor={hintProps.id} className="meta mt-5">
        Что писать
      </label>
      <textarea
        {...hintProps}
        className="mt-2 resize-none rounded-chip border border-rule bg-surface px-3 py-2.5 text-[15px] leading-[22px] text-ink outline-none placeholder:text-muted focus:border-ink pointer-coarse:text-[16px]"
      />
      {hintNote}

      <div className="mt-4 flex min-h-11 items-center gap-2 border-y border-rule py-2">
        <span className="flex min-w-0 flex-1 flex-col">
          <span id={`${id}-auto`} className="text-[15px] leading-5">
            Заполнять автоматически
          </span>
          <span className="text-[12px] leading-4 text-muted">{AUTO_CAPTION}</span>
        </span>
        <Toggle checked={auto} onCheckedChange={setAuto} aria-labelledby={`${id}-auto`} />
      </div>

      {def && onMove && count > 1 && (
        <div className="flex h-12 items-center gap-2 border-b border-rule">
          <span className="min-w-0 flex-1 text-[15px] leading-5">
            Место в списке
            <span className="ml-2 font-mono text-[12px] text-muted tabular-nums">
              {index + 1} из {count}
            </span>
          </span>
          <IconButton icon="chevron-up" label="Выше" iconSize={18} disabled={index <= 0} onClick={() => onMove(-1)} />
          <IconButton
            icon="chevron"
            label="Ниже"
            iconSize={18}
            disabled={index >= count - 1}
            onClick={() => onMove(1)}
            className="-mr-3"
          />
        </div>
      )}

      <Button type="submit" block pending={saving} pendingLabel="Сохраняем…" className="mt-5">
        Сохранить
      </Button>
      {onDelete && (
        <>
          <Button variant="danger" size="md" className="mt-2 self-center" onClick={onDelete}>
            Удалить поле
          </Button>
          <p className="m-0 text-center text-[12px] leading-4 text-muted">{DELETE_NOTE}</p>
        </>
      )}
    </form>
  );
}
