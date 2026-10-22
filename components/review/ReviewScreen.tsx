"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { cx } from "@/components/ui/cx";
import { useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAddSheet } from "@/components/providers/AddSheetContext";
import { useAppReady } from "@/components/providers/AppProviders";
import { OPEN_LAYER_SELECTOR } from "@/components/shell/keys";
import { useShortcutsEnabled } from "@/components/shell/ShellContext";
import { Chip } from "@/components/ui/Chip";
import { bottomBarRef } from "@/components/ui/bottom-clearance";
import { Icon } from "@/components/ui/Icons";
import { useSnackbar } from "@/components/ui/Snackbar";
import { cardNumber } from "@/components/add/match";
import { listFolders } from "@/lib/folders";
import { previewIntervals, reviewStateId, type Rating } from "@/lib/scheduler";
import { advancePractice, buildPracticeQueue, startOfStudyDay, type QueueItem, type SessionFilter } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { useFinePointer, useLayoutClass } from "@/lib/use-media";
import { getLastReview, getWord, gradeCard, undoLastReview } from "@/lib/words";
import { loadReviewScreen, type ReviewScreenData } from "./data";
import { EmptyFolder, EmptyLibrary } from "./EmptyStates";
import { effectiveDirection, nextDirection, toSessionFilter, type FolderChoice } from "./filter";
import { FolderPickerSheet } from "./FolderPickerSheet";
import { DIRECTION_LABELS, DIRECTION_NAMES, GRADE_LABELS, formatProgress, progressRatio, queueSummary } from "./format";
import { GradeBar } from "./GradeBar";
import { HINT_LINE_CSS, HintLine } from "./HintLine";
import { isTypingTarget, keepsActivationKeys, reviewKeyAction } from "./keys";
import { REVIEW_DESK_CSS, ReviewCard, ReviewCardPlaceholder } from "./ReviewCard";
import { ReviewTopBar, type ReviewProgress } from "./ReviewTopBar";
import { SessionDone } from "./SessionDone";
import { useInlineSnackbar } from "./useInlineSnackbar";
import { useReviewFilter } from "./useReviewFilter";
import { onThemePractice, takeThemePractice } from "./practice-request";

/** Re-read the queue this often while visible, so learning steps and the 04:00 day roll over. */
const TICK_MS = 60_000;

/** Desktop: keys are ignored this long after a screen change (done, practice start/end; DESKTOP-SPEC §4). */
const INPUT_GUARD_MS = 400;
/** Desktop: a grade chosen with a key flashes its button this long before the card moves on. */
const FLASH_MS = 120;

/**
 * Desktop desk (from 768): the card and the grade row centred in the content area under the running
 * head, the hint line 24px from the bottom. On phones it is `display: contents`, so the card, hint,
 * snackbar and grade bar stay direct children of the column as before.
 */
const DESK = "contents md:relative md:flex md:min-h-0 md:flex-1 md:flex-col md:items-center md:justify-center md:px-6 md:pb-[65px]";

interface Pinned {
  key: string;
  revealed: boolean;
  /** When the answer was shown (ms); grade-button intervals are previewed at this instant. */
  revealedAt: number;
  /** Set by a flip on this card, so the side that appears turns in (up to the answer, down back). */
  flip?: "up" | "down";
}

/** Data that was current when a grade/undo started; the screen waits for a newer read. */
interface Awaiting {
  data: ReviewScreenData | undefined;
  key: string | null;
  updatedAt: string | null;
}

interface Practice {
  /** mistakes: «Повторить ошибки»; extra: «Ещё практика»; theme: «Тренировка всей темы». */
  kind: "mistakes" | "extra" | "theme";
  queue: QueueItem[];
  total: number;
  history: QueueItem[][];
}

function isFresh(data: ReviewScreenData | undefined, awaiting: Awaiting | null): data is ReviewScreenData {
  if (!data) return false;
  if (!awaiting) return true;
  if (data === awaiting.data) return false;
  if (awaiting.key) {
    const item = data.session.queue.find((i) => i.key === awaiting.key);
    if (item && item.state.updated_at === awaiting.updatedAt) return false;
  }
  return true;
}

function errorText(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Не получилось сохранить ответ";
}

