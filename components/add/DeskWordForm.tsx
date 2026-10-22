"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Collapse } from "@/components/ui/Collapse";
import { cx } from "@/components/ui/cx";
import { FIELD_VALUE_MAX, useFieldDefs } from "@/lib/custom-fields";
import { SLANG_NAMES_RU } from "@/components/ui/SlangMeter";
import { Icon } from "@/components/ui/Icons";
import { ExampleList } from "@/components/examples/ExampleList";
import { SLANG_LABELS, type Folder, type SlangLevel } from "@/lib/types";
import type { DuplicateInfo } from "./data";
import { DraftExtras } from "./DraftExtras";
import { draftFieldsSummary, draftFieldValue, withDraftField } from "./draft";
import { DuplicateReveal, PendingDots, UnknownMeter, useFieldSpotlight } from "./parts";
import { detectionStates, type WordFormProps } from "./WordForm";
import { CheckBox, DESK_INPUT, DeskFieldError, DeskFrame, FIELD_LABEL, HIDDEN_CONTROL_FOCUS, HintLine, KeyButton, ThemeSquare, type Hint } from "./desk-parts";
import { choiceKey, choiceName, INBOX_CHOICE, sameChoice, type FolderChoice } from "./folder-choice";
import { AbbrHint } from "@/components/ui/AbbrHint";
import { cardNumber, posAbbr } from "./match";

export interface DeskWordFormProps extends Omit<WordFormProps, "onSubmit" | "onAddAnyway"> {
  /** «Добавить» (andMore = «Добавить и ещё»). */
  onSave: (andMore: boolean) => void;
  /** Which button's save is running: that one shows «Добавляем…», the other only stops taking presses. */
  saving: "add" | "more" | null;
  /** «Добавить и ещё» saved: the fields fade out (--dur-exit) before the search comes back. */
  leaving?: boolean;
  saveError: string | null;
  /** Footer status after «Добавить и ещё» (replaces the key line). */
  status?: ReactNode;
}

const FORM_HINTS: readonly Hint[] = [
  [["Tab"], "дальше"],
  [["Escape"], "к поиску"],
];

const isEnter = (e: KeyboardEvent) => e.key === "Enter" && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey && !e.nativeEvent.isComposing;

/**
 * D-Add-Form: the picked suggestion (or a manual entry) as a two-column form. Tab runs
 * Французский → Русский → Заметка → Пример FR → RU → «Свои поля» (when there are any) → level → verl. → theme → «Другие темы» →
 * «в обе стороны» → «Добавить и ещё» → «Добавить». ⌘↵ / ⇧⌘↵ and Esc are handled by the dialog.
 */
