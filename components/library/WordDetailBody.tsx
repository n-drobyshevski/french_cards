"use client";

import { useLiveQuery } from "dexie-react-hooks";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { Button, IconButton } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Icon, type IconName } from "@/components/ui/Icons";
import { Kbd } from "@/components/ui/Kbd";
import { Segmented } from "@/components/ui/Segmented";
import { SheetCloseButton } from "@/components/ui/Sheet";
import { SkeletonBar } from "@/components/ui/Skeleton";
import { AbbrHint } from "@/components/ui/AbbrHint";
import { SlangMeter } from "@/components/ui/SlangMeter";
import { Toggle } from "@/components/ui/Toggle";
import { cx } from "@/components/ui/cx";
import { autofillNote, autofillOrigin, detectEntry } from "@/lib/autofill";
import { ORIGIN_MAX } from "@/lib/core/conjugate";
import { db } from "@/lib/db";
import { listFolders } from "@/lib/folders";
import { useFormatKeys } from "@/lib/key-names";
import { spotlight } from "@/lib/motion";
import { formatDueIn, formatStability, wordStatus, type CardStatus } from "@/lib/scheduler";
import { findDuplicate, normalizeLemma } from "@/lib/text";
import { FIELD_LABEL_MAX, FIELD_VALUE_MAX, useFieldDefs } from "@/lib/custom-fields";
import { SLANG_LABELS, type Conjugation, type Direction, type FieldDef, type Folder, type ReviewLog, type SlangLevel, type Word } from "@/lib/types";
import {
  getWordHistory,
  getWordStates,
  moveWords,
  resetProgress,
  restoreMoves,
  restoreReviewStates,
  restoreWords,
  softDeleteWords,
  updateWord,
  type WordPatch,
} from "@/lib/words";
import { cardNumber } from "@/components/add/match";
import { spotlightTheme } from "@/components/shell/dnd";
import { CheckMark } from "./Checkbox";
import { useRevealClass } from "./first-paint";
import { formatDate, plural, posAbbr, SOURCE_LABELS, STATUS_LABELS } from "./format";
import { markLeaving, markReturning } from "./leaving";
import { INBOX_KEY, MoveMenu, ThemeSquare } from "./MoveMenu";
import { alphaOrder, catalogNumbers, neighboursAt, type Neighbour } from "./table";
import { folderOptions, TargetPickerSheet } from "./TargetPickerSheet";
import { TextOptions } from "./TextOptions";
import { useThemePause } from "./theme-pause";
import { useTranslationProposal, type TranslationProposal } from "./translation-proposal";
import { useUndoSnackbar } from "./undo";
import { LifeExamplesLink } from "@/components/context/ContextLink";
import { ExampleList, toDrafts, type ExampleDraft } from "@/components/examples/ExampleList";
import { examplesPatch, wordExamples } from "@/lib/examples";
import { conjDraftError, draftOf, isDirty, patchFor, undoFor, withConjugationDraft, type Draft, type Editing } from "./word-editor";
import { QuizIconButton, useConjugationView } from "@/components/conjugation/ConjugationViews";
import { AddFieldButton, type FieldKind } from "./AddFieldButton";
import { AutoFillButton } from "./AutoFill";
import { conjugationShown, ConjugationForm, ConjugationShown, offersConjugation, useBuiltinConjugation } from "./WordConjugation";
import { cleanConjugation, cleanOrigin } from "@/lib/core/conjugate";
import { canAddField, fieldRows, fieldRowsError, newFieldRow, type FieldRow } from "./word-fields";

// A word's entry, editable fields, schedule, history and actions. One body, two layouts: the
// phone sheet (WordDetailSheet) and the desktop detail pane (DESKTOP-SPEC §5 #6–8). Data, editing,
// «Обновить перевод и заметку» and the actions are shared.

const DIRECTION_LABEL: Record<Direction, string> = { fr_ru: "FR → RU", ru_fr: "RU → FR" };
const RATING_NAMES = { 1: "не знаю", 2: "сложно", 3: "знаю", 4: "легко" } as const;
const SLANG_OPTIONS = [
  { value: 0 as SlangLevel, label: "нейтр." },
  { value: 1 as SlangLevel, label: "fam.", lang: "fr" },
  { value: 2 as SlangLevel, label: "arg.", lang: "fr" },
  { value: 3 as SlangLevel, label: "vulg.", lang: "fr" },
];
const HISTORY_SLOTS = 8;
const PANE_HISTORY = 6;

/** ↻ and «+ Ещё пример» in the word's view: saved at once, with «Отменить». */
function useExampleSaver(word: Word | null) {
  const showUndo = useUndoSnackbar();
  return async (next: ExampleDraft[], change: { kind: string }) => {
    if (!word) return;
    const undo: WordPatch = { example_fr: word.example_fr, example_ru: word.example_ru, extra_examples: word.extra_examples ?? [] };
    await updateWord(word.id, examplesPatch(next));
    showUndo({ message: change.kind === "add" ? "Пример добавлен" : "Пример заменён", undo: () => void updateWord(word.id, undo) });
  };
}

interface ScheduleRow {
  direction: Direction;
  /** Sheet wording: «следующий показ через 4 д» on the first row, «через 5 д» after it. */
  text: string;
  /** Pane wording: every row in full. */
  full: string;
  stability: string | null;
}

interface DetailData {
  word: Word;
  schedule: ScheduleRow[];
  /** Newest first. */
  history: ReviewLog[];
  reviews: number;
  folders: Folder[];
  status: CardStatus;
  /** Catalog number (creation order, like «Карточка № 159»); pane only. */
  number?: number;
  /** «Рядом в алфавите»; pane only. */
  neighbours?: Neighbour[];
}

function useWordDetail(wordId: string) {
  return useLiveQuery(async (): Promise<{ word: null } | DetailData> => {
    const now = new Date();
    const word = await db.words.get(wordId);
    if (!word || word.deleted_at !== null) return { word: null };
    const [states, history, reviews, folders] = await Promise.all([
      getWordStates(wordId),
      getWordHistory(wordId, HISTORY_SLOTS),
      db.review_log.where("word_id").equals(wordId).filter((l) => l.deleted_at === null).count(),
      listFolders(),
    ]);
    const schedule = states.map((s, i) => {
      const due = formatDueIn(s, now);
      const text = s.state === 0 ? "новая карточка" : due === "сейчас" ? "пора повторить" : i === 0 ? `следующий показ ${due}` : due;
      const full = s.state === 0 ? "ещё не показывалось" : due === "сейчас" ? "к повторению" : `следующий показ ${due}`;
      return { direction: s.direction, text, full, stability: formatStability(s) };
    });
    return { word, schedule, history, reviews, folders, status: wordStatus(states) };
  }, [wordId]);
}

interface CatalogIndex {
  numbers: ReadonlyMap<string, number>;
  alpha: readonly { id: string; fr: string }[];
  /** Word id → its place in `alpha`. */
  at: ReadonlyMap<string, number>;
}

/**
 * Catalog numbers and the alphabetical order of the whole library, for the pane. One read per
 * change of the words, not per cursor move: each word then looks itself up.
 */
function useCatalogIndex(): CatalogIndex | undefined {
  return useLiveQuery(async () => {
    const all = (await db.words.toArray()).filter((w) => w.deleted_at === null);
    const alpha = alphaOrder(all).map((w) => ({ id: w.id, fr: w.fr }));
    return { numbers: catalogNumbers(all), alpha, at: new Map(alpha.map((w, i) => [w.id, i])) };
  }, []);
}

