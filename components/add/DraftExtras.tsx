"use client";

// «+ Поле» in the add form (phone and desktop), as in the word card: «Происхождение» (with
// «Заполнить автоматически»), «Спряжение» for a verb the dictionary does not know, and one-off
// «Своё поле» rows. Everything stays in the draft and is saved with the word.
import { useEffect, useRef, useState } from "react";
import { AddFieldButton, type FieldKind } from "@/components/library/AddFieldButton";
import { AutoFillButton } from "@/components/library/AutoFill";
import { ConjugationForm, useBuiltinConjugation } from "@/components/library/WordConjugation";
import { conjDraftOf } from "@/components/library/word-editor";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icons";
import { autofillOrigin } from "@/lib/autofill";
import { ORIGIN_MAX } from "@/lib/core/conjugate";
import { FIELD_LABEL_MAX, FIELD_VALUE_MAX } from "@/lib/core/custom-fields";
import { DESK_INPUT, DeskFieldError, FIELD_LABEL } from "./desk-parts";
import { canAddField, type DraftErrors, type WordDraft } from "./draft";
import { FIELD_INPUT, FieldError, FieldRow } from "./parts";

const ORIGIN_KIND = { label: "Происхождение", caption: "откуда слово, верлан, заимствование" };
const CONJ_KIND = { label: "Спряжение", caption: "4 времени, по 6 форм" };

function RemoveButton({ label, onClick, desk }: { label: string; onClick: () => void; desk: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-[4px] bg-transparent text-muted hoverable:bg-hover-surface hoverable:text-ink",
        desk ? "size-8 pointer-coarse:size-11" : "-mr-2 size-11",
      )}
    >
      <Icon name="close" size={16} />
    </button>
  );
}

