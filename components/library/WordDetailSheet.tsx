"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button, IconButton } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Segmented } from "@/components/ui/Segmented";
import { Sheet, SheetCloseButton } from "@/components/ui/Sheet";
import { AbbrHint } from "@/components/ui/AbbrHint";
import { SlangMeter } from "@/components/ui/SlangMeter";
import { useSnackbar } from "@/components/ui/Snackbar";
import { Toggle } from "@/components/ui/Toggle";
import { cx } from "@/components/ui/cx";
import { readNdjson } from "@/lib/ai/ndjson";
import type { AiErrorBody, SuggestLine, Suggestion } from "@/lib/ai/schemas";
import { db } from "@/lib/db";
import { listFolders } from "@/lib/folders";
import { formatDueIn, formatStability } from "@/lib/scheduler";
import { findDuplicate, normalizeLemma } from "@/lib/text";
import type { Direction, ReviewLog, SlangLevel, Word } from "@/lib/types";
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
import { formatDate, plural, posAbbr, SOURCE_LABELS } from "./format";
import { folderOptions, TargetPickerSheet } from "./TargetPickerSheet";

export interface WordDetailSheetProps {
  /** Word to show; null closes the sheet. */
  wordId: string | null;
  onClose: () => void;
}

/** Full-height sheet with a word's entry, editable fields, schedule, history and actions. */
export function WordDetailSheet({ wordId, onClose }: WordDetailSheetProps) {
  // Keep showing the last word while the sheet animates closed.
  const [shownId, setShownId] = useState<string | null>(wordId);
  if (wordId !== null && wordId !== shownId) setShownId(wordId);

  return (
    <Sheet
      open={wordId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      onClosed={() => setShownId(null)}
      height="full"
      title="Карточка слова"
    >
      {shownId && <WordDetail key={shownId} wordId={shownId} onClose={onClose} />}
    </Sheet>
  );
}

const DIRECTION_LABEL: Record<Direction, string> = { fr_ru: "FR → RU", ru_fr: "RU → FR" };
const RATING_NAMES = { 1: "не знаю", 2: "сложно", 3: "знаю", 4: "легко" } as const;
const SLANG_OPTIONS = [
  { value: 0 as SlangLevel, label: "нейтр." },
  { value: 1 as SlangLevel, label: "fam.", lang: "fr" },
  { value: 2 as SlangLevel, label: "arg.", lang: "fr" },
  { value: 3 as SlangLevel, label: "vulg.", lang: "fr" },
];
const HISTORY_SLOTS = 8;

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

function useWordDetail(wordId: string) {
  return useLiveQuery(async () => {
    const now = new Date();
    const word = await db.words.get(wordId);
    if (!word || word.deleted_at !== null) return { word: null } as const;
    const [states, history, reviews, folders] = await Promise.all([
      getWordStates(wordId),
      getWordHistory(wordId, HISTORY_SLOTS),
      db.review_log.where("word_id").equals(wordId).filter((l) => l.deleted_at === null).count(),
      listFolders(),
    ]);
    const schedule = states.map((s, i) => {
      const due = formatDueIn(s, now);
      const text = s.state === 0 ? "новая карточка" : due === "сейчас" ? "пора повторить" : i === 0 ? `следующий показ ${due}` : due;
      return { direction: s.direction, text, stability: formatStability(s) };
    });
    return { word, schedule, history: [...history].reverse(), reviews, folders } as const;
  }, [wordId]);
}

function WordDetail({ wordId, onClose }: { wordId: string; onClose: () => void }) {
  const id = useId();
  const data = useWordDetail(wordId);
  const snackbar = useSnackbar();
  const [editing, setEditing] = useState<Editing>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [dupConfirm, setDupConfirm] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // The word was deleted elsewhere (or by «Удалить»): close.
  const gone = data !== undefined && data.word === null;
  useEffect(() => {
    if (gone) onClose();
  }, [gone, onClose]);

  if (!data || !data.word) {
    return <div className="min-h-40" aria-busy="true" />;
  }
  const { word, schedule, history, reviews, folders } = data;
  const folder = word.folder_id !== null ? folders.find((f) => f.id === word.folder_id) : undefined;
  const abbr = posAbbr(word);

  const startEdit = (what: Exclude<Editing, null>) => {
    setDraft(draftOf(word));
    setEditing(what);
    setFormError(null);
    setDupConfirm(null);
  };
  const cancelEdit = () => {
    setEditing(null);
    setDraft(null);
    setFormError(null);
    setDupConfirm(null);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft || !editing) return;
    const patch: WordPatch =
      editing === "entry"
        ? { fr: draft.fr, ru: draft.ru, slang_level: draft.slang_level, verlan: draft.verlan }
        : editing === "note"
          ? { note: draft.note }
          : { example_fr: draft.example_fr, example_ru: draft.example_fr.trim() ? draft.example_ru : "" };
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
          return;
        }
      }
      await updateWord(word.id, patch);
      cancelEdit();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Не получилось сохранить");
    } finally {
      setSaving(false);
    }
  };

  const changeFolder = async (key: string) => {
    const to = key === "inbox" ? null : key;
    if (to === (folder ? folder.id : null)) return;
    const records = await moveWords([word.id], to);
    if (records.length === 0) return;
    const name = to === null ? "Входящие" : (folders.find((f) => f.id === to)?.name ?? "тему");
    snackbar.show({
      message: `${to === null ? "Перемещено во" : "Перемещено в"} «${name}»`,
      actionLabel: "Отменить",
      onAction: () => void restoreMoves(records),
    });
  };

  const reset = async () => {
    const prev = await resetProgress(word.id);
    snackbar.show({
      message: "Прогресс сброшен",
      actionLabel: "Отменить",
      onAction: () => void restoreReviewStates(prev),
    });
  };

  const remove = async () => {
    const { id: wid, fr } = word;
    await softDeleteWords([wid]);
    onClose();
    snackbar.show({
      message: (
        <>
          Удалено · <span lang="fr">{fr}</span>
        </>
      ),
      actionLabel: "Отменить",
      onAction: () => void restoreWords([wid]),
    });
  };

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
    if (key === "fr") setDupConfirm(null);
    setFormError(null);
  };

  const editActions = (
    <div className="mt-3 flex items-center gap-2">
      <Button type="submit" size="md" loading={saving}>
        {dupConfirm ? "Сохранить всё равно" : "Сохранить"}
      </Button>
      <Button variant="tertiary" size="md" onClick={cancelEdit}>
        Отмена
      </Button>
    </div>
  );
  const errorLine = formError && (
    <p role="alert" className="m-0 mt-2 text-[13px] leading-5 text-again">
      {formError}
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
              {word.fr}
            </h2>
            <IconButton icon="pencil" label="Изменить слово и перевод" className="-mr-3 text-muted" onClick={() => startEdit("entry")} />
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
            <SlangMeter level={word.slang_level} verlan={word.verlan} hints />
          </div>
          <p className="m-0 mt-1 text-[18px] leading-6">{word.ru}</p>
        </>
      )}

      {/* Editable fields */}
      <div className="mt-6 flex flex-col">
        <Field
          label="Заметка"
          editLabel="Изменить заметку"
          editing={editing === "note"}
          onEdit={() => startEdit("note")}
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
          {word.note ? (
            <span className="text-[15px] leading-[22px] whitespace-pre-line">{word.note}</span>
          ) : (
            <span className="text-[15px] leading-[22px] text-muted">Нет заметки</span>
          )}
        </Field>
        <Field
          label="Пример"
          editLabel="Изменить пример"
          editing={editing === "example"}
          onEdit={() => startEdit("example")}
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
          {word.example_fr ? (
            <>
              <span lang="fr" className="font-serif text-[17px] leading-6 italic">
                {word.example_fr}
              </span>
              {word.example_ru && <span className="-mt-1 text-[14px] leading-5 text-muted">{word.example_ru}</span>}
            </>
          ) : (
            <span className="text-[15px] leading-[22px] text-muted">Нет примера</span>
          )}
        </Field>
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

      <HistoryStrip history={history} />

      {/* Actions */}
      <RefreshPanel word={word} />
      <div className="mt-2 flex justify-between">
        <Button variant="tertiary" size="md" className="-ml-1 px-1 text-[14px] font-normal no-underline" onClick={() => void reset()}>
          Сбросить прогресс
        </Button>
        <Button variant="danger" size="md" className="-mr-1 px-1 text-[14px]" onClick={() => void remove()}>
          Удалить слово
        </Button>
      </div>

      <p className="meta m-0 mt-4 border-t border-rule pt-3">
        Добавлено {formatDate(word.created_at)} · {SOURCE_LABELS[word.source]}
      </p>

      <TargetPickerSheet
        nested
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="Тема"
        subtitle={word.fr}
        options={folderOptions(folders)}
        selectedKey={folder ? folder.id : "inbox"}
        onPick={(key) => void changeFolder(key)}
      />
    </div>
  );
}

