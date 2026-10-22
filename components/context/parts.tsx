"use client";

import { useId, useState, type MouseEvent, type ReactNode, type Ref } from "react";
import { posAbbr } from "@/components/add/match";
import { AbbrHint } from "@/components/ui/AbbrHint";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Collapse } from "@/components/ui/Collapse";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icons";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { SlangMeter } from "@/components/ui/SlangMeter";
import { StatusLine } from "@/components/ui/StatusLine";
import { CONJ_TENSES } from "@/lib/ai/constants";
import type { Conjugation, ContextExample, LookupResponse } from "@/lib/ai/schemas";
import { detectDirection } from "@/lib/ai/normalize";
import type { LookupEntry } from "@/lib/db";
import type { SlangLevel } from "@/lib/types";
import {
  conjugationPreview,
  contextHref,
  historyMeta,
  KIND_LABELS,
  shareWidth,
  splitHit,
  splitPronoun,
  TENSE_NAMES,
  translationLine,
  type MeaningChip,
  type SynonymCell,
  type SynonymColumn,
} from "./data";

// The pieces of «Контекст» (mockups B-Dossier, S-*, E-Tab, D-Context), shared by the phone
// dossier and the desktop page.

/** An example as the screen shows it: from the web, or made up by «Подобрать пример». */
export type ShownExample = ContextExample & { invented?: boolean };

/** Plain clicks stay in the page (history.pushState); modified clicks open the link as usual. */
export function routeClick(go: () => void) {
  return (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    go();
  };
}

// ---------------------------------------------------------------------------------------------
// Search field

export function SearchField({
  value,
  onChange,
  onSubmit,
  online,
  inputRef,
  strong = false,
  wide = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  online: boolean;
  inputRef?: Ref<HTMLInputElement>;
  /** Ink border at rest (the empty screen, where the field is the main thing). */
  strong?: boolean;
  wide?: boolean;
}) {
  const trimmed = value.trim();
  const direction = detectDirection(trimmed);
  const offline = !online;
  return (
    <form
      role="search"
      aria-label="Поиск в Контексте"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(value);
      }}
      className="flex flex-col"
    >
      <div
        className={cx(
          "flex items-center gap-2 rounded-[4px] border pr-1 pl-3",
          wide || strong ? "h-12" : "h-11",
          offline ? "border-rule bg-surface-2" : cx("bg-surface focus-within:border-ink", strong || wide ? "border-ink" : "border-rule"),
        )}
      >
        <Icon name="search" size={18} className="shrink-0 text-muted" />
        <input
          ref={inputRef}
          type="text"
          value={offline ? "" : value}
          onChange={(e) => onChange(e.target.value)}
          disabled={offline}
          aria-label="Слово или фраза"
          placeholder={offline ? "Без сети — искать нельзя" : "Слово или фраза, FR или RU"}
          lang={trimmed && !offline ? (direction === "ru" ? "ru" : "fr") : undefined}
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          className={cx(
            "h-10 min-w-0 flex-1 bg-transparent text-ink outline-none! placeholder:font-sans placeholder:text-[15px] placeholder:text-muted disabled:cursor-not-allowed",
            trimmed && !offline ? cx("font-serif", wide ? "text-[21px]" : "text-[19px]") : "text-[16px]",
          )}
        />
        {trimmed && !offline && (
          <span aria-hidden="true" className="meta shrink-0">
            {direction === "ru" ? "RU → FR" : "FR → RU"}
          </span>
        )}
        {value && !offline && (
          <button
            type="button"
            aria-label="Очистить"
            title="Очистить"
            onClick={(e) => {
              onChange("");
              e.currentTarget.parentElement?.querySelector("input")?.focus();
            }}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-chip bg-transparent text-muted active:bg-surface-2 hoverable:text-ink md:size-9"
          >
            <Icon name="close" size={16} />
          </button>
        )}
      </div>
      {offline && <p className="m-0 mt-2 text-[13px] leading-[18px] text-muted">Открываются прошлые запросы — они сохранены на телефоне.</p>}
    </form>
  );
}

// ---------------------------------------------------------------------------------------------
// The word

