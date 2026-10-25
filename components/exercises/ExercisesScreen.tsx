"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { SyncMark } from "@/components/library/SyncMark";
import { useClock } from "@/components/settings/useClock";
import { useShortcutsEnabled } from "@/components/shell/ShellContext";
import { blocksGlobalKeys, OPEN_LAYER_SELECTOR } from "@/components/shell/keys";
import { bottomBarRef } from "@/components/ui/bottom-clearance";
import { Button, buttonClasses } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icons";
import { FlatKey } from "@/components/ui/Kbd";
import { SessionStrip, type StripMark } from "@/components/ui/SessionStrip";
import { useSnackbar } from "@/components/ui/Snackbar";
import { deleteSet, restoreSet, unfinishedRun, useExerciseSets, useLastRunBySet, useOwnRunIds, useScopeCounts } from "@/lib/exercises";
import { listFolders } from "@/lib/folders";
import { syncNow } from "@/lib/sync";
import type { ExerciseRun, ExerciseSet } from "@/lib/types";
import { MEDIUM_QUERY, useMediaQuery } from "@/lib/use-media";
import { useOnline } from "@/lib/use-online";
import { copyRequest, copyText, useLastRequest } from "./clipboard";
import { ConnectorHelpSheet } from "./ConnectorHelpSheet";
import { EXERCISE_PLAY_HREF, setPendingExercise } from "./exercise-request";
import { isWaiting, nNew, nQuestions, nSets, resumeProgress, setThemesLine, shortDate, similarRequest, tileState } from "./list-format";
import { CopyGlyph, RequestBuilder, useThemeChoices } from "./RequestBuilder";
import { RequestSheet } from "./RequestSheet";
import { SetMenuSheet } from "./SetMenuSheet";
import { useCopyScopeRequest } from "./scope-request";
import { attemptMarks } from "./player-state";
import { RequestTile, ScopeTile, SetTile, SetTileSkeleton, WaitingTile } from "./SetTile";

/** From here the request builder sits in a right-hand column next to the tiles (D-Exercise-List). */
const SIDE_PANEL_QUERY = "(min-width: 1024px)";

const COPIED_MESSAGE = "Запрос скопирован — вставьте его в чат Claude";

/**
 * «Упражнения» (SPEC «Упражнения», boards Exercise-List-B, -Empty-A, -S-Resume, -S-Waiting,
 * -S-Offline, -S-Quick-Tiles, D-Exercise-List): the sets Claude wrote in the chat as two-column tiles
 * (three from 768), ready-made requests for the difficult / due words of every theme, «Продолжить»
 * for an unfinished run, the request builder (inline when there are no sets, a
 * sheet from «Попросить набор», a right-hand column on wide screens), «Ждём набор из чата» after a
 * copy and the offline strip. Sets play offline; nothing here calls Claude, so no spark glyph.
 */