function Field({
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

function RefreshPanel({ word }: { word: Word }) {
  const snackbar = useSnackbar();
  const [state, setState] = useState<RefreshState>({ status: "idle" });
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const run = async () => {
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

  const accept = async (rows: DiffRow[], picked: DiffField[]) => {
    const chosen = rows.filter((r) => picked.includes(r.field));
    if (chosen.length === 0) return;
    const patch = Object.assign({}, ...chosen.map((r) => r.patch)) as WordPatch;
    const undo = Object.assign({}, ...chosen.map((r) => r.undo)) as WordPatch;
    try {
      await updateWord(word.id, patch);
      setState({ status: "idle" });
      snackbar.show({
        message: "Перевод и заметка обновлены",
        actionLabel: "Отменить",
        onAction: () => void updateWord(word.id, undo).catch(() => {}),
      });
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : "Не получилось сохранить" });
    }
  };

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
                    onChange={() =>
                      setState({ ...state, picked: on ? picked.filter((f) => f !== r.field) : [...picked, r.field] })
                    }
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
          <Button size="md" disabled={picked.length === 0} onClick={() => void accept(rows, picked)} trailing={picked.length}>
            Принять
          </Button>
          <Button variant="tertiary" size="md" onClick={() => setState({ status: "idle" })}>
            Оставить как есть
          </Button>
        </div>
      </section>
    );
  }

  return (
    <div className="mt-6 flex flex-col">
      <Button variant="secondary" block icon="refresh" loading={state.status === "loading"} onClick={() => void run()}>
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

