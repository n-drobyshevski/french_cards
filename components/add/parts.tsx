"use client";

import Link from "next/link";
import {
  useEffect,
  useId,
  useState,
  type ClipboardEventHandler,
  type InputHTMLAttributes,
  type KeyboardEventHandler,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";
import { Button, IconButton } from "@/components/ui/Button";
import { AbbrHint } from "@/components/ui/AbbrHint";
import { Chip } from "@/components/ui/Chip";
import { Collapse } from "@/components/ui/Collapse";
import { Icon } from "@/components/ui/Icons";
import { Segmented } from "@/components/ui/Segmented";
import { SheetCloseButton, SheetTitle } from "@/components/ui/Sheet";
import { SLANG_NAMES_RU } from "@/components/ui/SlangMeter";
import { cx } from "@/components/ui/cx";
import { SkeletonRow } from "@/components/ui/Skeleton";
import { StatusLine } from "@/components/ui/StatusLine";
import type { Suggestion } from "@/lib/ai/schemas";
import { spotlight } from "@/lib/motion";
import { useDelayedFlag } from "@/lib/use-delayed-flag";
import type { SuggestApi, SuggestErrorKind } from "@/lib/use-suggest";
import { SLANG_LABELS, type Folder, type SlangLevel } from "@/lib/types";
import type { DuplicateInfo } from "./data";
import type { SpotField } from "./draft";
import { choiceKey, choiceName, INBOX_CHOICE, sameChoice, type FolderChoice } from "./folder-choice";
import { variantKey } from "./combobox";
import { plural } from "./match";

// ---------------------------------------------------------------------------------------
// Sheet chrome (L-Add-B): one 44px row, mono «№ 159» (or the title in «Несколько слов»), back
// and close, then the red index-card rule. Otherwise the sheet is named by Sheet `title` (sr-only).

export function AddSheetChrome({
  label,
  title,
  onBack,
  backLabel = "Назад",
}: {
  /** Mono catalogue number, shown when there is no visible title. */
  label?: ReactNode;
  /** A visible title that also names the sheet («Несколько слов»). */
  title?: string;
  onBack?: () => void;
  backLabel?: string;
}) {
  return (
    <div className="shrink-0">
      <div className={cx("mt-1 flex h-11 items-center justify-between pr-1", onBack ? "pl-1" : "pl-4")}>
        <span className="flex min-w-0 items-center">
          {onBack && <IconButton icon="back" label={backLabel} onClick={onBack} />}
          {title ? (
            <SheetTitle className="min-w-0 truncate max-md:text-[19px] max-md:leading-6">{title}</SheetTitle>
          ) : (
            <span className="truncate font-mono text-[12px] leading-4 tracking-[.06em] whitespace-nowrap text-muted">{label}</span>
          )}
        </span>
        <SheetCloseButton />
      </div>
      <div aria-hidden="true" className="h-0.5 bg-red" />
    </div>
  );
}

const TOOL =
  "inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-[4px] bg-transparent px-3 text-[14px] leading-5 text-ink no-underline active:bg-surface-2";

/**
 * The other ways in, under the empty headword line: «Со скриншота · Списком», two 44px text
 * buttons split by a hairline. Shown only while the line is empty.
 */
export function AddTools({ onScreenshot, onList }: { onScreenshot: () => void; onList: () => void }) {
  return (
    <div className="mx-1 mt-2 flex h-11 items-center">
      <Link href="/import" onClick={onScreenshot} className={TOOL}>
        <Icon name="camera" size={18} className="text-muted" />
        Со скриншота
      </Link>
      <span aria-hidden="true" className="h-4 w-px bg-rule" />
      <button type="button" aria-label="Списком — несколько слов сразу" onClick={onList} className={TOOL}>
        <Icon name="clipboard" size={18} className="text-muted" />
        Списком
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Headword (spec change §8): written on the card, a borderless Newsreader 22 line on a 1px ruled
// baseline that draws to 2px ink left → right while focused (--dur-move, linear; at once under
// reduced motion). The only input styled this way: search fields stay boxed.

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
  spot,
  className = "mt-8",
}: {
  /** Lit by a pick (useFieldSpotlight). */
  spot?: SpotField;
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
  /** Top margin: 32px under the red rule on the empty card. */
  className?: string;
}) {
  const clearable = Boolean(onClear && value);
  return (
    <div data-spot={spot} className={cx("group relative mx-4 flex h-12 shrink-0 items-center", className)}>
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
          "h-full w-full min-w-0 bg-transparent p-0 font-serif text-[22px] leading-7 font-medium text-ink outline-none!",
          "placeholder:font-normal placeholder:text-muted placeholder:italic",
          (clearable || Boolean(trailing)) && "pr-2",
        )}
      />
      {trailing && (
        <span className="shrink-0 whitespace-nowrap">
          {typeof trailing === "string" ? (
            <AbbrHint abbr={trailing} align="end" className="text-[15px] leading-5" />
          ) : (
            trailing
          )}
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
          className="-mr-3 text-muted"
        />
      )}
      <span aria-hidden="true" className={cx("pointer-events-none absolute inset-x-0 bottom-0 h-px", invalid ? "bg-again" : "bg-rule")} />
      <span
        aria-hidden="true"
        className={cx(
          "pointer-events-none absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 transition-transform duration-(--dur-move) ease-linear group-focus-within:scale-x-100 motion-reduce:transition-none",
          invalid ? "bg-again" : "bg-ink",
        )}
      />
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
  spot,
}: {
  label: ReactNode;
  children: ReactNode;
  align?: "center" | "start";
  as?: "label" | "div";
  className?: string;
  /** Lit by a pick or a detection (useFieldSpotlight). */
  spot?: SpotField;
}) {
  const Tag = as;
  return (
    <Tag
      data-spot={spot}
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

// ---------------------------------------------------------------------------------------
// «Варианты» region (MOTION-SPEC A2, A3, §3.6, §3.8): N × 72px slots reserved as soon as there is a
// query; status line + skeleton bars 150 ms after the debounce (held at least 500 ms); each streamed
// row takes the first free slot in place; at the end the status reads «3 варианта» and fades, and the
// slots left over collapse. Errors take a slot at row height, so nothing above or around them moves.

/** Height of a «Варианты» row and of its reserved slot. */
export const VARIANT_ROW_HEIGHT = 72;
const STAGGER_MS = 40;
const STAGGER_CAP_MS = 200;

export type VariantSlot =
  | { kind: "row"; key: string; suggestion: Suggestion; delay: number }
  | { kind: "error"; key: string; error: SuggestErrorKind }
  | { kind: "empty"; key: string }
  | { kind: "slot"; key: string; index: number; bars: boolean; collapsed: boolean };

export interface VariantsStatus {
  text: string;
  /** Still waiting: elapsed time and the ink run (StatusLine). */
  active: boolean;
  /** The finished count: fades out after 1.2 s. */
  fade: boolean;
  /** Remount key: a new count fades on its own. */
  key: string;
  announce: string;
}

export interface VariantsRegion {
  /** null: the 21px status slot stays blank. */
  status: VariantsStatus | null;
  slots: VariantSlot[];
  busy: boolean;
}

const ERROR_STATUS: Record<SuggestErrorKind, string> = {
  offline: "Нет сети",
  unavailable: "Недоступно",
  rate_limited: "Не удалось",
  failed: "Не удалось",
};

export const VARIANT_ERRORS: Record<SuggestErrorKind, { text: string; retry: boolean }> = {
  offline: { text: "Нет сети — варианты появятся, когда она вернётся", retry: false },
  unavailable: { text: "Подсказки недоступны — заполните вручную", retry: false },
  rate_limited: { text: "Слишком много запросов — попробуйте через минуту", retry: true },
  failed: { text: "Не удалось подобрать варианты", retry: true },
};

const variantsCount = (n: number) => (n === 0 ? "Нет вариантов" : `${n} ${plural(n, ["вариант", "варианта", "вариантов"])}`);

/** Slot and status-line state for «Варианты»; shared by the phone sheet and the desktop dialog. */
export function useVariantsRegion(suggest: SuggestApi): VariantsRegion {
  const { status, results, error, query, requesting } = suggest;
  const loading = status === "loading";
  const waiting = useDelayedFlag(loading && requesting, { delay: 150, min: 500 });

  // The query whose wait was visible: only that one echoes its count and fades its bars out.
  const [waitedFor, setWaitedFor] = useState<string | null>(null);
  if (waiting && waitedFor !== query) setWaitedFor(query);
  const waited = waitedFor === query;

  // Rows that arrive together rise one after another (40 ms apart, 200 ms at most); a row keeps
  // its delay while it stays, so a later row never restarts an earlier one.
  const keys = results.map(variantKey);
  const signature = keys.join("\u0002");
  const [stagger, setStagger] = useState<{ signature: string; delays: ReadonlyMap<string, number> }>({
    signature: "",
    delays: new Map(),
  });
  let delays = stagger.delays;
  if (stagger.signature !== signature) {
    const next = new Map<string, number>();
    let fresh = 0;
    for (const key of keys) next.set(key, stagger.delays.get(key) ?? Math.min(fresh++ * STAGGER_MS, STAGGER_CAP_MS));
    delays = next;
    setStagger({ signature, delays: next });
  }

  const slots: VariantSlot[] = results.map((suggestion, i) => ({
    kind: "row",
    key: keys[i],
    suggestion,
    delay: delays.get(keys[i]) ?? 0,
  }));
  if (status === "error" && error) slots.push({ kind: "error", key: "error", error });
  else if (status === "done" && results.length === 0) slots.push({ kind: "empty", key: "empty" });
  // Finished and the indicator released: the slots left over leave (fading their bars if shown).
  const collapsed = (status === "done" || status === "error") && !waiting;
  for (let i = slots.length; i < Math.max(1, suggest.max); i++) {
    slots.push({ kind: "slot", key: `slot-${i}`, index: i, bars: waiting || (collapsed && waited), collapsed });
  }

  let line: VariantsStatus | null = null;
  if (status === "error" && error) {
    const text = ERROR_STATUS[error];
    line = { text, active: false, fade: false, key: "live", announce: VARIANT_ERRORS[error].text };
  } else if (loading && waiting) {
    line = { text: "Подбираем варианты", active: true, fade: false, key: "live", announce: "Подбираем варианты" };
  } else if (status === "done" && waited) {
    line = {
      text: variantsCount(results.length),
      active: false,
      fade: true,
      key: `done:${query}`,
      announce: `Варианты: ${results.length}`,
    };
  }

  return { status: line, slots, busy: loading };
}

/** The 21px status slot above the rows: blank, or the StatusLine on its hairline. */
export function VariantsStatusSlot({ status, className }: { status: VariantsStatus | null; className?: string }) {
  return (
    <div className={cx("h-[21px]", className)}>
      {status && (
        <div
          key={status.key}
          className={cx(status.fade && "animate-[fade-out_var(--dur-exit)_var(--ease-exit)_1200ms_both]")}
        >
          <StatusLine text={status.text} active={status.active} announce={status.announce} />
        </div>
      )}
    </div>
  );
}

const SLOT_EXIT = "opacity var(--dur-exit) var(--ease-exit), grid-template-rows var(--dur-move) var(--ease-standard) var(--dur-exit)";

/**
 * A reserved slot: blank, or a skeleton row once the wait shows. When the answer is in, it fades
 * (--dur-exit) and then closes its height (--dur-move). It reopens at once for the next query.
 */
export function VariantSlotFrame({ slot, className }: { slot: Extract<VariantSlot, { kind: "slot" }>; className?: string }) {
  return (
    <div
      aria-hidden="true"
      data-variant-slot={slot.collapsed ? "collapsed" : slot.bars ? "skeleton" : "reserved"}
      className={cx("grid", slot.collapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr]", className)}
      style={slot.collapsed ? { transition: SLOT_EXIT } : undefined}
    >
      <div className="min-h-0 overflow-hidden">
        {slot.bars ? (
          <SkeletonRow height={VARIANT_ROW_HEIGHT} index={slot.index} lines={2} meter fade />
        ) : (
          <div style={{ height: VARIANT_ROW_HEIGHT }} />
        )}
      </div>
    </div>
  );
}

/**
 * The error in place of the first free slot, at row height: 1px --again rule on top, «Повторить» right.
 * Offline is not an error (B4): decided before any wait, it reads as a muted notice with no rule,
 * and the request goes out by itself when the network is back.
 */
export function VariantError({ kind, onRetry, className }: { kind: SuggestErrorKind; onRetry: () => void; className?: string }) {
  const e = VARIANT_ERRORS[kind];
  const offline = kind === "offline";
  return (
    <div
      data-variant-error={kind}
      // -mt-px: the --again rule lies on the hairline above it (status line or last row).
      className={cx("relative flex items-center justify-between gap-3", !offline && "-mt-px border-t border-again", className)}
      style={{ height: VARIANT_ROW_HEIGHT }}
    >
      <p className={cx("m-0 min-w-0 text-[13px] leading-5", offline ? "text-muted" : "text-ink")}>{e.text}</p>
      {e.retry && (
        <Button variant="tertiary" size="sm" className="-mr-2.5" onClick={onRetry}>
          Повторить
        </Button>
      )}
    </div>
  );
}

/** A streamed row rises into its slot: 4px + fade, --dur-enter, staggered when rows land together. */
export const VARIANT_ENTER = "animate-[enter-rise_var(--dur-enter)_var(--ease-enter)_both]";

// ---------------------------------------------------------------------------------------
// «Словарь» while the lexique loads (MOTION-SPEC A4): the section keeps its header and 3 row slots
// from the first letter; static bars fade in after --loading-delay (300 ms); the words fill the
// slots in place, and the slots left over fade and close like the «Варианты» ones.

export const DICTIONARY_ROWS = 3;

/**
 * Whether «Словарь» keeps its slots: once the lexique was still loading for a shown headword, the
 * section stays reserved for the rest of the sheet's life, so its rows can fill in place.
 */
export function useDictionaryReserved(loading: boolean): boolean {
  const [reserved, setReserved] = useState(loading);
  if (loading && !reserved) setReserved(true);
  return reserved || loading;
}

/** A reserved «Словарь» row: blank, then bars (CSS delay, so a fast load never paints them); closes once loaded. */
export function DictionarySlot({ height, index, loaded, className }: { height: number; index: number; loaded: boolean; className?: string }) {
  return (
    <div
      aria-hidden="true"
      data-dictionary-slot={loaded ? "collapsed" : "loading"}
      className={cx("grid", loaded ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr]", className)}
      style={loaded ? { transition: SLOT_EXIT } : undefined}
    >
      <div className="min-h-0 overflow-hidden">
        <SkeletonRow height={height} index={index} lines={1} fade className="delayed-in" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Detection in the forms (MOTION-SPEC A5, A6, §5.14): what is being detected shows its unknown
// state after 300 ms; what a pick or a detection filled is lit with the spotlight.

export type { SpotField };

/** One pick or one detection result: the fields it filled, lit together. `seq` restarts the fade. */
export interface FieldSpot {
  seq: number;
  fields: readonly SpotField[];
}

/**
 * Lights the fields of `spot` inside `root` each time a new spot comes (also on mount: a pick opens
 * the form). A field marked `data-spot-target="inputs"` lights its own inputs (opaque boxes).
 */
export function useFieldSpotlight(root: RefObject<HTMLElement | null>, spot: FieldSpot | null | undefined): void {
  useEffect(() => {
    if (!spot || !root.current) return;
    for (const field of spot.fields) {
      for (const el of root.current.querySelectorAll(`[data-spot~="${field}"]`)) {
        if (el.getAttribute("data-spot-target") === "inputs") el.querySelectorAll("input, textarea").forEach((input) => spotlight(input));
        else spotlight(el);
      }
    }
  }, [root, spot]);
}

/** What detection is doing for an open form; each part only when its setting is on. */
export interface FormDetection {
  /** Pending for 300 ms: show the unknown states. */
  waiting: boolean;
  /** The request failed: «не определилось». */
  failed: boolean;
  slang: boolean;
  examples: boolean;
  themes: boolean;
}

/** The slang meter before the level is known: 4 segments in --rule. */
export function UnknownMeter({ size = "md", className }: { size?: "sm" | "md"; className?: string }) {
  return (
    <span role="img" aria-label="Уровень сленга определяется" className={cx("inline-flex shrink-0 items-center gap-[2px]", className)}>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} aria-hidden="true" className={cx("bg-rule", size === "sm" ? "h-[2px] w-2" : "h-[3px] w-2.5")} />
      ))}
    </span>
  );
}

/** The mono «…» standing in for a value on its way (an example, a theme). */
export function PendingDots({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cx("font-mono text-[13px] leading-5 tracking-[.06em] text-muted not-italic", className)}>
      …
    </span>
  );
}

// ---------------------------------------------------------------------------------------
// Notices

/**
 * A9: the «Уже есть…» notice opens with Collapse (height --dur-move + fade) instead of appearing at
 * once, and closes the same way, keeping the last duplicate on screen while it closes. No shake, no
 * red: the notice's own warn colours carry it.
 */
export function DuplicateReveal({ info, children }: { info: DuplicateInfo | null; children: (info: DuplicateInfo) => ReactNode }) {
  const [held, setHeld] = useState(info);
  if (info && info !== held) setHeld(info);
  const shown = info ?? held;
  return (
    <Collapse open={info != null} appear onClosed={() => setHeld(null)}>
      {shown && children(shown)}
    </Collapse>
  );
}

/**
 * «Уже есть» as one 64px dashed warn row (Add-Duplicate B): «Уже есть · Деньги» + «Открыть ›» over
 * the saved translation; the whole row opens the saved word. «Всё равно добавить» is a muted text
 * action under it (on phones picking a «Вариант» counts as adding anyway too).
 */
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
    <div role="alert" className="mx-4 mt-4 flex flex-col">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Уже есть ${where}: ${info.word.fr} — ${info.word.ru}. Открыть`}
        className="flex h-16 w-full flex-col justify-center gap-0.5 rounded-card border border-dashed border-warn-edge bg-warn-bg px-4 text-left active:bg-surface-2"
      >
        <span className="flex w-full items-baseline justify-between gap-3">
          <span className="min-w-0 truncate text-[15px] leading-5 font-semibold text-warn">Уже есть · {info.folderName ?? "Входящие"}</span>
          <span className="inline-flex shrink-0 items-center gap-0.5 self-center text-[14px] leading-5 font-medium text-ink">
            Открыть
            <Icon name="chevron-right" size={16} />
          </span>
        </span>
        <span className="w-full truncate text-[14px] leading-5 text-ink">{info.word.ru}</span>
      </button>
      <button
        type="button"
        onClick={onAddAnyway}
        className="-mr-1 h-11 self-end bg-transparent px-1 text-[14px] leading-5 whitespace-nowrap text-muted active:underline"
      >
        Всё равно добавить
      </button>
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
  auto,
}: {
  id?: string;
  value: FolderChoice;
  folders: readonly Folder[];
  onChange: (choice: FolderChoice) => void;
  labelledBy?: string;
  /** A first option «label» that stands for «each word to its own theme». */
  auto?: { label: string; selected: boolean; onSelect: () => void };
}) {
  const options: FolderChoice[] = [INBOX_CHOICE, ...folders.map((f): FolderChoice => ({ kind: "folder", id: f.id }))];
  if (value.kind === "new") options.push(value);
  return (
    <span className="relative flex min-w-0 flex-1 items-center">
      <select
        id={id}
        aria-labelledby={labelledBy}
        value={auto?.selected ? "auto" : choiceKey(value)}
        onChange={(e) => {
          if (auto && e.target.value === "auto") return auto.onSelect();
          const next = options.find((o) => choiceKey(o) === e.target.value);
          if (next) onChange(next);
        }}
        className="h-[46px] w-full min-w-0 cursor-pointer appearance-none bg-transparent pr-6 text-[15px] leading-5 text-ink outline-none! pointer-coarse:text-[16px]"
      >
        {auto && <option value="auto">{auto.label}</option>}
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
 * «Тема» chips. With an automatic pick: one row with the pick, its top alternative and «Другие
 * темы», which opens in place the dashed «+ новая тема: X», the other alternatives and every theme
 * (a selected one never hides). «подобрано автоматически» is for screen readers: the spotlight
 * marks the pick. Without a pick: «Входящие» and every theme.
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
  const primary: FolderChoice[] = auto ? [auto, ...alternatives.slice(0, 1)] : all;
  const rest: FolderChoice[] = [];
  if (auto) {
    const seen = new Set(primary.map(choiceKey));
    for (const c of [...(proposal ? [proposal] : []), ...alternatives.slice(1), ...all]) {
      if (seen.has(choiceKey(c))) continue;
      seen.add(choiceKey(c));
      rest.push(c);
    }
  }
  const [expanded, setExpanded] = useState(false);
  const held = expanded ? undefined : rest.find((c) => sameChoice(c, value));
  const autoSelected = auto !== null && sameChoice(value, auto);

  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="mt-0.5 flex flex-col">
      <div className={CHIP_ROW}>
        {[...primary, ...(held ? [held] : [])].map((c, i) => (
          <ChoiceChip
            key={choiceKey(c)}
            choice={c}
            folders={folders}
            selected={sameChoice(value, c)}
            onSelect={onChange}
            describedBy={auto && i === 0 ? captionId : undefined}
          />
        ))}
        {rest.length > 0 && !expanded && (
          <Chip dropdown aria-expanded={false} onClick={() => setExpanded(true)}>
            Другие темы
          </Chip>
        )}
      </div>
      {autoSelected && (
        <span id={captionId} className="sr-only">
          подобрано автоматически
        </span>
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
  pending = false,
  failed = false,
  onChange,
}: {
  level: SlangLevel;
  verlan: boolean;
  /** «определён автоматически» (for screen readers). */
  auto: boolean;
  /** Detection has been running for 300 ms: the unknown meter («определяется…» for screen readers). */
  pending?: boolean;
  /** Detection failed: «не определилось» (muted, no alert). */
  failed?: boolean;
  onChange: (next: { slang_level?: SlangLevel; verlan?: boolean }) => void;
}) {
  const labelId = useId();
  const options = ([0, 1, 2, 3] as const).map((l) => ({
    value: l as SlangLevel,
    ariaLabel: SLANG_NAMES_RU[l],
    lang: l === 0 ? undefined : "fr",
    label: (
      <>
        {!pending && l < level && (
          <span aria-hidden="true" className={cx("absolute inset-x-0 top-0 h-[3px]", level === 3 ? "bg-red" : "bg-ink")} />
        )}
        {SLANG_LABELS[l]}
      </>
    ),
  }));
  const caption = pending ? "определяется…" : failed ? "не определилось" : auto ? "определён автоматически" : null;
  return (
    <div data-spot="slang" className="mx-4 mt-6">
      <div className="flex items-baseline justify-between gap-3">
        <span id={labelId} className="meta font-medium">
          Уровень сленга
        </span>
        {/* Only «не определилось» shows: the unknown meter draws the wait and the spotlight marks what
            detection filled; the words stay for screen readers. */}
        <span role={pending || failed ? "status" : undefined} className="flex items-center gap-2 text-[12px] leading-4 text-muted">
          {pending && <UnknownMeter />}
          {caption && <span className={cx(!failed && "sr-only")}>{caption}</span>}
        </span>
      </div>
      <div className="mt-2 flex gap-2">
        <Segmented
          variant="block"
          options={options}
          value={pending ? null : level}
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
