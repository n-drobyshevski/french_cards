"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { CheckMark } from "@/components/library/Checkbox";
import { SETTINGS_PAGES } from "@/components/settings/format";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icons";
import { Segmented } from "@/components/ui/Segmented";
import { useSnackbar } from "@/components/ui/Snackbar";
import { Toggle } from "@/components/ui/Toggle";
import { focusSummary } from "@/lib/core/exercise-focus";
import { db, liveRows } from "@/lib/db";
import {
  autoLevelOf,
  buildRequestText,
  CONJ_REQUEST_SIZES,
  EXERCISE_LEVELS,
  levelsText,
  NEW_WORDS_MAX,
  REQUEST_SIZES,
  requestSentence,
  requestWords,
  SCOPE_LABELS,
  TOPIC_MAX,
  useScopeCounts,
  type ExerciseLevel,
  type RequestSentence,
  type ScopeCounts,
} from "@/lib/exercises";
import { listFolders } from "@/lib/folders";
import type { ExerciseScope, ExerciseSet } from "@/lib/types";
import { useLevelData } from "@/lib/use-level-data";
import { useExerciseFocus } from "@/lib/user-prefs";
import { CLAUDE_NEW_CHAT_URL, copyRequest } from "./clipboard";
import { INBOX_KEY, INBOX_NAME, levelHint, requestSummary, type RequestChoice } from "./list-format";

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

/**
 * «Авто»'s level now (the request's «уровня ≈B1»): the median level of the neutral words the request
 * would use — a scope's words, else the picked themes', else every theme's not «на паузе»
 * (requestWords, autoLevelOf: as the connector's exercise_material does). Null while loading or
 * when none has a level.
 */