/** «v. tr. · ▮▮▯▯ fam.» and the note under it. */
export function MetaLine({ lookup }: { lookup: LookupResponse }) {
  const abbr = posAbbr(lookup);
  return (
    <>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        {abbr && (
          <>
            <AbbrHint abbr={abbr} lang="fr" className="text-[15px] leading-5" />
            <span aria-hidden="true" className="abbr text-[15px] leading-5">
              ·
            </span>
          </>
        )}
        <SlangMeter level={lookup.slang_level} verlan={lookup.verlan} hints />
      </div>
      {lookup.note && <p className="m-0 mt-2 text-[14px] leading-5 text-muted">{lookup.note}</p>}
    </>
  );
}

/** Translations ranked by share, each with a bar against the most frequent one. */
export function Translations({ lookup }: { lookup: LookupResponse }) {
  const list = lookup.translations;
  if (list.length === 0) return null;
  return (
    <ul aria-label="Переводы по частоте" className="m-0 mt-3.5 flex list-none flex-col gap-1.5 p-0">
      {list.map((t) => (
        <li key={t.ru} className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_2.5rem] items-center gap-2.5">
          <span className="text-[16px] leading-[22px] break-words">{t.ru}</span>
          <span aria-hidden="true" className="relative h-[3px] bg-surface-2">
            <span className="absolute inset-y-0 left-0 bg-ink" style={{ width: `${shareWidth(t.share, list)}%` }} />
          </span>
          <span className="text-right font-mono text-[11px] leading-4 text-muted tabular-nums">{t.share}%</span>
        </li>
      ))}
    </ul>
  );
}

export interface SavedWord {
  id: string;
  /** The theme, null = «Входящие». */
  folderName: string | null;
}

/** «В библиотеке · Эмоции ›» (opens the saved word) or «+ В карточки» (the filled add form). */
export function WordStatus({
  saved,
  onOpen,
  onAdd,
  wide = false,
}: {
  /** undefined while the library is read. */
  saved: SavedWord | null | undefined;
  onOpen: () => void;
  onAdd: () => void;
  wide?: boolean;
}) {
  if (saved === undefined) return wide ? null : <div aria-hidden="true" className="mt-4 h-11" />;
  if (saved) {
    return (
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={onOpen}
        className={cx(
          "flex items-center gap-2 bg-transparent text-left text-ink",
          wide
            ? "hover-fade h-9 rounded-btn border border-rule px-3 text-[14px] hoverable:bg-hover-surface"
            : "-mb-1 mt-4 min-h-11 w-full border-t border-rule pt-3 pb-1 text-[14px] active:bg-surface-2",
        )}
      >
        <Icon name="cards" size={16} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate">В библиотеке · {saved.folderName ?? "Входящие"}</span>
        <Icon name="chevron-right" size={16} className="shrink-0 text-muted" />
      </button>
    );
  }
  return wide ? (
    <Button variant="secondary" size="sm" icon="plus" className="h-9 px-3.5 text-[14px]" aria-haspopup="dialog" onClick={onAdd}>
      В карточки
    </Button>
  ) : (
    <Button variant="secondary" size="md" icon="plus" block className="mt-4" aria-haspopup="dialog" onClick={onAdd}>
      В карточки
    </Button>
  );
}

/** The headword while the dictionary part loads: ruled blanks in the index card. */
export function LookupWait({ retryIn, wide = false }: { retryIn: number | null; wide?: boolean }) {
  return (
    <div aria-busy="true" className={cx("flex flex-col", wide ? "mt-6" : "mt-4")}>
      <StatusLine text="Ищем слово" active count={retryIn ? `повтор через ${retryIn} с` : undefined} />
      <div className={cx("mt-3 flex flex-col px-4 pb-2", !wide && "rounded-card border border-rule bg-surface")}>
        {!wide && <div aria-hidden="true" className="-mx-4 h-0.5 bg-red" />}
        <SkeletonRows count={3} height={wide ? 48 : 44} />
      </div>
    </div>
  );
}

