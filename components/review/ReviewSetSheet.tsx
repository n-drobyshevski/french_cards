"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { cx } from "@/components/ui/cx";
import { Segmented } from "@/components/ui/Segmented";
import { Sheet, SheetCloseButton, SheetTitle } from "@/components/ui/Sheet";
import {
  ADDED_LABELS,
  countSetCards,
  EMPTY_SET_DRAFT,
  INBOX_KEY,
  MODE_LABELS,
  REVIEW_SET_NAME_MAX,
  SET_SLANG,
  SET_STATUSES,
  setSessionFilter,
  STATUS_LABELS,
  type ReviewSetDraft,
} from "@/lib/review-sets";
import { sessionFilterKey } from "@/lib/session";
import { SLANG_LABELS, type Direction, type Folder, type ReviewSet, type SlangLevel } from "@/lib/types";

const CARD_FORMS = ["карточка", "карточки", "карточек"] as const;
const cards = (n: number) => {
  const m10 = n % 10;
  const m100 = n % 100;
  const form = m10 === 1 && m100 !== 11 ? CARD_FORMS[0] : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? CARD_FORMS[1] : CARD_FORMS[2];
  return `${n} ${form}`;
};

const MODE_OPTIONS = [
  { value: "schedule", label: MODE_LABELS.schedule },
  { value: "practice", label: MODE_LABELS.practice },
] as const;

function Group({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="mt-5 first:mt-3">
      <h3 id={id} className="meta m-0 mb-1 flex justify-between font-medium">
        {label}
        {hint && <span className="font-normal">{hint}</span>}
      </h3>
      {children}
    </section>
  );
}

/** The slang meter's segments, decorative inside a chip (its text names the level). */
function Segments({ level, selected }: { level: SlangLevel; selected: boolean }) {
  const fill = selected ? "bg-on-ink" : level === 3 ? "bg-red" : "bg-ink";
  return (
    <span aria-hidden="true" className="inline-flex items-center gap-[2px]">
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className={cx("h-[2px] w-2", i <= level ? fill : selected ? "bg-on-ink/35" : "bg-rule")} />
      ))}
    </span>
  );
}

export interface ReviewSetSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The set being edited; null for «Новый набор». */
  set: ReviewSet | null;
  folders: readonly Folder[];
  /** The review screen's direction, for the live card count. */
  direction: Direction | undefined;
  onSave: (draft: ReviewSetDraft) => Promise<void>;
  /** Only when editing. */
  onDelete?: () => void;
}

const draftOf = (set: ReviewSet | null): ReviewSetDraft =>
  set ? { name: set.name, folders: set.folders, statuses: set.statuses, slang: set.slang, added: set.added, mode: set.mode } : EMPTY_SET_DRAFT;

/**
 * «Новый набор» / editing a set (mockups: Повторение «C · Мои наборы»): a name, themes, word
 * statuses, slang levels, age and how to review it, with the number of cards it gives right now.
 */
