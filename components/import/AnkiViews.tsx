"use client";

import type { ReactNode } from "react";
import { bottomBarRef } from "@/components/ui/bottom-clearance";
import { Button } from "@/components/ui/Button";
import { Header } from "@/components/ui/Header";
import { Icon } from "@/components/ui/Icons";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { StatusLine } from "@/components/ui/StatusLine";
import { Toggle } from "@/components/ui/Toggle";
import { cx } from "@/components/ui/cx";
import { useOnline } from "@/lib/use-online";
import { deckTitle, notesRu, selectNotes } from "./anki-plan";
import { CheckMark, DeskAlert, deskButton, SHOT_PANE } from "./desk";
import { CANT_CLASS, OFFLINE_REASON } from "./PickView";
import { wordsRu } from "./rows";
import type { AnkiImportState } from "./use-anki-import";

export const ANKI_TITLE = "Импорт из Anki";
export const ANKI_FOOTNOTE = "Переводы, примеры, уровень сленга и темы дополним сами — перед добавлением всё можно проверить. Аудио и картинки не переносятся.";
/** Phones: the one fact of the footnote the screen does not already show. */
const ANKI_FOOTNOTE_PHONE = "Аудио и картинки не переносятся.";

/** Phones: the file name only when it says more than the deck name under it («argot.apkg» vs «argot»). */
function phoneSubtitle(fileName: string | null, deckName: string | undefined): string | null {
  if (!fileName || !deckName) return fileName;
  const stem = fileName.replace(/\.[^.]+$/, "").trim().toLowerCase();
  return stem === deckName.trim().toLowerCase() ? null : fileName;
}

interface FrameProps {
  wide: boolean;
  /** Under the title: the file or deck name. */
  subtitle: string | null;
  children: ReactNode;
  /** Primary action first. */
  actions: ReactNode;
  onBack: () => void;
}

/** Phone: header, body, a sticky bottom bar. Desktop: page title, body and the buttons inline (720 wide). */
function Frame({ wide, subtitle, children, actions, onBack }: FrameProps) {
  if (wide) {
    return (
      <main data-wide="" className="flex flex-1 flex-col px-6 pt-10 pb-10 xl:px-12">
        <div className="flex max-w-[720px] flex-col">
          <h1 className="m-0 font-serif text-[28px] leading-9 font-medium tracking-[-0.015em] text-ink">{ANKI_TITLE}</h1>
          {subtitle && <p className="m-0 mt-1 truncate font-mono text-[11px] leading-4 text-muted">{subtitle}</p>}
          <div className="mt-6 flex flex-col">{children}</div>
          <div className="mt-6 flex flex-wrap items-center gap-2">{actions}</div>
        </div>
      </main>
    );
  }
  return (
    <>
      <Header large title={ANKI_TITLE} back={onBack} />
      <main className="flex flex-1 flex-col px-4 pt-2 pb-6">
        {subtitle && <p className="meta m-0 truncate">{subtitle}</p>}
        <div className="mt-3 flex flex-col">{children}</div>
      </main>
      <div
        ref={bottomBarRef}
        className={cx(
          "sticky bottom-(--shell-bottom) z-10 flex flex-col gap-2 border-t border-rule bg-surface px-4 pt-3 pb-3",
          "after:absolute after:inset-x-0 after:top-full after:h-(--shell-bottom) after:bg-surface after:content-['']",
        )}
      >
        {actions}
      </div>
    </>
  );
}

