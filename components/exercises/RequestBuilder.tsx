"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { CheckMark } from "@/components/library/Checkbox";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { cx } from "@/components/ui/cx";
import { FoldRow, foldSummary } from "@/components/ui/FoldRow";
import { Icon } from "@/components/ui/Icons";
import { Segmented } from "@/components/ui/Segmented";
import { useSnackbar } from "@/components/ui/Snackbar";
import { Toggle } from "@/components/ui/Toggle";
import { focusSummary } from "@/lib/core/exercise-focus";
import { db, liveRows } from "@/lib/db";
import { buildRequestText, CONJ_REQUEST_SIZES, NEW_WORDS_MAX, REQUEST_SIZES, SCOPE_LABELS, TOPIC_MAX, useScopeCounts } from "@/lib/exercises";
import { listFolders } from "@/lib/folders";
import type { ExerciseScope, ExerciseSet } from "@/lib/types";
import { useExerciseFocus } from "@/lib/user-prefs";
import { CLAUDE_NEW_CHAT_URL, copyRequest } from "./clipboard";
import { INBOX_KEY, INBOX_NAME, requestSummary, type RequestChoice } from "./list-format";

/** A theme chip: «Входящие» (key "inbox") or a theme, with its live, unpaused word count. */
export interface ThemeChoice {
  key: string;
  name: string;
  count: number;
}

/**
 * The themes a request can name, in library order: «Входящие» first while it holds words, then
 * every theme with words (an empty theme gives Claude nothing to ask about). Undefined while loading.
 */