export function ReviewSetSheet({ open, onOpenChange, set, folders, direction, onSave, onDelete }: ReviewSetSheetProps) {
  const nameId = useId();
  const [draft, setDraft] = useState<ReviewSetDraft>(() => draftOf(set));
  const [session, setSession] = useState<{ open: boolean; id: string | null }>({ open, id: set?.id ?? null });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Every opening starts from the set as stored (or an empty draft).
  if (session.open !== open || session.id !== (set?.id ?? null)) {
    setSession({ open, id: set?.id ?? null });
    if (open) {
      setDraft(draftOf(set));
      setSaving(false);
      setError(null);
    }
  }

  const patch = (p: Partial<ReviewSetDraft>) => setDraft((d) => ({ ...d, ...p }));
  const toggle = <T,>(list: readonly T[], v: T, order: readonly T[]): T[] =>
    list.includes(v) ? list.filter((x) => x !== v) : order.filter((x) => x === v || list.includes(x));

  const liveIds = new Set(folders.map((f) => f.id));
  const filter = setSessionFilter(draft, direction, liveIds);
  const filterKey = sessionFilterKey({ ...filter, addedSince: draft.added });
  const count = useLiveQuery(() => (open ? countSetCards(filter, draft.mode) : undefined), [open, filterKey, draft.mode]);

  const folderKeys = [INBOX_KEY, ...folders.map((f) => f.id)];
  const name = draft.name.trim();

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
    } catch (e) {
      setSaving(false);
      setError(e instanceof Error ? e.message : "Не получилось сохранить набор");
    }
  };

  const footer = (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-2">
      <Button variant="tertiary" onClick={() => onOpenChange(false)}>
        Отмена
      </Button>
      <Button disabled={!name} pending={saving} pendingLabel="Сохраняем…" trailing={count ?? undefined} onClick={() => void save()}>
        Сохранить
      </Button>
    </div>
  );

  const title = set ? "Изменить набор" : "Новый набор";

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      nested
      height="full"
      dialogWidth={560}
      title={title}
      description="Карточки для повторения по условиям"
      footer={footer}
      onOpenAutoFocus={(e) => e.preventDefault()}
    >
      <div className="flex h-11 shrink-0 items-center justify-between pr-1 pl-4">
        <SheetTitle>{title}</SheetTitle>
        <SheetCloseButton />
      </div>
      <div className="px-4 pb-4">
        <label htmlFor={nameId} className="meta mt-2 block font-medium">
          Название
        </label>
        <input
          id={nameId}
          type="text"
          value={draft.name}
          maxLength={REVIEW_SET_NAME_MAX}
          onChange={(e) => patch({ name: e.target.value })}
          placeholder="Например, «Арго для метро»"
          autoComplete="off"
          enterKeyHint="done"
          className="mt-1.5 h-11 w-full rounded-chip border border-rule bg-surface px-3 font-serif text-[19px] text-ink outline-none placeholder:font-sans placeholder:text-[15px] placeholder:text-muted focus:border-2 focus:border-ink pointer-coarse:text-[19px]"
        />
        {error && (
          <p role="alert" className="m-0 mt-1.5 text-[13px] leading-5 text-again">
            {error}
          </p>
        )}

        <Group label="Темы" hint="ни одной = все">
          <div role="group" aria-label="Темы" className="flex flex-wrap gap-x-1.5 gap-y-3 py-2">
            {folderKeys.map((key) => (
              <Chip
                key={key}
                role="checkbox"
                selected={draft.folders.includes(key)}
                dashed={key === INBOX_KEY}
                onClick={() => patch({ folders: toggle(draft.folders, key, folderKeys) })}
              >
                {key === INBOX_KEY ? "Входящие" : folders.find((f) => f.id === key)?.name}
              </Chip>
            ))}
          </div>
        </Group>

        <Group label="Карточки" hint="ни одного = любые">
          <div role="group" aria-label="Карточки" className="flex flex-wrap gap-x-1.5 gap-y-3 py-2">
            {SET_STATUSES.map((s) => (
              <Chip key={s} role="checkbox" selected={draft.statuses.includes(s)} onClick={() => patch({ statuses: toggle(draft.statuses, s, SET_STATUSES) })}>
                {STATUS_LABELS[s]}
              </Chip>
            ))}
          </div>
        </Group>

        <Group label="Уровень сленга">
          <div role="group" aria-label="Уровень сленга" className="flex flex-wrap gap-x-1.5 gap-y-3 py-2">
            {SET_SLANG.map((k) => {
              const on = draft.slang.includes(k);
              return (
                <Chip
                  key={String(k)}
                  role="checkbox"
                  selected={on}
                  dashed={k === "verl"}
                  lang={k === 0 ? undefined : "fr"}
                  onClick={() => patch({ slang: toggle(draft.slang, k, SET_SLANG) })}
                  className="gap-1.5 font-serif text-[15px] italic"
                >
                  {k !== "verl" && <Segments level={k} selected={on} />}
                  {k === "verl" ? "verl." : SLANG_LABELS[k]}
                </Chip>
              );
            })}
          </div>
        </Group>

        <Group label="Добавлены">
          <div role="radiogroup" aria-label="Добавлены" className="flex flex-wrap gap-x-1.5 gap-y-3 py-2">
            {(["all", "week", "month"] as const).map((a) => (
              <Chip key={a} role="radio" selected={draft.added === a} onClick={() => patch({ added: a })}>
                {ADDED_LABELS[a]}
              </Chip>
            ))}
          </div>
        </Group>

        <Group label="Как повторять">
          <Segmented options={MODE_OPTIONS} value={draft.mode} onChange={(mode) => patch({ mode })} ariaLabel="Как повторять" className="mt-2" />
          <p className="m-0 mt-2 text-[12px] leading-4 text-muted" role="status">
            {count === undefined
              ? "Считаем карточки…"
              : count === 0
                ? "Под эти условия сейчас ничего не подходит."
                : draft.mode === "practice"
                  ? `${cards(count)} вперемешку. Расписание не меняется.`
                  : `Сейчас ${cards(count)} к повторению. Оценки сдвигают интервалы, как обычно.`}
          </p>
        </Group>

        {onDelete && (
          <Button variant="danger" size="sm" className="mt-6" onClick={onDelete}>
            Удалить набор
          </Button>
        )}
        {count !== undefined && count > 0 && draft.folders.length === 0 && draft.statuses.length === 0 && draft.slang.length === 0 && draft.added === "all" && (
          <p className="m-0 mt-4 text-[12px] leading-4 text-muted">Без условий набор — это все темы целиком.</p>
        )}
      </div>
    </Sheet>
  );
}
