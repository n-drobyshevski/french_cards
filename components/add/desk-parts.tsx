"use client";

// Building blocks of the desktop «Новое слово» dialog (mockups/DESKTOP-SPEC.md §3, boards 13–16):
// text-link chrome, the scroll body + pinned footer frame, the flat-key hint line, 40px footer
// buttons with key caps, checkboxes and the theme select. Phones use parts.tsx instead.
import Link from "next/link";
import { Fragment, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icons";
import { FlatKey, Kbd } from "@/components/ui/Kbd";
import { DialogChrome } from "@/components/ui/Sheet";
import { cx } from "@/components/ui/cx";
import { useFormatKeys, useIsMac } from "@/lib/key-names";
import { useDelayedFlag } from "@/lib/use-delayed-flag";
import type { Folder } from "@/lib/types";
import { choiceKey, choiceName, INBOX_CHOICE, type FolderChoice } from "./folder-choice";

// ---------------------------------------------------------------------------------------
// Chrome: «Карточка № 159  Скриншот · Список» / back arrow + label, title, red rule.

const TEXT_LINK =
  "inline-flex h-8 items-center bg-transparent p-0 text-[13px] leading-4 font-medium whitespace-nowrap text-ink underline decoration-1 underline-offset-[3px] hoverable:decoration-2";

export function DeskChrome({
  label,
  title,
  onBack,
  onScreenshot,
  onList,
}: {
  label: string;
  title: string;
  /** Form: the back arrow before the label («Назад к поиску», Esc). */
  onBack?: () => void;
  /** «Скриншот» → /import (the dialog closes). */
  onScreenshot: () => void;
  /** «Список» (hidden while the list is shown). */
  onList?: () => void;
}) {
  const mono = <span className="font-mono text-[11px] whitespace-nowrap text-muted tabular-nums">{label}</span>;
  const tools = onBack ? (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={onBack}
        aria-label="Назад к поиску"
        title="Назад к поиску (Esc)"
        aria-keyshortcuts="Escape"
        className="-ml-2 inline-flex size-8 shrink-0 items-center justify-center rounded-[4px] bg-transparent text-ink hoverable:bg-hover-surface"
      >
        <Icon name="back" size={20} strokeWidth={1.5} />
      </button>
      {mono}
    </span>
  ) : (
    <span className="inline-flex items-center gap-4">
      {mono}
      <span className="inline-flex items-center gap-2">
        <Link href="/import" onClick={onScreenshot} className={TEXT_LINK}>
          Скриншот
        </Link>
        {onList && (
          <>
            <span aria-hidden="true" className="text-[13px] text-muted">
              ·
            </span>
            <button type="button" onClick={onList} className={TEXT_LINK}>
              Список
            </button>
          </>
        )}
      </span>
    </span>
  );
  return <DialogChrome tools={tools} title={title} />;
}

// ---------------------------------------------------------------------------------------
// Frame: the body scrolls, the footer (48 in search, 64 with buttons) stays pinned.

export function DeskFrame({
  children,
  footer,
  tall = false,
  bodyClassName,
}: {
  children: ReactNode;
  footer: ReactNode;
  /** 64px footer with 40px buttons; otherwise the 48px key-line footer. */
  tall?: boolean;
  bodyClassName?: string;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={cx("min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-6", bodyClassName ?? "pb-6")}>{children}</div>
      <div className={cx("flex shrink-0 items-center gap-2 border-t border-rule bg-surface px-6", tall ? "h-16" : "h-12")}>{footer}</div>
    </div>
  );
}

/** One hint: key combos (formatted for this platform) and what they do. */
export type Hint = readonly [keys: readonly string[], label: string];

/**
 * Footer key line: «↑ ↓ по списку · ↵ выбрать · Esc закрыть» (flat keys, 12px muted words). Hidden
 * when it does not fit beside the buttons (e.g. «Ctrl+Shift+Enter» caps off Mac): never clipped.
 */
export function HintLine({ hints }: { hints: readonly Hint[] }) {
  const fmt = useFormatKeys();
  const ref = useRef<HTMLSpanElement>(null);
  const [fits, setFits] = useState(true);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const check = () => setFits(el.scrollWidth <= el.clientWidth + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <span
      ref={ref}
      className={cx(
        "flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden text-[12px] leading-4 whitespace-nowrap text-muted",
        !fits && "invisible",
      )}
    >
      {hints.map(([keys, label], i) => (
        <Fragment key={label}>
          {i > 0 && (
            <span aria-hidden="true" className="mx-1">
              ·
            </span>
          )}
          {keys.map((k) => (
            <FlatKey key={k}>{fmt(k)}</FlatKey>
          ))}
          <span>{label}</span>
        </Fragment>
      ))}
    </span>
  );
}

/** After «Добавить и ещё»: the footer line says what was added, with «Отменить». */
export function UndoLine({ message, onUndo }: { message: string; onUndo: () => void }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-3 text-[13px] leading-5 whitespace-nowrap">
      <span role="status" className="min-w-0 truncate text-ink">
        {message}
      </span>
      <button
        type="button"
        onClick={onUndo}
        className="h-8 shrink-0 bg-transparent px-0 text-[13px] font-medium text-ink underline decoration-1 underline-offset-[3px] hoverable:decoration-2"
      >
        Отменить
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------------------
// Footer buttons: 40px, 14px 500, key cap inside (DESKTOP-SPEC: «Добавить ⌘↵»).

export interface KeyButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "disabled"> {
  variant?: "primary" | "secondary";
  /** Combo for the cap and aria-keyshortcuts, e.g. "Mod+Enter". */
  keys?: string;
  /** Shown but inactive: stays focusable, aria-disabled (DESKTOP-SPEC §3 disabled). */
  inactive?: boolean;
  /**
   * Waiting on its own action (MOTION-SPEC §3.5): no second press, full contrast; after 150 ms the
   * label becomes `pendingLabel` («Добавляем…») with the width locked to the wider label.
   */
  pending?: boolean;
  pendingLabel?: ReactNode;
  /** A sibling in the same footer is pending: presses do nothing, the look stays. */
  blocked?: boolean;
}

export function KeyButton({
  variant = "primary",
  keys,
  inactive = false,
  pending = false,
  pendingLabel = "Добавляем…",
  blocked = false,
  className,
  children,
  onClick,
  ...rest
}: KeyButtonProps) {
  const fmt = useFormatKeys();
  const mac = useIsMac();
  const swapped = useDelayedFlag(pending, { delay: 150, min: 0 });
  const shortcut = keys
    ?.split("+")
    .map((k) => (k === "Mod" ? (mac ? "Meta" : "Control") : k))
    .join("+");
  const stopped = inactive || pending || blocked;
  return (
    <button
      type="button"
      aria-disabled={stopped || undefined}
      aria-busy={pending || undefined}
      aria-keyshortcuts={shortcut}
      onClick={(e) => {
        if (!stopped) onClick?.(e);
      }}
      className={cx(
        "inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-btn border pr-3 pl-4 text-[14px] leading-5 font-medium whitespace-nowrap",
        variant === "primary"
          ? "border-ink bg-ink text-on-ink hoverable:opacity-90"
          : "border-boundary bg-surface text-ink hoverable:shadow-[inset_0_0_0_1px_var(--boundary)]",
        inactive && "cursor-default border-rule! bg-surface! text-boundary! shadow-none! hoverable:opacity-100",
        (pending || blocked) && !inactive && "cursor-default hoverable:opacity-100 hoverable:shadow-none",
        !keys && "pr-4",
        className,
      )}
      {...rest}
    >
      {/* Both labels share one grid cell, so the width never changes. */}
      <span className="grid">
        <span
          aria-hidden={swapped || undefined}
          className={cx("col-start-1 row-start-1 transition-opacity duration-(--dur-exit) ease-exit", swapped && "opacity-0")}
        >
          {children}
        </span>
        <span
          aria-hidden={!swapped || undefined}
          className={cx(
            "col-start-1 row-start-1 transition-opacity duration-(--dur-quick) ease-enter",
            !swapped && "opacity-0",
            swapped && (variant === "primary" ? "opacity-72" : "text-muted"),
          )}
        >
          {pendingLabel}
        </span>
      </span>
      {keys && (
        <Kbd aria-hidden="true" tone={variant === "primary" && !inactive ? "ink" : "paper"}>
          {fmt(keys)}
        </Kbd>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------------------
// Sections, labels, fields

/** «Словарь  работает без сети»: 28px, Plex 500 13 + 12 muted, 1px ink rule under. */
export function DeskSection({
  id,
  title,
  aside,
  className,
}: {
  id?: string;
  title: string;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex h-7 items-center justify-between gap-3 border-b border-ink", className)}>
      <h3 id={id} className="m-0 text-[13px] leading-5 font-medium text-ink">
        {title}
      </h3>
      {aside != null && <span className="min-w-0 truncate text-[12px] leading-4 text-muted tabular-nums">{aside}</span>}
    </div>
  );
}

/** 12px 500 muted field label, 6px above the control. */
export const FIELD_LABEL = "mb-1.5 block text-[12px] leading-4 font-medium text-muted";

/** 44px input: 1px boundary, radius 4; focused = 2px ink (inset shadow, no text shift). */
export const DESK_INPUT =
  "block h-11 w-full min-w-0 rounded-[4px] border border-boundary bg-surface px-[11px] text-[15px] leading-5 text-ink outline-none! placeholder:text-muted focus:border-ink focus:shadow-[inset_0_0_0_1px_var(--ink)] aria-invalid:border-again aria-invalid:focus:shadow-[inset_0_0_0_1px_var(--again)]";

export function DeskFieldError({ id, children }: { id?: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="m-0 mt-1 text-[12px] leading-4 text-again">
      {children}
    </p>
  );
}

/** 14×14 checkbox box (the only binary control on desktop). */
export function CheckBox({ checked, disabled = false, className }: { checked: boolean; disabled?: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "inline-flex size-3.5 shrink-0 items-center justify-center rounded-[2px] border",
        disabled ? "border-rule bg-paper" : checked ? "border-ink bg-ink text-on-ink" : "border-muted bg-surface",
        className,
      )}
    >
      {checked && !disabled && (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 6.2 5 8.6 9.5 3.6" />
        </svg>
      )}
    </span>
  );
}

/** Focus ring for a label that wraps a visually hidden native checkbox/select. */
export const HIDDEN_CONTROL_FOCUS = "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink";

/** Theme square: the theme's colour; «Входящие» is a dashed outline. */
export function ThemeSquare({ choice, folders, onInk = false }: { choice: FolderChoice; folders: readonly Folder[]; onInk?: boolean }) {
  if (choice.kind === "new") return null;
  const color = choice.kind === "folder" ? folders.find((f) => f.id === choice.id)?.color : undefined;
  return (
    <span
      aria-hidden="true"
      className={cx(
        "size-2 shrink-0 rounded-[1px]",
        !color ? "border border-dashed border-muted" : onInk && "border border-on-ink",
        !color && onInk && "border-on-ink",
      )}
      style={color ? { background: color } : undefined}
    />
  );
}

/**
 * «Входящие ▾» theme select (D-Add-List): a 36px outlined box over a native <select>, so the
 * keyboard and the menu are the platform's.
 */
export function ThemeSelect({
  value,
  folders,
  onChange,
  labelledBy,
  auto,
}: {
  value: FolderChoice;
  folders: readonly Folder[];
  onChange: (choice: FolderChoice) => void;
  labelledBy?: string;
  /** A first option «label» that stands for «each word to its own theme». */
  auto?: { label: string; selected: boolean; onSelect: () => void };
}) {
  const valueId = useId();
  const options: FolderChoice[] = [INBOX_CHOICE, ...folders.map((f): FolderChoice => ({ kind: "folder", id: f.id }))];
  if (value.kind === "new") options.push(value);
  return (
    <span
      className={cx(
        "relative inline-flex h-9 items-center gap-2 rounded-[4px] border border-boundary bg-surface pr-2 pl-3 text-[14px] leading-5 text-ink hoverable:bg-hover-surface",
        HIDDEN_CONTROL_FOCUS,
      )}
    >
      {!auto?.selected && <ThemeSquare choice={value} folders={folders} />}
      <span id={valueId} className="min-w-24 text-left">
        {auto?.selected ? auto.label : value.kind === "new" ? `Новая тема: ${value.name}` : choiceName(value, folders)}
      </span>
      <Icon name="chevron" size={14} strokeWidth={1.75} className="text-muted" />
      <select
        aria-labelledby={labelledBy}
        value={auto?.selected ? "auto" : choiceKey(value)}
        onChange={(e) => {
          if (auto && e.target.value === "auto") return auto.onSelect();
          const next = options.find((o) => choiceKey(o) === e.target.value);
          if (next) onChange(next);
        }}
        className="absolute inset-0 size-full cursor-pointer appearance-none opacity-0"
      >
        {auto && <option value="auto">{auto.label}</option>}
        {options.map((o) => (
          <option key={choiceKey(o)} value={choiceKey(o)}>
            {o.kind === "new" ? `Новая тема: ${o.name}` : choiceName(o, folders)}
          </option>
        ))}
      </select>
    </span>
  );
}