export function DeskWordForm({
  draft,
  onChange,
  folders,
  errors,
  frRef,
  ruRef,
  duplicate,
  onOpenWord,
  detection,
  spot,
  onSave,
  saving,
  leaving = false,
  saveError,
  status,
}: DeskWordFormProps) {
  const id = useId();
  const root = useRef<HTMLFormElement>(null);
  const states = detectionStates(draft, detection);
  useFieldSpotlight(root, spot);
  const ids = {
    fr: `${id}-fr`,
    ru: `${id}-ru`,
    frError: `${id}-fr-err`,
    ruError: `${id}-ru-err`,
    dup: `${id}-dup`,
    note: `${id}-note`,
    example: `${id}-ex`,
    level: `${id}-lvl`,
    theme: `${id}-theme`,
  };
  const hasExample = Boolean(draft.example_fr.trim() || draft.example_ru.trim());
  const abbr = draft.fr.trim() ? posAbbr(draft) : null;
  const slangCaption = states.slangPending
    ? "определяется…"
    : states.slangFailed
      ? "не определилось"
      : draft.slang_auto
        ? "определён автоматически"
        : null;

  const footer = (
    <>
      {status ??
        (saveError ? (
          <p role="alert" className="m-0 min-w-0 flex-1 truncate text-[13px] leading-5 text-again">
            {saveError}
          </p>
        ) : (
          <HintLine hints={FORM_HINTS} />
        ))}
      <KeyButton
        variant="secondary"
        keys="Shift+Mod+Enter"
        pending={saving === "more"}
        blocked={saving === "add"}
        onClick={() => onSave(true)}
      >
        Добавить и ещё
      </KeyButton>
      <KeyButton keys="Mod+Enter" pending={saving === "add"} blocked={saving === "more"} onClick={() => onSave(false)}>
        {duplicate ? "Добавить всё равно" : "Добавить"}
      </KeyButton>
    </>
  );

  return (
    <DeskFrame
      footer={footer}
      tall
      bodyClassName={cx("pb-3", leaving && "pointer-events-none opacity-0 transition-opacity duration-(--dur-exit) ease-exit")}
    >
      <form ref={root} aria-label="Новое слово" onSubmit={(e) => e.preventDefault()} className="m-0 flex flex-col">
        <div className="grid grid-cols-2 gap-x-4">
          <div className="min-w-0">
            {/* The part of speech sits on the label row and explains itself, as on the phone form. */}
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor={ids.fr} className={FIELD_LABEL}>
                Французский
              </label>
              {abbr && <AbbrHint abbr={abbr} align="end" className="text-[14px] leading-5" />}
            </div>
            <input
              ref={frRef}
              id={ids.fr}
              type="text"
              lang="fr"
              value={draft.fr}
              onChange={(e) => onChange({ fr: e.target.value })}
              onKeyDown={(e) => {
                if (!isEnter(e)) return;
                e.preventDefault();
                document.getElementById(ids.ru)?.focus();
              }}
              placeholder="По-французски"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={errors.fr ? true : undefined}
              aria-describedby={[errors.fr && ids.frError, duplicate && ids.dup].filter(Boolean).join(" ") || undefined}
              data-spot="fr"
              className={cx(DESK_INPUT, "font-serif text-[20px] font-medium placeholder:font-sans placeholder:text-[15px] placeholder:font-normal")}
            />
            <DeskFieldError id={ids.frError}>{errors.fr}</DeskFieldError>
            <DuplicateReveal info={duplicate}>
              {(info) => <DuplicateLine id={ids.dup} info={info} onOpen={() => onOpenWord(info.word.id)} />}
            </DuplicateReveal>
          </div>
          <div className="min-w-0">
            <label htmlFor={ids.ru} className={FIELD_LABEL}>
              Русский
            </label>
            <input
              ref={ruRef}
              id={ids.ru}
              type="text"
              lang="ru"
              value={draft.ru}
              onChange={(e) => onChange({ ru: e.target.value })}
              onKeyDown={(e) => {
                if (!isEnter(e)) return;
                e.preventDefault();
                onSave(false);
              }}
              placeholder="Перевод"
              autoComplete="off"
              aria-invalid={errors.ru ? true : undefined}
              aria-describedby={errors.ru ? ids.ruError : undefined}
              data-spot="ru"
              className={DESK_INPUT}
            />
            <DeskFieldError id={ids.ruError}>{errors.ru}</DeskFieldError>
          </div>
        </div>

        <label htmlFor={ids.note} className={cx(FIELD_LABEL, "mt-4")}>
          Заметка
        </label>
        <textarea
          id={ids.note}
          rows={2}
          lang="ru"
          value={draft.note}
          onChange={(e) => onChange({ note: e.target.value })}
          placeholder="Оттенок, синонимы, происхождение"
          data-spot="note"
          className={cx(DESK_INPUT, "h-16 resize-none py-[9px] leading-[22px]")}
        />

        <span id={ids.example} className={cx(FIELD_LABEL, "mt-4")}>
          Пример
        </span>
        <div role="group" aria-labelledby={ids.example} data-spot="example" data-spot-target="inputs" className="relative">
          <ExampleList
            editable
            layout="row"
            size="pane"
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
            frInputClass={cx(
              states.examplePending ? DESK_INPUT.replace("placeholder:text-muted", "placeholder:text-transparent") : DESK_INPUT,
              "font-serif text-[17px] italic placeholder:font-sans placeholder:text-[15px] placeholder:not-italic",
            )}
            ruInputClass={DESK_INPUT}
          />
          {/* The example on its way: a mono «…» in the placeholder's slot (A6). */}
          {states.examplePending && (
            <span data-example-pending="" className="pointer-events-none absolute top-0 left-3 flex h-11 items-center">
              <PendingDots />
            </span>
          )}
        </div>
        {draft.example_auto && hasExample && <span className="mt-1 text-[12px] leading-4 text-muted">подобран автоматически</span>}

        <DeskDraftFields draft={draft} onChange={onChange} />
        <DraftExtras draft={draft} onChange={onChange} errors={errors} layout="desk" />

        <span id={ids.level} className={cx(FIELD_LABEL, "mt-4")}>
          Уровень сленга
        </span>
        <div data-spot="slang" className="flex h-8 items-center">
          <LevelOptions
            labelledBy={ids.level}
            value={states.slangPending ? null : draft.slang_level}
            onChange={(slang_level) => onChange({ slang_level, slang_auto: false, slang_touched: true })}
          />
          <label className={cx("relative ml-1 inline-flex h-8 cursor-pointer items-center gap-2 rounded-[4px] px-1", HIDDEN_CONTROL_FOCUS)}>
            <input
              type="checkbox"
              aria-label="верлан"
              checked={draft.verlan}
              onChange={(e) => onChange({ verlan: e.target.checked, slang_auto: false, slang_touched: true })}
              className="absolute top-0 left-0 m-0 size-px opacity-0"
            />
            <CheckBox checked={draft.verlan} />
            <span lang="fr" className={cx("font-serif text-[14px] font-medium italic", draft.verlan ? "text-ink" : "text-muted")}>
              verl.
            </span>
          </label>
          {slangCaption && (
            <span role={states.slangPending || states.slangFailed ? "status" : undefined} className="ml-4 flex items-center gap-2 text-[12px] leading-4 text-muted">
              {states.slangPending && <UnknownMeter />}
              {slangCaption}
            </span>
          )}
        </div>

        <div data-spot="theme" className="mt-4">
          <span className="flex items-baseline gap-3">
            <span id={ids.theme} className={FIELD_LABEL}>
              Тема
            </span>
            {(states.themePending || states.themeFailed) && (
              <span role="status" className="text-[12px] leading-4 text-muted">
                {states.themePending ? "подбираем тему…" : "не определилась"}
              </span>
            )}
          </span>
          <ThemeChips
            labelledBy={ids.theme}
            value={draft.folder}
            onChange={(folder) => onChange({ folder, folder_touched: true })}
            folders={folders}
            auto={draft.auto?.auto ?? null}
            alternatives={draft.auto?.alternatives ?? []}
            proposal={draft.auto?.proposal ?? null}
          />
        </div>

        <label className={cx("relative -mx-2 mt-1 flex min-h-11 cursor-pointer items-start gap-3 rounded-[4px] px-2 py-3", HIDDEN_CONTROL_FOCUS)}>
          <input
            type="checkbox"
            checked={draft.both_directions}
            onChange={(e) => onChange({ both_directions: e.target.checked })}
            className="absolute top-0 left-0 m-0 size-px opacity-0"
          />
          <CheckBox checked={draft.both_directions} className="mt-[3px]" />
          <span className="text-[15px] leading-5 text-ink">
            Карточки в обе стороны
            <span className="ml-2.5 font-mono text-[12px] text-muted">FR → RU · RU → FR</span>
          </span>
        </label>
      </form>
    </DeskFrame>
  );
}