export function useThemeChoices(): ThemeChoice[] | undefined {
  return useLiveQuery(async () => {
    const [folders, words] = await Promise.all([listFolders(), liveRows(db.words)]);
    const counts = new Map<string, number>();
    const ids = new Set(folders.map((f) => f.id));
    for (const w of words) {
      if (w.muted) continue;
      const key = w.folder_id !== null && ids.has(w.folder_id) ? w.folder_id : INBOX_KEY;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const out: ThemeChoice[] = [];
    const inbox = counts.get(INBOX_KEY) ?? 0;
    if (inbox > 0) out.push({ key: INBOX_KEY, name: INBOX_NAME, count: inbox });
    for (const f of folders) {
      const count = counts.get(f.id) ?? 0;
      if (count > 0) out.push({ key: f.id, name: f.name, count });
    }
    return out;
  }, []);
}

/** The copy glyph of the boards (two sheets). */
export function CopyGlyph({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="8.5" y="8.5" width="11" height="12" rx="1" />
      <path d="M15.5 8.5V4.5a1 1 0 0 0-1-1h-9a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h3" />
    </svg>
  );
}

/** How long «Скопировано» stays on the button. */
const COPIED_MS = 2000;

export type RequestBuilderVariant = "page" | "sheet" | "panel";

export interface RequestBuilderProps {
  /**
   * page: the card in the empty state (Exercise-Empty-A). sheet: inside «Попросить набор»
   * (Exercise-S-Request-Sheet). panel: the desktop right column (D-Exercise-List).
   */
  variant: RequestBuilderVariant;
  themes: readonly ThemeChoice[];
  /** The sets on the device now: a newer one ends «Ждём набор из чата». */
  sets: readonly ExerciseSet[];
  online: boolean;
  /** After «Скопировать запрос» or «Открыть Claude» (ok: the text reached the clipboard). */
  onCopied?: (ok: boolean, via: "copy" | "open") => void;
  /** «Нет коннектора? ›» (sheet and panel; the page puts its own link under the card). */
  onHelp?: () => void;
  /**
   * Phones, the empty state (proposals «Empty» B): no card frame, one chip flow («Трудные 9»,
   * «К повторению 23», then the themes), «Вопросов», everything else under «Ещё ⌄», and one primary
   * «Скопировать и открыть Claude ↗» with «только скопировать» under it.
   */
  compact?: boolean;
  className?: string;
}

/**
 * The request builder (SPEC «Упражнения», D7 A): «Откуда слова» (themes, or only the difficult /
 * due words of every theme: Exercise-S-Request-Scope), theme chips (several, «Входящие» included), a
 * free-text «своя тема», «Спряжение глаголов» (a short verb test: 6 / 8 / 10 questions, no new
 * words), 8 / 12 / 16 questions, «Можно новые слова», the request text built live,
 * «Скопировать запрос» and «Открыть Claude ↗» (copies first), and while «Чаще в упражнениях» is on, a
 * muted line saying so («Чаще трудные · половина набора · Настройки ›»). No network call and no
 * spark: Claude writes the set in the chat through the connector.
 */
export function RequestBuilder({ variant, themes, sets, online, onCopied, onHelp, compact = false, className }: RequestBuilderProps) {
  const snackbar = useSnackbar();
  const ids = useId();
  const [picked, setPicked] = useState<readonly string[]>([]);
  const [topicOpen, setTopicOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [size, setSize] = useState<number>(12);
  const [allowNew, setAllowNew] = useState(true);
  // «Спряжение глаголов»: its own sizes (a short test), so switching it off keeps the usual size.
  const [conjugation, setConjugation] = useState(false);
  const [verbSize, setVerbSize] = useState<number>(8);
  // «Откуда слова»: null = the themes below. A scope whose words are gone (all reviewed, paused)
  // falls back to the themes.
  const [scopePick, setScopePick] = useState<ExerciseScope | null>(null);
  const counts = useScopeCounts();
  const scope = scopePick && counts && counts[scopePick] > 0 ? scopePick : null;
  const [copiedAt, setCopiedAt] = useState(0);
  const topicRef = useRef<HTMLInputElement>(null);
  const focusTopic = useRef(false);

  useEffect(() => {
    if (!copiedAt) return;
    const timer = window.setTimeout(() => setCopiedAt(0), COPIED_MS);
    return () => window.clearTimeout(timer);
  }, [copiedAt]);

  useEffect(() => {
    if (topicOpen && focusTopic.current) {
      focusTopic.current = false;
      topicRef.current?.focus();
    }
  }, [topicOpen]);

  const chosen = themes.filter((t) => picked.includes(t.key));
  const choice: RequestChoice = {
    folders: chosen.map((t) => t.name),
    // Compact: the topic field sits under «Ещё» with no chip, so it counts once it has text.
    topic: compact ? (topic.trim() ? topic : null) : topicOpen ? topic : null,
    size: conjugation ? verbSize : size,
    allowNew: allowNew && !conjugation,
    scope,
    conjugation,
  };
  const text = buildRequestText(choice);
  // «Чаще в упражнениях» (Settings): the connector reads it itself, so the request text stays as is;
  // the line only tells the user the set will lean that way.
  const focus = useExerciseFocus();
  // A scoped set takes only those words, so the focus setting has nothing to tilt.
  const focusLine = focus && !scope ? focusSummary(focus) : null;

  const toggleTheme = (key: string) => setPicked((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const copy = async (via: "copy" | "open") => {
    const ok = await copyRequest({ text, summary: requestSummary(choice) }, sets);
    if (ok) setCopiedAt(Date.now());
    else if (via === "copy") snackbar.show({ message: "Не получилось скопировать — выделите текст запроса" });
    onCopied?.(ok, via);
  };

  if (compact) {
    return (
      <CompactBuilder
        className={className}
        themes={themes}
        picked={picked}
        onTheme={(key) => {
          setScopePick(null);
          toggleTheme(key);
        }}
        scope={scope}
        counts={counts}
        onScope={(next) => {
          setScopePick(next);
          if (next) setPicked([]);
        }}
        size={size}
        onSize={setSize}
        conjugation={conjugation}
        onConjugation={setConjugation}
        verbSize={verbSize}
        onVerbSize={setVerbSize}
        topic={topic}
        onTopic={setTopic}
        allowNew={allowNew}
        onAllowNew={setAllowNew}
        text={text}
        focusLine={focusLine}
        online={online}
        copied={copiedAt > 0}
        onCopy={(via) => void copy(via)}
      />
    );
  }

  const panel = variant === "panel";
  const label = "meta flex items-baseline justify-between leading-4";
  const newCaption = variant === "page" ? "Claude поищет их в вебе" : `Claude поищет их в вебе, до ${NEW_WORDS_MAX} в наборе`;

  const body = (
    <>
      <span id={`${ids}-from`} className="meta leading-4">
        Откуда слова
      </span>
      <ScopeChips labelledBy={`${ids}-from`} value={scope} counts={counts} onChange={setScopePick} />
      {scope && (
        <p data-scope-caption="" className="m-0 mt-2 text-[12px] leading-4 text-muted">
          {SCOPE_CAPTIONS[scope]}
        </p>
      )}

      {!scope && (
        <>
          <div className={cx(label, "mt-3.5")}>
            <span id={`${ids}-themes`}>Темы</span>
            {variant !== "page" && <span>можно несколько</span>}
          </div>
          <div role="group" aria-labelledby={`${ids}-themes`} className="mt-2 flex flex-wrap gap-1.5">
            {themes.map((t) => {
              const on = picked.includes(t.key);
              return (
                <Chip
                  key={t.key}
                  selected={on}
                  icon={on ? "check" : undefined}
                  count={variant === "page" ? undefined : t.count}
                  onClick={() => toggleTheme(t.key)}
                  className="!h-9 gap-1.5 px-3"
                >
                  {t.name}
                </Chip>
              );
            })}
            <Chip
              dashed
              aria-pressed={topicOpen}
              aria-controls={topicOpen ? `${ids}-topic` : undefined}
              onClick={() => {
                focusTopic.current = !topicOpen;
                setTopicOpen((open) => !open);
              }}
              className="!h-9 px-3 aria-pressed:border-ink aria-pressed:font-medium"
            >
              + своя тема
            </Chip>
          </div>

          {topicOpen && (
            <div className="mt-3.5 flex flex-col">
              <label htmlFor={`${ids}-topic`} className="meta leading-4">
                Своя тема
              </label>
              <div className="mt-1.5 flex h-12 items-center gap-1 rounded-chip border-2 border-ink bg-surface pr-1 pl-3">
                <input
                  ref={topicRef}
                  id={`${ids}-topic`}
                  type="text"
                  value={topic}
                  maxLength={TOPIC_MAX}
                  autoComplete="off"
                  enterKeyHint="done"
                  onChange={(e) => setTopic(e.target.value)}
                  className="h-11 min-w-0 flex-1 bg-transparent text-[16px] leading-5 text-ink outline-none placeholder:text-muted"
                />
                <button
                  type="button"
                  aria-label="Очистить тему"
                  onClick={() => {
                    setTopic("");
                    setTopicOpen(false);
                  }}
                  className="press-sm inline-flex size-10 shrink-0 items-center justify-center rounded-chip text-muted active:bg-surface-2"
                >
                  <Icon name="close" size={16} strokeWidth={1.5} />
                </button>
              </div>
              <p className="m-0 mt-1.5 text-[12px] leading-4 text-muted">Claude подберёт слова из библиотеки и, если можно, новые.</p>
            </div>
          )}
        </>
      )}

      <SwitchRow
        panel={panel}
        id={`${ids}-verbs`}
        label="Спряжение глаголов"
        caption="Только глаголы, короткий тест"
        checked={conjugation}
        onChange={setConjugation}
        className={scope || topicOpen ? "mt-3" : "mt-2.5"}
      />

      <div className="flex h-12 items-center gap-2 border-t border-rule">
        <span id={`${ids}-size`} className="flex-1 text-[15px] leading-5">
          Вопросов
        </span>
        <Segmented<number>
          options={(conjugation ? CONJ_REQUEST_SIZES : REQUEST_SIZES).map((n) => ({ value: n, label: String(n) }))}
          value={conjugation ? verbSize : size}
          onChange={conjugation ? setVerbSize : setSize}
          ariaLabelledby={`${ids}-size`}
          mono
        />
      </div>

      {scope || conjugation ? null : (
        <SwitchRow panel={panel} id={`${ids}-new`} label="Можно новые слова" caption={newCaption} checked={allowNew} onChange={setAllowNew} />
      )}

      <div className="flex flex-col border-t border-rule pt-2.5">
        <span id={`${ids}-text`} className="meta leading-4">
          Запрос
        </span>
        <p
          aria-labelledby={`${ids}-text`}
          className={cx(
            "m-0 mt-1.5 rounded-chip border border-rule px-3 py-2.5 font-mono text-[12px] leading-[18px] text-ink select-all",
            variant === "page" || panel ? "bg-paper" : "bg-surface",
          )}
        >
          {text}
        </p>
        {focusLine && (
          <p data-exercise-focus="" className="m-0 mt-1.5 flex items-center gap-1 text-[12px] leading-4 text-muted">
            <span className="min-w-0 truncate">{focusLine}</span>
            <span aria-hidden="true">·</span>
            <Link
              href="/settings#set-exercises"
              className="-my-3.5 inline-flex h-11 shrink-0 items-center text-muted underline decoration-rule decoration-1 underline-offset-2 hoverable:text-ink active:text-ink"
            >
              Настройки ›
            </Link>
          </p>
        )}
      </div>

      <Button block className="mt-3" onClick={() => void copy("copy")}>
        {copiedAt ? <Icon name="check" size={18} /> : <CopyGlyph />}
        {copiedAt ? "Скопировано" : "Скопировать запрос"}
      </Button>
      <span role="status" className="sr-only">
        {copiedAt ? "Запрос скопирован. Вставьте его в чат Claude." : ""}
      </span>

      {variant === "page" ? (
        <OpenClaude online={online} onOpen={() => void copy("open")} className="self-center" />
      ) : (
        <div className="mt-1 flex items-center justify-between">
          <OpenClaude online={online} onOpen={() => void copy("open")} />
          {onHelp && (
            <button
              type="button"
              onClick={onHelp}
              className="-mr-1 inline-flex h-11 items-center gap-0.5 px-1 text-[13px] text-muted active:text-ink"
            >
              Нет коннектора?
              <Icon name="chevron-right" size={14} strokeWidth={2} />
            </button>
          )}
        </div>
      )}
    </>
  );

  if (variant === "page") {
    return (
      <section aria-label="Запрос для Claude" className={cx("flex flex-col rounded-card border border-rule bg-surface px-4 pt-3.5 pb-1", className)}>
        {body}
      </section>
    );
  }
  if (panel) {
    return (
      <section aria-labelledby={`${ids}-title`} className={cx("flex flex-col rounded-[8px] border border-rule bg-surface", className)}>
        <div className="flex h-12 items-center justify-between border-b border-rule px-5">
          <h2 id={`${ids}-title`} className="m-0 font-serif text-[19px] leading-6 font-medium">
            Новый набор
          </h2>
          <span className="meta">запрос для чата</span>
        </div>
        <div className="flex flex-col px-5 pt-4 pb-2">{body}</div>
      </section>
    );
  }
  return <div className={cx("flex flex-col", className)}>{body}</div>;
}

/**
 * One on/off option with a caption: a checkbox row in the desktop panel, a switch elsewhere
 * («Спряжение глаголов», «Можно новые слова»).
 */
function SwitchRow({
  panel,
  id,
  label,
  caption,
  checked,
  onChange,
  className,
}: {
  panel: boolean;
  id: string;
  label: string;
  caption: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}) {
  if (panel) {
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx("flex min-h-[52px] items-start gap-2.5 border-t border-rule py-3 text-left", className)}
      >
        <CheckMark checked={checked} className="mt-[3px]" />
        <span className="flex min-w-0 flex-col">
          <span className="text-[15px] leading-5">{label}</span>
          <span className="text-[12px] leading-4 text-muted">{caption}</span>
        </span>
      </button>
    );
  }
  return (
    <div className={cx("flex h-[52px] items-center gap-2 border-t border-rule", className)}>
      <span className="flex min-w-0 flex-1 flex-col">
        <span id={id} className="text-[15px] leading-5">
          {label}
        </span>
        <span className="text-[12px] leading-4 text-muted">{caption}</span>
      </span>
      <Toggle checked={checked} onCheckedChange={onChange} aria-labelledby={id} />
    </div>
  );
}

/** «Открыть Claude ↗»: copies the request, then opens a new chat; offline it says «нужна сеть». */
function OpenClaude({ online, onOpen, className }: { online: boolean; onOpen: () => void; className?: string }) {
  if (!online) {
    return (
      <span aria-disabled="true" className={cx("inline-flex h-11 items-center gap-1.5 text-[15px] font-medium text-muted", className)}>
        <span className="inline-flex items-center gap-1 opacity-60">
          Открыть Claude
          <Icon name="external" size={16} strokeWidth={1.5} />
        </span>
        <span className="meta text-[10px]">нужна сеть</span>
      </span>
    );
  }
  return (
    <a
      href={CLAUDE_NEW_CHAT_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onOpen}
      className={cx(
        "inline-flex h-11 items-center gap-1 text-[15px] font-medium text-ink underline decoration-rule decoration-1 underline-offset-4 active:text-muted",
        className,
      )}
    >
      Открыть Claude
      <Icon name="external" size={16} strokeWidth={1.5} />
    </a>
  );
}

/** The caption under «Откуда слова» while a scope is chosen (Exercise-S-Request-Scope). */
const SCOPE_CAPTIONS: Record<ExerciseScope, string> = {
  difficult: "Только ваши трудные слова из всех тем. Если их мало, набор будет короче.",
  due: "Только слова к повторению на сегодня, из всех тем. Если их мало, набор будет короче.",
  both: "Трудные слова и слова к повторению из всех тем. Если их мало, набор будет короче.",
};

/** Short chip labels; the chips' accessible names use the full ones (SCOPE_LABELS). */
const SCOPE_CHIPS: readonly { value: ExerciseScope; label: string; none: string }[] = [
  { value: "difficult", label: "Трудные", none: "нет трудных слов" },
  { value: "due", label: "К повторению", none: "нет слов к повторению" },
  { value: "both", label: "Оба", none: "нет трудных слов и слов к повторению" },
];

/**
 * «Откуда слова»: «Темы» · «Трудные 9» · «К повторению 23» · «Оба 28», one choice (a radiogroup
 * with arrow keys). A scope with no words is disabled and says why in its name; until the counts
 * are read only «Темы» can be picked.
 */
function ScopeChips({
  labelledBy,
  value,
  counts,
  onChange,
}: {
  labelledBy: string;
  value: ExerciseScope | null;
  counts: { difficult: number; due: number; both: number } | undefined;
  onChange: (scope: ExerciseScope | null) => void;
}) {
  const options: { value: ExerciseScope | null; label: string; count?: number; name: string; disabled: boolean }[] = [
    { value: null, label: "Темы", name: "Темы", disabled: false },
    ...SCOPE_CHIPS.map((o) => {
      const count = counts?.[o.value];
      const disabled = !count;
      return {
        value: o.value,
        label: o.label,
        count,
        name: count === undefined ? SCOPE_LABELS[o.value] : count === 0 ? `${SCOPE_LABELS[o.value]}: ${o.none}` : `${SCOPE_LABELS[o.value]}: ${count}`,
        disabled,
      };
    }),
  ];

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const enabled = options.filter((o) => !o.disabled);
    const at = enabled.findIndex((o) => o.value === value);
    const next = enabled[(at + step + enabled.length) % enabled.length];
    onChange(next.value);
    const radios = e.currentTarget.querySelectorAll<HTMLButtonElement>("[role='radio']");
    radios[options.indexOf(next)]?.focus();
  };

  return (
    <div role="radiogroup" aria-labelledby={labelledBy} onKeyDown={onKeyDown} className="mt-2 flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Chip
            key={o.value ?? "themes"}
            role="radio"
            selected={on}
            count={o.count}
            disabled={o.disabled}
            aria-label={o.name}
            title={o.disabled && o.count === 0 ? o.name : undefined}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            data-scope={o.value ?? "themes"}
            className="!h-9 gap-1.5 px-2.5"
          >
            {o.label}
          </Chip>
        );
      })}
    </div>
  );
}