export function LookupError({ error, online, onRetry }: { error: string | null; online: boolean; onRetry: () => void }) {
  return (
    <div className="mt-6 flex flex-col items-start gap-3">
      <p role="alert" className="m-0 flex items-start gap-2 text-[14px] leading-5 text-again">
        <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
        <span>{error ?? "Не получилось найти — попробуйте ещё раз"}</span>
      </p>
      {online && (
        <Button variant="secondary" size="md" onClick={onRetry}>
          Повторить
        </Button>
      )}
    </div>
  );
}

/** lookup.found = false: the query is not a word we can look up. */
export function NotFound({ q }: { q: string }) {
  return (
    <div className="mt-6 flex flex-col gap-2 border-t border-ink pt-4">
      <p role="status" className="m-0 font-serif text-[22px] leading-7 font-medium">
        Не нашли такого слова
      </p>
      <p className="m-0 text-[14px] leading-5 text-muted">
        «{q}» не похоже на французское или русское слово. Проверьте написание — или поищите по-русски.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Examples

/** The sentence with its headword form underlined in red. */
export function Hit({ fr, hit }: { fr: string; hit: string }) {
  const [before, word, after] = splitHit(fr, hit);
  return (
    <>
      {before}
      {word && <b className="font-semibold underline decoration-red decoration-2 underline-offset-[3px]">{word}</b>}
      {after}
    </>
  );
}

/** «ФОРУМ · forum.exemple.fr ↗», opening the page in a new tab. */
export function SourceLink({ example, className }: { example: Pick<ContextExample, "url" | "domain" | "kind">; className?: string }) {
  return (
    <a
      href={example.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cx("meta -my-3 inline-flex min-h-11 min-w-0 items-center gap-1 no-underline hoverable:text-ink", className)}
    >
      <span className="truncate">
        {KIND_LABELS[example.kind]} · {example.domain}
      </span>
      <span aria-hidden="true">↗</span>
      <span className="sr-only">, откроется в новой вкладке</span>
    </a>
  );
}

/** «Все · 5», «тащиться 38%»… Chips with no example are left out once the search is done. */
export function MeaningChips({
  chips,
  total,
  value,
  onChange,
  loading,
  keepEmpty = false,
  className,
}: {
  chips: readonly MeaningChip[];
  total: number;
  value: string | null;
  onChange: (meaning: string | null) => void;
  /** Still searching: the senses show (desktop), but cannot filter yet. */
  loading: boolean;
  /** Desktop: the chips are also the translations, so a sense with no example stays (disabled). */
  keepEmpty?: boolean;
  className?: string;
}) {
  const shown = loading || keepEmpty ? chips : chips.filter((c) => c.count > 0);
  return (
    <div role="group" aria-label="Значения" className={cx("flex gap-1.5", className)}>
      <Chip selected={value === null} onClick={() => onChange(null)} disabled={loading}>
        Все · {total}
      </Chip>
      {shown.map((c) => (
        <Chip key={c.ru} selected={value === c.ru} count={`${c.share}%`} disabled={loading || c.count === 0} onClick={() => onChange(value === c.ru ? null : c.ru)}>
          {c.ru}
        </Chip>
      ))}
    </div>
  );
}

function AddExampleButton({ example, inCard, onOpen, wide }: { example: ShownExample; inCard: boolean; onOpen: () => void; wide: boolean }) {
  const label = `${inCard ? "В карточке" : "В карточку"}: ${example.fr}`;
  if (wide) {
    return (
      <button
        type="button"
        aria-label={label}
        title={inCard ? "Уже в карточке" : "В карточку слова"}
        aria-haspopup="dialog"
        onClick={onOpen}
        className={cx(
          "hover-fade flex h-9 w-11 items-center justify-center rounded-chip border bg-surface hoverable:bg-hover-surface",
          inCard ? "border-good text-good" : "border-rule text-ink",
        )}
      >
        <Icon name={inCard ? "check" : "plus"} size={18} />
      </button>
    );
  }
  return (
    <button
      type="button"
      aria-label={label}
      aria-haspopup="dialog"
      onClick={onOpen}
      className={cx(
        "press-sm relative inline-flex h-8 shrink-0 items-center gap-1 rounded-chip border bg-surface px-2.5 text-[13px] leading-4 before:absolute before:-inset-y-1.5 before:inset-x-0",
        inCard ? "border-good text-good" : "border-rule text-ink active:bg-surface-2",
      )}
    >
      <Icon name={inCard ? "check" : "plus"} size={14} strokeWidth={2} />
      {inCard ? "В карточке" : "В карточку"}
    </button>
  );
}

function ExampleTag({ example }: { example: ShownExample }) {
  if (example.invented) return <span className="meta">Придуман</span>;
  return example.meaning ? <span className="meta">≈ {example.meaning}</span> : null;
}

/** Phone row: sense tag, the sentence, its translation, the source and «+ В карточку». */
export function ExampleItem({ example, inCard, onOpen }: { example: ShownExample; inCard: boolean; onOpen: () => void }) {
  return (
    <li className="flex flex-col gap-1 border-b border-rule py-3.5">
      <ExampleTag example={example} />
      <p lang="fr" className="m-0 font-serif text-[18px] leading-6 text-ink">
        <Hit fr={example.fr} hit={example.hit} />
      </p>
      {example.ru && <p className="m-0 text-[14px] leading-5 text-muted">{example.ru}</p>}
      <div className="mt-1 flex min-h-8 items-center justify-between gap-3">
        {example.invented ? <span className="meta">подобран по смыслу</span> : <SourceLink example={example} />}
        <AddExampleButton example={example} inCard={inCard} onOpen={onOpen} wide={false} />
      </div>
    </li>
  );
}

/** Desktop row of the bilingual table: FR (with its source) | RU | «+». */
export function ExampleTableRow({ example, inCard, onOpen }: { example: ShownExample; inCard: boolean; onOpen: () => void }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_44px] items-start gap-x-5 border-b border-rule py-3.5">
      <div className="flex min-w-0 flex-col gap-1">
        <ExampleTag example={example} />
        <p lang="fr" className="m-0 font-serif text-[18px] leading-[25px] text-ink">
          <Hit fr={example.fr} hit={example.hit} />
        </p>
        {example.invented ? (
          <span className="meta mt-1">подобран по смыслу</span>
        ) : (
          <SourceLink example={example} className="self-start" />
        )}
      </div>
      <p className={cx("m-0 text-[15px] leading-[22px] text-muted", (example.meaning || example.invented) && "mt-5")}>{example.ru}</p>
      <AddExampleButton example={example} inCard={inCard} onOpen={onOpen} wide />
    </li>
  );
}

