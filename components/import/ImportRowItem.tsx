"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icons";
import { Segmented } from "@/components/ui/Segmented";
import { SlangMeter } from "@/components/ui/SlangMeter";
import { cx } from "@/components/ui/cx";
import { SLANG_LABELS, type Folder, type SlangLevel } from "@/lib/types";
import { canAdd, choiceName, type ImportRow } from "./rows";

/** Mono outlined tag: «ДОГАДКА», «УЖЕ ЕСТЬ». */
export function Tag({ children, title, className }: { children: string; title?: string; className?: string }) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex h-4 shrink-0 items-center rounded-[2px] border px-1 font-mono text-[10px] leading-[14px] tracking-[.06em] whitespace-nowrap",
        className ?? "border-muted text-muted",
      )}
    >
      {children}
    </span>
  );
}

/**
 * 20px square checkbox (radius 2) inside a 44px hit area (MOTION-SPEC I6, §5.9): presses to .96;
 * checking fills it with ink in --dur-instant and then draws the tick (--dur-quick); unchecking
 * fades the fill in --dur-quick. Only a toggle draws: boxes checked from the start just fade in
 * with the review (no haptic: there are many of them, §5.13).
 */
function RowCheckbox({
  checked,
  disabled,
  label,
  onToggle,
  className,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onToggle: () => void;
  className?: string;
}) {
  const [toggled, setToggled] = useState(false);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      aria-label={label}
      onClick={() => {
        if (disabled) return;
        setToggled(true);
        onToggle();
      }}
      className={cx(
        "press-sm flex size-11 shrink-0 items-center justify-center bg-transparent p-0",
        disabled ? "cursor-default" : "cursor-pointer",
        className,
      )}
    >
      <span
        aria-hidden="true"
        data-checkbox-box=""
        className={cx(
          "box-border flex size-5 animate-[fade-in_var(--dur-quick)_var(--ease-enter)] items-center justify-center rounded-[2px] border transition-[background-color,border-color] ease-press",
          checked ? "border-ink bg-ink text-on-ink duration-(--dur-instant)" : "duration-(--dur-quick)",
          !checked && (disabled ? "border-rule bg-surface-2" : "border-ink bg-surface"),
        )}
      >
        {checked && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
            <path
              d="M20 6 9 17l-5-5"
              pathLength={1}
              strokeDasharray={1}
              className={cx(
                "[stroke-dashoffset:0]",
                toggled &&
                  "transition-[stroke-dashoffset] delay-(--dur-instant) duration-(--dur-quick) ease-standard starting:[stroke-dashoffset:1]",
              )}
            />
          </svg>
        )}
      </span>
    </button>
  );
}

function FolderLine({ label, onPick, disabled }: { label: string; onPick?: () => void; disabled?: boolean }) {
  const text = `Тема: ${label}`;
  if (!onPick || disabled) {
    return <span className="max-w-[150px] truncate font-mono text-[11px] leading-5 tracking-[.06em] text-muted uppercase">{text}</span>;
  }
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={`${text}. Изменить тему`}
      onClick={onPick}
      className="relative -mr-1 inline-flex max-w-[160px] items-center gap-0.5 rounded-chip bg-transparent pr-1 pl-1 font-mono text-[11px] leading-5 tracking-[.06em] text-muted uppercase before:absolute before:-inset-y-3 before:inset-x-0 before:content-[''] active:bg-surface-2 active:text-ink"
    >
      <span className="truncate">{text}</span>
      <Icon name="chevron" size={12} className="shrink-0" />
    </button>
  );
}

export interface ImportRowItemProps {
  row: ImportRow;
  folders: readonly Folder[];
  onToggle: () => void;
  onEdit: () => void;
  onPickFolder: () => void;
}

