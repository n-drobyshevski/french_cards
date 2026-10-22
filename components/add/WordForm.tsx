"use client";

import { useId, type KeyboardEvent, type Ref } from "react";
import type { Folder } from "@/lib/types";
import type { DuplicateInfo } from "./data";
import type { DraftErrors, WordDraft } from "./draft";
import { posAbbr } from "./match";
import {
  BothDirectionsRow,
  DuplicateNotice,
  FIELD_INPUT,
  FieldError,
  FieldRow,
  FolderChips,
  HeadwordInput,
  SlangPicker,
} from "./parts";

export interface WordFormProps {
  draft: WordDraft;
  onChange: (patch: Partial<WordDraft>) => void;
  folders: readonly Folder[];
  errors: DraftErrors;
  frRef: Ref<HTMLInputElement>;
  ruRef: Ref<HTMLInputElement>;
  duplicate: DuplicateInfo | null;
  onOpenWord: (id: string) => void;
  onAddAnyway: () => void;
  /** Return in «Русский»: save like «Добавить». */
  onSubmit: () => void;
}

const isEnter = (e: KeyboardEvent<HTMLInputElement>) =>
  e.key === "Enter" && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey && !e.nativeEvent.isComposing;

/** Add-Filled: the editable catalog card for a picked suggestion or manual entry. */
export function WordForm({
  draft,
  onChange,
  folders,
  errors,
  frRef,
  ruRef,
  duplicate,
  onOpenWord,
  onAddAnyway,
  onSubmit,
}: WordFormProps) {
  const ruId = useId();
  const frErrorId = useId();
  const ruErrorId = useId();
  const themeId = useId();
  const abbr = draft.fr.trim() ? posAbbr(draft) : null;

  return (
    <div className="flex flex-col pb-6">
      <HeadwordInput
        inputRef={frRef}
        value={draft.fr}
        onValueChange={(fr) => onChange({ fr })}
        ariaLabel="Французский"
        placeholder="По-французски"
        lang="fr"
        trailing={abbr}
        invalid={Boolean(errors.fr)}
        describedBy={errors.fr ? frErrorId : undefined}
        enterKeyHint="next"
        onKeyDown={(e) => {
          if (!isEnter(e)) return;
          e.preventDefault();
          document.getElementById(ruId)?.focus();
        }}
      />
      <div className="mx-4">
        <FieldError id={frErrorId}>{errors.fr}</FieldError>
      </div>

      {duplicate && <DuplicateNotice info={duplicate} onOpen={() => onOpenWord(duplicate.word.id)} onAddAnyway={onAddAnyway} />}

      <div className="mx-4 mt-2 flex flex-col">
        <FieldRow label="Русский">
          <input
            ref={ruRef}
            id={ruId}
            type="text"
            enterKeyHint="done"
            onKeyDown={(e) => {
              if (!isEnter(e)) return;
              e.preventDefault();
              onSubmit();
            }}
            value={draft.ru}
            onChange={(e) => onChange({ ru: e.target.value })}
            placeholder="Перевод"
            lang="ru"
            autoComplete="off"
            aria-invalid={errors.ru ? true : undefined}
            aria-describedby={errors.ru ? ruErrorId : undefined}
            className={FIELD_INPUT}
          />
        </FieldRow>
        <FieldError id={ruErrorId}>{errors.ru}</FieldError>
        <FieldRow label="Заметка" align="start">
          <textarea
            rows={2}
            value={draft.note}
            onChange={(e) => onChange({ note: e.target.value })}
            placeholder="Оттенок, синонимы, происхождение"
            lang="ru"
            className="min-h-[63px] min-w-0 flex-1 resize-none bg-transparent pt-3 pb-[11px] text-[14px] leading-5 text-ink outline-none! [field-sizing:content] placeholder:text-muted pointer-coarse:text-[16px]"
          />
        </FieldRow>
        <FieldRow label="Пример" align="start">
          <span className="flex min-w-0 flex-1 flex-col pb-1.5">
            <input
              type="text"
              value={draft.example_fr}
              onChange={(e) => onChange({ example_fr: e.target.value })}
              placeholder="Фраза по-французски"
              aria-label="Пример по-французски"
              lang="fr"
              autoComplete="off"
              className="h-[46px] min-w-0 bg-transparent p-0 font-serif text-[17px] leading-6 text-ink italic outline-none! placeholder:font-sans placeholder:text-[15px] placeholder:not-italic placeholder:text-muted"
            />
            {(draft.example_fr.trim() || draft.example_ru.trim()) && (
              <input
                type="text"
                value={draft.example_ru}
                onChange={(e) => onChange({ example_ru: e.target.value })}
                placeholder="Перевод примера"
                aria-label="Перевод примера"
                lang="ru"
                autoComplete="off"
                className="-mt-1.5 h-8 min-w-0 bg-transparent p-0 text-[14px] leading-5 text-muted outline-none! placeholder:text-muted pointer-coarse:text-[16px]"
              />
            )}
          </span>
        </FieldRow>
      </div>

      <SlangPicker
        level={draft.slang_level}
        verlan={draft.verlan}
        auto={draft.slang_auto}
        onChange={(next) => onChange({ ...next, slang_auto: false })}
      />

      <div className="mx-4 mt-6">
        <span id={themeId} className="meta block font-medium">
          Тема
        </span>
        <FolderChips
          labelledBy={themeId}
          value={draft.folder}
          onChange={(folder) => onChange({ folder, folder_touched: true })}
          folders={folders}
          auto={draft.auto?.auto ?? null}
          alternatives={draft.auto?.alternatives}
          proposal={draft.auto?.proposal}
        />
      </div>

      <BothDirectionsRow checked={draft.both_directions} onChange={(both_directions) => onChange({ both_directions })} />
    </div>
  );
}
