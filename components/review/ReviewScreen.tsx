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
import { advancePractice, buildPracticeQueue, sessionFilterKey, startOfStudyDay, type QueueItem, type SessionFilter } from "@/lib/session";
import { listReviewSets, setIdOf, setSessionFilter } from "@/lib/review-sets";
import { getSettings } from "@/lib/settings";
import { useDelayedFlag } from "@/lib/use-delayed-flag";
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
import { REVIEW_DESK_CSS, ReviewCard, ReviewCardPlaceholder, WRITE_IN } from "./ReviewCard";
import { PENDING_PROGRESS, ReviewTopBar, type ReviewProgress } from "./ReviewTopBar";
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
  /**
   * Set while the outgoing card is held: it stays as it was (answer side, or flown out after a
   * swipe) until the newer read lands, then the card resets to `pinned` in the same render, so no
   * blank card shows between two cards (MOTION-SPEC R2).
   */
  hold?: { pinned: Pinned | null };
}

interface Practice {
  /** mistakes: «Повторить ошибки»; extra: «Ещё практика»; theme: «Тренировка всей темы»; set: a practice-mode set. */
  kind: "mistakes" | "extra" | "theme" | "set";
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
  // «Мои наборы»: the filter may name a saved set (`set:<id>`) instead of a theme.
  const storedSets = useLiveQuery(() => listReviewSets(), []);
  const sets = useMemo(() => storedSets ?? [], [storedSets]);
  const storedSetId = setIdOf(stored.folder);
  const storedSet = storedSetId ? (sets.find((s) => s.id === storedSetId) ?? null) : null;
  const folderKnown =
    stored.folder === "all" ||
    stored.folder === "inbox" ||
    (storedSetId ? !storedSets || !!storedSet : !folders || folders.some((f) => f.id === stored.folder));
  const folder: FolderChoice = folderKnown ? stored.folder : "all";
  const set = folderKnown ? storedSet : null;
  const liveFolderIds = useMemo(() => (folders ? new Set(folders.map((f) => f.id)) : undefined), [folders]);
  const filter = useMemo(
    () => (set ? setSessionFilter(set, direction === "both" ? undefined : direction, liveFolderIds) : toSessionFilter(direction, folder)),
    [set, direction, folder, liveFolderIds],
  );
  const filterKey = sessionFilterKey(filter);
  const loaded = ready && settings !== undefined;