/** The phone empty state's builder (RequestBuilder `compact`): the same choice, fewer rows. */
function CompactBuilder({
  className,
  themes,
  picked,
  onTheme,
  scope,
  counts,
  onScope,
  size,
  onSize,
  conjugation,
  onConjugation,
  verbSize,
  onVerbSize,
  topic,
  onTopic,
  allowNew,
  onAllowNew,
  text,
  focusLine,
  online,
  copied,
  onCopy,
}: {
  className?: string;
  themes: readonly ThemeChoice[];
  picked: readonly string[];
  onTheme: (key: string) => void;
  scope: ExerciseScope | null;
  counts: { difficult: number; due: number; both: number } | undefined;
  onScope: (scope: ExerciseScope | null) => void;
  size: number;
  onSize: (size: number) => void;
  conjugation: boolean;
  onConjugation: (on: boolean) => void;
  verbSize: number;
  onVerbSize: (size: number) => void;
  topic: string;
  onTopic: (topic: string) => void;
  allowNew: boolean;
  onAllowNew: (on: boolean) => void;
  text: string;
  focusLine: string | null;
  online: boolean;
  copied: boolean;
  onCopy: (via: "copy" | "open") => void;
}) {
  const ids = useId();
  // «Оба» stays a chat-only choice; a scope with no words is left out of the flow.
  const scopes = SCOPE_CHIPS.filter((o) => o.value !== "both" && (counts?.[o.value] ?? 0) > 0);
  const summary = foldSummary([!scope && "своя тема", !scope && !conjugation && "новые слова", "текст запроса"]);

  return (
    <section aria-label="Запрос для Claude" className={cx("flex flex-col", className)}>
      <div role="group" aria-label="Из чего составить" className="flex flex-wrap gap-1.5">
        {scopes.map((o) => {
          const count = counts?.[o.value] ?? 0;
          return (
            <Chip
              key={o.value}
              selected={scope === o.value}
              count={count}
              aria-label={`${SCOPE_LABELS[o.value]}: ${count}`}
              data-scope={o.value}
              onClick={() => onScope(scope === o.value ? null : o.value)}
              className="!h-9 gap-1.5 px-3"
            >
              {o.label}
            </Chip>
          );
        })}
        {themes.map((t) => {
          const on = !scope && picked.includes(t.key);
          return (
            <Chip key={t.key} selected={on} icon={on ? "check" : undefined} onClick={() => onTheme(t.key)} className="!h-9 gap-1.5 px-3">
              {t.name}
            </Chip>
          );
        })}
      </div>

      <div className="mt-4 flex h-12 items-center gap-2 border-t border-rule">
        <span id={`${ids}-verbs`} className="flex-1 text-[15px] leading-5">
          Спряжение глаголов
        </span>
        <Toggle checked={conjugation} onCheckedChange={onConjugation} aria-labelledby={`${ids}-verbs`} />
      </div>
      <div className="flex h-12 items-center gap-2 border-y border-rule">
        <span id={`${ids}-size`} className="flex-1 text-[15px] leading-5">
          Вопросов
        </span>
        <Segmented<number>
          options={(conjugation ? CONJ_REQUEST_SIZES : REQUEST_SIZES).map((n) => ({ value: n, label: String(n) }))}
          value={conjugation ? verbSize : size}
          onChange={conjugation ? onVerbSize : onSize}
          ariaLabelledby={`${ids}-size`}
          mono
        />
      </div>
      <FoldRow summary={summary} rule="bottom" bodyClassName="px-px">
        <div className="flex flex-col pb-3">
          {scope ? (
            <p data-scope-caption="" className="m-0 text-[12px] leading-4 text-muted">
              {SCOPE_CAPTIONS[scope]}
            </p>
          ) : (
            <>
              <label htmlFor={`${ids}-topic`} className="meta leading-4">
                Своя тема
              </label>
              <input
                id={`${ids}-topic`}
                type="text"
                value={topic}
                maxLength={TOPIC_MAX}
                autoComplete="off"
                enterKeyHint="done"
                onChange={(e) => onTopic(e.target.value)}
                className="mt-1.5 h-11 min-w-0 rounded-chip border border-boundary bg-surface px-3 text-[16px] leading-5 text-ink outline-none focus:border-2 focus:border-ink focus:px-[11px]"
              />
              {!conjugation && (
                <div className="mt-2 flex h-12 items-center gap-2">
                  <span id={`${ids}-new`} className="flex-1 text-[15px] leading-5">
                    Можно новые слова
                  </span>
                  <Toggle checked={allowNew} onCheckedChange={onAllowNew} aria-labelledby={`${ids}-new`} />
                </div>
              )}
            </>
          )}
          <span id={`${ids}-text`} className="meta mt-2.5 leading-4">
            Запрос
          </span>
          <p
            aria-labelledby={`${ids}-text`}
            className="m-0 mt-1.5 rounded-chip border border-rule bg-surface px-3 py-2.5 font-mono text-[12px] leading-[18px] text-ink select-all"
          >
            {text}
          </p>
          {focusLine && (
            <p data-exercise-focus="" className="m-0 mt-1.5 flex items-center gap-1 text-[12px] leading-4 text-muted">
              <span className="min-w-0 truncate">{focusLine}</span>
              <span aria-hidden="true">·</span>
              <Link
                href="/settings#set-exercises"
                className="-my-3.5 inline-flex h-11 shrink-0 items-center text-muted underline decoration-rule decoration-1 underline-offset-2 active:text-ink"
              >
                Настройки ›
              </Link>
            </p>
          )}
        </div>
      </FoldRow>

      {online ? (
        <>
          <a
            href={CLAUDE_NEW_CHAT_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onCopy("open")}
            className={buttonClasses({ variant: "primary", size: "lg", block: true, className: "mt-6 gap-2" })}
          >
            {copied && <Icon name="check" size={18} />}
            {copied ? "Скопировано" : "Скопировать и открыть Claude"}
            {!copied && <Icon name="external" size={16} strokeWidth={1.5} />}
          </a>
          <button
            type="button"
            onClick={() => onCopy("copy")}
            className="mt-1 inline-flex h-11 items-center self-center px-2 text-[14px] text-muted underline decoration-rule decoration-1 underline-offset-4 active:text-ink"
          >
            только скопировать
          </button>
        </>
      ) : (
        <>
          <Button block className="mt-6" onClick={() => onCopy("copy")}>
            {copied ? <Icon name="check" size={18} /> : <CopyGlyph />}
            {copied ? "Скопировано" : "Скопировать запрос"}
          </Button>
          <p className="meta m-0 mt-2 self-center leading-4">Claude откроется, когда будет сеть</p>
        </>
      )}
      <span role="status" className="sr-only">
        {copied ? "Запрос скопирован. Вставьте его в чат Claude." : ""}
      </span>
    </section>
  );
}