export function DraftExtras({
  draft,
  onChange,
  errors,
  layout,
}: {
  draft: WordDraft;
  onChange: (patch: Partial<WordDraft>) => void;
  errors: DraftErrors;
  layout: "phone" | "desk";
}) {
  const desk = layout === "desk";
  const word = { fr: draft.fr.trim(), ru: draft.ru.trim(), pos: draft.pos };
  const builtin = useBuiltinConjugation(word);
  /** What was just added, to focus it. */
  const [focus, setFocus] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  // After the menu has given focus back to «+ Поле» (it does so on the next frame).
  useEffect(() => {
    if (!focus) return;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        root.current?.querySelector<HTMLInputElement>(`[data-focus="${focus}"]`)?.focus();
        setFocus(null);
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [focus]);

  const kinds: FieldKind[] = [];
  if (!draft.originShown) {
    kinds.push({
      ...ORIGIN_KIND,
      onSelect: () => {
        setFocus("origin");
        onChange({ originShown: true });
      },
    });
  }
  if (draft.conjugation === null && draft.pos === "verb" && builtin === null) {
    kinds.push({ ...CONJ_KIND, onSelect: () => onChange({ conjugation: conjDraftOf(null) }) });
  }
  const addCustom = canAddField(draft)
    ? () => {
        setFocus(`field:${draft.extraFields.length}`);
        onChange({ extraFields: [...draft.extraFields, { label: "", value: "" }] });
      }
    : null;
  const setExtra = (i: number, patch: Partial<WordDraft["extraFields"][number]>) =>
    onChange({ extraFields: draft.extraFields.map((f, j) => (j === i ? { ...f, ...patch } : f)) });

  const originInput = (
    <input
      type="text"
      aria-label="Происхождение"
      value={draft.origin}
      onChange={(e) => onChange({ origin: e.target.value })}
      maxLength={ORIGIN_MAX}
      placeholder="Например: верлан от lourd"
      autoComplete="off"
      data-focus="origin"
      className={desk ? DESK_INPUT : FIELD_INPUT}
    />
  );
  const originFill = word.fr && (
    <AutoFillButton fill={(o) => autofillOrigin(word, o)} onFill={(v) => onChange({ origin: v, originShown: true })} />
  );
  const removeOrigin = <RemoveButton desk={desk} label="Убрать происхождение" onClick={() => onChange({ origin: "", originShown: false })} />;

  const conjugation = draft.conjugation && (
    <ConjugationForm
      draft={draft.conjugation}
      onChange={(c) => onChange({ conjugation: c })}
      word={word}
      autofill={!!word.fr}
      size={desk ? "pane" : "sheet"}
    />
  );
  const removeConj = <RemoveButton desk={desk} label="Убрать спряжение" onClick={() => onChange({ conjugation: null })} />;
  const Error = desk ? DeskFieldError : FieldError;

  if (desk) {
    return (
      <div ref={root} className="flex flex-col">
        {draft.originShown && (
          <div className="mt-4 flex flex-col">
            <span className={FIELD_LABEL}>Происхождение</span>
            <span className="flex items-center gap-1">
              {originInput}
              {removeOrigin}
            </span>
            {originFill}
          </div>
        )}
        {conjugation && (
          <div role="group" aria-label="Спряжение" className="mt-4 flex flex-col">
            <span className="flex items-center justify-between">
              <span className={cx(FIELD_LABEL, "mb-0")}>Спряжение</span>
              {removeConj}
            </span>
            {conjugation}
            <Error>{errors.conjugation}</Error>
          </div>
        )}
        {draft.extraFields.length > 0 && (
          <div role="group" aria-label="Свои поля слова" className="mt-4 flex flex-col gap-2">
            <span className={cx(FIELD_LABEL, "mb-0")}>Своё поле</span>
            {draft.extraFields.map((f, i) => (
              <span key={i} className="grid grid-cols-[minmax(0,160px)_minmax(0,1fr)_auto] items-center gap-2">
                <input
                  type="text"
                  aria-label={`Название поля ${i + 1}`}
                  value={f.label}
                  onChange={(e) => setExtra(i, { label: e.target.value })}
                  placeholder="Название"
                  maxLength={FIELD_LABEL_MAX}
                  autoComplete="off"
                  data-focus={`field:${i}`}
                  className={DESK_INPUT}
                />
                <input
                  type="text"
                  aria-label={`Значение поля ${i + 1}`}
                  value={f.value}
                  onChange={(e) => setExtra(i, { value: e.target.value })}
                  placeholder="Значение"
                  maxLength={FIELD_VALUE_MAX}
                  autoComplete="off"
                  className={DESK_INPUT}
                />
                <RemoveButton desk label={`Убрать поле ${f.label.trim() || i + 1}`} onClick={() => onChange({ extraFields: draft.extraFields.filter((_, j) => j !== i) })} />
              </span>
            ))}
            <Error>{errors.fields}</Error>
          </div>
        )}
        <AddFieldButton extras={kinds} onCustom={addCustom} />
      </div>
    );
  }

  return (
    <div ref={root} className="flex flex-col">
      {draft.originShown && (
        <FieldRow
          as="div"
          align="start"
          // «Откуда», as on the card's back: «Происхождение» does not fit the 88px label column.
          label={<span title="Происхождение">Откуда</span>}
        >
          <span className="flex min-w-0 flex-1 flex-col pb-1">
            <span className="flex min-w-0 items-center">
              {originInput}
              {removeOrigin}
            </span>
            {originFill}
          </span>
        </FieldRow>
      )}
      {conjugation && (
        <div role="group" aria-label="Спряжение" className="flex flex-col border-b border-rule pt-1 pb-3">
          <span className="flex items-center justify-between">
            <span className="meta">Спряжение</span>
            {removeConj}
          </span>
          {conjugation}
          <Error>{errors.conjugation}</Error>
        </div>
      )}
      {draft.extraFields.map((f, i) => (
        <div key={i} className="flex min-h-12 items-center border-b border-rule focus-within:border-ink focus-within:shadow-[0_1px_0_0_var(--ink)]">
          <input
            type="text"
            aria-label={`Название поля ${i + 1}`}
            value={f.label}
            onChange={(e) => setExtra(i, { label: e.target.value })}
            placeholder="Название"
            maxLength={FIELD_LABEL_MAX}
            autoComplete="off"
            data-focus={`field:${i}`}
            className="h-[46px] w-[88px] min-w-0 shrink-0 bg-transparent p-0 pr-2 text-[13px] leading-5 text-muted outline-none! placeholder:text-muted/70 pointer-coarse:text-[16px]"
          />
          <input
            type="text"
            aria-label={`Значение поля ${i + 1}`}
            value={f.value}
            onChange={(e) => setExtra(i, { value: e.target.value })}
            placeholder="Значение"
            maxLength={FIELD_VALUE_MAX}
            autoComplete="off"
            className={FIELD_INPUT}
          />
          <RemoveButton desk={false} label={`Убрать поле ${f.label.trim() || i + 1}`} onClick={() => onChange({ extraFields: draft.extraFields.filter((_, j) => j !== i) })} />
        </div>
      ))}
      <Error>{errors.fields}</Error>
      <AddFieldButton extras={kinds} onCustom={addCustom} />
    </div>
  );
}
