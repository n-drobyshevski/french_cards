"use client";

import { useId, useRef, type KeyboardEvent, type Ref } from "react";
import { ExampleList } from "@/components/examples/ExampleList";
import { cx } from "@/components/ui/cx";
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
  PendingDots,
  SlangPicker,
  useFieldSpotlight,
  type FieldSpot,
  type FormDetection,
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
  /** Slang level, example and theme being detected for a manual entry (A6). */
  detection?: FormDetection;
  /** The fields a pick or a detection just filled: lit together (A5, A6). */
  spot?: FieldSpot | null;
}

const isEnter = (e: KeyboardEvent<HTMLInputElement>) =>
  e.key === "Enter" && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey && !e.nativeEvent.isComposing;

/** What detection shows in each field while it runs or after it failed; nothing for what the user set. */
export function detectionStates(draft: WordDraft, detection: FormDetection | undefined) {
  const d = detection;
  const slang = !!d && d.slang && !draft.slang_touched;
  const example = !!d && d.examples && !draft.example_touched && !draft.example_fr.trim();
  const theme = !!d && d.themes && !draft.folder_touched && draft.auto === null;
  return {
    slangPending: slang && d.waiting,
    slangFailed: slang && d.failed,
    examplePending: example && d.waiting,
    themePending: theme && d.waiting,
    // One «не определилось»: on the level, or on the theme when the level is not detected.
    themeFailed: theme && d.failed && !slang,
  };
}

const EXAMPLE_FR =
  "h-[46px] min-w-0 bg-transparent p-0 font-serif text-[17px] leading-6 text-ink italic outline-none! placeholder:font-sans placeholder:text-[15px] placeholder:not-italic";

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
  detection,
  spot,
}: WordFormProps) {
  const ruId = useId();
  const frErrorId = useId();
  const ruErrorId = useId();
  const themeId = useId();
  const root = useRef<HTMLDivElement>(null);
  const abbr = draft.fr.trim() ? posAbbr(draft) : null;
  const states = detectionStates(draft, detection);
  useFieldSpotlight(root, spot);

  return (
    <div ref={root} className="flex flex-col pb-6">
      <HeadwordInput
        inputRef={frRef}
        spot="fr"
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
        <FieldRow label="Русский" spot="ru">
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
        <FieldRow label="Заметка" align="start" spot="note">
          <textarea
            rows={2}
            value={draft.note}
            onChange={(e) => onChange({ note: e.target.value })}
            placeholder="Оттенок, синонимы, происхождение"
            lang="ru"
            className="min-h-[63px] min-w-0 flex-1 resize-none bg-transparent pt-3 pb-[11px] text-[14px] leading-5 text-ink outline-none! [field-sizing:content] placeholder:text-muted pointer-coarse:text-[16px]"
          />
        </FieldRow>
        <FieldRow label="Пример" align="start" spot="example">
          <span className="relative flex min-w-0 flex-1 flex-col pb-1.5">
            <ExampleList
              editable
              size="form"
              card={{ fr: draft.fr, ru: draft.ru, note: draft.note }}
              examples={[{ fr: draft.example_fr, ru: draft.example_ru }, ...draft.extra_examples]}
              onChange={(next, change) => {
                const [first = { fr: "", ru: "" }, ...rest] = next;
                const firstChanged = change.index === 0 || change.kind === "remove";
                onChange({
                  example_fr: first.fr,
                  example_ru: first.ru,
                  extra_examples: rest,
                  ...(firstChanged && { example_touched: true, example_auto: change.kind === "retry" }),
                });
              }}
              frInputClass={cx(EXAMPLE_FR, states.examplePending ? "placeholder:text-transparent" : "placeholder:text-muted")}
              ruInputClass="-mt-1.5 h-8 min-w-0 bg-transparent p-0 text-[14px] leading-5 text-muted outline-none! placeholder:text-muted pointer-coarse:text-[16px]"
            />
            {/* The example on its way: a mono «…» in the placeholder's slot (A6). */}
            {states.examplePending && (
              <span data-example-pending="" className="pointer-events-none absolute top-0 left-0 flex h-[46px] items-center">
                <PendingDots />
              </span>
            )}
            {draft.example_auto && <span className="pb-1.5 text-[12px] leading-4 text-muted">подобран автоматически</span>}
          </span>
        </FieldRow>
      </div>

      <SlangPicker
        level={draft.slang_level}
        verlan={draft.verlan}
        auto={draft.slang_auto}
        pending={states.slangPending}
        failed={states.slangFailed}
        onChange={(next) => onChange({ ...next, slang_auto: false, slang_touched: true })}
      />

      <div data-spot="theme" className="mx-4 mt-6">
        <div className="flex items-baseline justify-between gap-3">
          <span id={themeId} className="meta block font-medium">
            Тема
          </span>
          {(states.themePending || states.themeFailed) && (
            <span role="status" className="text-[12px] leading-4 text-muted">
              {states.themePending ? "подбираем тему…" : "не определилась"}
            </span>
          )}
        </div>
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
