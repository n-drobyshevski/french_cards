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
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { Button, IconButton } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Collapse } from "@/components/ui/Collapse";
import { FoldRow, foldSummary } from "@/components/ui/FoldRow";
import { Icon, type IconName } from "@/components/ui/Icons";
import { Kbd } from "@/components/ui/Kbd";
import { Segmented } from "@/components/ui/Segmented";
import { Sheet, SheetCloseButton, SheetHeader } from "@/components/ui/Sheet";
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
import { conjDraftError, draftOf, isDirty, levelChoiceOf, patchFor, undoFor, withConjugationDraft, type Draft, type Editing, type LevelChoice } from "./word-editor";
import { CEFR_LEVELS, type LevelInfo } from "@/lib/core/level";
import { RU_FR_UNLOCK_DAYS } from "@/lib/core/plan";
import { useLevelData } from "@/lib/use-level-data";
import { useLayoutClass } from "@/lib/use-media";
import { getStudyPlan } from "@/lib/user-prefs";
import { LEVEL_SOURCE_CAPTIONS, levelAria, levelHint, levelText } from "./level";
import { LevelMark } from "./LevelMark";
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
/** The phone sheet's stamps ink in once it has settled (--dur-sheet). */
const STAMPS_AFTER_MS = 320;

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
  /** The phone sheet's mono line: «через 4 д», «пора повторить», «новая карточка» (later rows «новая»). */
  brief: string;
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
    const [states, history, reviews, folders, plan] = await Promise.all([
      getWordStates(wordId),
      getWordHistory(wordId, HISTORY_SLOTS),
      db.review_log.where("word_id").equals(wordId).filter((l) => l.deleted_at === null).count(),
      listFolders(),
      getStudyPlan(),
    ]);
    // «После 3 дней узнавания»: a new RU→FR card waits until FR→RU has held for 3 days.
    const frRu = states.find((s) => s.direction === "fr_ru");
    const ruLocked = plan.ru_fr === "after" && !(frRu && frRu.state === 2 && frRu.stability >= RU_FR_UNLOCK_DAYS);
    const schedule = states.map((s, i) => {
      const due = formatDueIn(s, now);
      if (s.state === 0 && s.direction === "ru_fr" && ruLocked) {
        const waits = `откроется после ${RU_FR_UNLOCK_DAYS} дней узнавания`;
        return { direction: s.direction, text: waits, full: waits, brief: `после ${RU_FR_UNLOCK_DAYS} дней узнавания`, stability: formatStability(s) };
      }
      const text = s.state === 0 ? "новая карточка" : due === "сейчас" ? "пора повторить" : i === 0 ? `следующий показ ${due}` : due;
      const full = s.state === 0 ? "ещё не показывалось" : due === "сейчас" ? "к повторению" : `следующий показ ${due}`;
      const brief = s.state === 0 ? (i === 0 ? "новая карточка" : "новая") : due === "сейчас" ? "пора повторить" : due;
      return { direction: s.direction, text, full, brief, stability: formatStability(s) };
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
  const levels = useLevelData();
  const proposal = useTranslationProposal(editor.draft?.fr ?? "", editor.draft?.ru ?? "", editor.editing === "entry");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [fieldFocus, setFieldFocus] = useState<string | null>(null);
  // Phones (L-Word-B): the «⋯» actions sheet, the «Ещё» fold and the ≈B1 source row.
  const lean = useLayoutClass() === "compact";
  const [menuOpen, setMenuOpen] = useState(false);
  const [foldOpen, setFoldOpen] = useState(false);
  const [levelOpen, setLevelOpen] = useState(false);
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
  const level = levels.level(w);
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

  // The forms, the same in both layouts.
  const entryForm = draft && (
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
        Сленг
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
      <LevelEditRow id={`${id}-cefr`} word={w} draft={draft} set={set} size="sheet" />
      {errorLine}
    </form>
  );
  const noteForm = draft && (
    <form onSubmit={save} className="flex flex-col" aria-label="Изменить заметку">
      <div className="mt-1 flex flex-col rounded-chip border border-rule bg-surface focus-within:border-ink">
        <textarea
          aria-label="Заметка"
          value={draft.note}
          onChange={(e) => set("note", e.target.value)}
          rows={3}
          autoFocus={lean}
          className="resize-none rounded-chip bg-transparent px-3 pt-2.5 pb-0.5 text-[15px] leading-[22px] text-ink outline-none! pointer-coarse:text-[16px]"
        />
        {editPair("px-1 pb-1")}
      </div>
      <AutoFillButton className="mt-1" fill={(o) => autofillNote(draft, o)} onFill={(v) => set("note", v)} />
      {errorLine}
    </form>
  );
  const originForm = draft && (
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
  );
  const conjForm = draft && (
    <form onSubmit={save} className="flex flex-col" aria-label="Изменить спряжение">
      <ConjugationForm draft={draft.conjugation} onChange={(next) => set("conjugation", next)} word={w} onReset={editor.cancel} autofill={builtin === null} size="sheet" />
      {errorLine}
      {editActions}
    </form>
  );
  const exampleForm = draft && (
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
  );
  const fieldsForm = draft && (
    <form onSubmit={save} className="flex flex-col" aria-label="Изменить свои поля">
      <FieldsForm size="sheet" rows={draft.fields} focusKey={fieldFocus} onChange={(rows) => set("fields", rows)} onFocusKey={setFieldFocus} trailing={editPair()} />
      {errorLine}
    </form>
  );
  const themeChip = (
    <Chip dropdown onClick={() => setPickerOpen(true)} aria-label={`Тема: ${folder?.name ?? "Входящие"}, изменить`}>
      {folder && <span aria-hidden="true" className="h-3 w-[3px]" style={{ background: folder.color }} />}
      {folder?.name ?? "Входящие"}
    </Chip>
  );
  const picker = (
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
  );

  if (lean) {
    // L-Word-B «Словарная статья»: the entry reads like a print dictionary (no field labels, no
    // pencils: the text is the edit button); the rest folds under one «Ещё»; rare and destructive
    // actions sit behind «⋯»; the answers and the next show are the card's stamps at the bottom.
    const examples = toDrafts(wordExamples(w));
    const filled = shownFields.filter((f) => f.value);
    const conjOn = conjugationShown(w, builtin, editing);
    const originOn = !!w.origin || editing === "origin";
    const fieldsOn = filled.length > 0 || editing === "fields";
    const noLevel = !level && levels.ready;
    // «+ Поле» lists what is empty: the note, origin, a verb's conjugation, the shared fields.
    const kinds: FieldKind[] = [
      ...(w.note ? [] : [{ label: "Заметка", caption: "нюанс, синонимы, когда так говорят", onSelect: () => editor.start("note") }]),
      ...fieldKinds,
      ...shownFields
        .filter((f) => f.shared && !f.value)
        .map((f) => ({ label: f.label, caption: f.hint ?? "общее поле", onSelect: () => editFields(f.key) })),
    ];
    const summary =
      foldSummary([
        conjOn && "спряжение",
        originOn && "происхождение",
        examples.length > 1 && (examples.length > 2 ? "ещё примеры" : "второй пример"),
        fieldsOn && "свои поля",
        noLevel && "уровень языка",
      ]) || (w.note ? "добавить поле" : "добавить заметку, поле");
    const actionNames = `сбросить прогресс, ${w.muted ? "вернуть в повторения" : "на паузу"}, удалить`;

    return (
      <div ref={savedRef} data-word-detail="" className={cx("flex flex-1 flex-col px-4", reveal)}>
        {/* Card header: theme chip, «⋯», close, above the red index-card rule */}
        <div className="flex h-11 shrink-0 items-center">
          {themeChip}
          <span className="flex-1" />
          <IconButton icon="more" label={`Действия со словом: ${actionNames}`} aria-haspopup="dialog" onClick={() => setMenuOpen(true)} />
          <SheetCloseButton className="-mr-3" />
        </div>
        <div aria-hidden="true" className="h-0.5 shrink-0 bg-red" />

        {/* Entry: headword, grammar line (the level printed once), translation */}
        {editing === "entry" ? (
          entryForm
        ) : (
          <>
            {/* The heading is named by the headword, not by its edit button. */}
            <h2 data-edited="entry" aria-label={w.fr} className="m-0 mt-5">
              <button
                type="button"
                onClick={() => editor.start("entry")}
                aria-label={`Изменить слово и перевод: ${w.fr}`}
                className="block w-full bg-transparent py-1 text-left text-ink"
              >
                <span lang="fr" className="block font-serif text-prompt-fit leading-[1.05] font-medium tracking-[-0.02em] break-words">
                  {w.fr}
                </span>
              </button>
            </h2>
            <div data-edited="entry" className="mt-1.5 flex min-h-5 flex-wrap items-center gap-x-2">
              {abbr && (
                <>
                  <AbbrHint abbr={abbr} className="text-[15px] leading-5" />
                  <span aria-hidden="true" className="abbr">
                    ·
                  </span>
                </>
              )}
              <SlangMeter level={w.slang_level} verlan={w.verlan} hints />
              {level && (
                <>
                  <span aria-hidden="true" className="abbr">
                    ·
                  </span>
                  <button
                    type="button"
                    aria-expanded={levelOpen}
                    aria-controls={`${id}-level`}
                    aria-label={`${levelAria(level)}${level.source === "flelex" || level.source === "freq" ? `, ${LEVEL_SOURCE_CAPTIONS[level.source]}` : ""}. ${levelOpen ? "Скрыть" : "Показать"} источник`}
                    onClick={() => setLevelOpen(!levelOpen)}
                    className="-my-3 h-11 bg-transparent px-1 font-mono text-[12px] leading-4 tracking-[.04em] text-ink underline decoration-boundary decoration-dotted decoration-1 underline-offset-4"
                  >
                    {levelText(level)}
                  </button>
                </>
              )}
            </div>
            {level && (
              <Collapse open={levelOpen}>
                <p id={`${id}-level`} className="m-0 pt-1.5 pb-1 text-[13px] leading-[18px] text-muted">
                  {levelNote(level)}{" "}
                  <button
                    type="button"
                    aria-label="Изменить уровень языка"
                    onClick={() => editor.start("entry")}
                    // 18px line + 13px above and below: a 44px hit area.
                    className="relative bg-transparent p-0 text-[13px] leading-[18px] font-medium text-ink underline decoration-1 underline-offset-[3px] before:absolute before:-inset-y-[13px] before:inset-x-0"
                  >
                    Изменить
                  </button>
                </p>
              </Collapse>
            )}
            <p data-edited="entry" className="m-0 mt-2 text-[20px] leading-7">
              {w.ru}
            </p>
          </>
        )}

        {/* Note: plain text, the edit button; nothing when empty («+ Поле» under «Ещё» offers it) */}
        {editing === "note" ? (
          <div className="mt-4">{noteForm}</div>
        ) : (
          w.note && (
            <button
              type="button"
              data-edited="note"
              onClick={() => editor.start("note")}
              aria-label={`Изменить заметку: ${w.note}`}
              className="mt-2 bg-transparent py-3 text-left text-[15px] leading-[22px] whitespace-pre-line text-ink"
            >
              {w.note}
            </button>
          )
        )}

        {/* One example, the headword in it inked; the others under «Ещё» */}
        <div data-edited="example" className={w.note || editing === "note" ? "mt-1.5" : "mt-4"}>
          {editing === "example" ? (
            exampleForm
          ) : (
            <ExampleList
              card={w}
              examples={examples}
              to={1}
              size="entry"
              mark={w.fr}
              emptyText=""
              addable={examples.length === 0}
              onEdit={() => editor.start("example")}
              onChange={(next, change) => void saveExamples(next, change)}
              aside={<LifeExamplesLink fr={w.fr} onNavigate={onClose} className="h-11 no-underline! before:hidden" />}
            />
          )}
        </div>

        <FoldRow open={foldOpen} onOpenChange={setFoldOpen} summary={summary} rule="none" className="mt-3 border-t border-rule" bodyClassName="-mx-1 px-1">
          <div className="flex flex-col pb-3">
            {conjOn && (
              <FoldSection
                label="Спряжение"
                tools={
                  editing !== "conjugation" && (
                    <>
                      {(cleanConjugation(w.conjugation) ?? builtin) && <QuizIconButton on={conjView.quiz.on} onClick={conjView.toggleQuiz} />}
                      <TextAction
                        label="Изменить спряжение"
                        onClick={() => editor.start("conjugation", withConjugationDraft(draftOf(w, defs), cleanConjugation(w.conjugation) ?? builtin))}
                      >
                        Изменить
                      </TextAction>
                    </>
                  )
                }
              >
                {editing === "conjugation" ? conjForm : <ConjugationShown word={w} builtin={builtin} size="sheet" view={conjView} />}
              </FoldSection>
            )}
            {originOn && (
              <FoldSection label="Происхождение">
                {editing === "origin" ? (
                  originForm
                ) : (
                  <TapToEdit label={`Изменить происхождение: ${w.origin}`} onClick={() => editor.start("origin")}>
                    {w.origin}
                  </TapToEdit>
                )}
              </FoldSection>
            )}
            {examples.length > 1 && editing !== "example" && (
              <FoldSection label={examples.length > 2 ? "Ещё примеры" : "Второй пример"} edited="example">
                <ExampleList
                  card={w}
                  examples={examples}
                  from={1}
                  size="entry"
                  mark={w.fr}
                  addable={false}
                  onEdit={() => editor.start("example")}
                  onChange={(next, change) => void saveExamples(next, change)}
                />
              </FoldSection>
            )}
            {fieldsOn && (
              <FoldSection label="Свои поля" edited="fields">
                {editing === "fields" ? fieldsForm : <FieldsView size="sheet" rows={filled} onEdit={editFields} tapToEdit />}
              </FoldSection>
            )}
            {noLevel && editing !== "entry" && (
              <FoldSection label="Уровень языка">
                <LevelShown info={null} ready onChange={() => editor.start("entry")} size="sheet" />
              </FoldSection>
            )}
            {editing !== "fields" && (canAddField(shownFields) || kinds.length > 0) && (
              <AddFieldButton
                extras={kinds}
                onCustom={
                  canAddField(shownFields)
                    ? () => {
                        const row = newFieldRow();
                        editFields(row.key, [...shownFields, row]);
                      }
                    : null
                }
              />
            )}
          </div>
        </FoldRow>

        {/* The card's stamps: the answers, old to new, then the next show */}
        <div className="mt-auto pt-8 pb-7">
          {/* «На паузе» heads the stamps, between two rules */}
          {(w.muted || folder?.muted) && (
            <div className="border-t border-rule">
              <PauseNotice word={w} folder={folder} actions={actions} size="sheet" />
            </div>
          )}
          <div className={cx("pt-4", !(w.muted || folder?.muted) && "border-t border-rule")}>
            <WordStamps history={[...history].reverse()} reviews={reviews} schedule={schedule} />
          </div>
        </div>

        <WordActionsSheet open={menuOpen} onOpenChange={setMenuOpen} word={w} actions={actions} />
        {picker}
      </div>
    );
  }

  return (
    <div ref={savedRef} data-word-detail="" className={cx("flex flex-col px-4 pb-4", reveal)}>
      {/* Card header: theme chip + close, above the red index-card rule */}
      <div className="flex h-11 shrink-0 items-center justify-between">
        {themeChip}
        <SheetCloseButton className="-mr-3" />
      </div>
      <div aria-hidden="true" className="h-0.5 shrink-0 bg-red" />

      {/* Entry */}
      {editing === "entry" ? (
        entryForm
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
            {level && (
              <>
                <span aria-hidden="true" className="abbr">
                  ·
                </span>
                <LevelMark info={level} size="header" />
              </>
            )}
          </div>
          <p data-edited="entry" className="m-0 mt-1 text-[18px] leading-6">
            {w.ru}
          </p>
        </>
      )}

      {/* Editable fields */}
      <div className="mt-6 flex flex-col">
        {/* «Уровень языка» (Level-Word): edited in the entry form (Level-Edit). */}
        {editing !== "entry" && (
          <SheetField label="Уровень языка" edited="entry" editLabel="Изменить уровень языка" editing={false} onEdit={() => editor.start("entry")} form={null}>
            <LevelShown info={level} ready={levels.ready} onChange={() => editor.start("entry")} size="sheet" />
          </SheetField>
        )}
        <SheetField label="Заметка" edited="note" editLabel="Изменить заметку" editing={editing === "note"} onEdit={() => editor.start("note")} form={noteForm}>
          {w.note ? (
            <span className="text-[15px] leading-[22px] whitespace-pre-line">{w.note}</span>
          ) : (
            <span className="text-[15px] leading-[22px] text-muted">Нет заметки</span>
          )}
        </SheetField>
        {(w.origin || editing === "origin") && (
          <SheetField label="Происхождение" editLabel="Изменить происхождение" editing={editing === "origin"} onEdit={() => editor.start("origin")} form={originForm}>
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
            form={conjForm}
          >
            <ConjugationShown word={w} builtin={builtin} size="sheet" view={conjView} />
          </SheetField>
        )}
        <SheetField label="Пример" edited="example" editLabel="Изменить пример" editing={editing === "example"} onEdit={() => editor.start("example")} form={exampleForm}>
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
            {editing === "fields" ? fieldsForm : <FieldsView size="sheet" rows={shownFields} onEdit={editFields} extras={fieldKinds} />}
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

      {picker}
    </div>
  );
}

/** The ≈B1 row's text: where the level comes from and how far to trust it («Изменить» follows). */
function levelNote(info: LevelInfo): string {
  if (!info.estimated) return "Уровень указали вы.";
  const hint = levelHint(info)?.replace(/^≈\s*\S+\s+—\s+/u, "") ?? LEVEL_SOURCE_CAPTIONS[info.source];
  return hint.charAt(0).toUpperCase() + hint.slice(1);
}

/** A part of the phone sheet's «Ещё»: a mono label (with tools at its right end), then the content. */
function FoldSection({ label, edited, tools, children }: { label: string; edited?: Exclude<Editing, null>; tools?: ReactNode; children: ReactNode }) {
  return (
    <section data-edited={edited} aria-label={label} className="flex flex-col gap-1 border-t border-rule py-3 first:border-t-0 first:pt-1">
      <div className="flex min-h-5 items-center gap-2">
        <span className="meta min-w-0 flex-1">{label}</span>
        {tools && <div className="-my-3 -mr-3 flex shrink-0 items-center">{tools}</div>}
      </div>
      {children}
    </section>
  );
}

/** A field's text as its own edit button (no pencil column): 22px lines, 44px tall at least. */
function TapToEdit({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="-my-2.5 min-h-11 bg-transparent py-2.5 text-left text-[15px] leading-[22px] break-words text-ink">
      {children}
    </button>
  );
}

/** A 44px text button («Изменить» on «Спряжение»). */
function TextAction({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="h-11 bg-transparent px-3 text-[13px] leading-5 font-medium text-ink underline decoration-1 underline-offset-4">
      {children}
    </button>
  );
}

/**
 * The phone sheet's «⋯» (L-Word-B): reset, pause or bring back, delete, with today's undo snackbars;
 * where the word came from as the caption. Opens over the word sheet (nested).
 */
function WordActionsSheet({
  open,
  onOpenChange,
  word,
  actions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  word: Word;
  actions: ReturnType<typeof useWordActions>;
}) {
  const run = (action: () => Promise<void>) => {
    onOpenChange(false);
    void action();
  };
  return (
    <Sheet nested open={open} onOpenChange={onOpenChange} description="Действия со словом">
      <SheetHeader title={<span lang="fr">{word.fr}</span>} />
      <div className="mx-4 mt-1 flex flex-col border-t border-rule">
        <SheetAction icon="reset" caption="начать заново" onClick={() => run(actions.reset)}>
          Сбросить прогресс
        </SheetAction>
        {word.muted ? (
          <SheetAction icon="cards" caption="снова показывать" onClick={() => run(() => actions.setMuted(false))}>
            Вернуть в повторения
          </SheetAction>
        ) : (
          <SheetAction icon="mute" caption="не повторять" onClick={() => run(() => actions.setMuted(true))}>
            На паузу
          </SheetAction>
        )}
        <SheetAction icon="trash" danger onClick={() => run(actions.remove)}>
          Удалить слово
        </SheetAction>
      </div>
      <p className="meta m-0 px-4 pt-3 pb-4">
        Добавлено {formatDate(word.created_at)} · {SOURCE_LABELS[word.source]}
      </p>
    </Sheet>
  );
}

/**
 * The phone sheet's history (L-Word-B): one 16px stamp per answer, old to new (знаю: ink; сложно:
 * a hollow ink square; не знаю: an --again outline with a slash, a shape and not only a colour),
 * then a dashed slot for the next show, which is not on record yet; under it the next show in mono.
 * The stamps ink in once, left to right, after the sheet has settled (reduced motion: a short fade).
 */
function WordStamps({ history, reviews, schedule }: { history: readonly ReviewLog[]; reviews: number; schedule: readonly ScheduleRow[] }) {
  const label =
    history.length === 0
      ? "Ответов ещё не было"
      : `История ответов, от старых к новым: ${history.map((l) => RATING_NAMES[l.rating]).join(", ")}. Всего ${reviews} ${plural(reviews, ["показ", "показа", "показов"])}`;
  const [first, ...rest] = schedule;
  return (
    <>
      <div role="img" aria-label={label} className="flex items-center gap-1">
        {history.map((l, i) => (
          <span
            key={l.id}
            style={{ "--strip-group": i, "--strip-delay": `${STAMPS_AFTER_MS}ms` } as CSSProperties}
            className={cx(
              "strip-write box-border flex size-4 items-center justify-center rounded-[2px]",
              l.rating === 1 && "border-[1.5px] border-again bg-surface",
              l.rating === 2 && "border border-ink bg-surface",
              l.rating >= 3 && "bg-ink",
            )}
          >
            {l.rating === 1 && (
              <svg aria-hidden="true" width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-again">
                <path d="M2.5 10.5 10.5 2.5" />
              </svg>
            )}
          </span>
        ))}
        {history.length > 0 && <span aria-hidden="true" className="mx-1 h-5 w-px bg-rule" />}
        <span className="box-border size-4 rounded-[2px] border border-dashed border-boundary" />
      </div>
      {first && (
        <p className="m-0 mt-2.5 font-mono text-[11px] leading-4 tracking-[.06em] text-muted uppercase">
          <span className="text-ink">{first.direction === "fr_ru" ? first.brief : `${DIRECTION_LABEL[first.direction]} ${first.brief}`}</span>
          {rest.map((s) => ` · ${DIRECTION_LABEL[s.direction]} ${s.brief}`).join("")}
        </p>
      )}
    </>
  );
}

/** A row of the word's actions (K1): phone sheet and touch panes 52 px, the desktop pane 40 px. */
function SheetAction({
  size = "sheet",
  icon,
  caption,
  danger,
  onClick,
  children,
}: {
  size?: "sheet" | "pane";
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
        "flex items-center border-b border-rule bg-transparent p-0 text-left hoverable:bg-hover active:bg-hover",
        size === "sheet" ? "h-[52px] gap-3.5 text-[16px]" : "h-10 gap-3 text-[14px]",
        danger ? "text-again" : "text-ink",
      )}
    >
      <Icon name={icon} size={size === "sheet" ? 20 : 16} strokeWidth={1.5} />
      <span className="min-w-0 flex-1">{children}</span>
      {caption && <span className={cx("text-muted", size === "sheet" ? "text-[13px]" : "text-[12px]")}>{caption}</span>}
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

/**
 * «Уровень языка» shown (Level-Word, D-Level-Word): mono «≈B1» with its source, the hint with
 * «Изменить»; the user's own level reads «B1 · вы указали · Изменить», with no hint. In the pane the
 * source is in the section's head: the 20px level, the hint beside it; `expanded` while the options
 * are open. Until the dictionaries are in (`ready`; never when they could not load), a word with no
 * stored level is unknown rather than «нет в словаре»: «—» with no caption and no hint.
 */
function LevelShown({
  info,
  ready,
  onChange,
  size,
  expanded = false,
}: {
  info: LevelInfo | null;
  ready: boolean;
  onChange?: () => void;
  size: "sheet" | "pane";
  expanded?: boolean;
}) {
  const unknown = !info && !ready;
  const own = !!info && !info.estimated;
  const hint = info ? levelHint(info) : unknown ? null : "Слова нет в словаре — уровень можно указать самим.";
  const change = onChange && (
    <button
      type="button"
      aria-expanded={size === "pane" ? expanded : undefined}
      onClick={onChange}
      // 18px line + 13px above and below: a 44px hit area.
      className="relative bg-transparent p-0 text-[13px] leading-[18px] font-medium text-ink underline decoration-1 underline-offset-[3px] before:absolute before:-inset-y-[13px] before:inset-x-0"
    >
      Изменить
    </button>
  );
  if (size === "pane") {
    return (
      <div className="flex items-baseline gap-3">
        <span className={cx("shrink-0 font-mono text-[20px] leading-6 font-medium", !info && "text-boundary")}>{levelText(info)}</span>
        <span className="min-w-0 flex-1 text-[13px] leading-5 text-muted">
          {own ? (
            <>
              · вы указали{change && <> · {change}</>}
            </>
          ) : (
            <>
              {hint}
              {hint && change && " "}
              {change}
            </>
          )}
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <span className="flex flex-wrap items-baseline gap-2">
        <span className={cx("font-mono font-medium", size === "sheet" ? "text-[15px] leading-[22px]" : "text-[14px] leading-5", !info && "text-boundary")}>
          {levelText(info)}
        </span>
        {!unknown && <span className="text-[13px] leading-[18px] text-muted">· {info ? LEVEL_SOURCE_CAPTIONS[info.source] : "без уровня"}</span>}
        {!hint && change}
      </span>
      {hint && (
        <span className="text-[13px] leading-[18px] text-muted">
          {hint} {change}
        </span>
      )}
    </div>
  );
}

/**
 * The edit row (Level-Edit, D-Level-Word): A1 … C2 + «Авто». «Авто» is checked while the level is
 * not the user's; the option «Авто» would give has a dotted underline («B1, сейчас оценка»).
 */
function LevelEditRow({
  id,
  word,
  draft,
  set,
  size,
  autoFocus = false,
}: {
  id: string;
  word: Word;
  draft: Draft;
  set: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  size: "sheet" | "pane";
  /** The checked option takes focus when the row opens (the pane, where the row is the whole form). */
  autoFocus?: boolean;
}) {
  const levels = useLevelData();
  const groupRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (autoFocus) groupRef.current?.querySelector<HTMLElement>('[role="radio"][tabindex="0"]')?.focus({ preventScroll: true });
  }, [autoFocus]);
  // What «Авто» gives: a level from Claude stays; else the estimate for the form's slang level.
  const kept = levelChoiceOf(word) === "auto" ? word : { ...word, cefr: null, cefr_source: null };
  const auto = levels.level({ ...kept, slang_level: draft.slang_level, verlan: draft.verlan });
  const label = (v: LevelChoice) => (v === "auto" ? "Авто" : v);
  // The levels in mono, «Авто» in the text face (Level-Edit).
  const AUTO = <span className="font-sans text-[14px] font-medium tracking-normal">Авто</span>;
  const options = [...CEFR_LEVELS, "auto" as const].map((v) => ({
    value: v as LevelChoice,
    label: v === auto?.level ? <span className="underline decoration-dotted decoration-1 underline-offset-[3px]">{v}</span> : v === "auto" ? AUTO : label(v),
    ariaLabel: v === auto?.level ? `${v}, сейчас оценка` : label(v),
  }));
  const caption = draft.cefr === "auto" ? `подобрано автоматически · ${auto ? `${levelText(auto)} ${LEVEL_SOURCE_CAPTIONS[auto.source]}` : "без уровня"}` : null;
  return (
    <>
      <span id={id} className={size === "sheet" ? "meta mt-4" : "sr-only"}>
        Уровень языка
      </span>
      {size === "sheet" ? (
        <Segmented
          variant="block"
          options={options}
          value={draft.cefr}
          onChange={(v) => set("cefr", v)}
          ariaLabelledby={id}
          itemClassName="font-mono text-[13px] tracking-[.04em]"
          className="mt-2"
        />
      ) : (
        <div ref={groupRef} className="mt-2.5">
          <Segmented
            variant="block"
            options={options}
            value={draft.cefr}
            onChange={(v) => set("cefr", v)}
            ariaLabelledby={id}
            itemClassName="font-mono text-[12px] tracking-[.04em]"
            className="h-8!"
          />
        </div>
      )}
      {size === "sheet" ? (
        <>
          {caption && <span className="mt-1.5 text-[12px] leading-4 text-muted">{caption}</span>}
          <span className="mt-0.5 text-[12px] leading-4 text-muted">Свой уровень — без «≈»; «Авто» вернёт оценку.</span>
        </>
      ) : (
        <span className="mt-1.5 text-[12px] leading-4 text-muted">
          {draft.cefr === "auto" ? "подобрано автоматически · «Авто» вернёт оценку" : "«Авто» вернёт оценку."}
        </span>
      )}
    </>
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
  const levels = useLevelData();
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
  const level = levels.level(w);
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
    drop();
    cardRef?.current?.focus({ preventScroll: true });
  };
  // The same, with focus left where it is («Изменить» under «Уровень языка» closes its options).
  const drop = () => {
    const what = editing;
    const kept = draft;
    const dirty = editor.dirty;
    editor.cancel();
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
          <span className="flex items-center gap-3">
            <SlangMeter level={w.slang_level} verlan={false} hints hintAlign="end" />
            {level && <LevelMark info={level} size="header" />}
          </span>
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
                Сленг
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

      {/* Уровень языка (D-Level-Word) */}
      <section aria-labelledby={`${id}-lvl`} data-edited="level" className="mt-5">
        <div className="flex items-baseline justify-between border-b border-ink pb-1.5">
          <h3 id={`${id}-lvl`} className="m-0 text-[13px] leading-5 font-medium">
            Уровень языка
          </h3>
          {/* The user's own level says «вы указали» by the level itself (D-Level-Library). */}
          {level?.estimated && <span className="text-[12px] leading-4 text-muted">{LEVEL_SOURCE_CAPTIONS[level.source]}</span>}
        </div>
        <div className="pt-2.5">
          {/* «Изменить» stays while the options are open (aria-expanded) and closes them again. */}
          <LevelShown
            info={level}
            ready={levels.ready}
            onChange={editing === "level" ? drop : editing ? undefined : () => editor.start("level")}
            size="pane"
            expanded={editing === "level"}
          />
          {editing === "level" && draft && (
            <form onSubmit={(e) => void submit(e)} onKeyDown={formKeys} aria-label="Изменить уровень языка" className="flex flex-col">
              <LevelEditRow id={`${id}-cefr`} word={w} draft={draft} set={set} size="pane" autoFocus />
              {formActions}
            </form>
          )}
        </div>
      </section>

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

      {/* Actions (K1, as on phones) */}
      <div className="mt-5 flex flex-col border-t border-rule">
        <SheetAction size={coarse ? "sheet" : "pane"} icon="reset" caption="начать заново" onClick={() => void actions.reset()}>
          Сбросить прогресс
        </SheetAction>
        {!w.muted && (
          <SheetAction size={coarse ? "sheet" : "pane"} icon="mute" caption="не повторять" onClick={() => void actions.setMuted(true)}>
            На паузу
          </SheetAction>
        )}
        <SheetAction size={coarse ? "sheet" : "pane"} icon="trash" danger onClick={() => void actions.remove()}>
          Удалить слово
        </SheetAction>
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

/**
 * The fields as label / value rows. Without `onEdit` (the desktop card while its entry is edited) only filled ones, read-only.
 * `tapToEdit` (the phone sheet's «Ещё»): each row is its own edit button, and «+ Поле» is the caller's.
 */
function FieldsView({
  size,
  rows,
  onEdit,
  extras = [],
  tapToEdit = false,
}: {
  size: FieldsSize;
  rows: readonly FieldRow[];
  onEdit?: EditFields;
  extras?: readonly FieldKind[];
  tapToEdit?: boolean;
}) {
  const pane = size === "pane";
  if (tapToEdit && onEdit) {
    return (
      <dl className="m-0 flex flex-col">
        {rows.map((r) => (
          <div key={r.key} data-field={r.label} className="relative grid grid-cols-[minmax(0,108px)_minmax(0,1fr)] gap-x-3 py-2.5 first:-mt-2.5">
            <dt className="text-[13px] leading-[22px] break-words text-muted">{r.label}</dt>
            <dd className="m-0 min-w-0">
              {/* The whole row is the target (44px at least); the value names it. */}
              <button
                type="button"
                aria-label={`Изменить поле «${r.label}»: ${r.value}`}
                onClick={() => onEdit(r.key)}
                className="w-full bg-transparent p-0 text-left text-[15px] leading-[22px] break-words text-ink before:absolute before:inset-x-0 before:-inset-y-px"
              >
                {r.value}
              </button>
            </dd>
          </div>
        ))}
      </dl>
    );
  }
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
