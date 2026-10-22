"use client";

import { useLiveQuery } from "dexie-react-hooks";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { Button, IconButton } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icons";
import { Kbd } from "@/components/ui/Kbd";
import { Segmented } from "@/components/ui/Segmented";
import { SheetCloseButton } from "@/components/ui/Sheet";
import { AbbrHint } from "@/components/ui/AbbrHint";
import { SlangMeter, slangAbbr } from "@/components/ui/SlangMeter";
import { Toggle } from "@/components/ui/Toggle";
import { cx } from "@/components/ui/cx";
import { readNdjson } from "@/lib/ai/ndjson";
import type { AiErrorBody, SuggestLine, Suggestion } from "@/lib/ai/schemas";
import { db } from "@/lib/db";
import { listFolders } from "@/lib/folders";
import { useFormatKeys } from "@/lib/key-names";
import { formatDueIn, formatStability, wordStatus, type CardStatus } from "@/lib/scheduler";
import { findDuplicate, normalizeLemma } from "@/lib/text";
import type { Direction, Folder, ReviewLog, SlangLevel, Word } from "@/lib/types";
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
import { CheckMark } from "./Checkbox";
import { formatDate, plural, posAbbr, SOURCE_LABELS, STATUS_LABELS } from "./format";
import { INBOX_KEY, MoveMenu, ThemeSquare } from "./MoveMenu";
import { alphaNeighbours, type Neighbour } from "./table";
import { folderOptions, TargetPickerSheet } from "./TargetPickerSheet";
import { TextOptions } from "./TextOptions";
import { useUndoSnackbar } from "./undo";

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

type Editing = null | "entry" | "note" | "example";

interface Draft {
  fr: string;
  ru: string;
  slang_level: SlangLevel;
  verlan: boolean;
  note: string;
  example_fr: string;
  example_ru: string;
}

const draftOf = (w: Word): Draft => ({
  fr: w.fr,
  ru: w.ru,
  slang_level: w.slang_level,
  verlan: w.verlan,
  note: w.note ?? "",
  example_fr: w.example_fr ?? "",
  example_ru: w.example_ru ?? "",
});

function patchFor(editing: Exclude<Editing, null>, draft: Draft): WordPatch {
  if (editing === "entry") return { fr: draft.fr, ru: draft.ru, slang_level: draft.slang_level, verlan: draft.verlan };
  if (editing === "note") return { note: draft.note };
  return { example_fr: draft.example_fr, example_ru: draft.example_fr.trim() ? draft.example_ru : "" };
}

/** The word's current values of the fields a patch touches (to undo it). */
function undoFor(word: Word, patch: WordPatch): WordPatch {
  const undo: Record<string, unknown> = {};
  for (const key of Object.keys(patch)) undo[key] = word[key as keyof Word];
  return undo as WordPatch;
}