/** Editing state of one word: which field is open, the draft, saving with the duplicate guard. */
function useWordEditor(word: Word | null, folders: readonly Folder[], defs: readonly FieldDef[]) {
  const [editing, setEditing] = useState<Editing>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [dupConfirm, setDupConfirm] = useState<string | null>(null);

  const start = (what: Exclude<Editing, null>, from?: Draft) => {
    if (!word) return;
    setDraft(from ?? draftOf(word, defs));
    setEditing(what);
    setFormError(null);
    setDupConfirm(null);
  };
  const cancel = () => {
    setEditing(null);
    setDraft(null);
    setFormError(null);
    setDupConfirm(null);
  };
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
    if (key === "fr") setDupConfirm(null);
    setFormError(null);
  };

  /** Saves the open field; returns the undo patch, or null when nothing was saved. */
  const save = async (): Promise<WordPatch | null> => {
    if (!draft || !editing || !word) return null;
    const patch = patchFor(editing, draft);
    const problem =
      editing === "fields" ? fieldRowsError(draft.fields, defs) : editing === "conjugation" ? conjDraftError(draft.conjugation) : null;
    if (problem) {
      setFormError(problem);
      return null;
    }
    // Opened on the dictionary's forms and left as they are: nothing to save.
    if (editing === "conjugation" && !isDirty(word, editing, draft)) {
      cancel();
      return null;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editing === "entry" && normalizeLemma(draft.fr) !== normalizeLemma(word.fr)) {
        const dup = await findDuplicate(draft.fr, { excludeId: word.id });
        if (dup && dupConfirm !== dup.id) {
          const where = dup.folder_id ? folders.find((f) => f.id === dup.folder_id)?.name : undefined;
          setDupConfirm(dup.id);
          setFormError(`«${dup.fr}» уже есть${where ? ` в «${where}»` : " во «Входящих»"}.`);
          setSaving(false);
          return null;
        }
      }
      const undo = undoFor(word, patch);
      await updateWord(word.id, patch);
      cancel();
      return undo;
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Не получилось сохранить");
      return null;
    } finally {
      setSaving(false);
    }
  };

  /** «Свои поля», optionally with other rows than the word's (a new one-off row from «+ Поле»). */
  const startFields = (rows?: FieldRow[]) => {
    if (!word) return;
    start("fields", rows ? { ...draftOf(word, defs), fields: rows } : undefined);
  };

  return {
    editing,
    draft,
    saving,
    formError,
    dupConfirm,
    start,
    startFields,
    cancel,
    set,
    save,
    dirty: !!word && isDirty(word, editing, draft),
  };
}

/**
 * L9: a saved edit lights what it changed (spotlight, §5.14), one region: the entry's headword,
 * grammar and translation together (`data-edited~="entry"`), or the note, or the examples. Call
 * `lit(what)` once the save went through; the fields are lit after the view is back.
 */
function useSavedSpotlight() {
  const root = useRef<HTMLDivElement>(null);
  const [saved, setSaved] = useState<{ what: Exclude<Editing, null>; n: number } | null>(null);
  useEffect(() => {
    if (saved) root.current?.querySelectorAll(`[data-edited~="${saved.what}"]`).forEach((el) => spotlight(el));
  }, [saved]);
  const lit = (what: Exclude<Editing, null>) => setSaved((s) => ({ what, n: (s?.n ?? 0) + 1 }));
  return { ref: root, lit };
}

/** Move / reset / delete with undo snackbars. */
function useWordActions(word: Word | null, folders: readonly Folder[], onDeleted: () => void) {
  const showUndo = useUndoSnackbar();
  const folder = word && word.folder_id !== null ? folders.find((f) => f.id === word.folder_id) : undefined;

  const changeFolder = async (key: string) => {
    if (!word) return;
    const to = key === INBOX_KEY ? null : key;
    if (to === (folder ? folder.id : null)) return;
    // Its row closes in a list it leaves; the target theme in the sidebar is lit (L10).
    markLeaving([word.id]);
    const records = await moveWords([word.id], to);
    if (records.length === 0) return;
    spotlightTheme(to);
    const name = to === null ? "Входящие" : (folders.find((f) => f.id === to)?.name ?? "тему");
    showUndo({
      message: `${to === null ? "Перемещено во" : "Перемещено в"} «${name}»`,
      undo: () => {
        markReturning([word.id]);
        void restoreMoves(records);
      },
    });
  };

  const reset = async () => {
    if (!word) return;
    const prev = await resetProgress(word.id);
    showUndo({ message: "Прогресс сброшен", undo: () => void restoreReviewStates(prev) });
  };

  const remove = async () => {
    if (!word) return;
    const { id: wid, fr } = word;
    markLeaving([wid]);
    await softDeleteWords([wid]);
    onDeleted();
    showUndo({
      message: (
        <>
          Удалено · <span lang="fr">{fr}</span>
        </>
      ),
      undo: () => {
        markReturning([wid]);
        void restoreWords([wid]);
      },
    });
  };

  /** «На паузу» / «Вернуть в повторения»: the word stays, its cards leave review (or come back). */
  const setMuted = async (muted: boolean) => {
    if (!word) return;
    const wid = word.id;
    await updateWord(wid, { muted });
    showUndo({
      message: muted ? "На паузе — в повторениях не появится" : "Снова в повторениях",
      undo: () => void updateWord(wid, { muted: !muted }).catch(() => {}),
    });
  };

  const setThemePaused = useThemePause();
  /** «Вернуть тему»: the word's theme is «на паузе». */
  const unpauseTheme = () => (folder ? setThemePaused(folder, false) : Promise.resolve());

  return { folder, changeFolder, reset, remove, setMuted, unpauseTheme };
}

/** «Повторение»'s notice for a word «на паузе», itself or through its theme. */
function PauseNotice({ word, folder, actions, size }: { word: Word; folder: Folder | undefined; actions: ReturnType<typeof useWordActions>; size: "sheet" | "pane" }) {
  if (word.muted) return <MutedNotice size={size} onUnmute={() => void actions.setMuted(false)} />;
  if (folder?.muted) return <MutedNotice size={size} text={`Тема «${folder.name}» на паузе`} action="Вернуть тему" onUnmute={() => void actions.unpauseTheme()} />;
  return null;
}

/** Under «Повторение» while the word is «на паузе»: what that means and the way back. */
function MutedNotice({
  onUnmute,
  size,
  text = "На паузе — не показывается в повторениях",
  action = "Вернуть",
}: {
  onUnmute: () => void;
  size: "sheet" | "pane";
  text?: string;
  action?: string;
}) {
  return (
    <div className={cx("flex items-center justify-between gap-3 border-b border-rule", size === "sheet" ? "min-h-11 py-1" : "min-h-9 py-1")}>
      <span className={cx("flex min-w-0 items-center gap-2 text-muted", size === "sheet" ? "text-[14px]" : "text-[13px]")}>
        <Icon name="mute" size={16} strokeWidth={1.5} className="shrink-0" />
        {text}
      </span>
      <button
        type="button"
        onClick={onUnmute}
        className={cx(
          "-mx-1 inline-flex shrink-0 items-center gap-1.5 rounded-[4px] bg-transparent px-1 font-medium text-ink underline decoration-1 underline-offset-4 hoverable:bg-hover",
          size === "sheet" ? "h-11 text-[14px]" : "h-8 text-[13px] pointer-coarse:h-11",
        )}
      >
        {action}
      </button>
    </div>
  );
}

export interface PaneOptions {
  /** Chevron-up / `K`; undefined = this is the first word. */
  onPrev?: () => void;
  /** Chevron-down / `J`; undefined = this is the last word. */
  onNext?: () => void;
  /** «Рядом в алфавите» links. */
  onOpenWord?: (id: string) => void;
  /** «+ Новая тема…» in the theme picker: create a theme and move these words there. */
  onNewTheme?: (ids: string[]) => void;
  /** Bumped by `E`: opens the entry form with «Русский» focused. */
  editSignal?: number;
  /** Coarse pointer (D-Library-Touch): tracings footer on the card, POS-only grammar line. */
  coarse?: boolean;
  /** The index card, for `↵` (focus moves into it). */
  cardRef?: RefObject<HTMLElement | null>;
}

export interface WordDetailBodyProps extends PaneOptions {
  wordId: string;
  variant: "sheet" | "pane";
  /** The word is gone (deleted here or elsewhere). */
  onClose: () => void;
}

export function WordDetailBody({ variant, ...props }: WordDetailBodyProps) {
  return variant === "sheet" ? <SheetBody wordId={props.wordId} onClose={props.onClose} /> : <PaneBody {...props} />;
}

function useCloseWhenGone(data: { word: Word | null } | undefined, onClose: () => void) {
  const gone = data !== undefined && data.word === null;
  useEffect(() => {
    if (gone) onClose();
  }, [gone, onClose]);
}

// ---------------------------------------------------------------------------------------------
// Phone sheet layout

const NO_WORD = { fr: "", pos: "other" } as const;