/**
 * «Свои поля ▾» (only when Settings has shared fields): a disclosure under «Пример» that opens one
 * optional input per field, two to a row, the field's hint as the placeholder.
 */
function DeskDraftFields({ draft, onChange }: Pick<DeskWordFormProps, "draft" | "onChange">) {
  const defs = useFieldDefs();
  const id = useId();
  const [open, setOpen] = useState(() => draft.customFields.length > 0);
  if (defs.length === 0) return null;
  return (
    <div className="mt-4 flex flex-col">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="-mx-1 flex h-7 min-w-0 cursor-pointer items-center gap-2 self-start rounded-[4px] bg-transparent px-1 text-left hoverable:bg-hover-surface"
      >
        <span className="text-[12px] leading-4 font-medium text-muted">Свои поля</span>
        <span className="min-w-0 truncate text-[12px] leading-4 text-muted">· {draftFieldsSummary(draft, defs)}</span>
        <Icon name="chevron" size={14} className={cx("shrink-0 text-muted transition-transform duration-(--dur-move) ease-standard", open && "rotate-180")} />
      </button>
      <Collapse open={open} innerClassName="px-0.5">
        <div id={id} role="group" aria-label="Свои поля" className="grid grid-cols-2 gap-x-4 gap-y-3 pt-1.5 pb-0.5">
          {defs.map((def) => (
            <div key={def.id} className="min-w-0">
              <label htmlFor={`${id}-${def.id}`} className={FIELD_LABEL}>
                {def.name}
              </label>
              <input
                id={`${id}-${def.id}`}
                type="text"
                value={draftFieldValue(draft, def)}
                onChange={(e) => onChange({ customFields: withDraftField(draft.customFields, def, e.target.value) })}
                placeholder={def.hint ?? "Необязательно"}
                maxLength={FIELD_VALUE_MAX}
                autoComplete="off"
                className={DESK_INPUT}
              />
            </div>
          ))}
        </div>
      </Collapse>
    </div>
  );
}