/** One extracted word: checkbox, FR/RU (tap to edit), slang meter and theme. */
export function ImportRowItem({ row, folders, onToggle, onEdit, onPickFolder }: ImportRowItemProps) {
  const dup = row.duplicate;
  const addable = canAdd(row);
  const checkboxLabel = dup ? `${row.fr} — уже есть` : row.fr || "Без французского";

  const ru = (
    <span className="flex min-w-0 items-center gap-2">
      <span
        className={cx(
          "min-w-0 truncate text-[14px] leading-5",
          row.warn && !dup ? "text-ink" : "text-muted",
          row.ruGuess && "italic",
          !row.ru.trim() && "text-again not-italic",
        )}
      >
        {row.ru.trim() || "нет перевода"}
      </span>
      {row.ruGuess && row.ru.trim() && <Tag title="Перевода не было на скриншоте">ДОГАДКА</Tag>}
    </span>
  );

  const words = (
    <>
      <span lang="fr" className={cx("truncate font-serif text-[19px] leading-6 font-medium", dup ? "text-muted" : "text-ink")}>
        {row.fr.trim() || "—"}
      </span>
      {ru}
      {row.exampleFr && !dup && (
        <span lang="fr" className="truncate font-serif text-[14px] leading-5 text-muted italic">
          {row.exampleFr}
        </span>
      )}
    </>
  );

  if (row.warn && !dup) {
    return (
      <li className="-mx-2 my-2 flex items-start gap-1 rounded-chip border border-dashed border-warn-edge bg-warn-bg py-3 pr-2">
        <RowCheckbox
          checked={row.checked}
          disabled={!addable}
          label={checkboxLabel}
          onToggle={onToggle}
          className="-mt-2.5"
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <button type="button" onClick={onEdit} className="flex min-w-0 flex-col bg-transparent p-0 text-left">
            {words}
            <span className="mt-1 flex items-center gap-1.5 text-[12px] leading-4 text-warn">
              <Icon name="alert" size={14} className="shrink-0" />
              <span className="min-w-0">{row.issue ?? "Перевод под вопросом"}</span>
            </span>
          </button>
          <span className="mt-2 flex min-w-0 items-center justify-between gap-2">
            <SlangMeter level={row.slang_level} verlan={row.verlan} />
            <FolderLine label={choiceName(row.folder, folders)} onPick={onPickFolder} disabled={!addable} />
          </span>
        </span>
        <button
          type="button"
          onClick={onEdit}
          className="-mt-2.5 h-11 shrink-0 bg-transparent px-1 text-[13px] font-medium text-warn underline decoration-1 underline-offset-[3px]"
        >
          Проверить
        </button>
      </li>
    );
  }

  const existingFolder = dup ? (folders.find((f) => f.id === dup.folder_id)?.name ?? "Входящие") : null;

  // An addable row left unchecked dims to .5 (--dur-quick); the box itself stays clear.
  const dim = addable && !row.checked;
  return (
    <li className="flex min-h-14 items-center gap-1 border-b border-rule">
      <RowCheckbox checked={row.checked} disabled={!addable} label={checkboxLabel} onToggle={onToggle} className="-ml-3" />
      <button
        type="button"
        onClick={onEdit}
        className={cx(
          "flex min-w-0 flex-1 flex-col bg-transparent py-1.25 text-left transition-opacity duration-(--dur-quick) ease-standard",
          dim && "opacity-50",
        )}
      >
        {words}
        <span className="sr-only">Изменить</span>
      </button>
      <span className={cx("flex shrink-0 flex-col items-end transition-opacity duration-(--dur-quick) ease-standard", dim && "opacity-50")}>
        {dup ? (
          <span className="inline-flex h-6 items-center">
            <Tag className="border-rule bg-surface text-muted">УЖЕ ЕСТЬ</Tag>
          </span>
        ) : (
          <span className="inline-flex h-6 items-center">
            <SlangMeter level={row.slang_level} verlan={row.verlan} />
          </span>
        )}
        {dup ? (
          <FolderLine label={existingFolder ?? "Входящие"} />
        ) : (
          <FolderLine label={choiceName(row.folder, folders)} onPick={onPickFolder} disabled={!addable} />
        )}
      </span>
    </li>
  );
}

const LEVEL_OPTIONS = SLANG_LABELS.map((label, value) => ({
  value: value as SlangLevel,
  label,
  lang: value === 0 ? undefined : "fr",
}));

export interface RowEditorProps {
  row: ImportRow;
  onSave: (patch: Partial<ImportRow>) => void;
  onCancel: () => void;
}

/** Edit state for one row (shared by the phone card form and the desktop inline row editor). */
export function useRowDraft(row: ImportRow) {
  const [fr, setFr] = useState(row.fr);
  const [ru, setRu] = useState(row.ru);
  const [note, setNote] = useState(row.note ?? "");
  const [exampleFr, setExampleFr] = useState(row.exampleFr ?? "");
  const [exampleRu, setExampleRu] = useState(row.exampleRu ?? "");
  const [level, setLevel] = useState<SlangLevel>(row.slang_level);
  const [verlan, setVerlan] = useState(row.verlan);
  const valid = fr.trim() !== "" && ru.trim() !== "";

  /** The row patch to save, or null while FR or RU is empty. */
  const patch = (): Partial<ImportRow> | null => {
    if (!valid) return null;
    const ruChanged = ru.trim() !== row.ru.trim();
    return {
      fr: fr.replace(/\s+/g, " ").trim(),
      ru: ru.replace(/\s+/g, " ").trim(),
      note: note.trim() || null,
      exampleFr: exampleFr.trim() || null,
      exampleRu: exampleFr.trim() ? exampleRu.trim() || null : null,
      slang_level: level,
      verlan,
      ruGuess: row.ruGuess && !ruChanged ? row.ruGuess : false,
    };
  };

  return {
    fr,
    setFr,
    ru,
    setRu,
    note,
    setNote,
    exampleFr,
    setExampleFr,
    exampleRu,
    setExampleRu,
    level,
    setLevel,
    verlan,
    setVerlan,
    valid,
    patch,
  };
}