function Alert({ wide, children }: { wide: boolean; children: ReactNode }) {
  if (wide) return <DeskAlert>{children}</DeskAlert>;
  return (
    <p role="alert" className="m-0 flex items-start gap-2 text-[13px] leading-5 text-again">
      <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function Act({
  wide,
  primary = false,
  quiet = false,
  disabled,
  onClick,
  icon,
  children,
}: {
  wide: boolean;
  primary?: boolean;
  /** Phones: a rare action as a tertiary text button, not a second full-width button. */
  quiet?: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon?: "spark" | "stop" | "refresh" | "cloud-off";
  children: ReactNode;
}) {
  if (wide) {
    return (
      <button type="button" disabled={disabled} onClick={onClick} className={deskButton(primary ? "primary" : "secondary")}>
        {children}
      </button>
    );
  }
  return (
    <Button
      block
      variant={primary ? undefined : quiet ? "tertiary" : "secondary"}
      icon={icon}
      disabled={disabled}
      className={CANT_CLASS}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

export interface AnkiSetupProps {
  wide: boolean;
  state: AnkiImportState;
  onToggleDeck: (id: string) => void;
  onCarry: (carry: boolean) => void;
  onStart: () => void;
  onPickOther: () => void;
  onBack: () => void;
}

/** After the deck is read: which decks, carry progress or not, «Дополнить N карточек». */
export function AnkiSetupView({ wide, state, onToggleDeck, onCarry, onStart, onPickOther, onBack }: AnkiSetupProps) {
  const online = useOnline();
  const { deck } = state;
  const reading = state.phase === "reading" || !deck;
  const selection = deck ? selectNotes(deck, state.chosen, state.known) : null;
  const count = selection?.send.length ?? 0;

  let status = "Читаем колоду…";
  if (selection) {
    const parts = [count > 0 ? `К дополнению ${count}` : "Новых карточек нет"];
    if (selection.known > 0) parts.push(`уже есть ${selection.known}`);
    status = parts.join(" · ");
  }

  return (
    <Frame
      wide={wide}
      subtitle={wide || !deck || deck.decks.length > 1 ? state.fileName : phoneSubtitle(state.fileName, deck.decks[0]?.name)}
      onBack={onBack}
      actions={
        <>
          <Act
            wide={wide}
            primary
            icon={online ? "spark" : "cloud-off"}
            disabled={reading || count === 0 || !online}
            onClick={onStart}
          >
            {!online
              ? "Нужна сеть"
              : reading
                ? "Читаем колоду…"
                : count === 0
                  ? "Нечего дополнять"
                  : `Дополнить ${notesRu(count)}`}
          </Act>
          <Act wide={wide} quiet onClick={onPickOther}>
            Другой файл
          </Act>
        </>
      }
    >
      {reading ? (
        <SkeletonRows count={3} height={52} />
      ) : deck.decks.length > 1 ? (
        <ul aria-label="Колоды" className="m-0 flex list-none flex-col border-t border-ink p-0">
          {deck.decks.map((d) => {
            const on = state.chosen.has(d.id);
            return (
              <li key={d.id} className="border-b border-rule">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => onToggleDeck(d.id)}
                  className="flex min-h-11 w-full items-center gap-3 bg-transparent py-2 text-left"
                >
                  <CheckMark checked={on} />
                  <span lang="fr" className="min-w-0 flex-1 truncate font-serif text-[17px] leading-6 text-ink">
                    {d.name}
                  </span>
                  <span className="font-mono text-[11px] text-muted tabular-nums">{d.count}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p
          lang="fr"
          className="m-0 border-b border-rule pb-3 font-serif text-[22px] leading-7 font-medium tracking-[-0.01em] text-ink"
        >
          {deck.decks[0]?.name ?? "Колода"}{" "}
          <span className="ml-1 font-mono text-[11px] font-normal tracking-normal text-muted tabular-nums">
            · {notesRu(deck.decks[0]?.count ?? 0)}
          </span>
        </p>
      )}

      <StatusLine className="mt-4" text={status} active={reading} />
      {selection && selection.later > 0 && (
        <p className="m-0 mt-2 text-[13px] leading-5 text-muted">
          За раз — до {selection.send.length}. Остальные {selection.later} добавятся при следующем импорте этой же колоды.
        </p>
      )}

      {deck?.hasProgress && (
        <div className="mt-4 flex items-center gap-3 border-y border-rule py-2">
          <div className="min-w-0 flex-1">
            <p id="anki-carry" className="m-0 text-[15px] leading-5 text-ink">
              Перенести прогресс из Anki
            </p>
            <p className="m-0 text-[13px] leading-5 text-muted">
              {state.carry ? "Интервалы и сроки повторений сохранятся." : "Все карточки начнутся заново, как новые."}
            </p>
          </div>
          <Toggle checked={state.carry} onCheckedChange={onCarry} aria-labelledby="anki-carry" />
        </div>
      )}

      {!online && <p className="m-0 mt-4 text-[13px] leading-5 text-muted">{OFFLINE_REASON}</p>}
      <p className="m-0 mt-4 text-[13px] leading-5 text-muted">{wide ? ANKI_FOOTNOTE : ANKI_FOOTNOTE_PHONE}</p>
    </Frame>
  );
}

export interface AnkiProgressProps {
  wide: boolean;
  state: AnkiImportState;
  onStop: () => void;
  onRetry: () => void;
  onContinue: () => void;
  onPickOther: () => void;
  onBack: () => void;
}

/** Enriching (count, determinate bar, «Стоп»), stopped («Дальше с N словами») or failed («Повторить»). */
export function AnkiProgressView({ wide, state, onStop, onRetry, onContinue, onPickOther, onBack }: AnkiProgressProps) {
  const { phase, done, total, retryIn, deck } = state;
  const working = phase === "enriching";
  const kept = state.items.filter((i) => !i.skip).length;
  const title = deck ? deckTitle(deck, state.chosen) : state.fileName;

  let text: string;
  if (working) text = retryIn ? `Много запросов — продолжим через ${retryIn} с` : "Дополняем карточки";
  else if (phase === "stopped") text = `Остановлено · готово ${kept}`;
  else text = "Не получилось";

  return (
    <Frame
      wide={wide}
      subtitle={title}
      onBack={onBack}
      actions={
        working ? (
          <Act wide={wide} icon="stop" onClick={onStop}>
            Стоп
          </Act>
        ) : phase === "stopped" && kept > 0 ? (
          <>
            <Act wide={wide} primary onClick={onContinue}>
              Дальше с {wordsRu(kept)}
            </Act>
            <Act wide={wide} onClick={onRetry}>
              Начать заново
            </Act>
          </>
        ) : (
          <>
            {deck && (
              <Act wide={wide} primary icon="refresh" onClick={onRetry}>
                Повторить
              </Act>
            )}
            <Act wide={wide} onClick={onPickOther}>
              Другой файл
            </Act>
          </>
        )
      }
    >
      <StatusLine
        text={text}
        count={total > 0 ? `${done} / ${total}` : undefined}
        active={working}
        progress={total > 0 ? done / total : undefined}
        frozen={!working}
        announce={working ? `Дополнено ${done} из ${total}` : text}
      />
      {state.error && phase === "error" && (
        <div className="mt-4">
          <Alert wide={wide}>{state.error}</Alert>
        </div>
      )}
      {/* Phones: two rows say «more coming»; the review appears all at once. */}
      {working && <SkeletonRows className="mt-2" count={wide ? 5 : 2} height={56} meter />}
    </Frame>
  );
}

/** Review, phone: what replaces the screenshot summary above the rows. */
export function AnkiReviewSummary({ title, line }: { title: string; line: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p lang="fr" className="m-0 truncate font-serif text-[17px] leading-6 text-ink">
        {title}
      </p>
      <p className="meta m-0">{line}</p>
    </div>
  );
}

/** Review, desktop: the left column instead of the screenshots. */
export function AnkiReviewPane({ title, line, onPickOther }: { title: string; line: string; onPickOther: () => void }) {
  return (
    <aside aria-label="Колода" className={cx(SHOT_PANE, "flex min-h-0 shrink-0 flex-col gap-3 border-r border-rule px-6 pt-6")}>
      <div className="flex h-8 items-center justify-between gap-2">
        <p className="m-0 text-[12px] leading-4 text-muted">Колода Anki</p>
        <button type="button" onClick={onPickOther} className={deskButton("tertiary", "-mr-2")}>
          Другой файл
        </button>
      </div>
      <p lang="fr" className="m-0 font-serif text-[22px] leading-7 font-medium tracking-[-0.01em] text-ink">
        {title}
      </p>
      <p className="m-0 text-[13px] leading-5 text-muted">{line}</p>
      <p className="m-0 font-serif text-[14px] leading-5 text-muted italic">{ANKI_FOOTNOTE}</p>
    </aside>
  );
}