function DuplicateLine({ id, info, onOpen }: { id: string; info: DuplicateInfo; onOpen: () => void }) {
  const where = info.folderName ? `в «${info.folderName}»` : "во «Входящих»";
  return (
    <p id={id} className="m-0 mt-1 flex items-baseline gap-1.5 text-[12px] leading-4 whitespace-nowrap text-warn">
      <span className="min-w-0 truncate">
        «<span lang="fr">{info.word.fr}</span>» уже есть {where}.
      </span>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Открыть ${cardNumber(info.ordinal)}`}
        className="shrink-0 bg-transparent p-0 font-mono text-[11px] text-warn tabular-nums underline decoration-1 underline-offset-[3px]"
      >
        {cardNumber(info.ordinal)}
      </button>
    </p>
  );
}

/** Roving tabindex + arrows for a row of radios (APG radio group). */
function onRadioKeys<T>(e: KeyboardEvent<HTMLElement>, values: readonly T[], current: number, select: (v: T, index: number) => void) {
  const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
  if (!delta || values.length === 0) return;
  e.preventDefault();
  const next = (Math.max(current, 0) + delta + values.length) % values.length;
  select(values[next], next);
}

const focusRadio = (group: HTMLElement | null, index: number) =>
  requestAnimationFrame(() => group?.querySelectorAll<HTMLElement>('[role="radio"]')[index]?.focus());

/** нейтр. | fam. | arg. | vulg. — text options with hairline separators. */
/** `value` null: the level is still being detected, nothing is selected (A6). */
function LevelOptions({ labelledBy, value, onChange }: { labelledBy: string; value: SlangLevel | null; onChange: (v: SlangLevel) => void }) {
  const group = useRef<HTMLDivElement>(null);
  const levels = [0, 1, 2, 3] as const;
  return (
    <div
      ref={group}
      role="radiogroup"
      aria-labelledby={labelledBy}
      className="-ml-3 flex items-center"
      onKeyDown={(e) =>
        onRadioKeys(e, levels, value ?? -1, (v, i) => {
          onChange(v);
          focusRadio(group.current, i);
        })
      }
    >
      {levels.map((l) => (
        <span key={l} className="flex items-center">
          {l > 0 && <span aria-hidden="true" className="h-4 w-px bg-rule" />}
          <button
            type="button"
            role="radio"
            aria-checked={value === l}
            aria-label={SLANG_NAMES_RU[l]}
            tabIndex={value === l || (value === null && l === 0) ? 0 : -1}
            lang={l === 0 ? undefined : "fr"}
            onClick={() => onChange(l)}
            className={cx(
              "h-8 bg-transparent px-3 font-serif text-[14px] font-medium italic",
              value === l ? "text-ink underline decoration-1 underline-offset-4" : "text-muted hoverable:text-ink",
            )}
          >
            {SLANG_LABELS[l]}
          </button>
        </span>
      ))}
    </div>
  );
}

const CHIP =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[4px] border pr-2.5 pl-[9px] text-[13px] leading-4 whitespace-nowrap";

/**
 * «Тема»: the automatic pick (caption «подобрано автоматически» under it), its alternatives, the
 * dashed «+ новая тема: X», and «Другие темы ▾» (a native select in folder order) for the rest.
 * Without an automatic pick: «Входящие» and every theme.
 */
function ThemeChips({
  labelledBy,
  value,
  onChange,
  folders,
  auto,
  alternatives,
  proposal,
}: {
  labelledBy: string;
  value: FolderChoice;
  onChange: (choice: FolderChoice) => void;
  folders: readonly Folder[];
  auto: FolderChoice | null;
  alternatives: readonly FolderChoice[];
  proposal: FolderChoice | null;
}) {
  const group = useRef<HTMLDivElement>(null);
  const captionId = useId();
  const all: FolderChoice[] = [INBOX_CHOICE, ...folders.map((f): FolderChoice => ({ kind: "folder", id: f.id }))];
  const chips: FolderChoice[] = auto ? [auto, ...alternatives] : all;
  if (proposal && !chips.some((c) => sameChoice(c, proposal))) chips.push(proposal);
  // A theme picked from «Другие темы» joins the chips.
  if (!chips.some((c) => sameChoice(c, value))) chips.splice(auto ? 1 + alternatives.length : chips.length, 0, value);
  const rest = auto ? all.filter((c) => !chips.some((s) => sameChoice(s, c))) : [];
  const autoSelected = auto !== null && sameChoice(value, auto);
  const current = chips.findIndex((c) => sameChoice(c, value));

  return (
    <div className={cx("flex items-start gap-1.5", autoSelected && "pb-5")}>
      <div
        ref={group}
        role="radiogroup"
        aria-labelledby={labelledBy}
        className="flex min-w-0 flex-wrap items-start gap-x-1.5 gap-y-2"
        onKeyDown={(e) =>
          onRadioKeys(e, chips, current, (c, i) => {
            onChange(c);
            focusRadio(group.current, i);
          })
        }
      >
        {chips.map((c, i) => {
          const selected = i === current;
          const isNew = c.kind === "new";
          const isAuto = autoSelected && i === 0;
          return (
            <span key={choiceKey(c)} className="relative flex">
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                aria-describedby={isAuto ? captionId : undefined}
                tabIndex={selected || (current === -1 && i === 0) ? 0 : -1}
                onClick={() => onChange(c)}
                className={cx(
                  CHIP,
                  isNew && "border-dashed pl-2.5",
                  selected ? "border-ink bg-ink text-on-ink" : "border-boundary bg-surface text-ink hoverable:bg-hover-surface",
                )}
              >
                <ThemeSquare choice={c} folders={folders} onInk={selected} />
                <span>{isNew ? `+ новая тема: ${c.name}` : choiceName(c, folders)}</span>
              </button>
              {isAuto && (
                <span id={captionId} className="absolute top-9 left-0 text-[12px] leading-4 whitespace-nowrap text-muted">
                  подобрано автоматически
                </span>
              )}
            </span>
          );
        })}
      </div>
      {rest.length > 0 && (
        <span className={cx("relative", CHIP, "gap-1 border-boundary bg-surface pr-2 pl-2.5 text-ink hoverable:bg-hover-surface", HIDDEN_CONTROL_FOCUS)}>
          <span>Другие темы</span>
          <Icon name="chevron" size={14} strokeWidth={1.75} className="text-muted" />
          <select
            aria-label="Другие темы"
            value=""
            onChange={(e) => {
              const next = rest.find((c) => choiceKey(c) === e.target.value);
              if (next) onChange(next);
            }}
            className="absolute inset-0 size-full cursor-pointer appearance-none opacity-0"
          >
            <option value="" disabled>
              Другие темы
            </option>
            {rest.map((c) => (
              <option key={choiceKey(c)} value={choiceKey(c)}>
                {choiceName(c, folders)}
              </option>
            ))}
          </select>
        </span>
      )}
    </div>
  );
}
