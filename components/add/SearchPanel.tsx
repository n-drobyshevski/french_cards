"use client";

import { useId, type ClipboardEvent, type KeyboardEvent, type Ref } from "react";
import { ContextRow } from "@/components/context/ContextLink";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icons";
import { SlangMeter } from "@/components/ui/SlangMeter";
import type { Suggestion } from "@/lib/ai/schemas";
import { detectDirection } from "@/lib/ai/normalize";
import type { LexiqueHit } from "@/lib/lexique";
import type { Folder, Word } from "@/lib/types";
import type { SuggestApi } from "@/lib/use-suggest";
import type { AddContext, DuplicateInfo } from "./data";
import type { FolderChoice } from "./folder-choice";
import { posAbbr, splitTypedPrefix } from "./match";
import { Collapse } from "@/components/ui/Collapse";
import {
  AddTools,
  DICTIONARY_ROWS,
  DictionarySlot,
  DuplicateNotice,
  DuplicateReveal,
  FIELD_INPUT,
  FieldError,
  FieldRow,
  HeadwordInput,
  SectionHeader,
  useDictionaryReserved,
  useVariantsRegion,
  VARIANT_ENTER,
  VARIANT_ROW_HEIGHT,
  VariantError,
  VariantSlotFrame,
  VariantsStatusSlot,
} from "./parts";

export interface QuickFields {
  /** The other side of the typed headword (RU for French input, FR for Russian input). */
  other: string;
  folder: FolderChoice;
  error: string | null;
}

export interface SearchPanelProps {
  inputRef: Ref<HTMLInputElement>;
  value: string;
  onValueChange: (value: string) => void;
  onClear: () => void;
  /** Enter in the headword input. */
  onSubmit: () => void;
  /** Multi-line text pasted into the headword: switch to «Список». */
  onPasteList: (text: string) => void;
  suggest: SuggestApi;
  suggestionsEnabled: boolean;
  /** Settings «Раскладывать по темам автоматически»: off shows «Входящие» as each variant's theme. */
  autoSort?: boolean;
  /** Settings «Определять уровень сленга»: off hides the level on each variant. */
  showSlang?: boolean;
  folders: readonly Folder[];
  context: AddContext | undefined;
  dictionary: readonly LexiqueHit[];
  /** The lexique is still loading for this headword: «Словарь» holds its slots (A4). */
  dictionaryLoading?: boolean;
  onPickHit: (hit: LexiqueHit) => void;
  onPickSuggestion: (s: Suggestion) => void;
  /** The «Вариант» just picked: ink-filled until the form replaces it (A5). */
  pickedKey?: string | null;
  /** «Заполнить вручную» / «Все поля»: open the full form. */
  onManual: () => void;
  duplicate: DuplicateInfo | null;
  onOpenWord: (id: string) => void;
  onAddAnyway: () => void;
  /** The word «Добавить и ещё» just saved: it opens at the top of «Недавние» with the paper fade. */
  freshId?: string | null;
  /** The compact manual form shown when suggestions are unavailable (null hides it). */
  quick: QuickFields | null;
  onQuickChange: (patch: Partial<QuickFields>) => void;
  /** Closes the sheet when a link leaves it («Как «…» говорят в жизни» → «Контекст»). */
  onLeave?: () => void;
  /** «Со скриншота» (leaves for /import) and «Списком», under the empty line. */
  onScreenshot?: () => void;
  onList?: () => void;
  /** First run (the first open): the line «… заполнятся сами» under the empty headword. */
  helper?: boolean;
}

/** The «Контекст» row shows from this many typed characters. */
export const CONTEXT_MIN_CHARS = 3;

