"use client";

import { useId, type ClipboardEvent, type KeyboardEvent, type Ref } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icons";
import { SlangMeter } from "@/components/ui/SlangMeter";
import type { Suggestion } from "@/lib/ai/schemas";
import { detectDirection } from "@/lib/ai/normalize";
import type { LexiqueHit } from "@/lib/lexique";
import type { Folder, Word } from "@/lib/types";
import type { SuggestApi } from "@/lib/use-suggest";
import type { AddContext, DuplicateInfo } from "./data";
import { choiceName, foldersForSuggestion, type FolderChoice } from "./folder-choice";
import { posAbbr, splitTypedPrefix } from "./match";
import {
  DuplicateNotice,
  FIELD_INPUT,
  FieldError,
  FieldRow,
  FolderSelect,
  HeadwordInput,
  SectionHeader,
  SkeletonRows,
  SuggestNotice,
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
  folders: readonly Folder[];
  context: AddContext | undefined;
  dictionary: readonly LexiqueHit[];
  onPickHit: (hit: LexiqueHit) => void;
  onPickSuggestion: (s: Suggestion) => void;
  /** «Заполнить вручную» / «Все поля»: open the full form. */
  onManual: () => void;
  duplicate: DuplicateInfo | null;
  onOpenWord: (id: string) => void;
  onAddAnyway: () => void;
  /** The compact manual form shown when suggestions are unavailable (null hides it). */
  quick: QuickFields | null;
  onQuickChange: (patch: Partial<QuickFields>) => void;
}

/** Add-Empty / Add-Suggest / Add-Duplicate: headword input with «Словарь» and «Варианты». */
export function SearchPanel(props: SearchPanelProps) {
  const { value, suggest, quick } = props;
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
          {props.duplicate && (
            <DuplicateNotice
              info={props.duplicate}
              onOpen={() => props.onOpenWord(props.duplicate!.word.id)}
              onAddAnyway={props.onAddAnyway}
            />
          )}

          {quick ? (
            <>
              {props.suggestionsEnabled && suggest.error && <SuggestNotice kind={suggest.error} onRetry={suggest.retry} />}
              <QuickForm {...props} quick={quick} direction={direction} />
              <Dictionary {...props} query={value} hidden={direction === "ru"} />
            </>
          ) : (
            <>
              <Dictionary {...props} query={value} hidden={direction === "ru"} />
              <Variants {...props} direction={direction} />
              <ManualRow onManual={props.onManual} />
            </>
          )}
        </>
      )}
    </div>
  );
}

