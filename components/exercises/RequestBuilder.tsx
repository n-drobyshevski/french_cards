"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useId, useRef, useState } from "react";
import { CheckMark } from "@/components/library/Checkbox";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icons";
import { Segmented } from "@/components/ui/Segmented";
import { useSnackbar } from "@/components/ui/Snackbar";
import { Toggle } from "@/components/ui/Toggle";
import { db, liveRows } from "@/lib/db";
import { buildRequestText, NEW_WORDS_MAX, REQUEST_SIZES, TOPIC_MAX } from "@/lib/exercises";
import { listFolders } from "@/lib/folders";
import type { ExerciseSet } from "@/lib/types";
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
  className?: string;
}

/**
 * The request builder (SPEC «Упражнения», D7 A): theme chips (several, «Входящие» included), a
 * free-text «своя тема», 8 / 12 / 16 questions, «Можно новые слова», the request text built live,
 * «Скопировать запрос» and «Открыть Claude ↗» (copies first). No network call and no spark: Claude
 * writes the set in the chat through the connector.
 */
export function RequestBuilder({ variant, themes, sets, online, onCopied, onHelp, className }: RequestBuilderProps) {
  const snackbar = useSnackbar();
  const ids = useId();
  const [picked, setPicked] = useState<readonly string[]>([]);
  const [topicOpen, setTopicOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [size, setSize] = useState<number>(12);
  const [allowNew, setAllowNew] = useState(true);
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
    topic: topicOpen ? topic : null,
    size,
    allowNew,
  };
  const text = buildRequestText(choice);

  const toggleTheme = (key: string) => setPicked((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const copy = async (via: "copy" | "open") => {
    const ok = await copyRequest({ text, summary: requestSummary(choice) }, sets);
    if (ok) setCopiedAt(Date.now());
    else if (via === "copy") snackbar.show({ message: "Не получилось скопировать — выделите текст запроса" });
    onCopied?.(ok, via);
  };

  const panel = variant === "panel";
  const label = "meta flex items-baseline justify-between leading-4";
  const newCaption = variant === "page" ? "Claude поищет их в вебе" : `Claude поищет их в вебе, до ${NEW_WORDS_MAX} в наборе`;

  const body = (
    <>
      <div className={label}>
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

      <div className={cx("flex h-12 items-center gap-2 border-t border-rule", topicOpen ? "mt-3" : "mt-2.5")}>
        <span id={`${ids}-size`} className="flex-1 text-[15px] leading-5">
          Вопросов
        </span>
        <Segmented<number>
          options={REQUEST_SIZES.map((n) => ({ value: n, label: String(n) }))}
          value={size}
          onChange={setSize}
          ariaLabelledby={`${ids}-size`}
          mono
        />
      </div>

      {panel ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={allowNew}
          onClick={() => setAllowNew((v) => !v)}
          className="flex min-h-[52px] items-start gap-2.5 border-t border-rule py-3 text-left"
        >
          <CheckMark checked={allowNew} className="mt-[3px]" />
          <span className="flex min-w-0 flex-col">
            <span className="text-[15px] leading-5">Можно новые слова</span>
            <span className="text-[12px] leading-4 text-muted">{newCaption}</span>
          </span>
        </button>
      ) : (
        <div className="flex h-[52px] items-center gap-2 border-t border-rule">
          <span className="flex min-w-0 flex-1 flex-col">
            <span id={`${ids}-new`} className="text-[15px] leading-5">
              Можно новые слова
            </span>
            <span className="text-[12px] leading-4 text-muted">{newCaption}</span>
          </span>
          <Toggle checked={allowNew} onCheckedChange={setAllowNew} aria-labelledby={`${ids}-new`} />
        </div>
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