/** Add-Empty / Add-Suggest / Add-Duplicate: headword input with «Словарь» and «Варианты». */
export function SearchPanel(props: SearchPanelProps) {
  const { value, quick } = props;
  const trimmed = value.trim();
  const direction = detectDirection(trimmed);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      props.onSubmit();
    }
  };
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (/\S[^\S\n]*\r?\n[^\S\n]*\S/.test(text)) {
      e.preventDefault();
      props.onPasteList(text);
    }
  };

  return (
    <div className="flex flex-col pb-6">
      <HeadwordInput
        inputRef={props.inputRef}
        value={value}
        onValueChange={props.onValueChange}
        onClear={props.onClear}
        autoFocus
        ariaLabel="Слово или выражение — FR или RU"
        placeholder="Слово или выражение — FR или RU"
        lang={trimmed ? (direction === "ru" ? "ru" : "fr") : undefined}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        enterKeyHint="go"
      />

      {!trimmed ? (
        <EmptyState {...props} />
      ) : (
        <>
          <DuplicateReveal info={props.duplicate}>
            {(info) => <DuplicateNotice info={info} onOpen={() => props.onOpenWord(info.word.id)} onAddAnyway={props.onAddAnyway} />}
          </DuplicateReveal>

          {/* Fixed order (A3): «Словарь», «Варианты», then the manual way in. An error stays inside
              «Варианты», and the quick form opens below it, so nothing above moves. */}
          <Dictionary {...props} query={value} hidden={direction === "ru"} />
          {props.suggestionsEnabled && <Variants {...props} />}
          {quick ? <QuickForm {...props} quick={quick} direction={direction} /> : <ManualRow onManual={props.onManual} />}
          {trimmed.length >= CONTEXT_MIN_CHARS && (
            <div className="mx-4">
              <ContextRow q={trimmed} onNavigate={props.onLeave} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EmptyState({ context, onOpenWord, suggestionsEnabled, freshId, onScreenshot, onList, helper = false }: SearchPanelProps) {
  const recent = context?.recent ?? [];
  // The helper is a first-run line; «Подсказки выключены» explains a state, so it always shows.
  const note = !suggestionsEnabled
    ? "Подсказки выключены в настройках — перевод и тему заполни сам."
    : helper
      ? "Перевод, заметка, уровень сленга и тема заполнятся сами — останется только проверить."
      : null;
  return (
    <>
      {onScreenshot && onList && <AddTools onScreenshot={onScreenshot} onList={onList} />}
      {note && <p className="m-0 mx-4 mt-2 text-[13px] leading-5 text-muted">{note}</p>}
      {recent.length > 0 && (
        <ul aria-label="Недавние" className="m-0 mx-4 mt-3 flex list-none flex-col border-t border-rule p-0">
          {recent.map((w) => (
            <li key={w.id} className={cx(w.id === freshId && FRESH_ROW)} style={w.id === freshId ? FRESH_ROW_STYLE : undefined}>
              <RecentRow word={w} onOpen={() => onOpenWord(w.id)} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** A just-added row opens from 0 (--dur-move) and its paper fades from --surface-2 (--dur-spotlight). */
const FRESH_ROW = "h-12 overflow-hidden starting:h-0 starting:bg-surface-2";
const FRESH_ROW_STYLE = {
  transition: "height var(--dur-move) var(--ease-standard), background-color var(--dur-spotlight) linear",
} as const;

/** «Недавние»: one 48px line, FR serif — RU muted. Level and theme live on the card. */
function RecentRow({ word, onOpen }: { word: Word; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Открыть: ${word.fr} — ${word.ru}`}
      className="flex h-12 w-full items-baseline gap-2 overflow-hidden border-b border-rule bg-transparent p-0 text-left leading-[48px] whitespace-nowrap text-ink active:bg-surface-2"
    >
      <span lang="fr" className="max-w-[60%] shrink-0 truncate font-serif text-[19px] font-medium">
        {word.fr}
      </span>
      <span aria-hidden="true" className="shrink-0 text-[15px] text-muted">
        —
      </span>
      <span className="min-w-0 truncate text-[15px] text-muted">{word.ru}</span>
    </button>
  );
}

function Dictionary({
  dictionary,
  dictionaryLoading = false,
  query,
  hidden,
  onPickHit,
}: Pick<SearchPanelProps, "dictionary" | "dictionaryLoading" | "onPickHit"> & { query: string; hidden: boolean }) {
  const headingId = useId();
  const reserved = useDictionaryReserved(dictionaryLoading && !hidden);
  if (hidden || (!reserved && dictionary.length === 0)) return null;
  // Reserved (A4): the header and 3 × 44px from the first letter; once loaded, the words take the
  // slots in place and the spare slots close; with no word at all the section closes.
  return (
    <Collapse open={dictionaryLoading || dictionary.length > 0}>
      <section aria-labelledby={headingId} aria-busy={dictionaryLoading || undefined} data-dictionary="">
        {/* No visible header (Add-Suggest B): the typed-vs-rest rows and ↖ say what they are. */}
        <SectionHeader id={headingId} title="Словарь" className="sr-only" />
        <ul className="m-0 mx-4 mt-2 flex list-none flex-col p-0">
          {dictionary.map((hit) => (
            <li key={hit.fr}>
              <DictionaryRow hit={hit} query={query} onPick={() => onPickHit(hit)} />
            </li>
          ))}
          {reserved &&
            Array.from({ length: Math.max(0, DICTIONARY_ROWS - dictionary.length) }, (_, i) => (
              <li key={`slot-${dictionary.length + i}`}>
                <DictionarySlot height={44} index={dictionary.length + i} loaded={!dictionaryLoading} />
              </li>
            ))}
        </ul>
      </section>
    </Collapse>
  );
}

function DictionaryRow({ hit, query, onPick }: { hit: LexiqueHit; query: string; onPick: () => void }) {
  const [typed, rest] = splitTypedPrefix(hit.fr, query);
  const abbr = posAbbr({ pos: hit.pos, gender: hit.gender, fr: hit.fr });
  return (
    <button
      type="button"
      aria-label={`Подставить: ${hit.fr}`}
      onClick={onPick}
      className="flex h-11 w-full items-center gap-2 border-b border-rule bg-transparent p-0 text-left text-ink active:bg-surface-2"
    >
      <span lang="fr" className="min-w-0 truncate font-serif text-[19px] leading-6 font-medium whitespace-nowrap">
        {typed || rest}
        {typed && <span className="font-normal text-muted">{rest}</span>}
      </span>
      {abbr && (
        <span lang="fr" className="abbr shrink-0 text-[15px] leading-5 whitespace-nowrap">
          {abbr}
        </span>
      )}
      <span className="flex-1" />
      <Icon name="arrow-up-left" size={16} className="shrink-0 text-muted" />
    </button>
  );
}

function Variants({
  suggest,
  showSlang = true,
  onPickSuggestion,
  pickedKey = null,
}: Pick<SearchPanelProps, "suggest" | "showSlang" | "onPickSuggestion" | "pickedKey">) {
  const headingId = useId();
  const region = useVariantsRegion(suggest);
  return (
    <section aria-labelledby={headingId} aria-busy={region.busy || undefined} data-variants="">
      {/* The status slot («Подбираем варианты» → «3 варианта») stands in for the header (Add-Suggest B). */}
      <SectionHeader id={headingId} title="Варианты" className="sr-only" />
      <div className="mx-4 mt-2">
        <VariantsStatusSlot status={region.status} />
        <ul className="m-0 flex list-none flex-col p-0">
          {region.slots.map((slot) =>
            slot.kind === "row" ? (
              <li key={slot.key} className={VARIANT_ENTER} style={{ animationDelay: `${slot.delay}ms` }}>
                <VariantRow
                  suggestion={slot.suggestion}
                  showSlang={showSlang}
                  picked={slot.key === pickedKey}
                  onPick={() => onPickSuggestion(slot.suggestion)}
                />
              </li>
            ) : slot.kind === "error" ? (
              <li key={slot.key}>
                <VariantError kind={slot.error} onRetry={suggest.retry} />
              </li>
            ) : slot.kind === "empty" ? (
              <li
                key={slot.key}
                className="flex items-center border-b border-rule text-[14px] leading-5 text-muted"
                style={{ height: VARIANT_ROW_HEIGHT }}
              >
                Вариантов не нашлось.
              </li>
            ) : (
              <li key={slot.key}>
                <VariantSlotFrame slot={slot} />
              </li>
            ),
          )}
        </ul>
      </div>
    </section>
  );
}

/** A «Вариант»: FR + abbr, RU and the meter. The theme is decided in the form; the whole row is the button. */
function VariantRow({
  suggestion: s,
  showSlang,
  picked,
  onPick,
}: {
  suggestion: Suggestion;
  showSlang: boolean;
  picked: boolean;
  onPick: () => void;
}) {
  const abbr = posAbbr(s);
  return (
    <button
      type="button"
      onClick={onPick}
      aria-label={`Выбрать: ${s.fr} — ${s.ru}`}
      aria-pressed={picked || undefined}
      data-picked={picked ? "" : undefined}
      // Picked (A5): the row ink-fills in --dur-instant, every line of it on ink.
      style={picked ? { transitionDuration: "var(--dur-instant)" } : undefined}
      className={cx(
        "press-tint flex h-[72px] w-full items-center gap-3 border-b border-rule py-2 text-left",
        picked ? "bg-ink text-on-ink [&_.abbr]:text-on-ink [&_.bg-ink]:bg-on-ink [&_.text-muted]:text-on-ink" : "bg-transparent text-ink",
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex min-w-0 items-baseline gap-2 whitespace-nowrap">
          <span lang="fr" className="min-w-0 truncate font-serif text-[19px] leading-6 font-medium">
            {s.fr}
          </span>
          {abbr && (
            <span lang="fr" className="abbr shrink-0 text-[15px] leading-5">
              {abbr}
            </span>
          )}
        </span>
        <span className="truncate text-[15px] leading-5">{s.ru}</span>
      </span>
      {showSlang && (
        <span className="flex h-6 shrink-0 items-center">
          <SlangMeter level={s.slang_level} verlan={s.verlan} />
        </span>
      )}
    </button>
  );
}

/** «Заполнить вручную»: a muted 44px text action under the last slot. */
function ManualRow({ onManual }: { onManual: () => void }) {
  return (
    <div className="mx-4">
      <button
        type="button"
        onClick={onManual}
        className="flex h-11 items-center bg-transparent p-0 text-left text-[14px] leading-5 text-muted underline-offset-4 active:underline"
      >
        Заполнить вручную
      </button>
    </div>
  );
}

/**
 * Suggestions off or failed: the other side on one ruled row, then «Добавить» in the footer. The
 * theme is «Входящие» (sorted later by detection); «Все поля» opens the full card to pick one.
 */
function QuickForm({
  quick,
  direction,
  onQuickChange,
  onManual,
}: Pick<SearchPanelProps, "onQuickChange" | "onManual"> & { quick: QuickFields; direction: "fr" | "ru" }) {
  const errorId = useId();
  return (
    <div className={cx("mx-4 mt-2", VARIANT_ENTER)}>
      <div className="flex flex-col border-t border-rule">
        <FieldRow label={direction === "ru" ? "Французский" : "Русский"}>
          <input
            type="text"
            value={quick.other}
            onChange={(e) => onQuickChange({ other: e.target.value, error: null })}
            placeholder={direction === "ru" ? "По-французски" : "Перевод"}
            lang={direction === "ru" ? "fr" : "ru"}
            autoComplete="off"
            aria-invalid={quick.error ? true : undefined}
            aria-describedby={quick.error ? errorId : undefined}
            className={FIELD_INPUT}
          />
        </FieldRow>
      </div>
      <FieldError id={errorId}>{quick.error}</FieldError>
      <div className="mt-2 flex justify-end">
        <Button variant="tertiary" size="sm" onClick={onManual}>
          Все поля
        </Button>
      </div>
    </div>
  );
}