/** «Ищем примеры в вебе» (or the quick free search): the status line, ruled blanks and «Остановить поиск». */
export function ExamplesWait({
  retryIn,
  onStop,
  wide = false,
  web = true,
}: {
  retryIn: number | null;
  onStop: () => void;
  wide?: boolean;
  /** The paid web search (10–20 s); otherwise Tatoeba's quick one. */
  web?: boolean;
}) {
  return (
    <div aria-busy="true" className="mt-3 flex flex-col">
      <StatusLine text={web ? "Ищем примеры в вебе" : "Ищем примеры"} active count={retryIn ? `повтор через ${retryIn} с` : undefined} />
      <SkeletonRows count={web ? 3 : 2} height={wide ? 76 : 96} lines={3} />
      {!wide && web && (
        <p className="m-0 mt-4 text-[13px] leading-[18px] text-muted">Перевод и синонимы уже готовы — можно смотреть, пока ищем живые примеры.</p>
      )}
      <Button variant="tertiary" size="sm" className="mt-2 self-start text-[14px]" onClick={onStop}>
        Остановить поиск
      </Button>
    </div>
  );
}

/** Under Tatoeba's sentences: the paid web search, only on request. */
export function WebMore({ online, onSearch, wide = false }: { online: boolean; onSearch: () => void; wide?: boolean }) {
  if (!online) return null;
  return (
    <div className="mt-4 flex flex-col items-start gap-1.5">
      <Button variant="secondary" size={wide ? "md" : "lg"} block={!wide} icon="spark" onClick={onSearch}>
        Искать ещё в вебе
      </Button>
      <p className="meta m-0">форумы, песни, субтитры · 10–20 с</p>
    </div>
  );
}