function useAutoLevel(picked: readonly string[], scope: ExerciseScope | null): ExerciseLevel | null {
  const levels = useLevelData();
  const key = picked.join("|");
  const words = useLiveQuery(async () => {
    const [folders, words, states] = await Promise.all([liveRows(db.folders), liveRows(db.words), scope ? liveRows(db.review_state) : []]);
    return requestWords(words, states, folders, key ? key.split("|") : [], scope);
  }, [key, scope]);
  return useMemo(() => (words ? autoLevelOf(words, (w) => levels.level(w)?.level ?? null) : null), [words, levels]);
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
   * Phones (X-Request-B, pick E2 B): the request sheet and the empty state (`variant` "sheet" /
   * "page") show the kind row, the request as one sentence with slots that open in place, and the
   * two hand-off steps (`RequestComposer`); the copied text is `requestSentence`. Desktop keeps
   * the builder below and `buildRequestText`.
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
 * muted line saying so («Чаще трудные · половина набора · Настройки ›»). No network call: Claude
 * writes the set in the chat through the connector. Phones (`compact`) get `RequestComposer`
 * instead, whose hand-off button carries the spark (X-Request-B); this desktop builder has none.
 */
export function RequestBuilder({ variant, themes, sets, online, onCopied, onHelp, compact = false, className }: RequestBuilderProps) {
  const snackbar = useSnackbar();
  const ids = useId();
  const [picked, setPicked] = useState<readonly string[]>([]);
  const [topicOpen, setTopicOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [size, setSize] = useState<number>(12);
  const [allowNew, setAllowNew] = useState(true);
  // «Уровень набора» (pick L1 A; several at once since 2026-10-25): none = «Авто», the level of the words.
  const [levels, setLevels] = useState<readonly ExerciseLevel[]>([]);
  // «Спряжение глаголов»: its own sizes (a short test), so switching it off keeps the usual size.
  const [conjugation, setConjugation] = useState(false);
  const [verbSize, setVerbSize] = useState<number>(8);
  // «Откуда слова» (phones: the kind row): null = the themes below. A scope whose words are gone
  // (all reviewed, paused) falls back to the themes.
  const [scopePick, setScopePick] = useState<ExerciseScope | null>(null);
  const counts = useScopeCounts();
  const scope = scopePick && counts && counts[scopePick] > 0 ? scopePick : null;
  const [copiedAt, setCopiedAt] = useState(0);
  const topicRef = useRef<HTMLInputElement>(null);
  const focusTopic = useRef(false);
  const kind: RequestKind =
    scope === "difficult" || scope === "due"
      ? scope
      : conjugation
        ? "conjugation"
        : "themes";

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
  const autoLevel = useAutoLevel(scope ? [] : picked, scope);
  const choice: RequestChoice = {
    folders: chosen.map((t) => t.name),
    topic: topicOpen ? topic : null,
    size: conjugation ? verbSize : size,
    allowNew: allowNew && !conjugation,
    scope,
    conjugation,
    levels,
    autoLevel,
  };
  // Phones copy the sentence they read; desktop keeps the classic text.
  const sentence = compact ? requestSentence(choice) : null;
  const text = sentence ? sentence.text : buildRequestText(choice);
  // «Чаще в упражнениях» (Settings): the connector reads it itself, so the request text stays as is;
  // the line only tells the user the set will lean that way.
  const focus = useExerciseFocus();
  // A scoped set takes only those words, so the focus setting has nothing to tilt.
  const focusLine = focus && !scope ? focusSummary(focus) : null;

  const toggleTheme = (key: string) => setPicked((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const copy = async (via: "copy" | "open") => {
    const ok = await copyRequest({ text, summary: requestSummary(choice) }, sets);
    if (ok) setCopiedAt(Date.now());
    else if (via === "copy")
      snackbar.show({
        message: compact
          ? "Не получилось скопировать"
          : "Не получилось скопировать — выделите текст запроса",
      });
    onCopied?.(ok, via);
  };

  if (sentence) {
    return (
      <RequestComposer
        framed={variant === "page"}
        className={className}
        themes={themes}
        picked={picked}
        onTheme={toggleTheme}
        kind={kind}
        counts={counts}
        onKind={(next) => {
          setScopePick(next === "difficult" || next === "due" ? next : null);
          setConjugation(next === "conjugation");
        }}
        size={conjugation ? verbSize : size}
        sizes={conjugation ? CONJ_REQUEST_SIZES : REQUEST_SIZES}
        onSize={conjugation ? setVerbSize : setSize}
        topicOpen={topicOpen}
        onTopicOpen={setTopicOpen}
        topic={topic}
        onTopic={setTopic}
        allowNew={allowNew}
        onAllowNew={setAllowNew}
        levels={levels}
        autoLevel={autoLevel}
        onLevels={setLevels}
        sentence={sentence}
        focusLine={focusLine}
        online={online}
        copied={copiedAt > 0}
        onCopy={(via) => void copy(via)}
        onHelp={onHelp}
      />
    );
  }

  const panel = variant === "panel";
  // «Настройки ›» under the request: the desktop page's section, or the phone sub-screen.
  const wideLayout = panel || variant === "page";
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

      <div className="flex flex-col border-t border-rule py-1.5">
        <div className="flex min-h-10 items-center gap-2">
          <span id={`${ids}-level`} className="flex-1 text-[15px] leading-5">
            Уровень
          </span>
          <LevelToggles labelledBy={`${ids}-level`} value={levels} onChange={setLevels} />
        </div>
        <p data-level-hint="" className="m-0 text-[12px] leading-4 text-muted">
          {levelHint(levels, autoLevel)}
        </p>
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
              href={wideLayout ? `/settings#${SETTINGS_PAGES.exercises.anchor}` : SETTINGS_PAGES.exercises.href}
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
  counts: ScopeCounts | undefined;
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

/** What the phone request asks for (X-Request-B): the four big choices above the sentence. */
export type RequestKind = "themes" | "difficult" | "due" | "conjugation";

const NBSP = " ";

/** The kind row's glyphs (24 viewBox, stroke 1.5): theme lines, a hard card, the due calendar, a conjugation table. */
function KindGlyph({ kind }: { kind: RequestKind }) {
  return (
    <svg
      aria-hidden="true"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {kind === "themes" && (
        <>
          <path d="M5 4.5v4" />
          <path d="M9 6.5h10" />
          <path d="M5 10v4" />
          <path d="M9 12h10" />
          <path d="M5 15.5v4" />
          <path d="M9 17.5h10" />
        </>
      )}
      {kind === "difficult" && (
        <>
          <rect x="8" y="3.5" width="8" height="17" rx="1" />
          <path d="M12 8.5v7" strokeWidth={2} />
        </>
      )}
      {kind === "due" && (
        <>
          <rect x="4" y="6" width="16" height="13" rx="1.5" />
          <path d="M4 9.5h16" className="stroke-red" />
          <rect
            x="15"
            y="2"
            width="5"
            height="5"
            stroke="none"
            className="fill-red"
          />
        </>
      )}
      {kind === "conjugation" && (
        <>
          <rect x="4" y="4" width="16" height="16" rx="1.5" />
          <path d="M12 4v16" />
          <path d="M4 9.33h16" />
          <path d="M4 14.67h16" />
        </>
      )}
    </svg>
  );
}

/**
 * «Что повторить»: «Слова по темам» · «Трудные 9» · «К повторению 23» · «Спряжение», one choice (a
 * radiogroup with arrow keys). A scope with no words is not drawn; «Оба» is a chat-only choice.
 */
function KindRow({
  value,
  counts,
  onChange,
}: {
  value: RequestKind;
  counts: ScopeCounts | undefined;
  onChange: (kind: RequestKind) => void;
}) {
  const options: {
    value: RequestKind;
    label: ReactNode;
    name: string;
    count?: number;
  }[] = [
    {
      value: "themes",
      label: (
        <>
          Слова
          <br />
          по темам
        </>
      ),
      name: "Слова по темам",
    },
  ];
  if (counts?.difficult)
    options.push({
      value: "difficult",
      label: "Трудные",
      name: `Трудные слова из всех тем: ${counts.difficult}`,
      count: counts.difficult,
    });
  if (counts?.due)
    options.push({
      value: "due",
      label: "К повторению",
      name: `Слова к повторению на сегодня: ${counts.due}`,
      count: counts.due,
    });
  options.push({
    value: "conjugation",
    label: "Спряжение",
    name: "Спряжение глаголов",
  });

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!step) return;
    e.preventDefault();
    const at = options.findIndex((o) => o.value === value);
    const next = (at + step + options.length) % options.length;
    onChange(options[next].value);
    e.currentTarget
      .querySelectorAll<HTMLButtonElement>("[role='radio']")
      [next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label="Что повторить"
      onKeyDown={onKeyDown}
      className="grid gap-1.5"
      // minmax(0, auto): on a 360px phone the labels wrap (hyphenated) instead of pushing the row wider.
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, auto))` }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.name}
            tabIndex={on ? 0 : -1}
            data-kind={o.value}
            onClick={() => onChange(o.value)}
            className={cx(
              "press-sm relative flex h-20 min-w-0 flex-col items-start justify-between rounded-card bg-surface text-left text-ink",
              on
                ? "border-2 border-ink px-[7px] py-2 max-[374px]:px-[5px]"
                : "border border-rule px-2 py-[9px] active:bg-surface-2 max-[374px]:px-1.5",
            )}
          >
            <span className={cx("inline-flex", on ? "text-ink" : "text-muted")}>
              <KindGlyph kind={o.value} />
            </span>
            {o.count !== undefined && (
              <span className="absolute top-2 right-2 font-mono text-[12px] leading-4">
                {o.count}
              </span>
            )}
            <span
              lang="ru"
              className={cx(
                "max-w-full text-[13px] leading-4 hyphens-auto max-[374px]:text-[12px] max-[374px]:leading-[14px]",
                on && "font-medium",
              )}
            >
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** A level tapped on or off; the last one off is «Авто» again (none). Kept in A2…C1 order. */
const toggleLevel = (levels: readonly ExerciseLevel[], level: ExerciseLevel): ExerciseLevel[] =>
  EXERCISE_LEVELS.filter((l) => (l === level ? !levels.includes(l) : levels.includes(l)));

/**
 * The level slot's choices (X-Level-A, pick L1 A): «Авто ≈B1» · A2 · B1 · B2 · C1. Several levels
 * can be on at once (2026-10-25, «B1–B2»): each is a toggle; «Авто» clears them, and turning the
 * last one off is «Авто» again.
 */
function LevelChips({
  value,
  autoLevel,
  onChange,
}: {
  value: readonly ExerciseLevel[];
  autoLevel: ExerciseLevel | null;
  onChange: (levels: readonly ExerciseLevel[]) => void;
}) {
  return (
    <div role="group" aria-label="Уровень набора, можно несколько" className="flex flex-wrap gap-x-1.5">
      <Chip
        selected={value.length === 0}
        aria-label={autoLevel ? `Авто: по уровню выбранных слов, сейчас примерно ${autoLevel}` : "Авто: по уровню выбранных слов"}
        onClick={() => onChange([])}
        className="my-1 !h-9 min-w-11 justify-center gap-1.5 px-3"
      >
        Авто
        {autoLevel && <span className="font-mono text-[12px] font-normal opacity-70">≈{autoLevel}</span>}
      </Chip>
      {EXERCISE_LEVELS.map((l) => {
        const on = value.includes(l);
        return (
          <Chip
            key={l}
            selected={on}
            icon={on && value.length > 1 ? "check" : undefined}
            onClick={() => onChange(toggleLevel(value, l))}
            className="my-1 !h-9 min-w-11 justify-center gap-1.5 px-3"
          >
            {l}
          </Chip>
        );
      })}
    </div>
  );
}

/**
 * Desktop's «Уровень» row (D-Exercise-Level): «Авто · A2 · B1 · B2 · C1» in the «Вопросов» row's mono
 * look, several levels at once, as on phones.
 */
function LevelToggles({
  labelledBy,
  value,
  onChange,
}: {
  labelledBy: string;
  value: readonly ExerciseLevel[];
  onChange: (levels: readonly ExerciseLevel[]) => void;
}) {
  const options: { key: string; label: string; on: boolean; tap: () => void }[] = [
    { key: "auto", label: "Авто", on: value.length === 0, tap: () => onChange([]) },
    ...EXERCISE_LEVELS.map((l) => ({ key: l, label: l, on: value.includes(l), tap: () => onChange(toggleLevel(value, l)) })),
  ];
  return (
    <span role="group" aria-labelledby={labelledBy} className="-mr-2.5 inline-flex items-center">
      {options.map((o, i) => (
        <span key={o.key} className="inline-flex items-center">
          {i > 0 && <span aria-hidden="true" className="h-4 w-px bg-rule" />}
          <button
            type="button"
            aria-pressed={o.on}
            onClick={o.tap}
            className={cx(
              "h-8 px-2.5 font-mono text-[14px] tabular-nums",
              o.on ? "font-semibold text-ink underline decoration-1 underline-offset-4" : "font-medium text-muted hoverable:text-ink",
            )}
          >
            {o.label}
          </button>
        </span>
      ))}
    </span>
  );
}

/**
 * A slot in the request sentence: the ink-underlined words that open their choice in place
 * (the count, the themes) or flip it (new words). The open one sits on a `surface-2` band one line
 * (38px) tall; a 3px band above and below makes the tap area 44px. (A button lays out as an inline
 * block even with `display: inline`, so vertical padding would push the lines apart.)
 */
function Slot({
  open,
  label,
  controls,
  onClick,
  children,
}: {
  /** undefined: a toggle, not a disclosure. */
  open?: boolean;
  label: string;
  controls?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={open ? controls : undefined}
      aria-label={label}
      onClick={onClick}
      className={cx(
        "relative -mx-0.5 inline rounded-[2px] px-0.5 font-medium text-ink underline decoration-ink underline-offset-[5px] active:text-muted",
        "before:absolute before:-inset-y-[3px] before:inset-x-0 before:content-['']",
        open ? "bg-surface-2 decoration-2" : "decoration-[1.5px]",
      )}
    >
      {children}
    </button>
  );
}

/** «1», «2»: the step numbers of the hand-off. */
function StepNo({ n }: { n: number }) {
  return (
    <span
      aria-hidden="true"
      className="w-3.5 shrink-0 font-mono text-[13px] font-medium"
    >
      {n}
    </span>
  );
}

/**
 * The phone request (X-Request-B, pick E2 B; RequestBuilder `compact`: the request sheet and the
 * empty state): the kind row, then the request as one Newsreader sentence whose underlined slots open
 * in place — «Сделай в Карточках [12 вопросов] по темам [Еда, Полиция] — [можно новые слова].» —
 * and is the very text copied; then two steps, «1 · Скопировать и открыть Claude» (spark ↗) and
 * «2 · Вставьте в чат и отправьте», with «Только скопировать» and «Нет коннектора? ›» under them.
 */
function RequestComposer({
  framed,
  className,
  themes,
  picked,
  onTheme,
  kind,
  counts,
  onKind,
  size,
  sizes,
  onSize,
  topicOpen,
  onTopicOpen,
  topic,
  onTopic,
  allowNew,
  onAllowNew,
  levels,
  autoLevel,
  onLevels,
  sentence,
  focusLine,
  online,
  copied,
  onCopy,
  onHelp,
}: {
  /** The empty state: a region named «Запрос для Claude» (the sheet is the dialog itself). */
  framed: boolean;
  className?: string;
  themes: readonly ThemeChoice[];
  picked: readonly string[];
  onTheme: (key: string) => void;
  kind: RequestKind;
  counts: ScopeCounts | undefined;
  onKind: (kind: RequestKind) => void;
  size: number;
  sizes: readonly number[];
  onSize: (size: number) => void;
  topicOpen: boolean;
  onTopicOpen: (open: boolean) => void;
  topic: string;
  onTopic: (topic: string) => void;
  allowNew: boolean;
  onAllowNew: (on: boolean) => void;
  /** «Уровень набора»: one or several; none = «Авто». */
  levels: readonly ExerciseLevel[];
  autoLevel: ExerciseLevel | null;
  onLevels: (levels: readonly ExerciseLevel[]) => void;
  sentence: RequestSentence;
  focusLine: string | null;
  online: boolean;
  copied: boolean;
  onCopy: (via: "copy" | "open") => void;
  onHelp?: () => void;
}) {
  const ids = useId();
  // The themes are open at first: they are the first thing to choose.
  const [open, setOpen] = useState<"size" | "level" | "themes" | null>("themes");
  const topicRef = useRef<HTMLInputElement>(null);
  const focusTopic = useRef(false);
  const themesOpen = open === "themes" && sentence.themes !== null;
  const toggle = (slot: "size" | "level" | "themes") =>
    setOpen((now) => (now === slot ? null : slot));

  useEffect(() => {
    if (topicOpen && focusTopic.current) {
      focusTopic.current = false;
      topicRef.current?.focus();
    }
  }, [topicOpen]);

  // «по темам», «по теме», «на тему» stay with the slot; a scope's longer phrase wraps freely.
  const where =
    sentence.where.split(" ").length <= 2
      ? sentence.where.replace(/ /g, NBSP)
      : sentence.where;
  const Root = framed ? "section" : "div";

  return (
    <Root
      aria-label={framed ? "Запрос для Claude" : undefined}
      className={cx("flex flex-col", className)}
    >
      <KindRow value={kind} counts={counts} onChange={onKind} />

      <div
        role="group"
        aria-label={`Запрос для Claude: ${sentence.text}`}
        className="mt-[22px]"
      >
        <p
          data-request-sentence=""
          className="m-0 font-serif text-[25px] leading-[38px] tracking-[-0.005em] text-pretty text-ink"
        >
          Сделай в{NBSP}Карточках{" "}
          <Slot
            open={open === "size"}
            label={`Вопросов: ${size}, изменить`}
            controls={`${ids}-size`}
            onClick={() => toggle("size")}
          >
            {sentence.size.replace(" ", NBSP)}
          </Slot>{" "}
          <Slot
            open={open === "level"}
            label={`Уровень: ${levels.length ? levelsText(levels) : autoLevel ? `авто, примерно ${autoLevel}` : "авто"}, изменить`}
            controls={`${ids}-level`}
            onClick={() => toggle("level")}
          >
            {sentence.level.replace(" ", NBSP)}
          </Slot>
          {sentence.what && ` ${sentence.what}`} {where}
          {sentence.themes !== null && (
            <>
              {NBSP}
              <Slot
                open={themesOpen}
                label={`Темы: ${sentence.themes}, изменить`}
                controls={`${ids}-themes`}
                onClick={() => toggle("themes")}
              >
                {sentence.themes}
              </Slot>
            </>
          )}
          {sentence.fresh && (
            <>
              {NBSP}—{" "}
              <Slot
                label={`Новые слова: ${allowNew ? "можно" : "без них"}, изменить`}
                onClick={() => onAllowNew(!allowNew)}
              >
                {sentence.fresh}
              </Slot>
            </>
          )}
          .
        </p>
      </div>

      {open === "size" && (
        <div
          id={`${ids}-size`}
          className="mt-2.5 flex h-14 items-center gap-2 rounded-card bg-surface-2 px-3"
        >
          <span
            id={`${ids}-size-label`}
            className="flex-1 text-[15px] leading-5"
          >
            Вопросов
          </span>
          <Segmented<number>
            options={sizes.map((n) => ({ value: n, label: String(n) }))}
            value={size}
            onChange={onSize}
            ariaLabelledby={`${ids}-size-label`}
            mono
          />
        </div>
      )}

      {open === "level" && (
        <div id={`${ids}-level`} className="mt-2.5 flex flex-col rounded-card bg-surface-2 px-2 py-1">
          <LevelChips value={levels} autoLevel={autoLevel} onChange={onLevels} />
          <p data-level-hint="" className="m-0 mx-2 mt-1 mb-2 text-[13px] leading-[18px] text-muted">
            {levelHint(levels, autoLevel)}
          </p>
        </div>
      )}

      {themesOpen && (
        <div
          id={`${ids}-themes`}
          className="mt-2.5 flex flex-col rounded-card bg-surface-2 px-2 py-1"
        >
          <div
            role="group"
            aria-label="Темы, можно несколько"
            className="flex flex-wrap gap-x-1.5"
          >
            {themes.map((t) => {
              const on = picked.includes(t.key);
              return (
                <Chip
                  key={t.key}
                  selected={on}
                  icon={on ? "check" : undefined}
                  onClick={() => onTheme(t.key)}
                  className="my-1 !h-9 gap-1.5 px-3"
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
                onTopicOpen(!topicOpen);
              }}
              className="my-1 !h-9 bg-transparent px-3 aria-pressed:border-ink aria-pressed:font-medium"
            >
              + своя тема
            </Chip>
          </div>
          {topicOpen && (
            <div className="my-1 flex h-12 items-center gap-1 rounded-chip border-2 border-ink bg-surface pr-1 pl-3">
              <input
                ref={topicRef}
                id={`${ids}-topic`}
                type="text"
                aria-label="Своя тема"
                placeholder="Своя тема"
                value={topic}
                maxLength={TOPIC_MAX}
                autoComplete="off"
                enterKeyHint="done"
                onChange={(e) => onTopic(e.target.value)}
                className="h-11 min-w-0 flex-1 bg-transparent text-[16px] leading-5 text-ink outline-none placeholder:text-muted"
              />
              <button
                type="button"
                aria-label="Очистить тему"
                onClick={() => {
                  onTopic("");
                  onTopicOpen(false);
                }}
                className="press-sm inline-flex size-10 shrink-0 items-center justify-center rounded-chip text-muted active:bg-surface-2"
              >
                <Icon name="close" size={16} strokeWidth={1.5} />
              </button>
            </div>
          )}
        </div>
      )}

      {focusLine && (
        <p
          data-exercise-focus=""
          className="m-0 mt-2 flex items-center gap-1 text-[12px] leading-4 text-muted"
        >
          <span className="min-w-0 truncate">{focusLine}</span>
          <span aria-hidden="true">·</span>
          <Link
            href={SETTINGS_PAGES.exercises.href}
            className="-my-3.5 inline-flex h-11 shrink-0 items-center text-muted underline decoration-rule decoration-1 underline-offset-2 active:text-ink"
          >
            Настройки ›
          </Link>
        </p>
      )}

      <ol className="m-0 mt-[22px] flex list-none flex-col border-t border-ink p-0">
        <li className="flex items-center gap-3 pt-3">
          <StepNo n={1} />
          {online ? (
            <a
              href={CLAUDE_NEW_CHAT_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => onCopy("open")}
              className={buttonClasses({
                variant: "primary",
                size: "lg",
                className: "min-w-0 flex-1 gap-2 px-2.5 max-[374px]:text-[14px] min-[375px]:gap-2.5",
              })}
            >
              <Icon
                name={copied ? "check" : "spark"}
                size={18}
                strokeWidth={copied ? 1.75 : 1.5}
              />
              <span className="truncate">
                {copied ? "Скопировано" : "Скопировать и открыть Claude"}
              </span>
              {!copied && (
                <Icon
                  name="external"
                  size={16}
                  strokeWidth={1.5}
                  className="shrink-0 opacity-70"
                />
              )}
            </a>
          ) : (
            <Button className="min-w-0 flex-1" onClick={() => onCopy("copy")}>
              {copied ? <Icon name="check" size={18} /> : <CopyGlyph />}
              {copied ? "Скопировано" : "Скопировать запрос"}
            </Button>
          )}
        </li>
        <li className="flex min-h-14 items-center gap-3 py-2">
          <StepNo n={2} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[15px] leading-5 font-medium">
              Вставьте в чат и отправьте
            </span>
            <span className="text-[13px] leading-[18px] text-muted">
              {online
                ? "Набор сам появится в «Упражнениях»"
                : "Когда будет сеть — набор сам появится в «Упражнениях»"}
              {/* The phone list no longer says it (E1 A); the empty state's intro line does. */}
              {!framed && ", на расписание не влияет"}
            </span>
          </span>
          <span
            aria-hidden="true"
            className="flex h-[38px] w-[30px] shrink-0 flex-col gap-1 rounded-[3px] border border-dashed border-boundary px-[5px] py-[7px]"
          >
            <span className="h-[3px] w-full bg-rule" />
            <span className="h-[3px] w-[70%] bg-rule" />
          </span>
        </li>
      </ol>
      {(online || onHelp) && (
        <div className="mt-0.5 flex items-center justify-between pl-[26px]">
          {online ? (
            <button
              type="button"
              onClick={() => onCopy("copy")}
              className="inline-flex h-11 items-center text-[13px] text-muted underline decoration-rule decoration-1 underline-offset-4 active:text-ink"
            >
              Только скопировать
            </button>
          ) : (
            <span />
          )}
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
      <span role="status" className="sr-only">
        {copied ? "Запрос скопирован. Вставьте его в чат Claude." : ""}
      </span>
    </Root>
  );
}