  const data = useLiveQuery(
    () => (loaded ? loadReviewScreen(filter) : undefined),
    [loaded, filterKey, tick],
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
  if (awaiting?.hold && live) {
    // The newer read is in: move on in this render, before anything paints.
    setAwaiting({ ...awaiting, hold: undefined });
    setPinned(awaiting.hold.pinned);
    setInstance((n) => n + 1);
  }
  /** The graded (or undone-from) card is held until the next one is ready; input is ignored meanwhile. */
  const holding = !!awaiting?.hold && !live;
  /** A read that takes longer than --loading-delay swaps the held card for the placeholder (no
      minimum: the next card replaces the same-shaped placeholder at once). */
  const slowHold = useDelayedFlag(holding, { min: 0 });
  const heldQueue = holding ? awaiting?.data?.session.queue : undefined;
  const queue = practice ? practice.queue : (live?.session.queue ?? heldQueue);
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
  // While a card is held the screen stays as it was (e.g. «Готово на сегодня» until an undo lands).
  const emptyLibrary = !practice && !!shown && shown.libraryWords === 0;
  const emptyFolder = !practice && !!shown && !emptyLibrary && shown.filterWords === 0;
  const done = !practice && !!shown && !emptyLibrary && !emptyFolder && shown.session.queue.length === 0;

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
  const folderLabel = set
    ? set.name
    : folder === "all"
      ? "Все темы"
      : folder === "inbox"
        ? "Входящие"
        : (folderNames.get(folder) ?? "Тема");

  const resetCard = () => {
    setPinned(null);
    setInstance((n) => n + 1);
  };

  const reveal = () => {
    if (!current || holding) return;
    if (focusInCard()) refocus.current = "answer";
    setPinned({ key: current.key, revealed: true, revealedAt: Date.now(), flip: "up" });
  };

  /** Back to the question side; the answer can be flipped again with fresh intervals. */
  const hide = () => {
    if (!current || holding) return;
    if (focusInCard()) refocus.current = "reveal";
    setPinned({ key: current.key, revealed: false, revealedAt: 0, flip: "down" });
  };

  const undo = async () => {
    if (busy.current || holding) return;
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
      // The current card stays until the read with the restored one lands.
      const pinned = { key: reviewStateId(result.log.word_id, result.log.direction), revealed: false, revealedAt: 0 };
      setAwaiting({ data: before, key: null, updatedAt: null, hold: { pinned } });
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
    if (!current || (!revealed && !swiped) || busy.current || holding) return;
    const item = current;
    if (focusInCard()) refocus.current = "reveal";

    if (practice) {
      resetCard();
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
    // The graded card stays (held) until the read without it lands; then the next one shows.
    setAwaiting({ data: latestData.current, key: item.key, updatedAt: item.state.updated_at, hold: { pinned: null } });
    try {
      await gradeCard(item.word.id, item.direction, rating);
      snackbar.hide();
    } catch (error) {
      // Nothing was saved: the card stays as it was, ready for another try.
      refocus.current = null;
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
      const scope = kind === "mistakes" ? "today" : kind === "theme" || kind === "set" ? "all" : "recent";
      const items = await buildPracticeQueue({ ...over, scope });
      if (items.length === 0) {
        toast.show({
          message:
            kind === "mistakes"
              ? "Сегодня ошибок не было"
              : kind === "theme"
                ? "В теме пока нет карточек"
                : kind === "set"
                  ? "В наборе нет карточек — измените условия"
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
    // Picking a practice set (again) starts a fresh round.
    autoPracticeSet.current = null;
    resetCard();
  };

  // A practice-mode set opens straight into a practice round over the set, once per pick.
  const autoPracticeSet = useRef<string | null>(null);
  const startSetPractice = useEffectEvent(() => {
    if (!loaded || !set || set.mode !== "practice" || practice || practiceLoading) return;
    if (autoPracticeSet.current === set.id) return;
    autoPracticeSet.current = set.id;
    void startPractice("set", filter);
  });
  useEffect(() => {
    queueMicrotask(() => startSetPractice());
  }, [loaded, set?.id, set?.mode, stored.folder]);

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
    // While a graded card is held the focus stays where it is; it moves once the next card shows.
    if (!target || holding) return;
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
      left:
        practice.kind === "theme"
          ? "Тренировка темы · не влияет на расписание"
          : practice.kind === "set"
            ? "Тренировка набора · не влияет на расписание"
            : "Практика · не влияет на расписание",
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
  /** The card on screen; none while loading or when a held card waits too long (the placeholder shows). */
  const card = !loading && !(holding && slowHold) ? current : undefined;
  const cardKey = card ? `${card.key}:${instance}` : null;

  // R1: the card that replaces the placeholder writes its text in; later cards swap in one frame.
  const [afterPlaceholder, setAfterPlaceholder] = useState(true);
  const [writeInKey, setWriteInKey] = useState<string | null>(null);
  if (loading || cardsShown) {
    if (!cardKey && !afterPlaceholder) setAfterPlaceholder(true);
    if (cardKey && afterPlaceholder) {
      setAfterPlaceholder(false);
      setWriteInKey(cardKey);
    }
  }

  // overflow-clip: the flip and fly-out transforms must never widen the page (mobile browsers
  // zoom out to fit and stay zoomed). clip, unlike hidden, does not create a scroll container.
  // data-wide: from 768 up the screen lays itself out over the whole content area (running head,
  // the card centred under it); phones keep the 16px-gutter column.
  return (
    <main
      ref={mainRef}
      data-review=""
      data-wide=""
      aria-busy={loading || undefined}
      className="flex flex-1 flex-col overflow-clip px-4 pb-4 md:p-0"
    >
      <style>{REVIEW_DESK_CSS + HINT_LINE_CSS}</style>
      <ReviewTopBar
        canUndo={canUndo}
        onUndo={() => void undo()}
        letters={letters}
        hideOnDesktop={done || emptyLibrary}
        progress={loading ? PENDING_PROGRESS : cardsShown ? progress : null}
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

      {/* Loading uses the same layout as the cards (R1): the placeholder in the card's slot, the
          hint row and the grade bar's space reserved, so nothing moves when the queue arrives. */}
      {(loading || cardsShown) && (
        <div className={DESK}>
          {card && cardKey ? (
            <ReviewCard
              key={cardKey}
              word={card.word}
              direction={card.direction}
              revealed={revealed}
              onReveal={reveal}
              onHide={hide}
              flip={pinned?.key === card.key ? pinned.flip : undefined}
              haptics={hapticsEnabled}
              folderName={(card.word.folder_id && folderNames.get(card.word.folder_id)) || "Входящие"}
              swipeEnabled={cardSwipe}
              onSwipe={(outcome) => void grade(outcome === "good" ? 3 : 1, true)}
              hasNext={hasNext}
              number={ordinal ? cardNumber(ordinal) : undefined}
              remaining={remaining}
              enter={writeInKey === cardKey}
            />
          ) : (
            <ReviewCardPlaceholder />
          )}
          {/* The hint and grade bar keep their space on the question side too (invisible and inert),
              so the card does not change size when it flips. */}
          {swipeEnabled && (
            <p
              aria-hidden="true"
              className={cx("meta mt-4 mb-0 flex h-4 shrink-0 justify-between leading-4 md:hidden", card ? WRITE_IN : "invisible")}
            >
              <span>← {GRADE_LABELS[1]}</span>
              <span>{revealed ? "тап — вопрос" : "тап — ответ"}</span>
              <span>{GRADE_LABELS[3]} →</span>
            </p>
          )}
          {/* The snackbar overlays the card's footer zone just above the grade bar (R9). */}
          <div className="relative mt-4 shrink-0 md:mt-8 md:w-(--card-w) md:max-w-full">
            {snackbar.render()}
            <div
              ref={bottomBarRef}
              data-review-focus=""
              inert={!card || !revealed}
              aria-hidden={card && revealed ? undefined : true}
              className={cx((!card || !revealed) && "invisible")}
            >
              <GradeBar buttons={gradeButtons} intervals={intervals} flash={flash} onGrade={(r) => void grade(r)} />
            </div>
          </div>
          {keyHints && card && (
            <HintLine revealed={revealed} practice={!!practice} letters={letters} gradeButtons={gradeButtons} />
          )}
        </div>
      )}

      <FolderPickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        value={folder}
        onChange={setFolder}
        sets={sets}
        direction={direction === "both" ? undefined : direction}
      />
    </main>
  );
}