function SheetBody({ wordId, onClose }: { wordId: string; onClose: () => void }) {
  const id = useId();
  const data = useWordDetail(wordId);
  const word = data && data.word ? data.word : null;
  const folders = data && "folders" in data ? data.folders : [];
  const defs = useFieldDefs();
  const editor = useWordEditor(word, folders, defs);
  const builtin = useBuiltinConjugation(word ?? NO_WORD);
  // «Спряжение»: «Все формы» and «Проверь себя» (the eye in the field's header) share this state.
  const conjView = useConjugationView();
  const actions = useWordActions(word, folders, onClose);
  const saveExamples = useExampleSaver(word);
  const proposal = useTranslationProposal(editor.draft?.fr ?? "", editor.draft?.ru ?? "", editor.editing === "entry");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [fieldFocus, setFieldFocus] = useState<string | null>(null);
  const { ref: savedRef, lit: litSaved } = useSavedSpotlight();
  // L9: the content is usually there on the first frame; when it is not, the sheet keeps a reserved
  // blank (never a skeleton) and the content fades in --dur-quick over it.
  const reveal = useRevealClass(!!data?.word);
  useCloseWhenGone(data, onClose);

  if (!data || !data.word) {
    return <div className="min-h-40" aria-busy="true" />;
  }
  const { schedule, history, reviews } = data;
  const w = data.word;
  const { folder } = actions;
  const { editing, draft, set } = editor;
  const abbr = posAbbr(w);
  const shownFields = fieldRows(w, defs);
  const editFields = (focus: string | null, rows?: FieldRow[]) => {
    setFieldFocus(focus);
    editor.startFields(rows);
  };
  const fieldKinds = addableKinds(w, builtin, editor, defs);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const what = editor.editing;
    if (what && (await editor.save())) litSaved(what);
  };

  // Mockups: canvas «Правка полей — мокапы», H4 (chosen 2026-10-23): ✕ and ✓ at the bottom right of
  // the field being edited; inside the box of a one-input field (note, origin), under a larger form.
  const editPair = (className?: string) => (
    <EditPair className={className} saving={editor.saving} dupConfirm={!!editor.dupConfirm} onCancel={editor.cancel} />
  );
  const editActions = editPair("mt-3");
  const errorLine = editor.formError && (
    <p role="alert" className="m-0 mt-2 text-[13px] leading-5 text-again">
      {editor.formError}
    </p>
  );

  return (
    <div ref={savedRef} data-word-detail="" className={cx("flex flex-col px-4 pb-4", reveal)}>
      {/* Card header: theme chip + close, above the red index-card rule */}
      <div className="flex h-11 shrink-0 items-center justify-between">
        <Chip dropdown onClick={() => setPickerOpen(true)} aria-label={`Тема: ${folder?.name ?? "Входящие"}, изменить`}>
          {folder && <span aria-hidden="true" className="h-3 w-[3px]" style={{ background: folder.color }} />}
          {folder?.name ?? "Входящие"}
        </Chip>
        <SheetCloseButton className="-mr-3" />
      </div>
      <div aria-hidden="true" className="h-0.5 shrink-0 bg-red" />

      {/* Entry */}
      {editing === "entry" && draft ? (
        <form onSubmit={save} className="mt-4 flex flex-col" aria-label="Изменить слово">
          <label htmlFor={`${id}-fr`} className="meta">
            Французский
          </label>
          <input
            id={`${id}-fr`}
            lang="fr"
            value={draft.fr}
            onChange={(e) => set("fr", e.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            className="mt-2 h-12 rounded-chip border border-rule bg-surface px-3 font-serif text-[20px] text-ink outline-none focus:border-ink"
          />
          <label htmlFor={`${id}-ru`} className="meta mt-4">
            Русский
          </label>
          {/* H4: the form's ✕ / ✓ sit inside «Русский», the last box of the form. */}
          <div className="mt-2 flex items-center rounded-chip border border-rule bg-surface pr-1 focus-within:border-ink">
            <input
              id={`${id}-ru`}
              value={draft.ru}
              onChange={(e) => set("ru", e.target.value)}
              autoComplete="off"
              className="h-12 min-w-0 flex-1 bg-transparent px-3 text-[16px] text-ink outline-none!"
            />
            {editPair()}
          </div>
          <ProposalLine proposal={proposal} onUse={(ru) => set("ru", ru)} />
          <span id={`${id}-slang`} className="meta mt-4">
            Уровень сленга
          </span>
          <div className="mt-2 flex items-center gap-2">
            <Segmented
              variant="block"
              options={SLANG_OPTIONS}
              value={draft.slang_level}
              onChange={(v) => set("slang_level", v)}
              ariaLabelledby={`${id}-slang`}
              itemClassName="font-serif italic text-[16px]"
              className="min-w-0 flex-1"
            />
            <span className="flex items-center">
              <span id={`${id}-verl`} lang="fr" className="abbr text-[16px]">
                verl.
              </span>
              <Toggle checked={draft.verlan} onCheckedChange={(v) => set("verlan", v)} aria-labelledby={`${id}-verl`} />
            </span>
          </div>
          <DetectEntry word={w} draft={draft} set={set} />
          {errorLine}
        </form>
      ) : (
        <>
          <div data-edited="entry" className="mt-4 flex items-start gap-2">
            <h2 lang="fr" className="m-0 min-w-0 flex-1 font-serif text-[36px] leading-10 font-medium tracking-[-0.015em] break-words">
              {w.fr}
            </h2>
            <IconButton icon="pencil" label="Изменить слово и перевод" className="-mr-3 text-muted" onClick={() => editor.start("entry")} />
          </div>
          <div data-edited="entry" className="mt-2 flex h-5 items-center gap-2">
            {abbr && (
              <>
                <AbbrHint abbr={abbr} className="text-[15px] leading-5" />
                <span aria-hidden="true" className="abbr">
                  ·
                </span>
              </>
            )}
            <SlangMeter level={w.slang_level} verlan={w.verlan} hints />
          </div>
          <p data-edited="entry" className="m-0 mt-1 text-[18px] leading-6">
            {w.ru}
          </p>
        </>
      )}

      {/* Editable fields */}
      <div className="mt-6 flex flex-col">
        <SheetField
          label="Заметка"
          edited="note"
          editLabel="Изменить заметку"
          editing={editing === "note"}
          onEdit={() => editor.start("note")}
          form={
            draft && (
              <form onSubmit={save} className="flex flex-col" aria-label="Изменить заметку">
                <div className="mt-1 flex flex-col rounded-chip border border-rule bg-surface focus-within:border-ink">
                  <textarea
                    aria-label="Заметка"
                    value={draft.note}
                    onChange={(e) => set("note", e.target.value)}
                    rows={3}
                    className="resize-none rounded-chip bg-transparent px-3 pt-2.5 pb-0.5 text-[15px] leading-[22px] text-ink outline-none! pointer-coarse:text-[16px]"
                  />
                  {editPair("px-1 pb-1")}
                </div>
                <AutoFillButton className="mt-1" fill={(o) => autofillNote(draft, o)} onFill={(v) => set("note", v)} />
                {errorLine}
              </form>
            )
          }
        >
          {w.note ? (
            <span className="text-[15px] leading-[22px] whitespace-pre-line">{w.note}</span>
          ) : (
            <span className="text-[15px] leading-[22px] text-muted">Нет заметки</span>
          )}
        </SheetField>
        {(w.origin || editing === "origin") && (
        <SheetField
          label="Происхождение"
          editLabel="Изменить происхождение"
          editing={editing === "origin"}
          onEdit={() => editor.start("origin")}
          form={
            draft && (
              <form onSubmit={save} className="flex flex-col" aria-label="Изменить происхождение">
                <div className="mt-1 flex items-center rounded-chip border border-rule bg-surface pr-1 focus-within:border-ink">
                  <input
                    aria-label="Происхождение"
                    value={draft.origin}
                    onChange={(e) => set("origin", e.target.value)}
                    maxLength={ORIGIN_MAX}
                    placeholder="Например: верлан от lourd"
                    autoFocus
                    className="h-12 min-w-0 flex-1 bg-transparent px-3 text-[15px] text-ink outline-none! placeholder:text-muted pointer-coarse:text-[16px]"
                  />
                  {editPair()}
                </div>
                <AutoFillButton className="mt-1" fill={(o) => autofillOrigin(w, o)} onFill={(v) => set("origin", v)} />
                {errorLine}
              </form>
            )
          }
        >
          <span className="text-[15px] leading-[22px]">{w.origin}</span>
        </SheetField>
        )}
        {conjugationShown(w, builtin, editing) && (
          <SheetField
            label="Спряжение"
            editLabel="Изменить спряжение"
            editing={editing === "conjugation"}
            tools={(cleanConjugation(w.conjugation) ?? builtin) && <QuizIconButton on={conjView.quiz.on} onClick={conjView.toggleQuiz} />}
            onEdit={() => editor.start("conjugation", withConjugationDraft(draftOf(w, defs), cleanConjugation(w.conjugation) ?? builtin))}
            form={
              draft && (
                <form onSubmit={save} className="flex flex-col" aria-label="Изменить спряжение">
                  <ConjugationForm draft={draft.conjugation} onChange={(next) => set("conjugation", next)} word={w} onReset={editor.cancel} autofill={builtin === null} size="sheet" />
                  {errorLine}
                  {editActions}
                </form>
              )
            }
          >
            <ConjugationShown word={w} builtin={builtin} size="sheet" view={conjView} />
          </SheetField>
        )}
        <SheetField
          label="Пример"
          edited="example"
          editLabel="Изменить пример"
          editing={editing === "example"}
          onEdit={() => editor.start("example")}
          form={
            draft && (
              <form onSubmit={save} className="flex flex-col" aria-label="Изменить пример">
                <ExampleList
                  editable
                  card={w}
                  examples={draft.examples.length ? draft.examples : [{ fr: "", ru: "" }]}
                  onChange={(next) => set("examples", next)}
                  frInputClass="mt-1 h-11 rounded-chip border border-rule bg-surface px-3 font-serif text-[17px] text-ink italic outline-none placeholder:text-muted focus:border-ink"
                  ruInputClass="mt-2 h-11 rounded-chip border border-rule bg-surface px-3 text-[15px] text-ink outline-none placeholder:text-muted focus:border-ink pointer-coarse:text-[16px]"
                  trailing={editPair()}
                />
                {errorLine}
              </form>
            )
          }
        >
          <ExampleList
            card={w}
            examples={toDrafts(wordExamples(w))}
            onChange={(next, change) => void saveExamples(next, change)}
            aside={<LifeExamplesLink fr={w.fr} onNavigate={onClose} />}
          />
        </SheetField>
        <div data-edited="fields" className="flex items-start gap-2 border-t border-rule py-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="meta">Свои поля</span>
            {editing === "fields" && draft ? (
              <form onSubmit={save} className="flex flex-col" aria-label="Изменить свои поля">
                <FieldsForm
                  size="sheet"
                  rows={draft.fields}
                  focusKey={fieldFocus}
                  onChange={(rows) => set("fields", rows)}
                  onFocusKey={setFieldFocus}
                  trailing={editPair()}
                />
                {errorLine}
              </form>
            ) : (
              <FieldsView size="sheet" rows={shownFields} onEdit={editFields} extras={fieldKinds} />
            )}
          </div>
          {editing !== "fields" && shownFields.length > 0 && (
            <IconButton icon="pencil" label="Изменить свои поля" className="-mt-1 -mr-3 text-muted" onClick={() => editFields(null)} />
          )}
        </div>
      </div>

      {/* Progress */}
      <div className="meta mt-2 flex justify-between border-t border-ink pt-2">
        <span className="font-medium text-ink">Повторение</span>
        <span>
          {reviews} {plural(reviews, ["показ", "показа", "показов"])}
        </span>
      </div>
      <div className="mt-1 flex flex-col">
        <PauseNotice word={w} folder={actions.folder} actions={actions} size="sheet" />
        {schedule.map((s) => (
          <div
            key={s.direction}
            className="grid h-10 grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-2 border-b border-rule"
          >
            <span className="font-mono text-[12px] tracking-[.04em]">{DIRECTION_LABEL[s.direction]}</span>
            <span className="truncate text-[14px]">{s.text}</span>
            <span className="meta">{s.stability ? `стаб. ${s.stability}` : "—"}</span>
          </div>
        ))}
      </div>

      <HistoryStrip history={[...history].reverse()} />

      {/* Actions (K1): ruled rows, an icon, the label and a muted caption; «Удалить» last, in red. */}
      <div className="mt-6 flex flex-col border-t border-rule">
        <SheetAction icon="reset" caption="начать заново" onClick={() => void actions.reset()}>
          Сбросить прогресс
        </SheetAction>
        {!w.muted && (
          <SheetAction icon="mute" caption="не повторять" onClick={() => void actions.setMuted(true)}>
            На паузу
          </SheetAction>
        )}
        <SheetAction icon="trash" danger onClick={() => void actions.remove()}>
          Удалить слово
        </SheetAction>
      </div>

      <p className="meta m-0 mt-4">
        Добавлено {formatDate(w.created_at)} · {SOURCE_LABELS[w.source]}
      </p>

      <TargetPickerSheet
        nested
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="Тема"
        subtitle={w.fr}
        options={folderOptions(data.folders)}
        selectedKey={folder ? folder.id : INBOX_KEY}
        onPick={(key) => void actions.changeFolder(key)}
      />
    </div>
  );
}

function SheetAction({
  icon,
  caption,
  danger,
  onClick,
  children,
}: {
  icon: IconName;
  caption?: string;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "flex h-[52px] items-center gap-3.5 border-b border-rule bg-transparent p-0 text-left text-[16px] hoverable:bg-hover active:bg-hover",
        danger ? "text-again" : "text-ink",
      )}
    >
      <Icon name={icon} size={20} strokeWidth={1.5} />
      <span className="min-w-0 flex-1">{children}</span>
      {caption && <span className="text-[13px] text-muted">{caption}</span>}
    </button>
  );
}