function EmptyState({ context, folders, onOpenWord, suggestionsEnabled }: SearchPanelProps) {
  const recent = context?.recent ?? [];
  return (
    <>
      <p className="m-0 mx-4 mt-2 text-[13px] leading-5 text-muted">
        {suggestionsEnabled
          ? "Перевод, заметка, уровень сленга и тема заполнятся сами — останется только проверить."
          : "Подсказки выключены в настройках — перевод и тему заполни сам."}
      </p>
      {recent.length > 0 && (
        <>
          <SectionHeader
            title="Недавние"
            className="mt-8"
            aside={context && context.today > 0 ? <span className="meta">Сегодня · {context.today}</span> : undefined}
          />
          <ul className="m-0 mx-4 flex list-none flex-col p-0">
            {recent.map((w) => (
              <li key={w.id}>
                <RecentRow word={w} folders={folders} onOpen={() => onOpenWord(w.id)} />
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="m-0 mx-4 mt-6 text-[12px] leading-4 text-muted">
        Несколько слов сразу — через «Список». Со скриншота — через «Скриншот».
      </p>
    </>
  );
}

function RecentRow({ word, folders, onOpen }: { word: Word; folders: readonly Folder[]; onOpen: () => void }) {
  const folder = word.folder_id ? folders.find((f) => f.id === word.folder_id) : undefined;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Открыть: ${word.fr} — ${word.ru}`}
      className="flex h-16 w-full items-center justify-between gap-4 border-b border-rule bg-transparent p-0 text-left text-ink active:bg-surface-2"
    >
      <span className="flex min-w-0 flex-col">
        <span lang="fr" className="truncate font-serif text-[19px] leading-6 font-medium">
          {word.fr}
        </span>
        <span className="truncate text-[14px] leading-5 text-muted">{word.ru}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end">
        <span className="flex h-6 items-center">
          <SlangMeter level={word.slang_level} verlan={word.verlan} />
        </span>
        <span className="max-w-[160px] truncate font-mono text-[11px] leading-5 tracking-[.06em] whitespace-nowrap text-muted uppercase">
          Тема: {folder?.name ?? "Входящие"}
        </span>
      </span>
    </button>
  );
}

function Dictionary({
  dictionary,
  query,
  hidden,
  onPickHit,
}: Pick<SearchPanelProps, "dictionary" | "onPickHit"> & { query: string; hidden: boolean }) {
  const headingId = useId();
  if (hidden || dictionary.length === 0) return null;
  return (
    <section aria-labelledby={headingId}>
      <SectionHeader id={headingId} title="Словарь" aside="работает без сети" />
      <ul className="m-0 mx-4 flex list-none flex-col p-0">
        {dictionary.map((hit) => {
          const [typed, rest] = splitTypedPrefix(hit.fr, query);
          const abbr = posAbbr({ pos: hit.pos, gender: hit.gender, fr: hit.fr });
          return (
            <li key={hit.fr}>
              <button
                type="button"
                aria-label={`Подставить: ${hit.fr}`}
                onClick={() => onPickHit(hit)}
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
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Variants({
  suggest,
  suggestionsEnabled,
  autoSort = true,
  folders,
  onPickSuggestion,
  direction,
}: Pick<SearchPanelProps, "suggest" | "suggestionsEnabled" | "autoSort" | "folders" | "onPickSuggestion"> & {
  direction: "fr" | "ru";
}) {
  const headingId = useId();
  if (!suggestionsEnabled || suggest.status === "idle") return null;
  const { results, status } = suggest;
  const loading = status === "loading";
  return (
    <section aria-labelledby={headingId} aria-busy={loading || undefined}>
      <SectionHeader
        id={headingId}
        title="Варианты"
        aside={direction === "ru" ? "по-французски · уровень · тема" : "перевод · уровень · тема"}
      />
      <ul className="m-0 mx-4 flex list-none flex-col p-0">
        {results.map((s) => (
          <li key={`${s.fr}\u0001${s.ru}`}>
            <VariantRow suggestion={s} folders={folders} autoSort={autoSort} onPick={() => onPickSuggestion(s)} />
          </li>
        ))}
      </ul>
      <div className="mx-4">
        {loading && <SkeletonRows count={2} />}
        {status === "done" && results.length === 0 && (
          <p className="m-0 flex h-11 items-center border-b border-rule text-[14px] leading-5 text-muted">Вариантов не нашлось.</p>
        )}
      </div>
      {status === "error" && suggest.error && results.length > 0 && (
        <SuggestNotice kind={suggest.error} onRetry={suggest.retry} className="mt-3" />
      )}
    </section>
  );
}

function VariantRow({
  suggestion: s,
  folders,
  autoSort,
  onPick,
}: {
  suggestion: Suggestion;
  folders: readonly Folder[];
  autoSort: boolean;
  onPick: () => void;
}) {
  const abbr = posAbbr(s);
  const theme = autoSort ? choiceName(foldersForSuggestion(s, folders).auto, folders) : "Входящие";
  return (
    <button
      type="button"
      onClick={onPick}
      aria-label={`Выбрать: ${s.fr} — ${s.ru}`}
      className="flex min-h-[72px] w-full items-center gap-3 border-b border-rule bg-transparent py-2 text-left text-ink active:bg-surface-2"
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
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="flex h-6 items-center">
          <SlangMeter level={s.slang_level} verlan={s.verlan} />
        </span>
        <span className="max-w-[156px] truncate font-mono text-[11px] leading-5 tracking-[.06em] whitespace-nowrap text-muted uppercase">
          Тема: {theme}
        </span>
      </span>
      <Icon name="chevron-right" size={16} className="shrink-0" />
    </button>
  );
}

function ManualRow({ onManual }: { onManual: () => void }) {
  return (
    <div className="mx-4">
      <button
        type="button"
        onClick={onManual}
        className="flex h-11 w-full items-center gap-2 border-b border-rule bg-transparent p-0 text-left text-[14px] leading-5 text-muted active:bg-surface-2"
      >
        <Icon name="pencil" size={16} className="shrink-0" />
        <span className="flex-1">Заполнить вручную</span>
        <Icon name="chevron-right" size={16} className="shrink-0" />
      </button>
    </div>
  );
}

function QuickForm({
  quick,
  direction,
  folders,
  onQuickChange,
  onManual,
}: Pick<SearchPanelProps, "folders" | "onQuickChange" | "onManual"> & { quick: QuickFields; direction: "fr" | "ru" }) {
  const errorId = useId();
  const themeId = useId();
  return (
    <div className="mx-4 mt-4">
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
        <FieldRow label={<span id={themeId}>Тема</span>} as="div">
          <FolderSelect value={quick.folder} folders={folders} labelledBy={themeId} onChange={(folder) => onQuickChange({ folder })} />
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