/** Inline catalog-card form for one row (FR, RU, note, example, slang level). */
export function RowEditor({ row, onSave, onCancel }: RowEditorProps) {
  const id = useId();
  const { fr, setFr, ru, setRu, note, setNote, exampleFr, setExampleFr, exampleRu, setExampleRu, level, setLevel, verlan, setVerlan, valid, patch } =
    useRowDraft(row);

  const save = () => {
    const p = patch();
    if (p) onSave(p);
  };

  const fieldRow = "flex min-h-12 items-center border-b border-rule";
  const labelCls = "w-[88px] shrink-0 font-mono text-[11px] leading-4 tracking-[.06em] text-muted uppercase";
  const inputCls = "h-[46px] min-w-0 flex-1 border-0 bg-transparent p-0 text-ink outline-none placeholder:text-muted";

  return (
    <li className="-mx-4 flex flex-col border-b border-rule bg-surface px-4 pt-3 pb-4">
      <form
        className="flex flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
      >
        <label className={fieldRow}>
          <span className={labelCls}>Французский</span>
          <input
            lang="fr"
            autoFocus
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="next"
            value={fr}
            onChange={(e) => setFr(e.target.value)}
            className={cx(inputCls, "font-serif text-[19px] leading-6 font-medium")}
          />
        </label>
        <label className={fieldRow}>
          <span className={labelCls}>Русский</span>
          <input
            autoComplete="off"
            enterKeyHint="done"
            value={ru}
            onChange={(e) => setRu(e.target.value)}
            className={cx(inputCls, "text-[15px] leading-5 pointer-coarse:text-[16px]")}
          />
        </label>
        <label className={fieldRow}>
          <span className={labelCls}>Заметка</span>
          <input
            autoComplete="off"
            enterKeyHint="done"
            value={note}
            placeholder="необязательно"
            onChange={(e) => setNote(e.target.value)}
            className={cx(inputCls, "text-[14px] leading-5 pointer-coarse:text-[16px]")}
          />
        </label>
        <label className={fieldRow}>
          <span className={labelCls}>Пример</span>
          <input
            lang="fr"
            autoComplete="off"
            enterKeyHint="done"
            value={exampleFr}
            placeholder="необязательно"
            onChange={(e) => setExampleFr(e.target.value)}
            className={cx(inputCls, "font-serif text-[16px] leading-5 italic")}
          />
        </label>
        {exampleFr.trim() && (
          <label className={fieldRow}>
            <span className={labelCls}>Перевод</span>
            <input
              autoComplete="off"
              enterKeyHint="done"
              value={exampleRu}
              placeholder="перевод примера"
              onChange={(e) => setExampleRu(e.target.value)}
              className={cx(inputCls, "text-[14px] leading-5 pointer-coarse:text-[16px]")}
            />
          </label>
        )}
        {row.frAsSeen && row.frAsSeen !== fr && (
          <p className="m-0 mt-2 text-[12px] leading-4 text-muted">
            На скриншоте: <span lang="fr" className="font-serif text-[14px] italic">{row.frAsSeen}</span>
          </p>
        )}

        <span id={`${id}-lvl`} className="mt-4 font-mono text-[11px] leading-4 font-medium tracking-[.06em] text-muted uppercase">
          Уровень сленга
        </span>
        <div className="mt-2 flex gap-2">
          <Segmented
            variant="block"
            options={LEVEL_OPTIONS}
            value={level}
            onChange={setLevel}
            ariaLabelledby={`${id}-lvl`}
            itemClassName="font-serif italic text-[16px]"
            className="min-w-0 flex-1"
          />
          <button
            type="button"
            role="checkbox"
            lang="fr"
            aria-checked={verlan}
            title="верлан"
            onClick={() => setVerlan((v) => !v)}
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-chip border border-rule bg-surface px-3 font-serif text-[16px] leading-5 text-ink italic"
          >
            <span
              aria-hidden="true"
              className={cx(
                "box-border flex size-3.5 items-center justify-center rounded-[2px] border-[1.5px] border-ink",
                verlan && "bg-ink text-on-ink",
              )}
            >
              {verlan && <Icon name="check" size={10} strokeWidth={3} />}
            </span>
            verl.
          </button>
        </div>

        {!valid && <p className="m-0 mt-3 text-[12px] leading-4 text-again">Нужны и французское слово, и перевод.</p>}
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="tertiary" size="md" onClick={onCancel}>
            Отмена
          </Button>
          <Button type="submit" size="md" disabled={!valid}>
            Готово
          </Button>
        </div>
      </form>
    </li>
  );
}