/**
 * «Определить» under the entry form's slang level: the level, verlan and part of speech from the
 * word's suggestion. A part of speech that changes shows as a caption (the form has no control for it).
 */
function DetectEntry({ word, draft, set }: { word: Word; draft: Draft; set: <K extends keyof Draft>(key: K, value: Draft[K]) => void }) {
  const next = posAbbr({ fr: draft.fr, pos: draft.pos, gender: draft.gender });
  const changed = next !== posAbbr(word);
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3">
      <AutoFillButton
        label="Определить уровень и часть речи"
        fill={(o) => detectEntry(draft, o)}
        onFill={(g) => {
          set("slang_level", g.slang_level);
          set("verlan", g.verlan);
          set("pos", g.pos);
          set("gender", g.gender);
        }}
      />
      {changed && next && (
        <span role="status" className="text-[13px] leading-5 text-muted">
          Часть речи: <span lang="fr" className="abbr text-ink">{next}</span>
        </span>
      )}
    </div>
  );
}

function SheetField({
  label,
  edited,
  editLabel,
  editing,
  onEdit,
  form,
  tools,
  children,
}: {
  label: string;
  /** Lit after its form saves (data-edited). */
  edited?: Exclude<Editing, null>;
  /** Icon buttons before the pencil («Проверь себя» on «Спряжение»). */
  tools?: ReactNode;
  editLabel: string;
  editing: boolean;
  onEdit: () => void;
  form: ReactNode;
  children: ReactNode;
}) {
  return (
    <div data-edited={edited} className="flex items-start gap-2 border-t border-rule py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="meta">{label}</span>
        {editing ? form : children}
      </div>
      {!editing && (
        <div className="-mt-1 -mr-3 flex shrink-0">
          {tools}
          <IconButton icon="pencil" label={editLabel} className="text-muted" onClick={onEdit} />
        </div>
      )}
    </div>
  );
}

/**
 * «Вариант» under «Русский»: the translation proposed for the French as it is now, with «Подставить».
 * The row shows only while there is something in it (a proposal, or a request on its way, a static
 * bar per MOTION-SPEC §3.1, never «думает…»), so an untouched form has no gap above «Уровень сленга».
 */
function ProposalLine({ proposal, onUse }: { proposal: TranslationProposal; onUse: (ru: string) => void }) {
  const { ru } = proposal;
  if (!proposal.enabled) return null;
  // Empty, the live region stays (zero height) so a proposal that arrives is still announced.
  if (!ru && !proposal.pending) return <div role="status" />;
  return (
    <div role="status" className="mt-2 flex min-h-8 items-center gap-3">
      {ru ? (
        <>
          <span className="meta shrink-0">Вариант</span>
          <span className="min-w-0 flex-1 text-[15px] leading-5 break-words">{ru}</span>
          <Button variant="secondary" size="sm" onClick={() => onUse(ru)}>
            Подставить
          </Button>
        </>
      ) : (
        proposal.pending && (
          <>
            <span className="meta shrink-0">Вариант</span>
            <SkeletonBar width="40%" height={6} className="delayed-in" />
          </>
        )
      )}
    </div>
  );
}

