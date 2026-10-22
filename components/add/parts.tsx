"use client";

import Link from "next/link";
import { useId, useState, type ClipboardEventHandler, type InputHTMLAttributes, type KeyboardEventHandler, type ReactNode, type Ref } from "react";
import { Button, IconButton } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Icon, type IconName } from "@/components/ui/Icons";
import { Segmented } from "@/components/ui/Segmented";
import { SheetCloseButton, SheetTitle } from "@/components/ui/Sheet";
import { SLANG_NAMES_RU, SlangMeter } from "@/components/ui/SlangMeter";
import { cx } from "@/components/ui/cx";
import type { SuggestErrorKind } from "@/lib/use-suggest";
import { SLANG_LABELS, type Folder, type SlangLevel } from "@/lib/types";
import type { DuplicateInfo } from "./data";
import { choiceKey, choiceName, INBOX_CHOICE, sameChoice, type FolderChoice } from "./folder-choice";
import { cardNumber } from "./match";

// ---------------------------------------------------------------------------------------
// Sheet chrome: «КАРТОЧКА № 159» + close, title + tools, red index-card rule.

export function AddSheetChrome({
  label,
  title,
  tools,
  onBack,
  backLabel = "Назад",
}: {
  label: ReactNode;
  title: string;
  tools?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
}) {
  return (
    <div className="shrink-0">
      <div className={cx("mt-1 flex h-11 items-center justify-between pr-1", onBack ? "pl-1" : "pl-4")}>
        <span className="flex min-w-0 items-center">
          {onBack && <IconButton icon="back" label={backLabel} onClick={onBack} />}
          <span className="meta truncate whitespace-nowrap">{label}</span>
        </span>
        <SheetCloseButton />
      </div>
      <div className="flex h-11 items-center justify-between gap-2 px-4">
        <SheetTitle className="min-w-0 truncate">{title}</SheetTitle>
        {tools && <div className="flex shrink-0 items-center gap-2">{tools}</div>}
      </div>
      <div aria-hidden="true" className="mt-2 h-0.5 bg-red" />
    </div>
  );
}

const TOOL =
  "relative inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-chip border border-rule bg-surface px-2.5 text-[13px] leading-4 font-medium text-ink no-underline active:bg-surface-2 before:absolute before:-inset-y-1.5 before:inset-x-0 before:content-['']";

/** «Скриншот» / «Список» header tools: 32px outlined boxes with a 44px hit area. */
export function ToolButton({ icon, children, onClick }: { icon: IconName; children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={TOOL}>
      <Icon name={icon} size={16} />
      {children}
    </button>
  );
}