/** «Повторение»: today's queue, the answer card, grading, undo, practice and the done view. */
export function ReviewScreen() {
  const ready = useAppReady();
  const addSheet = useAddSheet();
  const toast = useSnackbar();
  const snackbar = useInlineSnackbar();
  const [stored, setStored] = useReviewFilter();

  const settings = useLiveQuery(() => getSettings(), []);
  const folders = useLiveQuery(() => listFolders(), []);
  const [tick, setTick] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pinned, setPinned] = useState<Pinned | null>(null);
  const [awaiting, setAwaiting] = useState<Awaiting | null>(null);
  const [instance, setInstance] = useState(0);
  const [practice, setPractice] = useState<Practice | null>(null);
  const [practiceLoading, setPracticeLoading] = useState(false);
  const [flash, setFlash] = useState<Rating | null>(null);
  const busy = useRef(false);
  const flashing = useRef(false);
  /** performance.now() until which desktop keys are ignored (screen just changed). */
  const guardUntil = useRef(0);
  const layout = useLayoutClass();
  const desktop = layout !== "compact";
  const finePointer = useFinePointer();
  const shortcutsEnabled = useShortcutsEnabled();
  /** Single-letter keys (Z, P): settings.shortcuts on desktop; phones keep Z as before. */
  const letters = desktop ? shortcutsEnabled : true;
  /** Whether focus last moved by pointer (then Space/Enter on a focused button still flip the card). */
  const focusByPointer = useRef(false);
  /**
   * Revealing or grading unmounts the focused control (the question card, grade buttons). Where
   * focus should go once the new controls render, so keyboard and screen-reader users land on the
   * answer, then on the next question card.
   */
  const refocus = useRef<"answer" | "reveal" | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const focusInCard = () => {
    const active = document.activeElement;
    return !!active && active !== document.body && !!mainRef.current?.contains(active) && !!active.closest("[data-review-focus]");
  };

  const direction = effectiveDirection(stored, settings?.default_direction ?? "fr_ru");
  const folderKnown =
    stored.folder === "all" || stored.folder === "inbox" || !folders || folders.some((f) => f.id === stored.folder);
  const folder: FolderChoice = folderKnown ? stored.folder : "all";
  const filter = useMemo(() => toSessionFilter(direction, folder), [direction, folder]);
  const loaded = ready && settings !== undefined;

  const data = useLiveQuery(
    () => (loaded ? loadReviewScreen(filter) : undefined),
    [loaded, filter.direction, filter.folderId, tick],
  );
  const lastToday = useLiveQuery(async () => {
    const last = await getLastReview();
    return last && last.review >= startOfStudyDay().toISOString() ? last : null;
  }, [tick]);

  const latestData = useRef(data);
  useLayoutEffect(() => {
    latestData.current = data;
  }, [data]);

  useEffect(() => {
    const bump = () => {
      if (document.visibilityState === "visible" && !busy.current) setTick((t) => t + 1);
    };
    const timer = window.setInterval(bump, TICK_MS);
    window.addEventListener("focus", bump);
    document.addEventListener("visibilitychange", bump);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", bump);
      document.removeEventListener("visibilitychange", bump);
    };
  }, []);

  const live = isFresh(data, awaiting) ? data : undefined;
  const queue = practice ? practice.queue : live?.session.queue;
  const current = queue ? ((pinned && queue.find((i) => i.key === pinned.key)) ?? queue[0]) : undefined;
  const revealed = !!current && pinned?.key === current.key && pinned.revealed;
  const hasNext = !!queue && queue.some((i) => i.key !== current?.key);
  const gradeButtons = settings?.grade_buttons ?? 3;
  const swipeEnabled = settings?.swipe_grading ?? true;
  // With a mouse or trackpad a drag does not grade: a click flips, keys and buttons grade.
  const cardSwipe = swipeEnabled && !finePointer;
  const keyHints = settings?.key_hints ?? true;
  const hapticsEnabled = settings?.haptics ?? true;
  const canUndo = practice ? practice.history.length > 0 : !!lastToday;

  const shown = live ?? awaiting?.data;
  const loading = !practice && (!loaded || shown === undefined);
  const emptyLibrary = !practice && !!live && live.libraryWords === 0;
  const emptyFolder = !practice && !!live && !emptyLibrary && live.filterWords === 0;
  const done = !practice && !!live && !emptyLibrary && !emptyFolder && live.session.queue.length === 0;

  // Desktop input guard: a screen change (done, practice start/end) ignores keys for 400ms, also
  // key presses that began before it (e.g. a held «3» on the last card landing on «Готово»).
  const inPractice = !!practice;
  const screenKey = done ? "done" : inPractice ? "practice" : "cards";
  const previousScreen = useRef(screenKey);
  useEffect(() => {
    if (previousScreen.current === screenKey) return;
    previousScreen.current = screenKey;
    guardUntil.current = performance.now() + INPUT_GUARD_MS;
  }, [screenKey]);

  const revealedAt = revealed && pinned ? pinned.revealedAt : 0;
  const currentState = current?.state;
  const intervals = useMemo(
    () => (!practice && currentState && revealedAt ? previewIntervals(currentState, new Date(revealedAt)) : undefined),
    [practice, currentState, revealedAt],
  );

  const folderNames = useMemo(() => new Map((folders ?? []).map((f) => [f.id, f.name])), [folders]);
  const folderLabel = folder === "all" ? "Все темы" : folder === "inbox" ? "Входящие" : (folderNames.get(folder) ?? "Тема");

  const resetCard = () => {
    setPinned(null);
    setInstance((n) => n + 1);
  };

  const reveal = () => {
    if (!current) return;
    if (focusInCard()) refocus.current = "answer";
    setPinned({ key: current.key, revealed: true, revealedAt: Date.now(), flip: "up" });
  };

  /** Back to the question side; the answer can be flipped again with fresh intervals. */
  const hide = () => {
    if (!current) return;
    if (focusInCard()) refocus.current = "reveal";
    setPinned({ key: current.key, revealed: false, revealedAt: 0, flip: "down" });
  };

  const undo = async () => {
    if (busy.current) return;
    if (practice) {
      setPractice((p) => {
        const previous = p?.history.at(-1);
        return p && previous ? { ...p, queue: previous, history: p.history.slice(0, -1) } : p;
      });
      resetCard();
      snackbar.hide();
      return;
    }
    busy.current = true;
    const before = latestData.current;
    try {
      const result = await undoLastReview();
      if (!result) return;
      setAwaiting({ data: before, key: null, updatedAt: null });
      setPinned({ key: reviewStateId(result.log.word_id, result.log.direction), revealed: false, revealedAt: 0 });
      setInstance((n) => n + 1);
      const word = await getWord(result.log.word_id);
      snackbar.show({
        message: word ? (
          <>
            Ответ отменён ·{" "}
            <span lang="fr" className="font-serif text-[16px] italic">
              {word.fr}
            </span>
          </>
        ) : (
          "Ответ отменён"
        ),
      });
    } catch (error) {
      snackbar.show({ message: errorText(error) });
    } finally {
      busy.current = false;
    }
  };

  /** A swipe grades from either side; buttons and keys only from the answer. */
  const grade = async (rating: Rating, swiped = false) => {
    if (!current || (!revealed && !swiped) || busy.current) return;
    const item = current;
    if (focusInCard()) refocus.current = "reveal";
    resetCard();

    if (practice) {
      const nextQueue = advancePractice(practice.queue, rating);
      if (nextQueue.length === 0) {
        setPractice(null);
        snackbar.show({ message: "Практика окончена" });
        return;
      }
      setPractice({ ...practice, queue: nextQueue, history: [...practice.history, practice.queue] });
      snackbar.hide();
      return;
    }

    busy.current = true;
    setAwaiting({ data: latestData.current, key: item.key, updatedAt: item.state.updated_at });
    try {
      await gradeCard(item.word.id, item.direction, rating);
      snackbar.hide();
    } catch (error) {
      setAwaiting(null);
      snackbar.show({ message: errorText(error) });
    } finally {
      busy.current = false;
    }
  };

  const startPractice = async (kind: Practice["kind"], over: SessionFilter = filter) => {
    if (practiceLoading) return;
    setPracticeLoading(true);
    try {
      const scope = kind === "mistakes" ? "today" : kind === "theme" ? "all" : "recent";
      const items = await buildPracticeQueue({ ...over, scope });
      if (items.length === 0) {
        toast.show({
          message:
            kind === "mistakes"
              ? "Сегодня ошибок не было"
              : kind === "theme"
                ? "В теме пока нет карточек"
                : "Пока нечего повторять — сначала ответьте на несколько карточек",
        });
        return;
      }
      setPractice({ kind, queue: items, total: items.length, history: [] });
      resetCard();
      snackbar.hide();
    } finally {
      setPracticeLoading(false);
    }
  };

  // «Тренировка всей темы» from the library (`/?folder=…&practice=1`), once the screen can run it.
  const takeThemeRequest = useEffectEvent(() => {
    if (!loaded) return;
    const requested = takeThemePractice();
    if (requested) void startPractice("theme", toSessionFilter(direction, requested));
  });
  useEffect(() => {
    // After the commit: starting a round sets state.
    const check = () => queueMicrotask(() => takeThemeRequest());
    check();
    return onThemePractice(check);
  }, [loaded]);

  const endPractice = () => {
    setPractice(null);
    resetCard();
    snackbar.hide();
  };

  /** Desktop: a grade chosen with a key flashes its button (ink fill), then the card moves on. */
  const gradeWithFlash = (rating: Rating) => {
    if (!desktop) {
      void grade(rating);
      return;
    }
    if (flashing.current || busy.current) return;
    flashing.current = true;
    setFlash(rating);
    window.setTimeout(() => {
      flashing.current = false;
      setFlash(null);
      void grade(rating);
    }, FLASH_MS);
  };

  const setFolder = (value: FolderChoice) => {
    setStored({ ...stored, folder: value });
    resetCard();
  };

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || isTypingTarget(event.target)) return;
    if (pickerOpen || addSheet.isOpen || document.querySelector('[role="dialog"]')) return;
    if (desktop && (document.querySelector(OPEN_LAYER_SELECTOR) || event.timeStamp < guardUntil.current || flashing.current)) return;
    const action = reviewKeyAction(event, { revealed, gradeButtons, letters, desktop, done, practice: !!practice });
    if (!action) return;
    if (action.type === "practice") {
      event.preventDefault();
      void startPractice("extra");
      return;
    }
    if (action.type === "end-practice") {
      event.preventDefault();
      endPractice();
      return;
    }
    if (action.type === "undo") {
      if (!canUndo) return;
      event.preventDefault();
      void undo();
      return;
    }
    if (!current) return;
    if ((event.key === " " || event.key === "Enter") && keepsActivationKeys(event.target, focusByPointer.current)) return;
    event.preventDefault();
    if (action.type === "flip") reveal();
    else if (action.type === "unflip") hide();
    else gradeWithFlash(action.rating);
  });

  useEffect(() => {
    const onPointerDown = () => {
      focusByPointer.current = true;
    };
    const onTab = (event: KeyboardEvent) => {
      if (event.key === "Tab") focusByPointer.current = false;
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onTab, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onTab, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    const target = refocus.current;
    if (!target) return;
    // Desktop «Готово на сегодня» places focus itself (on «Повторить ошибки»).
    if (desktop && done) {
      refocus.current = null;
      return;
    }
    const root = mainRef.current;
    if (target === "answer") {
      const answer = root?.querySelector<HTMLElement>("[data-review-answer]");
      if (!answer) return;
      refocus.current = null;
      answer.focus({ preventScroll: true });
      return;
    }
    // The next question card, or the «Готово на сегодня» heading when the session ended.
    const button = root?.querySelector<HTMLButtonElement>("[data-review-reveal]");
    const next = button ? (button.disabled ? null : button) : root?.querySelector<HTMLElement>("h1[tabindex]");
    if (!next) return;
    refocus.current = null;
    next.focus({ preventScroll: true });
  });


  let progress: ReviewProgress | null = null;
  if (practice) {
    const remaining = new Set(practice.queue.map((i) => i.key)).size;
    const cleared = practice.total - remaining;
    progress = {
      left: practice.kind === "theme" ? "Тренировка темы · не влияет на расписание" : "Практика · не влияет на расписание",
      right: formatProgress(cleared, practice.total),
      ratio: progressRatio(cleared, practice.total),
    };
  } else if (shown && !done) {
    const c = shown.session.counts;
    progress = {
      left: queueSummary(c.due, c.new),
      right: formatProgress(c.done, c.total),
      ratio: progressRatio(c.done, c.total),
    };
  }

  const ordinals = (live ?? awaiting?.data)?.ordinals;
  const ordinal = current ? ordinals?.get(current.word.id) : undefined;
  /** Cards after this one (the desktop stack shows up to two outlines). */
  const remaining = queue && current ? new Set(queue.map((i) => i.key)).size - 1 : 0;
  const cardsShown = !loading && !emptyLibrary && !emptyFolder && !done;

  // overflow-clip: the flip and fly-out transforms must never widen the page (mobile browsers
  // zoom out to fit and stay zoomed). clip, unlike hidden, does not create a scroll container.
  // data-wide: from 768 up the screen lays itself out over the whole content area (running head,
  // the card centred under it); phones keep the 16px-gutter column.
  return (
    <main ref={mainRef} data-review="" data-wide="" className="flex flex-1 flex-col overflow-clip px-4 pb-4 md:p-0">
      <style>{REVIEW_DESK_CSS + HINT_LINE_CSS}</style>
      <ReviewTopBar
        canUndo={canUndo}
        onUndo={() => void undo()}
        letters={letters}
        hideOnDesktop={done || emptyLibrary}
        progress={cardsShown ? progress : null}
        heading={cardsShown ? <h1 className="sr-only">Повторение</h1> : null}
      >
        {practice ? (
          <Chip
            icon="close"
            onClick={endPractice}
            aria-keyshortcuts={desktop ? "Escape" : undefined}
            title={desktop ? "Закончить практику (Esc)" : undefined}
            className="md:border-boundary hoverable:bg-hover-surface"
          >
            Закончить практику
          </Chip>
        ) : (
          <>
            <Chip
              mono
              aria-label={`Направление ${DIRECTION_NAMES[direction]}, сменить`}
              onClick={() => {
                setStored({ ...stored, direction: nextDirection(direction) });
                resetCard();
              }}
              className="md:border-boundary hoverable:bg-hover-surface"
            >
              <span>{DIRECTION_LABELS[direction]}</span>
              <Icon name="swap" size={14} className="text-muted" />
            </Chip>
            <Chip
              dropdown
              aria-haspopup="dialog"
              onClick={() => setPickerOpen(true)}
              className="min-w-0 shrink! md:border-boundary hoverable:bg-hover-surface"
            >
              <span className="min-w-0 truncate">{folderLabel}</span>
            </Chip>
          </>
        )}
      </ReviewTopBar>

      {loading && (
        <div className={DESK}>
          <ReviewCardPlaceholder />
          {/* The grade row's place, so the card does not move when it loads. */}
          <div aria-hidden="true" className="mt-8 h-14 max-md:hidden" />
        </div>
      )}

      {emptyLibrary && <EmptyLibrary onAdd={() => addSheet.open()} />}

      {emptyFolder && <EmptyFolder folderName={folderLabel} onShowAll={() => setFolder("all")} onAdd={() => addSheet.open()} />}

      {done && (
        <SessionDone
          filter={filter}
          tick={tick}
          busy={practiceLoading}
          desktop={desktop}
          letters={letters}
          onRepeatMistakes={() => void startPractice("mistakes")}
          onPractice={() => void startPractice("extra")}
          onAddWords={() => addSheet.open()}
          snackbar={snackbar.render("mb-4", "done")}
        />
      )}

      {cardsShown && (
        <div className={DESK}>
          {current ? (
            <ReviewCard
              key={`${current.key}:${instance}`}
              word={current.word}
              direction={current.direction}
              revealed={revealed}
              onReveal={reveal}
              onHide={hide}
              flip={pinned?.key === current.key ? pinned.flip : undefined}
              haptics={hapticsEnabled}
              folderName={(current.word.folder_id && folderNames.get(current.word.folder_id)) || "Входящие"}
              swipeEnabled={cardSwipe}
              onSwipe={(outcome) => void grade(outcome === "good" ? 3 : 1, true)}
              hasNext={hasNext}
              number={ordinal ? cardNumber(ordinal) : undefined}
              remaining={remaining}
            />
          ) : (
            <ReviewCardPlaceholder />
          )}
          {/* The hint and grade bar keep their space on the question side too (invisible and inert),
              so the card does not change size when it flips. */}
          {swipeEnabled && (
            <p
              aria-hidden="true"
              className="meta mt-4 mb-0 flex h-4 shrink-0 justify-between leading-4 md:hidden"
            >
              <span>← {GRADE_LABELS[1]}</span>
              <span>{revealed ? "тап — вопрос" : "тап — ответ"}</span>
              <span>{GRADE_LABELS[3]} →</span>
            </p>
          )}
          {snackbar.render()}
          <div
            ref={bottomBarRef}
            data-review-focus=""
            inert={!revealed}
            aria-hidden={revealed ? undefined : true}
            className={cx("mt-4 shrink-0 md:mt-8 md:w-(--card-w) md:max-w-full", !revealed && "invisible")}
          >
            <GradeBar buttons={gradeButtons} intervals={intervals} flash={flash} onGrade={(r) => void grade(r)} />
          </div>
          {keyHints && current && (
            <HintLine revealed={revealed} practice={!!practice} letters={letters} gradeButtons={gradeButtons} />
          )}
        </div>
      )}

      <FolderPickerSheet open={pickerOpen} onOpenChange={setPickerOpen} value={folder} onChange={setFolder} />
    </main>
  );
}