/** Tatoeba's licence asks for credit: under the list whenever one of its sentences shows. */
export function TatoebaCredit() {
  return (
    <p className="meta m-0 mt-3">
      Фразы{" "}
      <a href="https://tatoeba.org" target="_blank" rel="noopener noreferrer" className="text-muted underline underline-offset-2 hoverable:text-ink">
        Tatoeba
      </a>{" "}
      · CC BY 2.0 FR
    </p>
  );
}

/** The web search failed or was stopped: what happened and the way to try again. */
export function ExamplesHalt({
  kind,
  error,
  online,
  onRetry,
}: {
  kind: "error" | "stopped";
  error: string | null;
  online: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="mt-4 flex flex-col items-start gap-3">
      {kind === "error" ? (
        <p role="alert" className="m-0 flex items-start gap-2 text-[14px] leading-5 text-again">
          <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
          <span>{error ?? "Не получилось найти — попробуйте ещё раз"}</span>
        </p>
      ) : (
        <p role="status" className="m-0 text-[14px] leading-5 text-muted">
          Поиск остановлен — перевод и синонимы остались.
        </p>
      )}
      {online && (
        <Button variant="secondary" size="md" onClick={onRetry}>
          {kind === "error" ? "Повторить" : "Искать примеры"}
        </Button>
      )}
    </div>
  );
}