function HistoryStrip({ history }: { history: readonly ReviewLog[] }) {
  const label =
    history.length === 0
      ? "Ответов ещё не было"
      : `История ответов, от старых к новым: ${history.map((l) => RATING_NAMES[l.rating]).join(", ")}`;
  return (
    <div className="mt-4 flex items-center justify-between gap-3">
      <div role="img" aria-label={label} className="flex gap-1">
        {Array.from({ length: HISTORY_SLOTS }, (_, i) => {
          const log = history[i];
          return (
            <span
              key={i}
              className={cx(
                "box-border size-3.5 rounded-[2px]",
                !log && "border border-dashed border-rule",
                log?.rating === 1 && "bg-again",
                log?.rating === 2 && "border border-ink bg-surface",
                log && log.rating >= 3 && "bg-ink",
              )}
            />
          );
        })}
      </div>
      <div aria-hidden="true" className="flex items-center gap-2 text-[12px] leading-4 whitespace-nowrap text-muted">
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-[1px] bg-ink" />
          знаю
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="box-border size-2 rounded-[1px] border border-ink" />
          сложно
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-[1px] bg-again" />
          не знаю
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Desktop pane layout: the selected word as an index card (D-Library, D-Library-Edit, -Refresh)

const fieldInput =
  "box-border h-10 rounded-[4px] border border-boundary bg-surface px-3 text-ink outline-none placeholder:text-muted focus:border-2 focus:border-ink focus:px-[11px]";

/**
 * The pane follows the list cursor without blinking (MOTION-SPEC D3): the query keeps the previous
 * word's data until the next word is read, and only then does the content (with its per-word
 * editing state) switch over — in one frame, no animation.
 */
function PaneBody(props: Omit<WordDetailBodyProps, "variant">) {
  const { wordId, onClose, editSignal = 0 } = props;
  const detail = useWordDetail(wordId);
  const index = useCatalogIndex();
  useCloseWhenGone(detail, onClose);
  // Lives across words, so an `E` pressed while the next word is still being read is not lost.
  const handledEditRef = useRef(editSignal);
  const ready = useMemo((): DetailData | null => {
    if (!detail?.word || !index) return null;
    const number = index.numbers.get(detail.word.id);
    const at = index.at.get(detail.word.id);
    // A word the index has not caught up with yet (just added): the last complete entry stays.
    if (number === undefined || at === undefined) return null;
    // The word's own spelling from its read, should an edit land a frame before the index's.
    const word = detail.word;
    const neighbours = neighboursAt(index.alpha, at).map((n) => (n.current ? { ...n, fr: word.fr } : n));
    return { ...detail, number, neighbours };
  }, [detail, index]);
  const [held, setHeld] = useState(ready);
  if (ready && ready !== held) setHeld(ready);
  const data = detail?.word ? (ready ?? held) : null;
  if (!data) {
    return <div className="min-h-40" aria-busy="true" />;
  }
  return <PaneContent key={data.word.id} {...props} data={data} handledEditRef={handledEditRef} />;
}

function PaneContent({
  wordId,
  data,
  handledEditRef,
  onClose,
  onPrev,
  onNext,
  onOpenWord,
  onNewTheme,
  editSignal = 0,
  coarse = false,
  cardRef,
}: Omit<WordDetailBodyProps, "variant"> & { data: DetailData; handledEditRef: RefObject<number> }) {
  const id = useId();
  const keys = useFormatKeys();
  const word = data.word;
  const folders = data.folders;
  const defs = useFieldDefs();
  const editor = useWordEditor(word, folders, defs);
  const builtin = useBuiltinConjugation(word);
  const [fieldFocus, setFieldFocus] = useState<string | null>(null);
  const actions = useWordActions(word, folders, onClose);
  const showUndo = useUndoSnackbar();
  const saveExamples = useExampleSaver(word);
  const proposal = useTranslationProposal(editor.draft?.fr ?? "", editor.draft?.ru ?? "", editor.editing === "entry");
  const [themeMenu, setThemeMenu] = useState<HTMLElement | null>(null);
  const ruRef = useRef<HTMLInputElement>(null);
  const { ref: savedRef, lit: litSaved } = useSavedSpotlight();

  // `E` from the list: open the entry form with «Русский» focused (once the word on screen is the
  // cursor's word).
  useEffect(() => {
    if (word.id !== wordId || editSignal === handledEditRef.current) return;
    handledEditRef.current = editSignal;
    editor.start("entry");
    requestAnimationFrame(() => {
      const el = ruRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  });

  // Leaving the word with unsaved changes saves them («Сохранено · Отменить»).
  const latest = useRef({ word, editing: editor.editing, draft: editor.draft, dirty: editor.dirty, showUndo });
  useEffect(() => {
    latest.current = { word, editing: editor.editing, draft: editor.draft, dirty: editor.dirty, showUndo };
  });
  useEffect(
    () => () => {
      const { word: w, editing, draft, dirty, showUndo: show } = latest.current;
      if (!w || !editing || !draft || !dirty) return;
      // A half-filled conjugation is not saved on leaving (saving it would clear the word's own).
      if (editing === "conjugation" && conjDraftError(draft.conjugation)) return;
      const patch = patchFor(editing, draft);
      const undo = undoFor(w, patch);
      void updateWord(w.id, patch).then(
        () => show({ message: "Сохранено", undo: () => void updateWord(w.id, undo).catch(() => {}) }),
        () => {},
      );
    },
    [],
  );

  const w = data.word;
  const { folder } = actions;
  const { editing, draft, set } = editor;
  const abbr = posAbbr(w);
  // The grammar line: part of speech, then (fine pointer) the slang level; each explains itself.
  const showGrammar = !!abbr || !coarse;

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    const what = editor.editing;
    const undo = await editor.save();
    if (!undo) return;
    cardRef?.current?.focus({ preventScroll: true });
    if (what) litSaved(what);
  };
  // Esc discards the edit; «Вернуть» brings the draft back.
  const discard = () => {
    const what = editing;
    const kept = draft;
    const dirty = editor.dirty;
    editor.cancel();
    cardRef?.current?.focus({ preventScroll: true });
    if (!dirty || !what || !kept) return;
    showUndo({
      message: "Изменения не сохранены",
      actionLabel: "Вернуть",
      undo: () => editor.start(what, kept),
    });
  };
  const formKeys = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      discard();
    } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.stopPropagation();
      void submit();
    }
  };

  const formActions = (
    // Wraps in a narrow pane (1280 with «Ctrl+Enter») instead of running out of the card.
    <div className="mt-4 flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
      {editor.formError && (
        <p role="alert" className="m-0 mr-auto min-w-0 text-[12px] leading-4 text-warn">
          {editor.formError}
        </p>
      )}
      <button
        type="button"
        onClick={discard}
        aria-keyshortcuts="Escape"
        className="inline-flex h-9 items-center gap-2 rounded-[6px] bg-transparent px-2 text-[14px] font-medium text-ink hoverable:bg-hover-surface"
      >
        Отмена
        <Kbd aria-hidden="true">Esc</Kbd>
      </button>
      <button
        type="submit"
        aria-keyshortcuts="Meta+Enter Control+Enter"
        aria-busy={editor.saving || undefined}
        className="inline-flex h-9 items-center gap-2 rounded-[6px] border border-ink bg-ink px-4 text-[14px] font-medium text-on-ink"
      >
        {editor.dupConfirm ? "Сохранить всё равно" : "Сохранить"}
        <Kbd tone="ink" aria-hidden="true">
          {keys("Mod+Enter")}
        </Kbd>
      </button>
    </div>
  );

  const pencil = (label: string, onClick: () => void, shortcut?: string) => (
    <button
      type="button"
      aria-label={label}
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-keyshortcuts={shortcut}
      onClick={onClick}
      className={cx(
        "-mr-1 inline-flex shrink-0 items-center justify-center rounded-[4px] bg-transparent text-muted hoverable:bg-hover-surface hoverable:text-ink",
        coarse ? "size-11 -my-2" : "size-7",
      )}
    >
      <Icon name="pencil" size={16} />
    </button>
  );

  const note = (
    <div data-edited="note" className="flex items-start gap-2">
      <p className={cx("m-0 min-w-0 flex-1 text-[14px] leading-5 whitespace-pre-line", !w.note && "text-muted")}>{w.note || "Нет заметки"}</p>
      {!editing && pencil("Изменить заметку", () => editor.start("note"))}
    </div>
  );
  const origin = (
    <div data-edited="origin" className="flex items-start gap-2">
      <p className="m-0 min-w-0 flex-1 text-[14px] leading-5">
        <span className="meta mr-1.5">Откуда</span>
        {w.origin}
      </p>
      {!editing && pencil("Изменить происхождение", () => editor.start("origin"))}
    </div>
  );
  const example = (
    <div data-edited="example" className="flex items-start gap-2">
      <ExampleList
        size="pane"
        card={w}
        examples={toDrafts(wordExamples(w))}
        onChange={(next, change) => void saveExamples(next, change)}
        aside={<LifeExamplesLink fr={w.fr} />}
        className="min-w-0 flex-1"
      />
      {!editing && pencil("Изменить пример", () => editor.start("example"))}
    </div>
  );

  const shownFields = fieldRows(w, defs);
  const editFields = (focus: string | null, rows?: FieldRow[]) => {
    setFieldFocus(focus);
    editor.startFields(rows);
  };
  const fields =
    editing === "fields" && draft ? (
      <form onSubmit={(e) => void submit(e)} onKeyDown={formKeys} aria-label="Изменить свои поля" className="flex flex-col">
        <span className="text-[12px] leading-4 text-muted">Свои поля</span>
        <FieldsForm size="pane" rows={draft.fields} focusKey={fieldFocus} onChange={(rows) => set("fields", rows)} onFocusKey={setFieldFocus} />
        {formActions}
      </form>
    ) : (
      <div data-edited="fields" className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[12px] leading-4 text-muted">Свои поля</span>
          {/* While another part is edited: what is filled, read-only (like the pencils, the rest waits). */}
          <FieldsView
            size="pane"
            rows={editing ? shownFields.filter((f) => f.value) : shownFields}
            onEdit={editing ? undefined : editFields}
            extras={addableKinds(w, builtin, editor, defs)}
          />
        </div>
        {!editing && shownFields.length > 0 && pencil("Изменить свои поля", () => editFields(null))}
      </div>
    );

  return (
    <div ref={savedRef} data-word-detail="" className="flex flex-col">
      {/* Theme button + previous / next */}
      <div className="flex h-8 items-center justify-between gap-2">
        <button
          type="button"
          aria-label={`Тема: ${folder?.name ?? "Входящие"}. Переместить`}
          aria-haspopup="menu"
          aria-expanded={!!themeMenu}
          aria-keyshortcuts="M"
          onClick={(e) => setThemeMenu(themeMenu ? null : e.currentTarget)}
          className={cx(
            "inline-flex min-w-0 items-center gap-2 rounded-[4px] border border-boundary bg-transparent px-2.5 text-[13px] text-ink hoverable:bg-hover",
            coarse ? "h-11" : "h-8",
          )}
        >
          <ThemeSquare color={folder?.color ?? null} />
          <span className="truncate">{folder?.name ?? "Входящие"}</span>
          <Icon name="chevron" size={14} />
        </button>
        <div className="flex items-center gap-1">
          <NavButton icon="chevron-up" label="Предыдущее слово" shortcut="K" disabledLabel="Это первое слово" onClick={onPrev} coarse={coarse} />
          <NavButton icon="chevron" label="Следующее слово" shortcut="J" disabledLabel="Это последнее слово" onClick={onNext} coarse={coarse} />
        </div>
      </div>

      {/* The index card */}
      <article
        ref={cardRef as RefObject<HTMLElement>}
        tabIndex={-1}
        aria-labelledby={`${id}-head`}
        className="mt-4 flex flex-col rounded-[6px] border border-rule bg-surface focus-visible:outline-offset-2"
      >
        <div data-edited="entry" className="flex h-10 items-center justify-between px-5">
          <span className="font-mono text-[11px] text-muted tabular-nums">FR · {cardNumber(data.number ?? 1)}</span>
          <SlangMeter level={w.slang_level} verlan={false} hints hintAlign="end" />
        </div>
        <div aria-hidden="true" className="h-0.5 bg-red" />
        <div className="flex flex-col p-5">
          {editing === "entry" && draft ? (
            <form onSubmit={(e) => void submit(e)} onKeyDown={formKeys} aria-label="Изменить слово" className="flex flex-col">
              <h2 id={`${id}-head`} className="sr-only" aria-live="polite">
                {w.fr}
              </h2>
              <label htmlFor={`${id}-fr`} className="text-[12px] leading-4 text-muted">
                Французский
              </label>
              <input
                id={`${id}-fr`}
                lang="fr"
                value={draft.fr}
                onChange={(e) => set("fr", e.target.value)}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                className={cx(fieldInput, "mt-1.5 font-serif text-[20px]")}
              />
              <label htmlFor={`${id}-ru`} className="mt-4 text-[12px] leading-4 text-muted">
                Русский
              </label>
              <input
                ref={ruRef}
                id={`${id}-ru`}
                value={draft.ru}
                onChange={(e) => set("ru", e.target.value)}
                autoComplete="off"
                className={cx(fieldInput, "mt-1.5 text-[16px]")}
              />
              <ProposalLine proposal={proposal} onUse={(ru) => set("ru", ru)} />
              <span id={`${id}-slang`} className="mt-4 text-[12px] leading-4 text-muted">
                Уровень сленга
              </span>
              <div className="mt-1 flex flex-wrap items-center gap-x-4">
                <TextOptions
                  options={SLANG_OPTIONS}
                  value={draft.slang_level}
                  onChange={(v) => set("slang_level", v)}
                  ariaLabelledby={`${id}-slang`}
                  itemClassName="font-serif italic text-[14px]"
                />
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={draft.verlan}
                  onClick={() => set("verlan", !draft.verlan)}
                  className="inline-flex h-8 items-center gap-2 bg-transparent px-1 text-ink"
                >
                  <CheckMark checked={draft.verlan} />
                  <span lang="fr" className="font-serif text-[14px] text-muted italic">
                    verl.
                  </span>
                </button>
              </div>
              <DetectEntry word={w} draft={draft} set={set} />
              {formActions}
            </form>
          ) : (
            <>
              <div data-edited="entry" className="flex items-start gap-2">
                <h2
                  id={`${id}-head`}
                  aria-live="polite"
                  lang="fr"
                  className="m-0 min-w-0 flex-1 font-serif text-[36px] leading-10 font-medium tracking-[-0.015em] break-words"
                >
                  {w.fr}
                </h2>
                <span className="mt-1.5">{pencil("Изменить слово и перевод", () => editor.start("entry"), "E")}</span>
              </div>
              {showGrammar && (
                <p data-edited="entry" className="m-0 mt-1 flex flex-wrap items-baseline gap-x-1 text-[15px] leading-5">
                  {abbr && <AbbrHint abbr={abbr} />}
                  {!coarse && (
                    <>
                      {abbr && (
                        <span aria-hidden="true" className="abbr">
                          ·
                        </span>
                      )}
                      <SlangHints word={w} />
                    </>
                  )}
                </p>
              )}
              <p data-edited="entry" className="m-0 mt-2 text-[18px] leading-6 font-medium">
                {w.ru}
              </p>
            </>
          )}

          {editing === "entry" ? (
            <div className="mt-5 flex flex-col gap-3 border-t border-rule pt-4">
              {w.note && <p className="m-0 text-[14px] leading-5 whitespace-pre-line">{w.note}</p>}
              {w.origin && <p className="m-0 text-[14px] leading-5 text-muted">{w.origin}</p>}
              {wordExamples(w).map((e, i) => (
                <div key={i} className="flex flex-col">
                  <span lang="fr" className="font-serif text-[16px] leading-6 italic">
                    {e.fr}
                  </span>
                  {e.ru && <span className="text-[13px] leading-5 text-muted">— {e.ru}</span>}
                </div>
              ))}
              {shownFields.some((f) => f.value) && <FieldsView size="pane" rows={shownFields.filter((f) => f.value)} />}
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-3">
              {editing === "note" && draft ? (
                <form onSubmit={(e) => void submit(e)} onKeyDown={formKeys} aria-label="Изменить заметку" className="flex flex-col">
                  <textarea
                    aria-label="Заметка"
                    value={draft.note}
                    onChange={(e) => set("note", e.target.value)}
                    rows={3}
                    autoFocus
                    className={cx(fieldInput, "h-auto resize-none py-2 text-[14px] leading-5 focus:py-[7px]")}
                  />
                  <AutoFillButton className="mt-1" fill={(o) => autofillNote(draft, o)} onFill={(v) => set("note", v)} />
                  {formActions}
                </form>
              ) : (
                note
              )}
              {editing === "origin" && draft ? (
                <form onSubmit={(e) => void submit(e)} onKeyDown={formKeys} aria-label="Изменить происхождение" className="flex flex-col">
                  <input
                    aria-label="Происхождение"
                    value={draft.origin}
                    onChange={(e) => set("origin", e.target.value)}
                    maxLength={ORIGIN_MAX}
                    placeholder="Например: верлан от lourd"
                    autoFocus
                    className={cx(fieldInput, "text-[14px]")}
                  />
                  <AutoFillButton className="mt-1" fill={(o) => autofillOrigin(w, o)} onFill={(v) => set("origin", v)} />
                  {formActions}
                </form>
              ) : (
                w.origin && origin
              )}
              {conjugationShown(w, builtin, editing) &&
                (editing === "conjugation" && draft ? (
                  <form onSubmit={(e) => void submit(e)} onKeyDown={formKeys} aria-label="Изменить спряжение" className="flex flex-col">
                    <ConjugationForm draft={draft.conjugation} onChange={(next) => set("conjugation", next)} word={w} onReset={editor.cancel} autofill={builtin === null} size="pane" />
                    {formActions}
                  </form>
                ) : (
                  <div data-edited="conjugation">
                    <ConjugationShown
                      word={w}
                      builtin={builtin}
                      size="pane"
                      onEdit={!editing && pencil("Изменить спряжение", () => editor.start("conjugation", withConjugationDraft(draftOf(w, defs), cleanConjugation(w.conjugation) ?? builtin)))}
                    />
                  </div>
                ))}
              {editing === "example" && draft ? (
                <form onSubmit={(e) => void submit(e)} onKeyDown={formKeys} aria-label="Изменить пример" className="flex flex-col">
                  <ExampleList
                    editable
                    size="pane"
                    card={w}
                    examples={draft.examples.length ? draft.examples : [{ fr: "", ru: "" }]}
                    onChange={(next) => set("examples", next)}
                    frInputClass={cx(fieldInput, "font-serif text-[16px] italic")}
                    ruInputClass={cx(fieldInput, "mt-2 text-[14px]")}
                  />
                  {formActions}
                </form>
              ) : (
                example
              )}
              <div className="border-t border-rule pt-3">{fields}</div>
            </div>
          )}

          {coarse && (
            <p className="m-0 mt-5 flex gap-4 border-t border-rule pt-4 text-[13px] leading-5 text-muted">
              <span>1. {folder?.name ?? "Входящие"}</span>
              <span className="inline-flex items-baseline gap-1">
                2. <SlangHints word={w} />
              </span>
            </p>
          )}
        </div>
      </article>

      {/* Повторение */}
      <section aria-labelledby={`${id}-rep`} className="mt-5">
        <div className="flex items-baseline justify-between border-b border-ink pb-1.5">
          <h3 id={`${id}-rep`} className="m-0 text-[13px] leading-5 font-medium">
            Повторение
          </h3>
          <span className="text-[12px] leading-4 text-muted tabular-nums">
            {STATUS_LABELS[data.status]} · {data.reviews} {plural(data.reviews, ["показ", "показа", "показов"])}
          </span>
        </div>
        <PauseNotice word={w} folder={actions.folder} actions={actions} size="pane" />
        {data.schedule.map((s) => (
          <div key={s.direction} className="flex h-9 items-center gap-4 border-b border-rule">
            <span className="w-14 shrink-0 font-mono text-[12px]">{DIRECTION_LABEL[s.direction]}</span>
            <span className="min-w-0 flex-1 truncate text-[13px] tabular-nums">{s.full}</span>
            {s.stability && <span className="shrink-0 font-mono text-[11px] text-muted">стаб. {s.stability}</span>}
          </div>
        ))}
      </section>

      {/* История */}
      <section aria-labelledby={`${id}-hist`} className="mt-5">
        <h3 id={`${id}-hist`} className="m-0 border-b border-ink pb-1.5 text-[13px] leading-5 font-medium">
          История
        </h3>
        {data.history.length === 0 ? (
          <p className="m-0 pt-2 text-[13px] leading-5 text-muted">Ответов ещё не было.</p>
        ) : (
          <ol className="m-0 list-none p-0">
            {data.history.slice(0, PANE_HISTORY).map((l) => (
              <li key={l.id} className="flex h-6 items-center gap-4 border-b border-rule">
                <span className="w-10 shrink-0 font-mono text-[12px] tabular-nums">{shortDate(l.review)}</span>
                <span className="w-14 shrink-0 font-mono text-[11px] text-muted">{DIRECTION_LABEL[l.direction]}</span>
                <span className="text-[13px]">{RATING_NAMES[l.rating]}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Рядом в алфавите */}
      {data.neighbours && data.neighbours.length > 1 && (
        <p className="m-0 mt-4 flex flex-wrap items-baseline gap-x-1.5 text-[12px] leading-6 text-muted">
          <span className="mr-1">Рядом в алфавите:</span>
          {data.neighbours.map((n, i) => (
            <span key={n.id} className="inline-flex items-baseline gap-1.5">
              {i > 0 && <span aria-hidden="true">·</span>}
              {n.current ? (
                <span lang="fr" aria-current="true" className="font-serif text-[14px] font-medium text-ink">
                  {n.fr}
                </span>
              ) : (
                <button
                  type="button"
                  lang="fr"
                  onClick={() => onOpenWord?.(n.id)}
                  className="bg-transparent p-0 font-serif text-[14px] text-ink underline decoration-1 underline-offset-4 hoverable:text-red"
                >
                  {n.fr}
                </button>
              )}
            </span>
          ))}
        </p>
      )}

      {/* Actions */}
      <div className="mt-5 flex items-center gap-5">
        <button type="button" onClick={() => void actions.reset()} className={paneAction(coarse)}>
          Сбросить прогресс
        </button>
        {!w.muted && (
          <button type="button" onClick={() => void actions.setMuted(true)} className={paneAction(coarse)}>
            <Icon name="mute" size={14} />
            На паузу
          </button>
        )}
        <button type="button" onClick={() => void actions.remove()} className={paneAction(coarse)}>
          <Icon name="trash" size={14} />
          Удалить слово
        </button>
      </div>

      <p className="m-0 mt-6 font-mono text-[11px] text-muted tabular-nums">
        Добавлено {formatDate(w.created_at)} · {SOURCE_LABELS[w.source]}
      </p>

      <MoveMenu
        open={!!themeMenu}
        anchor={themeMenu ? { element: themeMenu } : null}
        onClose={() => setThemeMenu(null)}
        folders={data.folders}
        currentKey={folder ? folder.id : INBOX_KEY}
        onPick={(key) => void actions.changeFolder(key)}
        onNewTheme={onNewTheme ? () => onNewTheme([w.id]) : undefined}
      />
    </div>
  );
}

/** «arg.» and «verl.» as hints (the slang level without the meter). */
function SlangHints({ word }: { word: Pick<Word, "slang_level" | "verlan"> }) {
  return (
    <>
      <AbbrHint abbr={SLANG_LABELS[word.slang_level]} lang={word.slang_level === 0 ? "ru" : "fr"} />
      {word.verlan && (
        <>
          <span aria-hidden="true" className="abbr">
            ·
          </span>
          <AbbrHint abbr="verl." />
        </>
      )}
    </>
  );
}

const paneAction = (coarse: boolean) =>
  cx(
    "-mx-1 inline-flex items-center gap-2 rounded-[4px] bg-transparent px-1 text-[13px] font-medium text-ink hoverable:bg-hover",
    coarse ? "h-11" : "h-8",
  );

function shortDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
}

function NavButton({
  icon,
  label,
  shortcut,
  disabledLabel,
  onClick,
  coarse,
}: {
  icon: "chevron-up" | "chevron";
  label: string;
  shortcut: string;
  disabledLabel: string;
  onClick?: () => void;
  coarse: boolean;
}) {
  const disabled = !onClick;
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={disabled || undefined}
      aria-keyshortcuts={shortcut}
      title={disabled ? disabledLabel : `${label} (${shortcut})`}
      onClick={() => onClick?.()}
      className={cx(
        "inline-flex items-center justify-center rounded-[4px] bg-transparent",
        coarse ? "size-11" : "size-8",
        disabled ? "cursor-default text-boundary" : "text-ink hoverable:bg-hover",
      )}
    >
      <Icon name={icon} size={18} />
    </button>
  );
}

// ---------------------------------------------------------------------------------------------
// «Свои поля» (both layouts): shared fields always listed, empty ones as a muted «Добавить»; the
// word's one-off fields after them; «+ Поле» adds a one-off field. Edited as one block, saved as
// one `custom_fields` patch.

type FieldsSize = "sheet" | "pane";

/** Opens the fields editor, focusing `focus` (a row's key); `rows` replaces the word's rows («+ Поле»). */
type EditFields = (focus: string | null, rows?: FieldRow[]) => void;

/** What «+ Поле» offers besides «Своё поле»: «Происхождение» while empty, «Спряжение» for a verb without one. */
function addableKinds(
  w: Word,
  builtin: Conjugation | null | undefined,
  editor: { start: (what: Exclude<Editing, null>, from?: Draft) => void },
  defs: readonly FieldDef[],
): FieldKind[] {
  const out: FieldKind[] = [];
  if (!cleanOrigin(w.origin)) out.push({ label: "Происхождение", caption: "откуда слово, верлан, заимствование", onSelect: () => editor.start("origin") });
  if (offersConjugation(w, builtin)) {
    out.push({
      label: "Спряжение",
      caption: "4 времени, по 6 форм",
      onSelect: () => editor.start("conjugation", withConjugationDraft(draftOf(w, defs), null)),
    });
  }
  return out;
}

/** The fields as label / value rows. Without `onEdit` (the desktop card while its entry is edited) only filled ones, read-only. */
function FieldsView({ size, rows, onEdit, extras = [] }: { size: FieldsSize; rows: readonly FieldRow[]; onEdit?: EditFields; extras?: readonly FieldKind[] }) {
  const pane = size === "pane";
  return (
    <div className="flex flex-col">
      {rows.length > 0 && (
        <dl className="m-0 flex flex-col">
          {rows.map((r) => (
            <div
              key={r.key}
              data-field={r.label}
              className={cx("grid gap-x-3 py-1", pane ? "grid-cols-[minmax(0,100px)_minmax(0,1fr)]" : "grid-cols-[minmax(0,108px)_minmax(0,1fr)]")}
            >
              <dt className={cx("break-words text-muted", pane ? "text-[13px] leading-5" : "text-[13px] leading-[22px]")}>{r.label}</dt>
              <dd className="m-0 min-w-0">
                {r.value ? (
                  <span className={cx("break-words", pane ? "text-[14px] leading-5" : "text-[15px] leading-[22px]")}>{r.value}</span>
                ) : (
                  onEdit && (
                    <button
                      type="button"
                      aria-label={`Добавить: ${r.label}`}
                      onClick={() => onEdit(r.key)}
                      className={cx(
                        "relative bg-transparent p-0 text-left text-muted underline decoration-rule decoration-1 underline-offset-4 before:absolute before:-inset-y-2.5 before:inset-x-0 hoverable:text-ink",
                        pane ? "text-[14px] leading-5" : "text-[15px] leading-[22px]",
                      )}
                    >
                      Добавить
                    </button>
                  )
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {onEdit && (canAddField(rows) || extras.length > 0) && (
        <AddFieldButton
          extras={extras}
          onCustom={
            canAddField(rows)
              ? () => {
                  const row = newFieldRow();
                  onEdit(row.key, [...rows, row]);
                }
              : null
          }
        />
      )}
    </div>
  );
}

/**
 * The fields editor: one input per field (placeholder = the shared field's hint); one-off fields get
 * × «Убрать поле», added ones a name input too. `focusKey`: the row whose input takes focus.
 */
function FieldsForm({
  size,
  rows,
  focusKey,
  onChange,
  onFocusKey,
  trailing,
}: {
  size: FieldsSize;
  rows: FieldRow[];
  focusKey: string | null;
  onChange: (rows: FieldRow[]) => void;
  onFocusKey: (key: string) => void;
  /** At the right end of the «+ Поле» row (the sheet's ✕ / ✓). */
  trailing?: ReactNode;
}) {
  const id = useId();
  const pane = size === "pane";
  const input = pane
    ? cx(fieldInput, "min-w-0 text-[14px]")
    : "h-11 min-w-0 rounded-chip border border-rule bg-surface px-3 text-[15px] text-ink outline-none placeholder:text-muted focus:border-ink pointer-coarse:text-[16px]";
  const update = (key: string, patch: Partial<FieldRow>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: string) => onChange(rows.filter((r) => r.key !== key));
  const removeButton = (r: FieldRow) => (
    <button
      type="button"
      onClick={() => remove(r.key)}
      aria-label={r.label.trim() ? `Убрать поле «${r.label.trim()}»` : "Убрать новое поле"}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-[4px] bg-transparent text-muted hoverable:bg-hover-surface hoverable:text-ink",
        pane ? "size-8" : "-mr-3 size-11",
      )}
    >
      <Icon name="close" size={16} />
    </button>
  );
  return (
    <div className={cx("flex flex-col gap-3", pane ? "mt-1.5" : "mt-1")}>
      {rows.map((r, i) => {
        const valueId = `${id}-v${i}`;
        return r.added ? (
          <div key={r.key} role="group" aria-label={r.label.trim() || "Новое поле"} className="flex items-center gap-2">
            <input
              aria-label="Название поля"
              value={r.label}
              onChange={(e) => update(r.key, { label: e.target.value })}
              maxLength={FIELD_LABEL_MAX}
              placeholder="Название"
              autoComplete="off"
              autoFocus={r.key === focusKey}
              className={cx(input, "w-[38%] shrink-0")}
            />
            <input
              aria-label="Значение поля"
              value={r.value}
              onChange={(e) => update(r.key, { value: e.target.value })}
              maxLength={FIELD_VALUE_MAX}
              placeholder="Значение"
              autoComplete="off"
              className={cx(input, "flex-1")}
            />
            {removeButton(r)}
          </div>
        ) : (
          <div key={r.key} className="flex flex-col">
            <label htmlFor={valueId} className={cx("text-muted", pane ? "text-[12px] leading-4" : "text-[13px] leading-5")}>
              {r.label}
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                id={valueId}
                value={r.value}
                onChange={(e) => update(r.key, { value: e.target.value })}
                maxLength={FIELD_VALUE_MAX}
                placeholder={r.hint ?? "Значение"}
                autoComplete="off"
                autoFocus={r.key === focusKey}
                className={cx(input, "flex-1")}
              />
              {!r.shared && removeButton(r)}
            </div>
          </div>
        );
      })}
      {(canAddField(rows) || trailing) && (
        <div className="flex items-center gap-3">
          {canAddField(rows) && (
            <AddFieldButton
              onClick={() => {
                const row = newFieldRow();
                onFocusKey(row.key);
                onChange([...rows, row]);
              }}
            />
          )}
          {trailing && <span className="mt-1 ml-auto">{trailing}</span>}
        </div>
      )}
    </div>
  );
}

/** H4: ✕ (muted) and ✓ (an ink disc) for the field being edited on phones; «Сохранить всё равно» spelled out. */
function EditPair({ saving, dupConfirm, onCancel, className }: { saving: boolean; dupConfirm: boolean; onCancel: () => void; className?: string }) {
  return (
    <div className={cx("flex shrink-0 items-center justify-end gap-1", className)}>
      <button
        type="button"
        aria-label="Отмена"
        title="Отмена"
        onClick={onCancel}
        className="press-sm inline-flex size-10 items-center justify-center rounded-full bg-transparent text-muted active:bg-surface-2 hoverable:bg-hover-surface hoverable:text-ink"
      >
        <Icon name="close" size={20} />
      </button>
      {dupConfirm ? (
        <button type="submit" disabled={saving} className="press-sm h-10 rounded-full bg-ink px-4 text-[14px] font-medium text-on-ink disabled:opacity-60">
          Сохранить всё равно
        </button>
      ) : (
        <button
          type="submit"
          aria-label={saving ? "Сохраняем…" : "Сохранить"}
          title="Сохранить"
          aria-busy={saving || undefined}
          disabled={saving}
          className="press-sm inline-flex size-10 items-center justify-center rounded-full bg-ink text-on-ink disabled:opacity-60"
        >
          <Icon name={saving ? "refresh" : "check"} size={20} strokeWidth={2} className={cx(saving && "animate-spin")} />
        </button>
      )}
    </div>
  );
}