const norm = (v: unknown) => (typeof v === "string" ? v.trim() : v ?? "");
function isDirty(word: Word, editing: Editing, draft: Draft | null): boolean {
  if (!editing || !draft) return false;
  const patch = patchFor(editing, draft);
  return Object.entries(patch).some(([k, v]) => norm(v) !== norm(word[k as keyof Word]));
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

function useWordDetail(wordId: string, extended: boolean) {
  return useLiveQuery(async (): Promise<{ word: null } | DetailData> => {
    const now = new Date();
    const word = await db.words.get(wordId);
    if (!word || word.deleted_at !== null) return { word: null };
    const [states, history, reviews, folders, all] = await Promise.all([
      getWordStates(wordId),
      getWordHistory(wordId, HISTORY_SLOTS),
      db.review_log.where("word_id").equals(wordId).filter((l) => l.deleted_at === null).count(),
      listFolders(),
      extended ? db.words.filter((w) => w.deleted_at === null).toArray() : Promise.resolve(null),
    ]);
    const schedule = states.map((s, i) => {
      const due = formatDueIn(s, now);
      const text = s.state === 0 ? "новая карточка" : due === "сейчас" ? "пора повторить" : i === 0 ? `следующий показ ${due}` : due;
      const full = s.state === 0 ? "ещё не показывалось" : due === "сейчас" ? "к повторению" : `следующий показ ${due}`;
      return { direction: s.direction, text, full, stability: formatStability(s) };
    });
    const data: DetailData = { word, schedule, history, reviews, folders, status: wordStatus(states) };
    if (all) {
      data.number = all.filter((w) => w.created_at < word.created_at || (w.created_at === word.created_at && w.id <= word.id)).length;
      data.neighbours = alphaNeighbours(all, word.id);
    }
    return data;
  }, [wordId, extended]);
}

/** Editing state of one word: which field is open, the draft, saving with the duplicate guard. */
function useWordEditor(word: Word | null, folders: readonly Folder[]) {
  const [editing, setEditing] = useState<Editing>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [dupConfirm, setDupConfirm] = useState<string | null>(null);

  const start = (what: Exclude<Editing, null>, from?: Draft) => {
    if (!word) return;
    setDraft(from ?? draftOf(word));
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

  return { editing, draft, saving, formError, dupConfirm, start, cancel, set, save, dirty: !!word && isDirty(word, editing, draft) };
}

/** Move / reset / delete with undo snackbars. */
function useWordActions(word: Word | null, folders: readonly Folder[], onDeleted: () => void) {
  const showUndo = useUndoSnackbar();
  const folder = word && word.folder_id !== null ? folders.find((f) => f.id === word.folder_id) : undefined;

  const changeFolder = async (key: string) => {
    if (!word) return;
    const to = key === INBOX_KEY ? null : key;
    if (to === (folder ? folder.id : null)) return;
    const records = await moveWords([word.id], to);
    if (records.length === 0) return;
    const name = to === null ? "Входящие" : (folders.find((f) => f.id === to)?.name ?? "тему");
    showUndo({ message: `${to === null ? "Перемещено во" : "Перемещено в"} «${name}»`, undo: () => void restoreMoves(records) });
  };

  const reset = async () => {
    if (!word) return;
    const prev = await resetProgress(word.id);
    showUndo({ message: "Прогресс сброшен", undo: () => void restoreReviewStates(prev) });
  };

  const remove = async () => {
    if (!word) return;
    const { id: wid, fr } = word;
    await softDeleteWords([wid]);
    onDeleted();
    showUndo({
      message: (
        <>
          Удалено · <span lang="fr">{fr}</span>
        </>
      ),
      undo: () => void restoreWords([wid]),
    });
  };

  return { folder, changeFolder, reset, remove };
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

function SheetBody({ wordId, onClose }: { wordId: string; onClose: () => void }) {
  const id = useId();
  const data = useWordDetail(wordId, false);
  const word = data && data.word ? data.word : null;
  const folders = data && "folders" in data ? data.folders : [];
  const editor = useWordEditor(word, folders);
  const actions = useWordActions(word, folders, onClose);
  const [pickerOpen, setPickerOpen] = useState(false);
  useCloseWhenGone(data, onClose);

  if (!data || !data.word) {
    return <div className="min-h-40" aria-busy="true" />;
  }
  const { schedule, history, reviews } = data;
  const w = data.word;
  const { folder } = actions;
  const { editing, draft, set } = editor;
  const abbr = posAbbr(w);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    await editor.save();
  };

  const editActions = (
    <div className="mt-3 flex items-center gap-2">
      <Button type="submit" size="md" loading={editor.saving}>
        {editor.dupConfirm ? "Сохранить всё равно" : "Сохранить"}
      </Button>
      <Button variant="tertiary" size="md" onClick={editor.cancel}>
        Отмена
      </Button>
    </div>
  );
  const errorLine = editor.formError && (
    <p role="alert" className="m-0 mt-2 text-[13px] leading-5 text-again">
      {editor.formError}
    </p>
  );

  return (
    <div className="flex flex-col px-4 pb-4">
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
          <input
            id={`${id}-ru`}
            value={draft.ru}
            onChange={(e) => set("ru", e.target.value)}
            autoComplete="off"
            className="mt-2 h-12 rounded-chip border border-rule bg-surface px-3 text-[16px] text-ink outline-none focus:border-ink"
          />
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
          {errorLine}
          {editActions}
        </form>
      ) : (
        <>
          <div className="mt-4 flex items-start gap-2">
            <h2 lang="fr" className="m-0 min-w-0 flex-1 font-serif text-[36px] leading-10 font-medium tracking-[-0.015em] break-words">
              {w.fr}
            </h2>
            <IconButton icon="pencil" label="Изменить слово и перевод" className="-mr-3 text-muted" onClick={() => editor.start("entry")} />
          </div>
          <div className="mt-2 flex h-5 items-center gap-2">
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
          <p className="m-0 mt-1 text-[18px] leading-6">{w.ru}</p>
        </>
      )}

      {/* Editable fields */}
      <div className="mt-6 flex flex-col">
        <SheetField
          label="Заметка"
          editLabel="Изменить заметку"
          editing={editing === "note"}
          onEdit={() => editor.start("note")}
          form={
            draft && (
              <form onSubmit={save} className="flex flex-col" aria-label="Изменить заметку">
                <textarea
                  aria-label="Заметка"
                  value={draft.note}
                  onChange={(e) => set("note", e.target.value)}
                  rows={3}
                  className="mt-1 resize-none rounded-chip border border-rule bg-surface px-3 py-2.5 text-[15px] leading-[22px] text-ink outline-none focus:border-ink pointer-coarse:text-[16px]"
                />
                {errorLine}
                {editActions}
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
        <SheetField
          label="Пример"
          editLabel="Изменить пример"
          editing={editing === "example"}
          onEdit={() => editor.start("example")}
          form={
            draft && (
              <form onSubmit={save} className="flex flex-col" aria-label="Изменить пример">
                <input
                  aria-label="Пример по-французски"
                  lang="fr"
                  value={draft.example_fr}
                  onChange={(e) => set("example_fr", e.target.value)}
                  placeholder="Phrase en français"
                  className="mt-1 h-11 rounded-chip border border-rule bg-surface px-3 font-serif text-[17px] text-ink italic outline-none placeholder:text-muted focus:border-ink"
                />
                <input
                  aria-label="Перевод примера"
                  value={draft.example_ru}
                  onChange={(e) => set("example_ru", e.target.value)}
                  placeholder="Перевод"
                  className="mt-2 h-11 rounded-chip border border-rule bg-surface px-3 text-[15px] text-ink outline-none placeholder:text-muted focus:border-ink pointer-coarse:text-[16px]"
                />
                {errorLine}
                {editActions}
              </form>
            )
          }
        >
          {w.example_fr ? (
            <>
              <span lang="fr" className="font-serif text-[17px] leading-6 italic">
                {w.example_fr}
              </span>
              {w.example_ru && <span className="-mt-1 text-[14px] leading-5 text-muted">{w.example_ru}</span>}
            </>
          ) : (
            <span className="text-[15px] leading-[22px] text-muted">Нет примера</span>
          )}
        </SheetField>
      </div>

      {/* Progress */}
      <div className="meta mt-2 flex justify-between border-t border-ink pt-2">
        <span className="font-medium text-ink">Повторение</span>
        <span>
          {reviews} {plural(reviews, ["показ", "показа", "показов"])}
        </span>
      </div>
      <div className="mt-1 flex flex-col">
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

      {/* Actions */}
      <SheetRefresh word={w} />
      <div className="mt-2 flex justify-between">
        <Button variant="tertiary" size="md" className="-ml-1 px-1 text-[14px] font-normal no-underline" onClick={() => void actions.reset()}>
          Сбросить прогресс
        </Button>
        <Button variant="danger" size="md" className="-mr-1 px-1 text-[14px]" onClick={() => void actions.remove()}>
          Удалить слово
        </Button>
      </div>

      <p className="meta m-0 mt-4 border-t border-rule pt-3">
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

function SheetField({
  label,
  editLabel,
  editing,
  onEdit,
  form,
  children,
}: {
  label: string;
  editLabel: string;
  editing: boolean;
  onEdit: () => void;
  form: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 border-t border-rule py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="meta">{label}</span>
        {editing ? form : children}
      </div>
      {!editing && <IconButton icon="pencil" label={editLabel} className="-mt-1 -mr-3 text-muted" onClick={onEdit} />}
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

function PaneBody({ wordId, onClose, onPrev, onNext, onOpenWord, onNewTheme, editSignal = 0, coarse = false, cardRef }: Omit<WordDetailBodyProps, "variant">) {
  const id = useId();
  const keys = useFormatKeys();
  const data = useWordDetail(wordId, true);
  const word = data && data.word ? data.word : null;
  const folders = data && "folders" in data ? data.folders : [];
  const editor = useWordEditor(word, folders);
  const actions = useWordActions(word, folders, onClose);
  const refresh = useRefresh(word);
  const showUndo = useUndoSnackbar();
  const [themeMenu, setThemeMenu] = useState<HTMLElement | null>(null);
  const ruRef = useRef<HTMLInputElement>(null);
  useCloseWhenGone(data, onClose);

  // `E` from the list: open the entry form with «Русский» focused.
  const handledEdit = useRef(editSignal);
  useEffect(() => {
    if (!word || editSignal === handledEdit.current) return;
    handledEdit.current = editSignal;
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
      const patch = patchFor(editing, draft);
      const undo = undoFor(w, patch);
      void updateWord(w.id, patch).then(
        () => show({ message: "Сохранено", undo: () => void updateWord(w.id, undo).catch(() => {}) }),
        () => {},
      );
    },
    [],
  );

  if (!data || !data.word) {
    return <div className="min-h-40" aria-busy="true" />;
  }
  const w = data.word;
  const { folder } = actions;
  const { editing, draft, set } = editor;
  const abbr = posAbbr(w);
  const grammar = coarse ? abbr : [abbr, slangAbbr(w.slang_level, w.verlan)].filter(Boolean).join(" · ");

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    const undo = await editor.save();
    if (undo) cardRef?.current?.focus({ preventScroll: true });
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
    <div className="mt-4 flex items-center justify-end gap-3">
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
    <div className="flex items-start gap-2">
      <p className={cx("m-0 min-w-0 flex-1 text-[14px] leading-5 whitespace-pre-line", !w.note && "text-muted")}>{w.note || "Нет заметки"}</p>
      {!editing && pencil("Изменить заметку", () => editor.start("note"))}
    </div>
  );
  const example = (
    <div className="flex items-start gap-2">
      <div className="flex min-w-0 flex-1 flex-col">
        {w.example_fr ? (
          <>
            <span lang="fr" className="font-serif text-[16px] leading-6 italic">
              {w.example_fr}
            </span>
            {w.example_ru && <span className="text-[13px] leading-5 text-muted">— {w.example_ru}</span>}
          </>
        ) : (
          <span className="text-[14px] leading-5 text-muted">Нет примера</span>
        )}
      </div>
      {!editing && pencil("Изменить пример", () => editor.start("example"))}
    </div>
  );

  return (
    <div className="flex flex-col">
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
        <div className="flex h-10 items-center justify-between px-5">
          <span className="font-mono text-[11px] text-muted tabular-nums">FR · {cardNumber(data.number ?? 1)}</span>
          <SlangMeter level={w.slang_level} verlan={false} />
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
              {formActions}
            </form>
          ) : (
            <>
              <div className="flex items-start gap-2">
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
              {grammar && (
                <p lang="fr" className="abbr m-0 mt-1 text-[15px] leading-5">
                  {grammar}
                </p>
              )}
              <p className="m-0 mt-2 text-[18px] leading-6 font-medium">{w.ru}</p>
              <RefreshResult refresh={refresh} />
            </>
          )}

          {editing === "entry" ? (
            <div className="mt-5 flex flex-col gap-3 border-t border-rule pt-4">
              {w.note && <p className="m-0 text-[14px] leading-5 whitespace-pre-line">{w.note}</p>}
              {w.example_fr && (
                <div className="flex flex-col">
                  <span lang="fr" className="font-serif text-[16px] leading-6 italic">
                    {w.example_fr}
                  </span>
                  {w.example_ru && <span className="text-[13px] leading-5 text-muted">— {w.example_ru}</span>}
                </div>
              )}
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
                  {formActions}
                </form>
              ) : (
                note
              )}
              {editing === "example" && draft ? (
                <form onSubmit={(e) => void submit(e)} onKeyDown={formKeys} aria-label="Изменить пример" className="flex flex-col">
                  <input
                    aria-label="Пример по-французски"
                    lang="fr"
                    value={draft.example_fr}
                    onChange={(e) => set("example_fr", e.target.value)}
                    placeholder="Phrase en français"
                    autoFocus
                    className={cx(fieldInput, "font-serif text-[16px] italic")}
                  />
                  <input
                    aria-label="Перевод примера"
                    value={draft.example_ru}
                    onChange={(e) => set("example_ru", e.target.value)}
                    placeholder="Перевод"
                    className={cx(fieldInput, "mt-2 text-[14px]")}
                  />
                  {formActions}
                </form>
              ) : (
                example
              )}
            </div>
          )}

          {coarse && (
            <p className="m-0 mt-5 flex gap-4 border-t border-rule pt-4 text-[13px] leading-5 text-muted">
              <span>1. {folder?.name ?? "Входящие"}</span>
              <span>
                2.{" "}
                <span lang="fr" className="font-serif italic">
                  {slangAbbr(w.slang_level, w.verlan)}
                </span>
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
      <div className="mt-5 flex flex-col items-start gap-1">
        <button
          type="button"
          aria-busy={refresh.state.status === "loading" || undefined}
          disabled={refresh.state.status === "loading"}
          onClick={() => void refresh.run()}
          className={cx(paneAction(coarse), "disabled:cursor-default")}
        >
          <Icon name="refresh" size={14} />
          {refresh.state.status === "loading" ? "Подбираем…" : "Обновить перевод и заметку"}
        </button>
        <div className="flex items-center gap-5">
          <button type="button" onClick={() => void actions.reset()} className={paneAction(coarse)}>
            Сбросить прогресс
          </button>
          <button type="button" onClick={() => void actions.remove()} className={paneAction(coarse)}>
            <Icon name="trash" size={14} />
            Удалить слово
          </button>
        </div>
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
// «Обновить перевод и заметку»: fetch fresh variants for this word and show what would change.

type DiffField = "ru" | "note" | "example" | "slang" | "pos";

interface DiffRow {
  field: DiffField;
  label: string;
  before: ReactNode;
  after: ReactNode;
  patch: WordPatch;
  undo: WordPatch;
}

type RefreshState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "same" }
  | { status: "diff"; rows: DiffRow[]; picked: DiffField[] };

const SUGGEST_ERRORS: Record<string, string> = {
  unauthenticated: "Войдите, чтобы обновлять перевод.",
  forbidden_email: "Обновление перевода недоступно для этого аккаунта.",
  local_only_mode: "Обновление перевода сейчас недоступно.",
  not_configured: "Обновление перевода сейчас недоступно.",
  rate_limited: "Слишком много запросов. Попробуйте через минуту.",
};

function buildDiff(word: Word, s: Suggestion): DiffRow[] {
  const rows: DiffRow[] = [];
  const empty = <span className="text-muted">—</span>;
  if (s.ru && s.ru !== word.ru) {
    rows.push({ field: "ru", label: "Перевод", before: word.ru, after: s.ru, patch: { ru: s.ru }, undo: { ru: word.ru } });
  }
  if (s.note && s.note !== word.note) {
    rows.push({ field: "note", label: "Заметка", before: word.note ?? empty, after: s.note, patch: { note: s.note }, undo: { note: word.note } });
  }
  if (s.example_fr && (s.example_fr !== word.example_fr || (s.example_ru ?? null) !== word.example_ru)) {
    const show = (fr: string | null, ru: string | null) =>
      fr ? (
        <>
          <span lang="fr" className="font-serif italic">
            {fr}
          </span>
          {ru && <span className="text-muted"> — {ru}</span>}
        </>
      ) : (
        empty
      );
    rows.push({
      field: "example",
      label: "Пример",
      before: show(word.example_fr, word.example_ru),
      after: show(s.example_fr, s.example_ru),
      patch: { example_fr: s.example_fr, example_ru: s.example_ru },
      undo: { example_fr: word.example_fr, example_ru: word.example_ru },
    });
  }
  if (s.slang_level !== word.slang_level || s.verlan !== word.verlan) {
    rows.push({
      field: "slang",
      label: "Уровень сленга",
      before: <SlangMeter level={word.slang_level} verlan={word.verlan} size="sm" />,
      after: <SlangMeter level={s.slang_level} verlan={s.verlan} size="sm" />,
      patch: { slang_level: s.slang_level, verlan: s.verlan },
      undo: { slang_level: word.slang_level, verlan: word.verlan },
    });
  }
  const nextAbbr = posAbbr({ ...word, pos: s.pos, gender: s.gender });
  if ((s.pos !== word.pos || s.gender !== word.gender) && nextAbbr !== posAbbr(word)) {
    const abbr = (a: string | null) => (a ? <span lang="fr" className="abbr">{a}</span> : empty);
    rows.push({
      field: "pos",
      label: "Часть речи",
      before: abbr(posAbbr(word)),
      after: abbr(nextAbbr),
      patch: { pos: s.pos, gender: s.gender },
      undo: { pos: word.pos, gender: word.gender },
    });
  }
  return rows;
}

async function fetchSuggestion(fr: string, signal: AbortSignal): Promise<Suggestion | null> {
  let res: Response;
  try {
    res = await fetch("/api/ai/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: fr.slice(0, 80), direction: "fr" }),
      signal,
    });
  } catch (e) {
    if (signal.aborted) throw e;
    throw new Error(navigator.onLine === false ? "Нет сети. Попробуйте, когда появится интернет." : "Не получилось обновить. Попробуйте ещё раз.");
  }
  if (!res.ok) {
    let code = "";
    try {
      code = ((await res.json()) as AiErrorBody).error;
    } catch {
      // not JSON
    }
    throw new Error(SUGGEST_ERRORS[code] ?? "Не получилось обновить. Попробуйте ещё раз.");
  }
  const key = normalizeLemma(fr);
  const found: Suggestion[] = [];
  for await (const line of readNdjson<SuggestLine>(res, signal)) {
    if (line.type === "suggestion") {
      found.push(line.suggestion);
      if (normalizeLemma(line.suggestion.fr) === key) return line.suggestion;
    } else if (line.type === "error" && found.length === 0) {
      throw new Error("Не получилось обновить. Попробуйте ещё раз.");
    }
  }
  return found[0] ?? null;
}

function useRefresh(word: Word | null) {
  const showUndo = useUndoSnackbar();
  const [state, setState] = useState<RefreshState>({ status: "idle" });
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const run = async () => {
    if (!word) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setState({ status: "loading" });
    try {
      const suggestion = await fetchSuggestion(word.fr, controller.signal);
      if (controller.signal.aborted) return;
      if (!suggestion) {
        setState({ status: "error", message: "Вариантов не нашлось." });
        return;
      }
      const rows = buildDiff(word, suggestion);
      setState(rows.length ? { status: "diff", rows, picked: rows.map((r) => r.field) } : { status: "same" });
    } catch (e) {
      if (controller.signal.aborted) return;
      setState({ status: "error", message: e instanceof Error ? e.message : "Не получилось обновить." });
    }
  };

  const accept = async () => {
    if (!word || state.status !== "diff") return;
    const chosen = state.rows.filter((r) => state.picked.includes(r.field));
    if (chosen.length === 0) return;
    const patch = Object.assign({}, ...chosen.map((r) => r.patch)) as WordPatch;
    const undo = Object.assign({}, ...chosen.map((r) => r.undo)) as WordPatch;
    try {
      await updateWord(word.id, patch);
      setState({ status: "idle" });
      showUndo({ message: "Перевод и заметка обновлены", undo: () => void updateWord(word.id, undo).catch(() => {}) });
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : "Не получилось сохранить" });
    }
  };

  const toggle = (field: DiffField) =>
    setState((s) =>
      s.status === "diff" ? { ...s, picked: s.picked.includes(field) ? s.picked.filter((f) => f !== field) : [...s.picked, field] } : s,
    );

  return { state, run, accept, toggle, dismiss: () => setState({ status: "idle" }) };
}

type Refresh = ReturnType<typeof useRefresh>;

/** Sheet: the secondary button with the proposed changes in place of it. */
function SheetRefresh({ word }: { word: Word }) {
  const refresh = useRefresh(word);
  const { state } = refresh;

  if (state.status === "diff") {
    const { rows, picked } = state;
    return (
      <section aria-label="Предлагаемые изменения" className="mt-6 rounded-card border border-ink">
        <p className="meta m-0 border-b border-rule px-3 py-2">
          <span className="font-medium text-ink">Предлагаемые изменения</span>
        </p>
        <ul className="m-0 list-none p-0">
          {rows.map((r) => {
            const on = picked.includes(r.field);
            return (
              <li key={r.field} className="border-b border-rule last:border-b-0">
                <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => refresh.toggle(r.field)}
                    className="mt-0.5 size-[18px] shrink-0 accent-[var(--ink)]"
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="meta">{r.label}</span>
                    <span className="text-[14px] leading-5 text-muted line-through decoration-1">{r.before}</span>
                    <span className="text-[15px] leading-[22px] text-ink">{r.after}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center gap-2 border-t border-rule p-3">
          <Button size="md" disabled={picked.length === 0} onClick={() => void refresh.accept()} trailing={picked.length}>
            Принять
          </Button>
          <Button variant="tertiary" size="md" onClick={refresh.dismiss}>
            Оставить как есть
          </Button>
        </div>
      </section>
    );
  }

  return (
    <div className="mt-6 flex flex-col">
      <Button variant="secondary" block icon="refresh" loading={state.status === "loading"} onClick={() => void refresh.run()}>
        {state.status === "loading" ? "Подбираем…" : "Обновить перевод и заметку"}
      </Button>
      {state.status === "error" && (
        <p role="alert" className="m-0 mt-2 text-[13px] leading-5 text-again">
          {state.message}
        </p>
      )}
      {state.status === "same" && (
        <p role="status" className="m-0 mt-2 text-[13px] leading-5 text-muted">
          Перевод и заметка уже актуальны.
        </p>
      )}
    </div>
  );
}

const ALL_FIELDS: { field: DiffField; label: string }[] = [
  { field: "ru", label: "Перевод" },
  { field: "note", label: "Заметка" },
];

/** Pane: the proposed changes inside the card, under the translation (D-Library-Refresh). */
function RefreshResult({ refresh }: { refresh: Refresh }) {
  const { state } = refresh;
  if (state.status === "error" || state.status === "same") {
    return (
      <p role={state.status === "error" ? "alert" : "status"} className="m-0 mt-3 text-[13px] leading-5 text-muted">
        {state.status === "error" ? state.message : "Перевод и заметка уже актуальны."}
      </p>
    );
  }
  if (state.status !== "diff") return null;
  const { rows, picked } = state;
  // «Перевод» and «Заметка» always show, «без изменений» when the same.
  const unchanged = ALL_FIELDS.filter((f) => !rows.some((r) => r.field === f.field));
  const n = picked.length;
  return (
    <section aria-label="Предлагаемые изменения" className="mt-4 rounded-[6px] border border-ink p-3">
      <h3 className="m-0 border-b border-rule pb-2 text-[13px] leading-5 font-medium">Предлагаемые изменения</h3>
      <ul className="m-0 list-none p-0">
        {rows.map((r) => {
          const on = picked.includes(r.field);
          return (
            <li key={r.field} className="border-b border-rule">
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => refresh.toggle(r.field)}
                className="flex w-full items-start gap-3 bg-transparent py-2.5 text-left text-ink"
              >
                <CheckMark checked={on} className="mt-0.5" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[12px] leading-4 text-muted">{r.label}</span>
                  <span className="text-[13px] leading-5 text-muted line-through decoration-1">{r.before}</span>
                  <span className="text-[14px] leading-5 font-medium">
                    <span aria-hidden="true">→ </span>
                    {r.after}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
        {unchanged.map((f) => (
          <li key={f.field} className="flex items-start gap-3 border-b border-rule py-2.5">
            <CheckMark checked={false} className="mt-0.5 opacity-40" />
            <span className="flex flex-col">
              <span className="text-[12px] leading-4 text-muted">{f.label}</span>
              <span className="text-[13px] leading-5 text-muted">без изменений</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center gap-4">
        <button
          type="button"
          aria-disabled={n === 0 || undefined}
          title={n === 0 ? "Отметьте хотя бы одно поле" : undefined}
          onClick={() => n > 0 && void refresh.accept()}
          className={cx(
            "inline-flex h-9 items-center gap-2 rounded-[6px] border px-4 text-[14px] font-medium",
            n === 0 ? "cursor-default border-rule bg-transparent text-boundary" : "border-ink bg-ink text-on-ink",
          )}
        >
          Принять <span className="font-mono text-[13px]">{n}</span>
        </button>
        <button
          type="button"
          onClick={refresh.dismiss}
          className="inline-flex h-9 items-center bg-transparent px-1 text-[14px] font-medium text-ink hoverable:underline"
        >
          Оставить как есть
        </button>
      </div>
    </section>
  );
}