export function ToolLink({ icon, href, children, onClick }: { icon: IconName; href: string; children: ReactNode; onClick?: () => void }) {
  return (
    <Link href={href} onClick={onClick} className={TOOL}>
      <Icon name={icon} size={16} />
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------------------
// Headword: the big 56px input (Newsreader 22). 1px ink border, 2px while focused.

export function HeadwordInput({
  inputRef,
  value,
  onValueChange,
  ariaLabel,
  placeholder,
  lang,
  trailing,
  onClear,
  invalid,
  describedBy,
  onKeyDown,
  onPaste,
  enterKeyHint,
  autoFocus,
}: {
  inputRef?: Ref<HTMLInputElement>;
  value: string;
  onValueChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  lang?: string;
  /** Right-side content, e.g. the italic part-of-speech abbreviation. */
  trailing?: ReactNode;
  /** Shows a clear (×) button while there is text. */
  onClear?: () => void;
  invalid?: boolean;
  describedBy?: string;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  onPaste?: ClipboardEventHandler<HTMLInputElement>;
  enterKeyHint?: InputHTMLAttributes<HTMLInputElement>["enterKeyHint"];
  autoFocus?: boolean;
}) {
  const clearable = Boolean(onClear && value);
  return (
    <div
      className={cx(
        "relative mx-4 mt-4 flex h-14 shrink-0 items-center rounded-[4px] border bg-surface focus-within:shadow-[inset_0_0_0_1px_var(--ink)]",
        invalid ? "border-again focus-within:shadow-[inset_0_0_0_1px_var(--again)]" : "border-ink",
      )}
    >
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        placeholder={placeholder}
        lang={lang}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint={enterKeyHint}
        autoFocus={autoFocus}
        className={cx(
          "h-full w-full min-w-0 rounded-[3px] bg-transparent pl-[15px] font-serif text-[22px] leading-7 font-medium text-ink outline-none!",
          "placeholder:font-sans placeholder:text-[15px] placeholder:font-normal placeholder:text-muted",
          clearable || trailing ? "pr-2" : "pr-[15px]",
        )}
      />
      {trailing && (
        <span lang="fr" aria-hidden="true" className="abbr shrink-0 pr-[15px] text-[15px] leading-5 whitespace-nowrap">
          {trailing}
        </span>
      )}
      {clearable && (
        <IconButton
          icon="close"
          label="Стереть"
          iconSize={18}
          onClick={onClear}
          // Keep focus (and the on-screen keyboard) in the input.
          onMouseDown={(e) => e.preventDefault()}
          className="mr-0.5 text-muted"
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Sections and catalog-card fields

export function SectionHeader({ id, title, aside, className }: { id?: string; title: string; aside?: ReactNode; className?: string }) {
  return (
    <div className={cx("mx-4 mt-6 flex items-baseline justify-between gap-3 border-b border-ink pb-2", className)}>
      <h3 id={id} className="meta m-0 font-medium">
        {title}
      </h3>
      {aside && <span className="min-w-0 truncate text-[12px] leading-4 text-muted">{aside}</span>}
    </div>
  );
}

/** Label column (88px mono) + control, separated by hairlines. The row underline turns ink while focused. */
export function FieldRow({
  label,
  children,
  align = "center",
  as = "label",
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  align?: "center" | "start";
  as?: "label" | "div";
  className?: string;
}) {
  const Tag = as;
  return (
    <Tag
      className={cx(
        "flex border-b border-rule focus-within:border-ink focus-within:shadow-[0_1px_0_0_var(--ink)]",
        align === "start" ? "items-start" : "min-h-12 items-center",
        className,
      )}
    >
      <span className={cx("meta w-[88px] shrink-0", align === "start" && "pt-3.5")}>{label}</span>
      {children}
    </Tag>
  );
}

/** The row shows focus (ink underline), so the global focus ring is turned off on the control itself. */
/** iOS zooms the page into any field under 16px, so touch devices get 16px text in every input. */
export const FIELD_INPUT =
  "h-[46px] min-w-0 flex-1 bg-transparent p-0 text-[15px] leading-5 text-ink outline-none! placeholder:text-muted pointer-coarse:text-[16px]";

export function FieldError({ id, children }: { id?: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="m-0 mt-1 text-[13px] leading-5 text-again">
      {children}
    </p>
  );
}

/** Two hairline placeholder rows while «Варианты» load (no "думает…"). */
export function SkeletonRows({ count = 2 }: { count?: number }) {
  const widths = [
    [136, 104],
    [96, 152],
    [120, 88],
  ];
  return (
    <div role="status" aria-label="Загружаем варианты" className="flex flex-col">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} aria-hidden="true" className="flex h-11 items-center justify-between border-b border-rule">
          <span className="flex flex-col gap-1.5">
            <span className="block h-2 rounded-[2px] bg-surface-2" style={{ width: widths[i % 3][0] }} />
            <span className="block h-1.5 rounded-[2px] bg-surface-2" style={{ width: widths[i % 3][1] }} />
          </span>
          <span className="mr-7 inline-flex gap-[2px]">
            {[0, 1, 2, 3].map((s) => (
              <span key={s} className="h-[3px] w-2.5 bg-surface-2" />
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Notices

export function DuplicateNotice({
  info,
  onOpen,
  onAddAnyway,
}: {
  info: DuplicateInfo;
  onOpen: () => void;
  onAddAnyway: () => void;
}) {
  const where = info.folderName ? `в теме «${info.folderName}»` : "во «Входящих»";
  return (
    <div role="alert" className="mx-4 mt-4 rounded-card border border-dashed border-warn-edge bg-warn-bg p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[15px] leading-5 font-semibold text-warn">Уже есть {where}</span>
        <span className="shrink-0 font-mono text-[11px] leading-4 tracking-[.06em] whitespace-nowrap text-warn">
          {cardNumber(info.ordinal)}
        </span>
      </div>
      <div className="mt-2 flex min-h-6 items-center justify-between gap-3">
        <span className="flex min-w-0 items-baseline gap-2 whitespace-nowrap">
          <span lang="fr" className="truncate font-serif text-[19px] leading-6 font-medium text-ink">
            {info.word.fr}
          </span>
          <span className="truncate text-[15px] leading-5 text-ink">{info.word.ru}</span>
        </span>
        <SlangMeter level={info.word.slang_level} verlan={info.word.verlan} />
      </div>
      <div className="mt-4 flex items-center gap-4">
        <Button variant="secondary" size="md" className="px-5" onClick={onOpen}>
          Открыть
        </Button>
        <button
          type="button"
          onClick={onAddAnyway}
          className="h-11 shrink-0 bg-transparent px-1 text-[15px] leading-5 font-medium whitespace-nowrap text-ink active:underline"
        >
          Всё равно добавить
        </button>
      </div>
    </div>
  );
}

const NOTICE: Record<SuggestErrorKind, { lead: string; rest: string; retry: boolean }> = {
  offline: { lead: "Нет сети — подсказки недоступны.", rest: "Заполни вручную, мы синхронизируем позже.", retry: false },
  unavailable: { lead: "Подсказки недоступны.", rest: "Заполни вручную.", retry: false },
  rate_limited: { lead: "Слишком много запросов подряд.", rest: "Заполни вручную или попробуй через минуту.", retry: true },
  failed: { lead: "Подсказки не загрузились.", rest: "Заполни вручную или попробуй ещё раз.", retry: true },
};

export function SuggestNotice({ kind, onRetry, className }: { kind: SuggestErrorKind; onRetry?: () => void; className?: string }) {
  const n = NOTICE[kind];
  return (
    <div role="status" className={cx("mx-4 mt-4 flex items-start gap-2.5", className)}>
      <Icon name={kind === "offline" ? "cloud-off" : "alert"} size={18} className="mt-px shrink-0 text-muted" />
      <p className="m-0 text-[13px] leading-5 text-muted">
        <span className="font-medium text-ink">{n.lead}</span> {n.rest}
        {n.retry && onRetry && (
          <>
            {" "}
            <button
              type="button"
              onClick={onRetry}
              className="relative bg-transparent p-0 text-[13px] leading-5 font-medium text-ink underline decoration-1 underline-offset-2 before:absolute before:-inset-3 before:content-['']"
            >
              Повторить
            </button>
          </>
        )}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Theme pickers

/** Native select for compact forms («ТЕМА  Входящие ▾»). */
export function FolderSelect({
  id,
  value,
  folders,
  onChange,
  labelledBy,
}: {
  id?: string;
  value: FolderChoice;
  folders: readonly Folder[];
  onChange: (choice: FolderChoice) => void;
  labelledBy?: string;
}) {
  const options: FolderChoice[] = [INBOX_CHOICE, ...folders.map((f): FolderChoice => ({ kind: "folder", id: f.id }))];
  if (value.kind === "new") options.push(value);
  return (
    <span className="relative flex min-w-0 flex-1 items-center">
      <select
        id={id}
        aria-labelledby={labelledBy}
        value={choiceKey(value)}
        onChange={(e) => {
          const next = options.find((o) => choiceKey(o) === e.target.value);
          if (next) onChange(next);
        }}
        className="h-[46px] w-full min-w-0 cursor-pointer appearance-none bg-transparent pr-6 text-[15px] leading-5 text-ink outline-none! pointer-coarse:text-[16px]"
      >
        {options.map((o) => (
          <option key={choiceKey(o)} value={choiceKey(o)}>
            {o.kind === "new" ? `Новая тема: ${o.name}` : choiceName(o, folders)}
          </option>
        ))}
      </select>
      <Icon name="chevron" size={16} className="pointer-events-none absolute right-0 text-ink" />
    </span>
  );
}

function ChoiceChip({
  choice,
  folders,
  selected,
  onSelect,
  describedBy,
}: {
  choice: FolderChoice;
  folders: readonly Folder[];
  selected: boolean;
  onSelect: (c: FolderChoice) => void;
  describedBy?: string;
}) {
  const isNew = choice.kind === "new";
  return (
    <Chip
      role="radio"
      selected={selected}
      dashed={isNew}
      icon={isNew ? "plus" : undefined}
      aria-describedby={describedBy}
      onClick={() => onSelect(choice)}
      className={cx("max-w-full", isNew && "pl-2")}
    >
      <span className="truncate">{isNew ? `новая тема: ${choice.name}` : choiceName(choice, folders)}</span>
    </Chip>
  );
}

const CHIP_ROW = "flex flex-wrap gap-x-2 gap-y-3.5 py-[7px]";

/**
 * «Тема» chips. With an automatic pick: the pick (+ caption «подобрано автоматически» while
 * it stays selected), its alternatives, the dashed «+ новая тема: X», and «Другие» to reveal
 * every theme. Without one: «Входящие» and every theme.
 */
export function FolderChips({
  value,
  onChange,
  folders,
  auto,
  alternatives = [],
  proposal = null,
  labelledBy,
}: {
  value: FolderChoice;
  onChange: (choice: FolderChoice) => void;
  folders: readonly Folder[];
  auto: FolderChoice | null;
  alternatives?: readonly FolderChoice[];
  proposal?: FolderChoice | null;
  labelledBy: string;
}) {
  const captionId = useId();
  const all: FolderChoice[] = [INBOX_CHOICE, ...folders.map((f): FolderChoice => ({ kind: "folder", id: f.id }))];
  const primary: FolderChoice[] = auto ? [auto, ...alternatives] : all;
  const shownKeys = new Set([...primary, ...(proposal ? [proposal] : [])].map(choiceKey));
  const rest = auto ? all.filter((c) => !shownKeys.has(choiceKey(c))) : [];
  const [expanded, setExpanded] = useState(() => rest.some((c) => sameChoice(c, value)));
  const autoSelected = auto !== null && sameChoice(value, auto);

  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="mt-0.5 flex flex-col">
      <div className={CHIP_ROW}>
        {primary.map((c, i) => (
          <ChoiceChip
            key={choiceKey(c)}
            choice={c}
            folders={folders}
            selected={sameChoice(value, c)}
            onSelect={onChange}
            describedBy={auto && i === 0 ? captionId : undefined}
          />
        ))}
      </div>
      {autoSelected && (
        <span id={captionId} className="-mt-0.5 text-[12px] leading-4 text-muted">
          подобрано автоматически
        </span>
      )}
      {(proposal || rest.length > 0) && (
        <div className={CHIP_ROW}>
          {proposal && <ChoiceChip choice={proposal} folders={folders} selected={sameChoice(value, proposal)} onSelect={onChange} />}
          {rest.length > 0 && !expanded && (
            <Chip dropdown aria-expanded={false} onClick={() => setExpanded(true)}>
              Другие темы
            </Chip>
          )}
        </div>
      )}
      {expanded && rest.length > 0 && (
        <div className={CHIP_ROW}>
          {rest.map((c) => (
            <ChoiceChip key={choiceKey(c)} choice={c} folders={folders} selected={sameChoice(value, c)} onSelect={onChange} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Slang level: the meter, enlarged into a 4-option control, plus the verl. checkbox.

export function SlangPicker({
  level,
  verlan,
  auto,
  onChange,
}: {
  level: SlangLevel;
  verlan: boolean;
  /** Show «определён автоматически». */
  auto: boolean;
  onChange: (next: { slang_level?: SlangLevel; verlan?: boolean }) => void;
}) {
  const labelId = useId();
  const options = ([0, 1, 2, 3] as const).map((l) => ({
    value: l as SlangLevel,
    ariaLabel: SLANG_NAMES_RU[l],
    lang: l === 0 ? undefined : "fr",
    label: (
      <>
        {l < level && (
          <span aria-hidden="true" className={cx("absolute inset-x-0 top-0 h-[3px]", level === 3 ? "bg-red" : "bg-ink")} />
        )}
        {SLANG_LABELS[l]}
      </>
    ),
  }));
  return (
    <div className="mx-4 mt-6">
      <div className="flex items-baseline justify-between gap-3">
        <span id={labelId} className="meta font-medium">
          Уровень сленга
        </span>
        {auto && <span className="text-[12px] leading-4 text-muted">определён автоматически</span>}
      </div>
      <div className="mt-2 flex gap-2">
        <Segmented
          variant="block"
          options={options}
          value={level}
          onChange={(v) => onChange({ slang_level: v })}
          ariaLabelledby={labelId}
          className="min-w-0 flex-1"
          itemClassName="relative font-serif italic text-[16px]! leading-5!"
        />
        <button
          type="button"
          role="checkbox"
          aria-checked={verlan}
          aria-label="верлан"
          lang="fr"
          onClick={() => onChange({ verlan: !verlan })}
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-chip border border-rule bg-surface px-3 font-serif text-[16px] leading-5 text-ink italic active:bg-surface-2"
        >
          <span
            aria-hidden="true"
            className={cx(
              "flex size-3.5 shrink-0 items-center justify-center rounded-[2px] border-[1.5px] border-ink",
              verlan && "bg-ink text-on-ink",
            )}
          >
            {verlan && <Icon name="check" size={10} strokeWidth={3} />}
          </span>
          verl.
        </button>
      </div>
    </div>
  );
}

/** «Карточки в обе стороны» checkbox row (FR → RU · RU → FR). */
export function BothDirectionsRow({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  const labelId = useId();
  return (
    <div className="mx-4 mt-4 flex h-14 items-center border-y border-rule">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-labelledby={labelId}
        onClick={() => onChange(!checked)}
        className="flex h-full w-full items-center gap-4 bg-transparent p-0 text-left text-ink"
      >
        <span
          aria-hidden="true"
          className={cx(
            "flex size-5 shrink-0 items-center justify-center rounded-[2px]",
            checked ? "bg-ink text-on-ink" : "border-[1.5px] border-ink bg-surface",
          )}
        >
          {checked && <Icon name="check" size={14} strokeWidth={2.5} />}
        </span>
        <span className="flex flex-col">
          <span id={labelId} className="text-[15px] leading-5">
            Карточки в обе стороны
          </span>
          <span className="font-mono text-[11px] leading-4 tracking-[.06em] text-muted">FR → RU · RU → FR</span>
        </span>
      </button>
    </div>
  );
}