/** No sentence on the web: a dashed box with «Подобрать пример» (made up, marked as such). */
export function ExamplesEmpty({
  onInvent,
  inventing,
  error,
  online,
  wide = false,
  onWeb,
}: {
  onInvent: () => void;
  inventing: boolean;
  error: string | null;
  online: boolean;
  wide?: boolean;
  /** Set while the web search has not run yet: offered first, before a made-up example. */
  onWeb?: () => void;
}) {
  return (
    <div className="mt-4 flex flex-col gap-2 rounded-card border border-dashed border-rule bg-surface px-4 py-5">
      <p className="m-0 font-serif text-[20px] leading-[26px] font-medium">{onWeb ? "В Tatoeba примеров нет" : "Живых примеров не нашлось"}</p>
      <p className="m-0 text-[14px] leading-5 text-muted">
        {onWeb
          ? "Можно поискать живые фразы в вебе — на форумах, в песнях и субтитрах — или подобрать пример по смыслу: он будет помечен как придуманный."
          : "Слово редкое — в открытых текстах его почти не пишут. Можно подобрать пример по смыслу: он будет помечен как придуманный."}
      </p>
      {onWeb && (
        <Button className={cx("mt-2", wide && "self-start")} size={wide ? "md" : "lg"} block={!wide} icon="spark" disabled={!online} onClick={onWeb}>
          Искать в вебе
        </Button>
      )}
      <Button
        className={cx(onWeb ? "mt-1" : "mt-2", wide && "self-start")}
        variant={onWeb ? "secondary" : undefined}
        size={wide ? "md" : "lg"}
        block={!wide}
        icon="spark"
        pending={inventing}
        pendingLabel="Подбираем пример…"
        disabled={!online}
        onClick={onInvent}
      >
        Подобрать пример
      </Button>
      {error && (
        <p role="status" className="m-0 text-[13px] leading-[18px] text-muted">
          {error}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Synonyms

function SelfCell({ cell, wide }: { cell: SynonymCell; wide: boolean }) {
  return (
    <div className={cx("flex flex-col justify-center rounded-chip border border-ink bg-surface px-1.5 py-1.5", wide ? "mt-1" : "mt-1 min-h-[52px]")}>
      <span lang="fr" className="font-serif text-[16px] leading-5 break-words">
        {cell.fr}
      </span>
      <span className="text-[12px] leading-4 text-muted">это слово</span>
    </div>
  );
}

/** Phone: the register scale, one column per level that has words; tap opens, «+» adds. */
export function SynonymScale({
  columns,
  onOpen,
  onAdd,
}: {
  columns: readonly SynonymColumn[];
  onOpen: (fr: string) => void;
  onAdd: (cell: SynonymCell) => void;
}) {
  const headingId = useId();
  const n = columns.length;
  return (
    <section aria-labelledby={headingId} className="mt-8">
      <SectionHead id={headingId} title="Похожие слова" aside="по регистру" />
      <div className={cx("grid gap-x-2", n === 1 ? "grid-cols-1" : n === 3 ? "grid-cols-3" : "grid-cols-2")}>
        {columns.map((c) => (
          <div key={c.level} className="flex min-w-0 flex-col">
            <div className="flex h-9 items-center border-b border-rule">
              <SlangMeter level={c.level as SlangLevel} size="sm" />
            </div>
            <ul className="m-0 flex list-none flex-col p-0">
              {c.words.map((w) => (
                <li key={w.fr}>
                  {w.self ? (
                    <SelfCell cell={w} wide={false} />
                  ) : (
                    <div className="mt-1 flex items-stretch">
                      <button
                        type="button"
                        onClick={() => onOpen(w.fr)}
                        aria-label={`${w.fr} — ${w.ru}`}
                        className="flex min-h-[52px] min-w-0 flex-1 flex-col items-start justify-center rounded-chip bg-transparent px-1.5 py-1.5 text-left active:bg-surface-2"
                      >
                        <span lang="fr" className="max-w-full font-serif text-[16px] leading-5 break-words text-ink">
                          {w.fr}
                        </span>
                        <span className="max-w-full text-[12px] leading-4 break-words text-muted">{w.ru}</span>
                      </button>
                      <button
                        type="button"
                        aria-label={`Добавить ${w.fr} в карточки`}
                        aria-haspopup="dialog"
                        onClick={() => onAdd(w)}
                        className="flex w-11 shrink-0 items-center justify-center rounded-chip bg-transparent text-muted active:bg-surface-2"
                      >
                        <Icon name="plus" size={16} />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="m-0 mt-2.5 text-[13px] leading-[18px] text-muted">Нажми на слово — откроется в Контексте. «+» — сразу в карточки.</p>
    </section>
  );
}

/** Desktop rail: one ruled row per word, the level as a meter, from neutral to vulgar. */
export function SynonymList({
  columns,
  onOpen,
  onAdd,
}: {
  columns: readonly SynonymColumn[];
  onOpen: (fr: string) => void;
  onAdd: (cell: SynonymCell) => void;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="m-0 mt-3.5 border-b border-ink pb-1.5 font-serif text-[20px] leading-7 font-medium">
        Похожие слова
      </h2>
      <ul className="m-0 list-none p-0">
        {columns.flatMap((c) =>
          c.words.map((w) => (
            <li key={w.fr} className="flex min-h-10 items-center gap-2 border-b border-rule">
              <SlangMeter level={w.slang_level} size="sm" showLabel={false} />
              {w.self ? (
                <span className="flex min-w-0 flex-1 items-baseline gap-2 py-2">
                  <span lang="fr" className="font-serif text-[17px] leading-6 font-medium">
                    {w.fr}
                  </span>
                  <span className="meta">это слово</span>
                </span>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => onOpen(w.fr)}
                    aria-label={`${w.fr} — ${w.ru}`}
                    className="hover-fade flex min-w-0 flex-1 items-baseline gap-2 rounded-[4px] bg-transparent px-1 py-2 text-left text-ink hoverable:bg-hover"
                  >
                    <span lang="fr" className="font-serif text-[17px] leading-6">
                      {w.fr}
                    </span>
                    <span className="min-w-0 truncate text-[13px] leading-5 text-muted">{w.ru}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Добавить ${w.fr} в карточки`}
                    title="В карточки"
                    aria-haspopup="dialog"
                    onClick={() => onAdd(w)}
                    className="hover-fade inline-flex size-8 shrink-0 items-center justify-center rounded-[4px] bg-transparent text-muted hoverable:bg-hover hoverable:text-ink"
                  >
                    <Icon name="plus" size={16} />
                  </button>
                </>
              )}
            </li>
          )),
        )}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Conjugation

function Forms({ forms, order }: { forms: readonly string[]; order?: readonly number[] }) {
  const list = order ? order.map((i) => forms[i]).filter((f) => f !== undefined) : forms;
  return (
    <ul lang="fr" className={cx("m-0 list-none p-0", order && "grid grid-cols-2 gap-x-4")}>
      {list.map((form, i) => {
        const [pronoun, verb] = splitPronoun(form);
        return (
          <li key={i} className="flex min-h-7 items-center border-b border-surface-2 py-0.5 font-serif text-[16px] leading-5">
            {/* «j'ai» stays together; other pronouns keep their space. */}
            {pronoun && <span className={cx("text-muted", !/['’]$/.test(pronoun) && "mr-1.5")}>{pronoun.trim()}</span>}
            <span className="font-medium">{verb}</span>
          </li>
        );
      })}
    </ul>
  );
}

function ConjRemark({ conj }: { conj: Conjugation }) {
  return (
    <p className="m-0 text-[13px] leading-[18px] text-muted">
      {conj.remark ? `${conj.remark} · ` : ""}вспомогательный{" "}
      <span lang="fr" className="font-serif text-[15px] text-ink italic">
        {conj.auxiliary}
      </span>
    </p>
  );
}

/** Phone: collapsed to a one-line présent preview; open, a 2×2 grid of tenses. */
export function ConjugationSection({ conj }: { conj: Conjugation }) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="mt-8">
      <h2 id={headingId} className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-11 w-full items-end justify-between gap-3 border-b border-ink bg-transparent p-0 pb-2 text-left text-ink"
        >
          <span className="font-serif text-[22px] leading-7 font-medium">Спряжение</span>
          <span className="meta mb-1 inline-flex items-center gap-1">
            {open ? "свернуть" : "4 времени"}
            <Icon name={open ? "chevron-up" : "chevron"} size={14} />
          </span>
        </button>
      </h2>
      {!open && (
        <p lang="fr" className="m-0 mt-2.5 font-serif text-[16px] leading-[22px] text-muted">
          {conjugationPreview(conj.tenses.present)}
        </p>
      )}
      <Collapse open={open} innerClassName="px-px">
        <div id={bodyId} className="pt-2.5">
          <ConjRemark conj={conj} />
          <div className="grid grid-cols-2 gap-x-4">
            {CONJ_TENSES.map((t) => (
              <div key={t} className="mt-3.5 min-w-0">
                <h3 className="m-0 border-b border-rule pb-1.5 font-mono text-[11px] leading-4 font-medium tracking-[.06em] uppercase">{TENSE_NAMES[t]}</h3>
                <Forms forms={conj.tenses[t]} />
              </div>
            ))}
          </div>
        </div>
      </Collapse>
    </section>
  );
}

/** je / nous, tu / vous, il / ils: the two-column order of the desktop grid. */
const PAIRED = [0, 3, 1, 4, 2, 5] as const;

/** Desktop rail: présent, then the other tenses on demand. */
export function ConjugationAside({ conj }: { conj: Conjugation }) {
  const [all, setAll] = useState(false);
  const headingId = useId();
  const restId = useId();
  return (
    <section aria-labelledby={headingId} className="mt-7">
      <h2 id={headingId} className="m-0 flex items-baseline justify-between border-b border-ink pb-1.5 font-serif text-[20px] leading-7 font-medium">
        Спряжение
        <span className="meta font-sans font-normal">{TENSE_NAMES.present}</span>
      </h2>
      <Forms forms={conj.tenses.present} order={PAIRED} />
      <div id={restId} hidden={!all}>
        {CONJ_TENSES.filter((t) => t !== "present").map((t) => (
          <div key={t} className="mt-4">
            <h3 className="m-0 border-b border-rule pb-1 font-mono text-[11px] leading-4 font-medium tracking-[.06em] uppercase">{TENSE_NAMES[t]}</h3>
            <Forms forms={conj.tenses[t]} order={PAIRED} />
          </div>
        ))}
      </div>
      <div className="mt-2">
        <ConjRemark conj={conj} />
      </div>
      <Button variant="tertiary" size="sm" className="mt-1 -ml-0.5 h-9 px-0 text-[14px]" aria-expanded={all} aria-controls={restId} onClick={() => setAll((a) => !a)}>
        {all ? "Только présent" : "Все времена — passé composé, imparfait, futur"}
      </Button>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// The empty screen: history and the words without examples

export function SectionHead({ id, title, aside }: { id?: string; title: string; aside?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-ink pb-2">
      <h2 id={id} className="m-0 font-serif text-[22px] leading-7 font-medium">
        {title}
      </h2>
      {aside != null && <span className="meta shrink-0">{aside}</span>}
    </div>
  );
}

/** «Недавние»: the device-local history; a row reopens its query from the saved results. */
export function HistoryList({
  rows,
  onOpen,
  onDelete,
  onClear,
  wide = false,
}: {
  rows: readonly LookupEntry[];
  onOpen: (q: string) => void;
  /** «×» on a row: drop that one query (the screen offers «Отменить»). */
  onDelete: (entry: LookupEntry) => void;
  onClear: () => void;
  wide?: boolean;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="mt-6">
      <div className="flex h-8 items-center justify-between border-b border-ink">
        <h2 id={headingId} className="meta m-0 font-medium text-ink">
          Недавние
        </h2>
        <button
          type="button"
          onClick={onClear}
          className="meta relative -mr-1 bg-transparent px-1 hoverable:text-ink before:absolute before:-inset-y-3 before:inset-x-0"
        >
          Очистить
        </button>
      </div>
      <ul className="m-0 list-none p-0">
        {rows.map((r) => {
          const found = r.lookup.found;
          const name = found ? r.lookup.fr : r.q;
          return (
            <li
              key={r.key}
              className={cx("group flex items-center border-b border-rule", wide && "hover-fade -mx-2 hoverable:bg-hover")}
            >
              <a
                href={contextHref(r.q)}
                onClick={routeClick(() => onOpen(r.q))}
                className={cx(
                  "flex min-h-[60px] min-w-0 flex-1 items-center gap-2.5 py-2 text-ink no-underline",
                  wide ? "pl-2" : "active:bg-surface-2",
                )}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex min-w-0 items-center gap-2">
                    <span lang="fr" className="truncate font-serif text-[19px] leading-6">
                      {found ? r.lookup.fr : r.q}
                    </span>
                    {found && <SlangMeter level={r.lookup.slang_level} size="sm" showLabel={false} />}
                  </span>
                  <span className="truncate text-[14px] leading-5 text-muted">{found ? translationLine(r.lookup.translations, 2) : r.q}</span>
                </span>
                <span className="meta shrink-0 text-right">{historyMeta(r)}</span>
              </a>
              <button
                type="button"
                onClick={() => onDelete(r)}
                aria-label={`Убрать «${name}» из истории`}
                className={cx(
                  "flex size-11 shrink-0 items-center justify-center rounded-btn bg-transparent text-muted hoverable:text-ink",
                  wide ? "opacity-0 group-hover:opacity-100 focus-visible:opacity-100" : "-mr-3",
                )}
              >
                <Icon name="close" size={16} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** «Из твоих карточек без примеров»: saved words to look up. */
export function NoExampleChips({ words, onOpen }: { words: readonly { id: string; fr: string }[]; onOpen: (fr: string) => void }) {
  if (words.length === 0) return null;
  return (
    <div className="mt-6">
      <p className="meta m-0 mb-2">Из твоих карточек без примеров</p>
      <ul className="m-0 flex list-none flex-wrap gap-x-1.5 gap-y-2 p-0">
        {words.map((w) => (
          <li key={w.id}>
            <a
              href={contextHref(w.fr)}
              onClick={routeClick(() => onOpen(w.fr))}
              lang="fr"
              className="press-sm relative inline-flex h-[30px] items-center rounded-chip border border-rule bg-surface px-2.5 font-serif text-[15px] text-ink no-underline before:absolute before:-inset-y-[7px] before:inset-x-0 active:bg-surface-2 hoverable:border-ink"
            >
              {w.fr}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