export function ExercisesScreen() {
  const router = useRouter();
  const snackbar = useSnackbar();
  const sets = useExerciseSets();
  const runs = useLastRunBySet();
  const ownRuns = useOwnRunIds();
  // null when there is none (undefined is «still loading»).
  const resume = useLiveQuery(async () => (await unfinishedRun()) ?? null, []);
  const themes = useThemeChoices();
  const names = useLiveQuery(async () => new Map((await listFolders()).map((f) => [f.id, f.name] as const)), []);
  const online = useOnline();
  const last = useLastRequest();
  const nowMs = useClock();
  const wide = useMediaQuery(MEDIUM_QUERY);
  const side = useMediaQuery(SIDE_PANEL_QUERY);
  const shortcuts = useShortcutsEnabled();
  const scopeCounts = useScopeCounts();
  // The quick tiles copy like the builder: «Ждём набор из чата» follows from the copied request.
  const copyScope = useCopyScopeRequest((notice) => snackbar.show(notice));

  const [sheetOpen, setSheetOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [menu, setMenu] = useState<ExerciseSet | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // J / K move between the tiles from 768 up; Enter on a focused tile starts it (it is a link).
  useEffect(() => {
    if (!wide || !shortcuts) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyJ" && e.code !== "KeyK") return;
      if (e.defaultPrevented || e.repeat || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.isComposing) return;
      if (blocksGlobalKeys(e.target) || document.querySelector(OPEN_LAYER_SELECTOR)) return;
      const tiles = [...document.querySelectorAll<HTMLElement>("[data-set-tile]")];
      if (tiles.length === 0) return;
      e.preventDefault();
      const at = tiles.indexOf(document.activeElement as HTMLElement);
      const next = at < 0 ? 0 : Math.min(tiles.length - 1, Math.max(0, at + (e.code === "KeyJ" ? 1 : -1)));
      tiles[next].focus();
      tiles[next].scrollIntoView({ block: "nearest" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [wide, shortcuts]);

  const loading = sets === undefined || runs === undefined || resume === undefined;
  const list = sets ?? [];
  const folderNames = names ?? new Map<string, string>();
  const waiting = sets !== undefined && isWaiting(last, list, nowMs);
  // «Продолжить» takes a whole-set run's tile out of the grid (Exercise-S-Resume).
  const resumeSetId = resume?.run.kind === "set" ? resume.set.id : null;
  const tiles = list.filter((s) => s.id !== resumeSetId);
  const fresh = list.filter((s) => !runs?.has(s.id)).length;
  const empty = !loading && list.length === 0;

  const openRequest = () => {
    if (side && !empty) {
      const first = panelRef.current?.querySelector<HTMLElement>("button");
      panelRef.current?.scrollIntoView({ block: "nearest" });
      first?.focus();
      return;
    }
    setSheetOpen(true);
  };

  const refresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    void syncNow().finally(() => setRefreshing(false));
  };

  const copySimilar = async (set: ExerciseSet) => {
    const ok = await copyRequest(similarRequest(set, folderNames), list);
    snackbar.show({ message: ok ? COPIED_MESSAGE : "Не получилось скопировать" });
  };

  const remove = async (set: ExerciseSet) => {
    try {
      const removed = await deleteSet(set.id);
      if (!removed) return;
      snackbar.show({
        message: `Набор «${set.title}» удалён`,
        actionLabel: "Отменить",
        onAction: () => void restoreSet(set.id),
      });
    } catch {
      snackbar.show({ message: "Не получилось удалить набор" });
    }
  };

  const menuRun = menu ? runs?.get(menu.id) : undefined;
  const menuState = menu ? tileState(menu, menuRun, ownRuns) : null;
  const startFromMenu = () => {
    if (!menu || !menuState) return;
    setPendingExercise(menuState.resumeRunId ? { setId: menu.id, runId: menuState.resumeRunId } : { setId: menu.id });
    setMenuOpen(false);
    router.push(EXERCISE_PLAY_HREF);
  };

  const header = (
    <>
      <header className="mt-4 flex h-11 shrink-0 items-center justify-between gap-3 md:mt-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <h1 className="m-0 shrink-0 font-serif text-[28px] leading-9 font-medium tracking-[-0.015em]">Упражнения</h1>
          {/* Phones offline: one muted word is the whole offline state (proposals «Waiting» B). */}
          {!online && !wide ? (
            <span data-sync-mark="offline" className="meta min-w-0 truncate leading-9">
              · Офлайн
            </span>
          ) : (
            <SyncMark />
          )}
        </div>
        {!empty && !loading && (
          <Button variant="secondary" size="sm" onClick={openRequest} className="h-9 px-3 md:px-3.5 md:text-[14px]">
            Попросить набор
          </Button>
        )}
      </header>
      {!empty && !loading && (
        <>
          {/* Phones: the grid counts the sets; the schedule note is said here, once (L-ExPlayer-B). */}
          <p className="meta m-0 mt-1 leading-4 md:hidden">Не влияют на расписание повторений</p>
          <p className="m-0 mt-1 text-[13px] leading-5 text-muted max-md:hidden">
            {nSets(list.length)} · составлены в чате · не влияют на расписание повторений
          </p>
        </>
      )}
    </>
  );

  const offlineStrip = !online && (
    <div
      role="status"
      className="mt-3.5 flex h-10 shrink-0 items-center gap-2.5 rounded-chip border border-dashed max-md:hidden border-warn-edge bg-warn-bg px-3 text-[13px] leading-5 whitespace-nowrap text-warn"
    >
      <Icon name="cloud-off" size={18} strokeWidth={1.5} className="shrink-0" />
      <span className="min-w-0 truncate">
        <span className="font-semibold">Нет сети</span> · наборы играются, новые придут позже
      </span>
    </div>
  );

  const waitingLine = waiting && last && (
    // Phones: the waiting tile in the grid says it instead (WaitingTile).
    <section aria-label="Ждём набор" aria-busy="true" className="mt-4 flex shrink-0 flex-col max-md:hidden">
      {/* The StatusLine look (mono line on a hairline with the ink run) without its elapsed time:
          this wait lasts until the user is back from the chat. */}
      <div className="meta flex h-5 items-center leading-4 whitespace-nowrap">
        <span className="min-w-0 truncate">
          <span className="font-medium text-ink">Ждём набор из чата</span> · обновится, когда вернётесь
        </span>
      </div>
      <div aria-hidden="true" className="relative h-px overflow-hidden bg-rule">
        <span className="motion-loop absolute inset-y-0 w-8 bg-ink animate-[ink-run_2000ms_linear_infinite]" />
      </div>
      <span role="status" aria-live="polite" className="sr-only">
        Ждём набор из чата
      </span>
      <div className="flex h-11 items-center gap-3">
        <span className="min-w-0 flex-1 truncate text-[13px] leading-[18px] text-muted">Запрос: {last.summary}</span>
        <button
          type="button"
          onClick={refresh}
          aria-busy={refreshing || undefined}
          disabled={!online}
          className="-mr-2 inline-flex h-11 shrink-0 items-center gap-1.5 rounded-chip px-2 text-[13px] font-medium whitespace-nowrap text-ink active:bg-surface-2 disabled:opacity-40"
        >
          <Icon name="refresh" size={16} strokeWidth={1.5} className={cx(refreshing && "motion-safe:animate-spin")} />
          <span className="underline decoration-boundary decoration-1 underline-offset-4">Обновить</span>
        </button>
      </div>
    </section>
  );

  // Phones: the set's place in the grid is the waiting state; its status line for screen readers.
  const waitingTile = waiting && (
    <>
      <WaitingTile online={online} refreshing={refreshing} onRefresh={refresh} className="md:hidden" />
      <span role="status" className="sr-only md:hidden">
        Ждём набор из чата
      </span>
    </>
  );

  const helpLink = (
    <button
      type="button"
      onClick={() => setHelpOpen(true)}
      className="mt-1 inline-flex h-11 shrink-0 items-center gap-0.5 self-start text-[13px] text-muted active:text-ink"
    >
      Коннектор не подключён?
      <Icon name="chevron-right" size={14} strokeWidth={2} />
    </button>
  );

  let content: ReactNode;
  if (loading) {
    content = (
      <div aria-busy="true" className="delayed-in mt-5 grid grid-cols-2 gap-2 md:grid-cols-3">
        {[0, 1, 2, 3].map((i) => (
          <SetTileSkeleton key={i} />
        ))}
      </div>
    );
  } else if (empty) {
    content = (
      <div className="flex flex-col md:max-w-[560px]">
        {waitingLine}
        {wide ? (
          <>
            <h2 className="m-0 mt-5 font-serif text-[22px] leading-7 font-medium">Упражнений пока нет</h2>
            <p className="m-0 mt-1.5 text-[15px] leading-[22px] text-muted">
              Их составляет Claude в чате через коннектор «Карточки». Выберите темы — мы подготовим запрос.
            </p>
            <RequestBuilder variant="page" themes={themes ?? []} sets={list} online={online} className="mt-4" />
          </>
        ) : (
          // Phones (proposals «Empty» B): one line, then the builder's two decisions and the merged CTA.
          <>
            {waitingTile && <div className="mt-5 grid grid-cols-2 gap-2">{waitingTile}</div>}
            <h2 className="sr-only">Упражнений пока нет</h2>
            <p className="m-0 mt-4 text-[15px] leading-[22px] text-muted">
              Наборы пишет Claude в чате, на расписание они не влияют. Из чего составить?
            </p>
            <RequestBuilder variant="page" compact themes={themes ?? []} sets={list} online={online} className="mt-4" />
          </>
        )}
        {helpLink}
      </div>
    );
  } else {
    content = (
      <>
        {waitingLine}
        {resume && <ResumeCard run={resume.run} set={resume.set} themes={setThemesLine(resume.set, folderNames)} />}
        {/* Phones (list B): no section rules; the grid holds sets and nothing else. */}
        <SectionRule title="Наборы" note={fresh > 0 ? nNew(fresh) : null} className={cx("max-md:hidden", resume ? "mt-6" : waitingLine ? "mt-3" : "mt-5")} />
        <div className="mt-3 grid grid-cols-2 gap-2 max-md:mt-4 md:grid-cols-3 md:gap-3">
          {waiting && <SetTileSkeleton className="max-md:hidden" />}
          {waitingTile}
          {tiles.map((set) => {
            const state = tileState(set, runs?.get(set.id), ownRuns);
            return (
              <SetTile
                key={set.id}
                set={set}
                state={state}
                themes={setThemesLine(set, folderNames)}
                onStart={() => setPendingExercise(state.resumeRunId ? { setId: set.id, runId: state.resumeRunId } : { setId: set.id })}
                onMenu={() => {
                  setMenu(set);
                  setMenuOpen(true);
                }}
              />
            );
          })}
          {/* Phones (list B): one way to ask, the header button; its sheet starts with «Трудные» / «К повторению». */}
          {!!scopeCounts?.difficult && (
            <ScopeTile scope="difficult" count={scopeCounts.difficult} onClick={() => void copyScope("difficult")} className="max-md:hidden" />
          )}
          {!!scopeCounts?.due && <ScopeTile scope="due" count={scopeCounts.due} onClick={() => void copyScope("due")} className="max-md:hidden" />}
          <RequestTile onClick={openRequest} side={side} className="max-md:hidden" />
        </div>
        {shortcuts && (
          <p className="meta m-0 mt-4 flex flex-wrap items-center gap-x-1.5 leading-4 max-md:hidden">
            <FlatKey>J</FlatKey>
            <FlatKey>K</FlatKey>
            <span>выбрать набор</span>
            <span aria-hidden="true">·</span>
            <FlatKey>↵</FlatKey>
            <span>начать</span>
            <span aria-hidden="true">·</span>
            <FlatKey>G</FlatKey>
            <FlatKey>E</FlatKey>
            <span>упражнения из любого раздела</span>
          </p>
        )}
        {/* Phones offline: the header word only; the request sheet says «нужна сеть» itself. */}
        {!online && last && wide && <OfflineRequestBar text={last.text} summary={last.summary} onCopied={(ok) => snackbar.show({ message: ok ? COPIED_MESSAGE : "Не получилось скопировать" })} />}
      </>
    );
  }

  const showPanel = side && !empty && !loading;

  return (
    <main data-wide="" className="flex flex-1 flex-col px-4 pb-6 md:px-8 md:pt-3 md:pb-10 lg:flex-row lg:items-start lg:gap-8">
      <div className="flex min-w-0 flex-1 flex-col md:max-w-[1000px]">
        {header}
        {offlineStrip}
        {content}
      </div>
      {showPanel && (
        <aside ref={panelRef} aria-label="Попросить набор" className="sticky top-7 mt-7 w-[344px] shrink-0">
          <RequestBuilder
            variant="panel"
            themes={themes ?? []}
            sets={list}
            online={online}
            onHelp={() => setHelpOpen(true)}
            onCopied={(ok, via) => {
              if (ok && via === "copy") snackbar.show({ message: COPIED_MESSAGE });
            }}
          />
        </aside>
      )}

      <RequestSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        themes={themes ?? []}
        sets={list}
        online={online}
        onCopied={(via) => {
          if (via === "copy") snackbar.show({ message: COPIED_MESSAGE });
        }}
      />
      <ConnectorHelpSheet open={helpOpen} onOpenChange={setHelpOpen} />
      <SetMenuSheet
        set={menu}
        open={menuOpen}
        onOpenChange={setMenuOpen}
        resumable={!!menuState?.resumeRunId}
        onStart={startFromMenu}
        onCopySimilar={() => {
          const set = menu;
          setMenuOpen(false);
          if (set) void copySimilar(set);
        }}
        onDelete={() => {
          const set = menu;
          setMenuOpen(false);
          if (set) void remove(set);
        }}
      />
    </main>
  );
}

function SectionRule({ title, note, className }: { title: string; note: string | null; className?: string }) {
  return (
    <div className={cx("meta flex shrink-0 items-baseline justify-between border-b border-ink pb-2 leading-4", className)}>
      <span className="font-medium text-ink">{title}</span>
      {note && <span>{note}</span>}
    </div>
  );
}

/** The resume card's ticks: each question's first answer (ink, or a miss), then the questions still ahead. */
function resumeMarks(run: ExerciseRun, set: ExerciseSet, total: number): StripMark[] {
  const ids = new Set(set.items.map((i) => i.id));
  const marks = attemptMarks(run.answers.filter((a) => a.attempt === 1 && ids.has(a.item_id)));
  while (marks.length < total) marks.push("future");
  return marks;
}

/**
 * «НЕ ЗАКОНЧЕНО» (Exercise-S-Resume): the newest unfinished run with «Продолжить · 5 из 8». Phones
 * (list B): no rule or meta, the tick row, and a plain «Продолжить ›».
 */
function ResumeCard({ run, set, themes }: { run: ExerciseRun; set: ExerciseSet; themes: string }) {
  const { answered, total, progress } = resumeProgress(run, set);
  const meta = `${nQuestions(total)} · ${themes} · прервано ${shortDate(run.updated_at)}`;
  return (
    <>
      <SectionRule title="Не закончено" note="1" className="mt-5 max-md:hidden" />
      <section
        aria-label="Незаконченный набор"
        className="mt-3 flex shrink-0 flex-col rounded-card border border-rule bg-surface px-4 pt-3.5 pb-4 max-md:mt-4"
      >
        <span className="truncate font-serif text-[19px] leading-6 font-medium max-md:text-[22px] max-md:leading-[26px]">{set.title}</span>
        <span className="meta mt-0.5 truncate leading-4 max-md:hidden">{meta}</span>
        {/* Phones (list B): the player's tick row, one tick per question; the count is in the link's name. */}
        <SessionStrip size="ticks" marks={resumeMarks(run, set, total)} label={false} className="mt-3 md:hidden" />
        <div aria-hidden="true" className="relative mt-3 h-[5px] max-md:hidden">
          <div className="absolute inset-x-0 top-0.5 h-px bg-rule" />
          <div className="absolute top-[1.5px] left-0 h-0.5 bg-red" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <Link
          href={EXERCISE_PLAY_HREF}
          onClick={() =>
            setPendingExercise({
              setId: set.id,
              kind: run.kind === "mistakes" ? "mistakes" : "set",
              itemIds: run.item_ids.length > 0 ? run.item_ids : undefined,
              runId: run.id,
            })
          }
          className={buttonClasses({ variant: "primary", size: "lg", block: true, className: "mt-3.5 justify-start gap-2 px-4" })}
        >
          <span className="font-semibold">Продолжить</span>
          <span aria-hidden="true" className="text-on-ink/60 max-md:hidden">
            ·
          </span>
          <span className="font-mono text-[13px] tracking-[.02em] max-md:sr-only">
            {answered} из {total}
          </span>
          <span className="flex-1" />
          <Icon name="chevron-right" size={18} strokeWidth={1.5} />
        </Link>
      </section>
    </>
  );
}

/** Offline with sets on the device (Exercise-S-Offline): the last request to copy; Claude needs the network. */
function OfflineRequestBar({ text, summary, onCopied }: { text: string; summary: string; onCopied: (ok: boolean) => void }) {
  return (
    <section
      ref={bottomBarRef}
      aria-label="Попросить набор"
      className="sticky bottom-(--shell-bottom) z-[2] -mx-4 mt-auto flex flex-col gap-2 border-t border-rule bg-paper px-4 py-3 md:static md:mx-0 md:mt-6 md:border-0 md:bg-transparent md:px-0"
    >
      <p className="meta m-0 truncate leading-4">Последний запрос · {summary}</p>
      <div className="grid grid-cols-2 gap-2 md:max-w-[480px]">
        <Button variant="secondary" onClick={() => void copyText(text).then(onCopied)}>
          <CopyGlyph />
          Скопировать
        </Button>
        <button
          type="button"
          disabled
          aria-describedby="exercise-offline-net"
          className="flex h-[52px] flex-col items-center justify-center gap-px rounded-btn border border-rule bg-surface-2 whitespace-nowrap text-muted"
        >
          <span className="inline-flex items-center gap-1 text-[15px] leading-5 font-medium">
            Открыть Claude <Icon name="external" size={16} strokeWidth={1.5} />
          </span>
          <span id="exercise-offline-net" className="font-mono text-[10px] leading-[14px] tracking-[.06em] uppercase">
            нужна сеть
          </span>
        </button>
      </div>
    </section>
  );
}
