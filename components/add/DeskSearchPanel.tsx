"use client";

import { useEffect, useId, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icons";
import { Kbd } from "@/components/ui/Kbd";
import { SlangMeter, slangAbbr } from "@/components/ui/SlangMeter";
import { cx } from "@/components/ui/cx";
import { detectDirection } from "@/lib/ai/normalize";
import { useFormatKeys } from "@/lib/key-names";
import type { LexiqueHit } from "@/lib/lexique";
import type { Folder, SlangLevel, Word } from "@/lib/types";
import { dictionaryKey, MANUAL_KEY, moveActive, recentKey, resolveActive, variantKey } from "./combobox";
import { cardNumber, posAbbr, splitTypedPrefix } from "./match";
import { choiceName, foldersForSuggestion } from "./folder-choice";
import { DESK_INPUT, DeskFieldError, DeskFrame, DeskSection, FIELD_LABEL, HintLine, KeyButton, ThemeSelect, type Hint } from "./desk-parts";
import { Collapse } from "@/components/ui/Collapse";
import {
  DICTIONARY_ROWS,
  DictionarySlot,
  useDictionaryReserved,
  useVariantsRegion,
  VARIANT_ENTER,
  VARIANT_ROW_HEIGHT,
  VariantError,
  VariantSlotFrame,
  VariantsStatusSlot,
} from "./parts";
import type { SearchPanelProps } from "./SearchPanel";

export interface DeskSearchPanelProps extends Omit<SearchPanelProps, "onClear"> {
  /** The kept draft's option: ↵ reopens it while the headword is unchanged. */
  preferredKey: string | null;
  /** Footer status after «Добавить и ещё» (replaces the key line). */
  status?: ReactNode;
  /** Quick form «Добавить». */
  onQuickSave: () => void;
  saving: boolean;
  saveError: string | null;
}

type PanelProps = Omit<DeskSearchPanelProps, "inputRef">;

interface Option {
  key: string;
  id: string;
  run: () => void;
}

const SEARCH_HINTS: readonly Hint[] = [
  [["Up", "Down"], "по списку"],
  [["Enter"], "выбрать"],
  [["Escape"], "закрыть"],
];
const QUICK_HINTS: readonly Hint[] = [
  [["Tab"], "дальше"],
  [["Escape"], "закрыть"],
];

/**
 * D-Add-Empty / D-Add-Suggest: the headword is an APG combobox (aria-activedescendant); «Недавние»,
 * or «Словарь» + «Варианты» + «Заполнить вручную», are one list for ↑/↓, ↵ picks the active
 * option (by default the first «Вариант»). Focus never leaves the input.
 */
export function DeskSearchPanel({ inputRef, ...props }: DeskSearchPanelProps) {
  const { value, suggest, quick, dictionary, context, folders, suggestionsEnabled } = props;
  const base = useId();
  const trimmed = value.trim();
  const direction = detectDirection(trimmed);
  // While the lexique loads «Словарь» holds 3 row slots (A4); the words fill them in place.
  const dictionaryLoading = !!props.dictionaryLoading && trimmed !== "" && direction === "fr";
  const reserved = useDictionaryReserved(dictionaryLoading);
  const showDictionary = trimmed !== "" && direction === "fr" && (dictionary.length > 0 || reserved);
  // «Варианты» keep their slots whenever there is a headword, also while failed (A2, A3).
  const showVariants = trimmed !== "" && suggestionsEnabled;
  const recent = trimmed ? [] : (context?.recent ?? []);
  const results = showVariants ? suggest.results : [];

  // Option order = visual order. Ids are stable per key for aria-activedescendant.
  const optionId = (key: string) => `${base}-${key.replace(/[^a-zA-Z0-9]/g, (c) => c.charCodeAt(0).toString(36))}`;
  const options: Option[] = [
    ...recent.map((w) => ({ key: recentKey(w.id), run: () => props.onOpenWord(w.id) })),
    ...(showDictionary ? dictionary.map((hit) => ({ key: dictionaryKey(hit.fr), run: () => props.onPickHit(hit) })) : []),
    ...results.map((s) => ({ key: variantKey(s), run: () => props.onPickSuggestion(s) })),
    ...(trimmed && !quick ? [{ key: MANUAL_KEY, run: props.onManual }] : []),
  ].map((o) => ({ ...o, id: optionId(o.key) }));
  const keys = options.map((o) => o.key);

  // A move made with the arrows holds only for the headword it was made on.
  const [moved, setMoved] = useState<{ query: string; key: string | null } | null>(null);
  const explicit = moved && moved.query === value ? moved.key : null;
  const fallback = props.preferredKey ?? (results[0] ? variantKey(results[0]) : null);
  const active = resolveActive(keys, explicit, fallback);
  const activeOption = options.find((o) => o.key === active) ?? null;
  const activeId = activeOption?.id;

  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || e.altKey || e.metaKey || e.ctrlKey) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (keys.length === 0) return;
      e.preventDefault();
      setMoved({ query: value, key: moveActive(keys, active, e.key === "ArrowDown" ? 1 : -1) });
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (activeOption) activeOption.run();
      else props.onSubmit();
    }
  };
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (/\S[^\S\n]*\r?\n[^\S\n]*\S/.test(text)) {
      e.preventDefault();
      props.onPasteList(text);
    }
  };

  const optionProps = (key: string): OptionProps => {
    const o = options.find((x) => x.key === key)!;
    return {
      id: o.id,
      role: "option",
      "aria-selected": key === active,
      // Keep focus (and the caret) in the headword.
      onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault(),
      onClick: o.run,
    };
  };

  const listboxIds = [
    recent.length > 0 && `${base}-recent`,
    showDictionary && dictionary.length > 0 && `${base}-dict`,
    results.length > 0 && `${base}-var`,
    trimmed && !quick && `${base}-manual`,
  ].filter(Boolean);

  const footer = (
    <>
      {props.status ?? (props.saveError ? (
        <p role="alert" className="m-0 min-w-0 flex-1 truncate text-[13px] leading-5 text-again">
          {props.saveError}
        </p>
      ) : (
        <HintLine hints={quick ? QUICK_HINTS : SEARCH_HINTS} />
      ))}
      {trimmed && !quick && (
        <div role="listbox" id={`${base}-manual`} aria-label="Вручную" className="flex">
          <div
            {...optionProps(MANUAL_KEY)}
            className={cx(
              "-mr-2 inline-flex h-8 cursor-pointer items-center gap-2 rounded-[4px] px-2 text-[14px] leading-5 font-medium whitespace-nowrap text-ink",
              active === MANUAL_KEY ? "bg-hover-surface" : "hoverable:bg-hover-surface",
            )}
          >
            <Icon name="pencil" size={14} strokeWidth={1.75} />
            <span>Заполнить вручную</span>
            {active === MANUAL_KEY && <EnterCap />}
          </div>
        </div>
      )}
    </>
  );

  return (
    <DeskFrame footer={footer} bodyClassName={showVariants ? "pb-2" : "pb-6"}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label="Слово или выражение — FR или RU"
        aria-autocomplete="list"
        aria-expanded={listboxIds.length > 0}
        aria-controls={listboxIds.join(" ") || undefined}
        aria-activedescendant={activeId}
        value={value}
        onChange={(e) => props.onValueChange(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        placeholder="Слово или выражение — FR или RU"
        lang={trimmed ? (direction === "ru" ? "ru" : "fr") : undefined}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        className="block h-14 w-full rounded-[4px] border border-boundary bg-surface px-[15px] font-serif text-[22px] leading-7 text-ink outline-none! placeholder:text-muted focus:border-ink focus:shadow-[inset_0_0_0_1px_var(--ink)]"
      />

      {!trimmed ? (
        <EmptyState {...props} listboxId={`${base}-recent`} optionProps={optionProps} active={active} />
      ) : (
        <>
          {showDictionary && (
            <Collapse open={dictionaryLoading || dictionary.length > 0}>
              <section aria-labelledby={`${base}-dict-title`} aria-busy={dictionaryLoading || undefined} data-dictionary="" className="mt-4">
                <DeskSection id={`${base}-dict-title`} title="Словарь" aside="работает без сети" />
                <div role="listbox" id={`${base}-dict`} aria-labelledby={`${base}-dict-title`}>
                  {dictionary.map((hit, i) => (
                    <DictionaryRow
                      key={hit.fr}
                      hit={hit}
                      query={value}
                      last={i === dictionary.length - 1 && !dictionaryLoading}
                      active={active === dictionaryKey(hit.fr)}
                      optionProps={optionProps(dictionaryKey(hit.fr))}
                      onPick={() => props.onPickHit(hit)}
                    />
                  ))}
                </div>
                {reserved &&
                  Array.from({ length: Math.max(0, DICTIONARY_ROWS - dictionary.length) }, (_, i) => (
                    <DictionarySlot key={`slot-${dictionary.length + i}`} height={40} index={dictionary.length + i} loaded={!dictionaryLoading} />
                  ))}
              </section>
            </Collapse>
          )}
          {props.duplicate && !quick && (
            <DuplicateBox info={props.duplicate} onOpen={() => props.onOpenWord(props.duplicate!.word.id)} onAddAnyway={props.onAddAnyway} />
          )}
          {showVariants && (
            <Variants {...props} direction={direction} listboxId={`${base}-var`} optionProps={optionProps} active={active} folders={folders} />
          )}
          {/* Below «Варианты», so an error never moves what is above it (A3). */}
          {quick && <QuickForm {...props} quick={quick} direction={direction} />}
        </>
      )}
    </DeskFrame>
  );
}

interface OptionProps {
  id: string;
  role: "option";
  "aria-selected": boolean;
  onMouseDown: (e: { preventDefault: () => void }) => void;
  onClick: () => void;
}

interface ListProps {
  listboxId: string;
  optionProps: (key: string) => OptionProps;
  active: string | null;
}

/** Active option: hover fill, 2px ink bar at the dialog edge, full-bleed rule. */
const ROW = "relative -mx-6 flex cursor-pointer px-6";
const activeRow = (active: boolean) => (active ? "bg-hover-surface" : "hoverable:bg-hover-surface");

function RowEdges({ active, last }: { active: boolean; last: boolean }) {
  return (
    <>
      {active && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-ink" />}
      {(!last || active) && (
        <span aria-hidden="true" className={cx("absolute bottom-0 h-px bg-rule", active ? "inset-x-0" : "inset-x-6")} />
      )}
    </>
  );
}

/** ↵ cap on the active option (Enter off Mac). */
function EnterCap() {
  const fmt = useFormatKeys();
  return <Kbd aria-hidden="true">{fmt("Enter")}</Kbd>;
}

function Meter({ level, verlan }: { level: SlangLevel; verlan: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <SlangMeter level={level} verlan={verlan} showLabel={false} />
      <span aria-hidden="true" lang={level === 0 ? undefined : "fr"} className="abbr text-[14px] leading-5">
        {slangAbbr(level, verlan)}
      </span>
    </span>
  );
}

function EmptyState({
  context,
  folders,
  suggestionsEnabled,
  freshId,
  listboxId,
  optionProps,
  active,
}: PanelProps & ListProps) {
  const headingId = useId();
  const recent = context?.recent ?? [];
  return (
    <>
      <p className="m-0 mt-2 text-[13px] leading-5 text-muted">
        {suggestionsEnabled
          ? "Перевод, заметка, уровень сленга и тема заполнятся сами — останется только проверить."
          : "Подсказки выключены в настройках — перевод и тему заполни сам."}
      </p>
      {recent.length > 0 && (
        <section aria-labelledby={headingId} className="mt-6">
          <DeskSection
            id={headingId}
            title="Недавние"
            aside={context && context.today > 0 ? `Сегодня · ${context.today}` : undefined}
          />
          <div role="listbox" id={listboxId} aria-labelledby={headingId}>
            {recent.map((w) => (
              <RecentRow
                key={w.id}
                word={w}
                folders={folders}
                fresh={w.id === freshId}
                active={active === recentKey(w.id)}
                optionProps={optionProps(recentKey(w.id))}
              />
            ))}
          </div>
        </section>
      )}
      <p className="m-0 mt-4 text-[12px] leading-4 text-muted">Несколько слов сразу — через «Список». Со скриншота — через «Скриншот».</p>
    </>
  );
}

/** A just-added row opens from 0 (--dur-move) and its paper fades from --surface-2 (--dur-spotlight). */
const FRESH_ROW_STYLE = {
  transition: "height var(--dur-move) var(--ease-standard), background-color var(--dur-spotlight) linear",
} as const;

function RecentRow({
  word,
  folders,
  fresh,
  active,
  optionProps,
}: {
  word: Word;
  folders: readonly Folder[];
  fresh: boolean;
  active: boolean;
  optionProps: OptionProps;
}) {
  const folder = word.folder_id ? folders.find((f) => f.id === word.folder_id) : undefined;
  return (
    <div
      {...optionProps}
      aria-label={`Открыть: ${word.fr} — ${word.ru}`}
      style={fresh ? FRESH_ROW_STYLE : undefined}
      className={cx(
        ROW,
        "grid h-12 grid-cols-[200px_minmax(0,1fr)_96px_104px] items-center",
        fresh && "overflow-hidden starting:h-0 starting:bg-surface-2",
        activeRow(active),
      )}
    >
      <RowEdges active={active} last={false} />
      <span lang="fr" className="truncate pr-3 font-serif text-[19px] leading-6 font-medium">
        {word.fr}
      </span>
      <span className="truncate pr-3 text-[14px] leading-5 text-muted">{word.ru}</span>
      <Meter level={word.slang_level} verlan={word.verlan} />
      <span className="truncate text-right text-[12px] leading-4 text-muted">{folder?.name ?? "Входящие"}</span>
    </div>
  );
}

function DictionaryRow({
  hit,
  query,
  last,
  active,
  optionProps,
  onPick,
}: {
  hit: LexiqueHit;
  query: string;
  last: boolean;
  active: boolean;
  optionProps: OptionProps;
  onPick: () => void;
}) {
  const [typed, rest] = splitTypedPrefix(hit.fr, query);
  const abbr = posAbbr({ pos: hit.pos, gender: hit.gender, fr: hit.fr });
  return (
    <div {...optionProps} aria-label={`Подставить: ${hit.fr}`} className={cx(ROW, "h-10 items-center gap-1.5 pr-[18px]", activeRow(active))}>
      <RowEdges active={active} last={last} />
      <span lang="fr" className="min-w-0 truncate font-serif text-[18px] leading-6 whitespace-nowrap text-muted">
        {typed ? (
          <>
            <span className="font-medium text-ink">{typed}</span>
            {rest}
          </>
        ) : (
          <span className="font-medium text-ink">{rest}</span>
        )}
      </span>
      {abbr && (
        <span lang="fr" className="abbr shrink-0 text-[14px] leading-5 whitespace-nowrap">
          {abbr}
        </span>
      )}
      <span className="flex-1" />
      {active && <EnterCap />}
      <button
        type="button"
        tabIndex={-1}
        aria-label={`Подставить: ${hit.fr}`}
        onClick={(e) => {
          e.stopPropagation();
          onPick();
        }}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-[4px] bg-transparent text-muted hoverable:bg-hover"
      >
        <Icon name="arrow-up-left" size={16} strokeWidth={1.75} />
      </button>
    </div>
  );
}

function DuplicateBox({ info, onOpen, onAddAnyway }: { info: NonNullable<SearchPanelProps["duplicate"]>; onOpen: () => void; onAddAnyway: () => void }) {
  const where = info.folderName ? `в теме «${info.folderName}»` : "во «Входящих»";
  return (
    <div
      role="note"
      aria-label="Повтор"
      className="mt-4 flex h-12 items-center gap-2 rounded-[4px] border border-dashed border-warn-edge bg-warn-bg py-[7px] pr-1 pl-3"
    >
      <p className="m-0 flex min-w-0 flex-1 items-center gap-2 text-[13px] leading-5 whitespace-nowrap text-warn">
        <Icon name="alert" size={16} strokeWidth={1.75} className="shrink-0" />
        <span role="status" className="truncate">
          Уже есть {where}
        </span>
        <span className="font-mono text-[11px] tabular-nums">{cardNumber(info.ordinal)}</span>
      </p>
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex h-8 shrink-0 items-center rounded-btn border border-boundary bg-surface px-4 text-[14px] font-medium text-ink hoverable:shadow-[inset_0_0_0_1px_var(--boundary)]"
      >
        Открыть
      </button>
      <button
        type="button"
        onClick={onAddAnyway}
        className="inline-flex h-8 shrink-0 items-center rounded-[4px] bg-transparent px-2 text-[14px] font-medium whitespace-nowrap text-ink hoverable:underline hoverable:decoration-1 hoverable:underline-offset-4"
      >
        Всё равно добавить
      </button>
    </div>
  );
}

function Variants({
  suggest,
  autoSort = true,
  showSlang = true,
  folders,
  direction,
  listboxId,
  optionProps,
  active,
}: PanelProps & ListProps & { direction: "fr" | "ru" }) {
  const headingId = useId();
  const region = useVariantsRegion(suggest);
  const rows = region.slots.filter((slot) => slot.kind === "row");
  const rest = region.slots.filter((slot) => slot.kind !== "row");
  const done = suggest.status === "done";
  return (
    <section aria-labelledby={headingId} aria-busy={region.busy || undefined} data-variants="" className="mt-4">
      <DeskSection
        id={headingId}
        title="Варианты"
        aside={`${direction === "ru" ? "по-французски" : "перевод"}${showSlang ? " · уровень" : ""} · тема`}
      />
      <VariantsStatusSlot status={region.status} />
      <div role="listbox" id={listboxId} aria-labelledby={headingId}>
        {rows.map((slot, i) => {
          const s = slot.suggestion;
          const key = slot.key;
          const abbr = posAbbr(s);
          const theme = autoSort ? choiceName(foldersForSuggestion(s, folders).auto, folders) : "Входящие";
          const on = active === key;
          return (
            <div
              key={key}
              {...optionProps(key)}
              aria-label={`Выбрать: ${s.fr} — ${s.ru}`}
              style={{ animationDelay: `${slot.delay}ms` }}
              className={cx(ROW, VARIANT_ENTER, "grid h-[72px] grid-cols-[minmax(0,1fr)_136px_18px] items-center gap-x-4", activeRow(on))}
            >
              <RowEdges active={on} last={i === rows.length - 1 && done && rest.length === 0} />
              <span className="flex min-w-0 flex-col">
                <span className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap">
                  <span lang="fr" className="truncate font-serif text-[19px] leading-6 font-medium">
                    {s.fr}
                  </span>
                  {abbr && (
                    <span lang="fr" className="abbr shrink-0 text-[14px] leading-5">
                      {abbr}
                    </span>
                  )}
                </span>
                <span lang={direction === "ru" ? undefined : "ru"} className="mt-0.5 truncate text-[14px] leading-5">
                  {s.ru}
                </span>
              </span>
              <span className="flex min-w-0 flex-col items-start gap-1">
                {showSlang && <Meter level={s.slang_level} verlan={s.verlan} />}
                <span className="max-w-full truncate text-[12px] leading-4 text-muted">{theme}</span>
              </span>
              <span className="flex justify-end">{on && <EnterCap />}</span>
            </div>
          );
        })}
      </div>
      {rest.map((slot) =>
        slot.kind === "error" ? (
          <VariantError key={slot.key} kind={slot.error} onRetry={suggest.retry} />
        ) : slot.kind === "empty" ? (
          <p key={slot.key} className="m-0 flex items-center text-[14px] leading-5 text-muted" style={{ height: VARIANT_ROW_HEIGHT }}>
            Вариантов не нашлось.
          </p>
        ) : slot.kind === "slot" ? (
          <VariantSlotFrame key={slot.key} slot={slot} />
        ) : null,
      )}
    </section>
  );
}

/** Offline / suggestions off: the other side + theme, saved as typed (details are filled later). */
function QuickForm({
  quick,
  direction,
  folders,
  onQuickChange,
  onManual,
  onQuickSave,
  saving,
}: PanelProps & { quick: NonNullable<DeskSearchPanelProps["quick"]>; direction: "fr" | "ru" }) {
  const otherId = useId();
  const errorId = useId();
  const themeId = useId();
  return (
    <div className={cx("mt-4", VARIANT_ENTER)}>
      <div className="grid grid-cols-2 gap-x-4">
        <div>
          <label htmlFor={otherId} className={FIELD_LABEL}>
            {direction === "ru" ? "Французский" : "Русский"}
          </label>
          <input
            id={otherId}
            type="text"
            value={quick.other}
            onChange={(e) => onQuickChange({ other: e.target.value, error: null })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                onQuickSave();
              }
            }}
            placeholder={direction === "ru" ? "По-французски" : "Перевод"}
            lang={direction === "ru" ? "fr" : "ru"}
            autoComplete="off"
            aria-invalid={quick.error ? true : undefined}
            aria-describedby={quick.error ? errorId : undefined}
            className={DESK_INPUT}
          />
          <DeskFieldError id={errorId}>{quick.error}</DeskFieldError>
        </div>
        <div>
          <span id={themeId} className={FIELD_LABEL}>
            Тема
          </span>
          <ThemeSelect value={quick.folder} folders={folders} labelledBy={themeId} onChange={(folder) => onQuickChange({ folder })} />
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onManual}
          className="h-8 bg-transparent p-0 text-[14px] font-medium text-ink underline decoration-1 underline-offset-4 hoverable:decoration-2"
        >
          Все поля
        </button>
        <KeyButton keys="Mod+Enter" pending={saving} onClick={onQuickSave}>
          Добавить
        </KeyButton>
      </div>
    </div>
  );
}
