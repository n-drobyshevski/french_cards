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
import { useFieldDefs } from "@/lib/custom-fields";
import { listFolders } from "@/lib/folders";
import { haptic, type HapticKind } from "@/lib/haptics";
import { tokenMs } from "@/lib/motion";
import { LEARN_AHEAD_MS } from "@/lib/core/plan";
import { previewIntervals, reviewStateId, type Rating } from "@/lib/scheduler";
import { advancePractice, buildPracticeQueue, sessionFilterKey, startOfStudyDay, type QueueItem, type SessionFilter } from "@/lib/session";
import { listReviewSets, setIdOf, setSessionFilter } from "@/lib/review-sets";
import { getSettings } from "@/lib/settings";
import { useDelayedFlag } from "@/lib/use-delayed-flag";
import { useLayoutClass } from "@/lib/use-media";
import { getLastReview, getWord, gradeCard, restoreWords, softDeleteWords, undoLastReview, updateWord } from "@/lib/words";
import { returnSide, type CardArrival, type CardExit, type ReturnSide } from "./card-motion";
import { loadDoneScreen, loadReviewScreen, type ReviewScreenData } from "./data";
import { EmptyFolder, EmptyLibrary } from "./EmptyStates";
import { effectiveDirection, nextDirection, toSessionFilter, type FolderChoice } from "./filter";
import { WordDetailSheet } from "@/components/library/WordDetailSheet";
import { FolderPickerSheet } from "./FolderPickerSheet";
import { DIRECTION_LABELS, DIRECTION_NAMES, GRADE_LABELS, formatProgress, progressRatio, queueSummaryParts } from "./format";
import { GradeBar } from "./GradeBar";
import { HINT_LINE_CSS, HintLine } from "./HintLine";
import { isTypingTarget, keepsActivationKeys, reviewKeyAction } from "./keys";
import { CardDeck, LeavingCard, REVIEW_DESK_CSS, ReviewCard, ReviewCardPlaceholder, WRITE_IN, type CardFace } from "./ReviewCard";
import { PENDING_PROGRESS, ReviewTopBar, type GradeEcho, type ReviewProgress } from "./ReviewTopBar";
import { SessionDone } from "./SessionDone";
import { PlanPopover, PlanSheet, PlanSubline, type PlanData } from "./PlanParts";
import { newTicks, queueNew, summaryAria, waitingSummary } from "./plan-format";
import { WaitScreen } from "./WaitScreen";
import { useInlineSnackbar } from "./useInlineSnackbar";
import { useReviewFilter } from "./useReviewFilter";
import { onThemePractice, takeThemePractice } from "./practice-request";

/** Re-read the queue this often while visible, so learning steps and the 04:00 day roll over. */
const TICK_MS = 60_000;

/** Desktop: keys are ignored this long after a screen change (done, practice start/end; DESKTOP-SPEC §4). */
const INPUT_GUARD_MS = 400;

/** A grade or undo made while the previous one is still being saved waits at most this long, then is dropped. */
const SAVE_WAIT_MS = 2000;

/** Haptic of a grade (MOTION-SPEC §5.13): «Знаю» good, «Не знаю» again, «Сложно» a tick. */
const GRADE_HAPTIC: Record<Rating, HapticKind> = { 1: "again", 2: "tick", 3: "good", 4: "good" };

/** The progress echo's tone of a grade (R12): «Знаю» good, «Не знаю» again, «Сложно» ink. */
const GRADE_ECHO: Record<Rating, GradeEcho["tone"]> = { 1: "again", 2: "ink", 3: "good", 4: "good" };
let echoSeq = 0;

/**
 * The grade bar's labels fade in --dur-quick once the headword has glided (R3; the bar's slot is
 * always reserved); from 768 (D2) and under reduced motion with the answer, at once.
 */
const GRADE_BAR_IN =
  "animate-[fade-in_var(--dur-quick)_var(--ease-enter)_calc(var(--dur-move)*var(--motion-scale))_both] md:animate-[fade-in_var(--dur-quick)_var(--ease-enter)_both]";

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
  /** Set by a flip on this card, so the side that appears writes in (up to the answer, down back). */
  flip?: "up" | "down";
}

/** Data that was current when a grade/undo started; the screen waits for a newer read. */
interface Awaiting {
  data: ReviewScreenData | undefined;
  key: string | null;
  updatedAt: string | null;
  /**
   * Set until the newer read lands. grade: the graded card has already left (a LeavingCard) and the
   * next one is shown from the old queue without it, so no blank card shows between two cards
   * (MOTION-SPEC R2, R5). undo: the current card stays until the restored one can come back from
   * the side it left (R7).
   */
  hold?: { kind: "grade" } | { kind: "undo"; pinned: Pinned; from: ReturnSide | null };
}

interface Practice {
  /** mistakes: «Повторить ошибки»; extra: «Ещё практика»; theme: «Тренировка всей темы»; set: a practice-mode set. */
  kind: "mistakes" | "extra" | "theme" | "set";
  queue: QueueItem[];
  total: number;
  /** Queues before each answer, and the side the answered card left by (undo brings it back from there). */
  history: { queue: QueueItem[]; side: ReturnSide }[];
}

/** A graded card still playing its exit. */
interface Leaving extends CardFace {
  id: number;
  revealed: boolean;
  folderName: string;
  exit: CardExit;
}

let leavingSeq = 0;

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
  // «Свои поля» on the answer side (shared fields under their current names).
  const fieldDefs = useFieldDefs();
  const [tick, setTick] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  /** «Изменить карточку»: the word whose sheet is open over the card. */
  const [editId, setEditId] = useState<string | null>(null);
  /** «План на сегодня»: the sheet (phones) or the popover under the summary (desktop). */
  const [planOpen, setPlanOpen] = useState(false);
  const summaryRef = useRef<HTMLButtonElement>(null);
  /**
   * «Готово на сегодня» from the wait screen: the cards that were waiting (per filter). The done
   * screen stays while only they are left; they come back on the next visit.
   */
  const [skipWait, setSkipWait] = useState<{ filter: string; keys: ReadonlySet<string> } | null>(null);
  const [pinned, setPinned] = useState<Pinned | null>(null);
  const [awaiting, setAwaiting] = useState<Awaiting | null>(null);
  const [instance, setInstance] = useState(0);
  const [practice, setPractice] = useState<Practice | null>(null);
  /** The practice round being built (its kind), so «Готово на сегодня» shows which action waits (R11). */
  const [practiceLoading, setPracticeLoading] = useState<Practice["kind"] | null>(null);
  const [flash, setFlash] = useState<Rating | null>(null);
  /** The latest grade, echoed by the progress step it causes (R12); `practice` keeps it to its round. */
  const [lastGrade, setLastGrade] = useState<(GradeEcho & { practice: boolean }) | null>(null);
  /** Graded cards on their way out, over the next card. */
  const [leaving, setLeaving] = useState<Leaving[]>([]);
  /** How the card with this key appears: out of the stack after a grade, or back after an undo. */
  const [arrival, setArrival] = useState<{ key: string; arrive: CardArrival } | null>(null);
  const busy = useRef(false);
  const flashing = useRef(false);
  /** performance.now() until which desktop keys are ignored (screen just changed). */
  const guardUntil = useRef(0);
  const layout = useLayoutClass();
  const desktop = layout !== "compact";
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

  // The wait screen returns to the cards by itself: re-read when the first waiting card comes
  // within the learn-ahead window (it then joins the queue).
  const nextWaitDue = data?.session.queue.length === 0 ? data.session.nextDue : null;
  useEffect(() => {
    if (!nextWaitDue) return;
    const delay = Date.parse(nextWaitDue) - LEARN_AHEAD_MS - Date.now() + 250;
    if (delay > 2 ** 31 - 1) return;
    const timer = window.setTimeout(() => setTick((t) => t + 1), Math.max(0, delay));
    return () => window.clearTimeout(timer);
  }, [nextWaitDue]);

  const live = isFresh(data, awaiting) ? data : undefined;
  if (awaiting?.hold && live) {
    // The newer read is in: move on in this render, before anything paints.
    const hold = awaiting.hold;
    setAwaiting({ ...awaiting, hold: undefined });
    if (hold.kind === "undo") {
      // The restored card comes back over the one that was current, which drops into the stack.
      setPinned(hold.pinned);
      setInstance(instance + 1);
      setArrival({ key: `${hold.pinned.key}:${instance + 1}`, arrive: { kind: "return", from: hold.from } });
    }
  }
  /** A grade or undo waits for its read. Meanwhile the next card can be turned over, and a grade or
      undo waits for the read before it applies. */
  const holding = !!awaiting?.hold && !live;
  const undoing = holding && awaiting?.hold?.kind === "undo";
  /** An undo whose read takes longer than --loading-delay swaps the card for the placeholder (no
      minimum: the restored card replaces the same-shaped placeholder at once). */
  const slowUndo = useDelayedFlag(undoing, { min: 0 });
  // While a grade waits, the queue it was made in without the graded card: the next card is in place.
  const heldQueue = holding ? awaiting?.data?.session.queue.filter((i) => i.key !== awaiting.key) : undefined;
  const queue = practice ? practice.queue : (live?.session.queue ?? heldQueue);
  const current = queue ? ((pinned && queue.find((i) => i.key === pinned.key)) ?? queue[0]) : undefined;
  const nextItem = queue && current ? queue.find((i) => i.key !== current.key) : undefined;
  const revealed = !!current && pinned?.key === current.key && pinned.revealed;
  // The current word as stored now: an edit shows on the card at once (practice rounds keep their own copies).
  const currentWordId = current?.word.id;
  const storedWord = useLiveQuery(() => (currentWordId ? getWord(currentWordId) : undefined), [currentWordId]);
  const gradeButtons = settings?.grade_buttons ?? 3;
  const swipeEnabled = settings?.swipe_grading ?? true;
  // A mouse drags the card too (click and hold, then drag sideways); a click still flips.
  const cardSwipe = swipeEnabled;
  const keyHints = settings?.key_hints ?? true;
  const hapticsEnabled = settings?.haptics ?? true;
  const canUndo = practice ? practice.history.length > 0 : !!lastToday;

  const shown = live ?? awaiting?.data;
  const loading = !practice && (!loaded || shown === undefined);
  // While a card is held the screen stays as it was (e.g. «Готово на сегодня» until an undo lands).
  const emptyLibrary = !practice && !!shown && shown.libraryWords === 0;
  const emptyFolder = !practice && !!shown && !emptyLibrary && shown.filterWords === 0;
  const settled = !practice && !!shown && !emptyLibrary && !emptyFolder;
  const session = shown?.session;
  const queueEmpty = !!session && session.queue.length === 0;
  // After «Готово на сегодня» on the wait screen, only the cards that were waiting are left.
  const skipped =
    !!session &&
    !!skipWait &&
    skipWait.filter === filterKey &&
    [...session.queue, ...session.waiting].every((item) => skipWait.keys.has(item.key));
  /** Nothing to show now, but learning cards come back later today (Review-Wait). */
  const waitShown = settled && queueEmpty && !!session && session.waiting.length > 0 && !skipped;
  const done = settled && !waitShown && (queueEmpty || skipped);

  // «Готово на сегодня» reads its summary as soon as the session is done, during the hold below, so
  // it never opens on a blank frame (R10).
  const doneData = useLiveQuery(() => (done ? loadDoneScreen(filter) : undefined), [done, filterKey, tick]);

  // R8 / §5.12: the last grade of a session fills the progress line; the card layout holds it
  // --dur-done-hold, then «Готово на сегодня» plays its moment — once: not on a cold open, not back
  // from a practice round, not again after an undo and a new last grade.
  const view = practice ? "practice" : loading ? "loading" : emptyLibrary || emptyFolder ? "empty" : done ? "done" : waitShown ? "wait" : "cards";
  const [lastView, setLastView] = useState(view);
  const [finishing, setFinishing] = useState(false);
  const [moment, setMoment] = useState(false);
  const [momentPlayed, setMomentPlayed] = useState(false);
  if (view !== lastView) {
    setLastView(view);
    const finished = view === "done" && (lastView === "cards" || lastView === "wait");
    // The last grade's hold is for a card that just left; from the wait screen the moment plays at once.
    setFinishing(finished && lastView === "cards");
    if (finished && !momentPlayed) {
      setMoment(true);
      setMomentPlayed(true);
    } else if (view !== "done") setMoment(false);
  }
  useEffect(() => {
    if (!finishing) return;
    const timer = window.setTimeout(() => setFinishing(false), tokenMs("--dur-done-hold", 400));
    return () => window.clearTimeout(timer);
  }, [finishing]);
  const finishingView = done && (finishing || (moment && !doneData));
  const doneShown = done && !finishingView;

  // Desktop input guard: a screen change (done, practice start/end) ignores keys for 400ms, also
  // key presses that began before it (e.g. a held «3» on the last card landing on «Готово»).
  const inPractice = !!practice;
  const screenKey = doneShown ? "done" : inPractice ? "practice" : "cards";
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
  const ordinals = (live ?? awaiting?.data)?.ordinals;
  /** The item's word, edited copy included. */
  const wordOf = (item: QueueItem) => (storedWord?.id === item.word.id ? storedWord : item.word);
  const faceOf = (item: QueueItem): CardFace => {
    const ordinal = ordinals?.get(item.word.id);
    return { word: wordOf(item), direction: item.direction, number: ordinal ? cardNumber(ordinal) : undefined, fieldDefs, isNew: item.isNew };
  };
  const folderOf = (item: QueueItem) => {
    const word = wordOf(item);
    return (word.folder_id && folderNames.get(word.folder_id)) || "Входящие";
  };

  const resetCard = () => {
    setPinned(null);
    setInstance((n) => n + 1);
  };

  // The next card can be turned over while the previous grade's read is still on its way (R5); the
  // pin carries over to the newer read.
  const reveal = () => {
    if (!current || undoing || flashing.current) return;
    if (focusInCard() || refocus.current) refocus.current = "answer";
    setPinned({ key: current.key, revealed: true, revealedAt: Date.now(), flip: "up" });
  };

  /** Back to the question side; the answer can be flipped again with fresh intervals. */
  const hide = () => {
    if (!current || undoing || flashing.current) return;
    if (focusInCard() || refocus.current) refocus.current = "reveal";
    setPinned({ key: current.key, revealed: false, revealedAt: 0, flip: "down" });
  };

  /**
   * Undo (R7): the previous card returns, question side up, from the side it left (desktop: in
   * place). «wait»: a grade is still flashing, being written or read.
   */
  const undo = (): "done" | "wait" => {
    if (busy.current || holding || flashing.current) return "wait";
    if (practice) {
      const previous = practice.history.at(-1);
      if (!previous) return "done";
      const restored = previous.queue[0];
      setPractice({ ...practice, queue: previous.queue, history: practice.history.slice(0, -1) });
      setPinned(null);
      setInstance(instance + 1);
      if (restored) {
        setArrival({ key: `${restored.key}:${instance + 1}`, arrive: { kind: "return", from: desktop ? null : previous.side } });
      }
      snackbar.hide();
      return "done";
    }
    busy.current = true;
    const before = latestData.current;
    void (async () => {
      try {
        const result = await undoLastReview();
        if (!result) return;
        // The current card stays until the read with the restored one lands.
        const pinned = { key: reviewStateId(result.log.word_id, result.log.direction), revealed: false, revealedAt: 0 };
        const from = desktop ? null : returnSide(result.log.rating);
        setAwaiting({ data: before, key: null, updatedAt: null, hold: { kind: "undo", pinned, from } });
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
    })();
    return "done";
  };
  const undoLatest = useRef(undo);
  useLayoutEffect(() => {
    undoLatest.current = undo;
  });

  /** Undo now, or as soon as the grade before it has been saved (a quick Z right after «3»). */
  const requestUndo = (fromKey = false) => {
    // A tap on the header button ticks; keys never vibrate (§5.13).
    if (!fromKey && hapticsEnabled) haptic("tick");
    const started = performance.now();
    const attempt = () => {
      if (undoLatest.current() === "wait" && performance.now() - started < SAVE_WAIT_MS) window.setTimeout(attempt, 16);
    };
    attempt();
  };

  /**
   * Applies a grade: from either side by a swipe, from the answer by a button or key. The card
   * leaves at once — as a LeavingCard playing `exit`; none on desktop, where the next card simply
   * takes its place (D1) — and the next card settles out of the stack (R5) while the grade is
   * written; `from` is how far a drag had already grown it. «wait»: the previous grade or an undo is
   * still being written or read; «no»: there is no such card (any more).
   */
  const commitGrade = (rating: Rating, exit: CardExit | null, from = 0, key?: string): "done" | "wait" | "no" => {
    if (!current || (key && current.key !== key)) return "no";
    if (busy.current || holding) return "wait";
    const item = current;
    const before = pinned;
    if (focusInCard()) refocus.current = "reveal";
    if (exit) {
      const id = ++leavingSeq;
      setLeaving((list) => [...list, { ...faceOf(item), id, revealed, folderName: folderOf(item), exit }]);
    }
    const nextQueue = practice ? advancePractice(practice.queue, rating) : (queue ?? []).filter((i) => i.key !== item.key);
    const following = nextQueue[0];
    setArrival(following && exit ? { key: `${following.key}:${instance + 1}`, arrive: { kind: "stack", from, at: performance.now() } } : null);
    setInstance(instance + 1);
    setPinned(null);
    setFlash(null);
    setLastGrade({ seq: ++echoSeq, tone: GRADE_ECHO[rating], practice: !!practice });

    if (practice) {
      if (nextQueue.length === 0) {
        setPractice(null);
        snackbar.show({ message: "Практика окончена" });
        return "done";
      }
      setPractice({ ...practice, queue: nextQueue, history: [...practice.history, { queue: practice.queue, side: returnSide(rating) }] });
      snackbar.hide();
      return "done";
    }

    busy.current = true;
    // The next card shows from the old queue until the read without the graded one lands.
    setAwaiting({ data: latestData.current, key: item.key, updatedAt: item.state.updated_at, hold: { kind: "grade" } });
    void (async () => {
      try {
        await gradeCard(item.word.id, item.direction, rating);
        snackbar.hide();
      } catch (error) {
        // Nothing was saved: the card comes back as it was, ready for another try.
        refocus.current = null;
        setAwaiting(null);
        setPinned(before);
        setLastGrade(null);
        snackbar.show({ message: errorText(error) });
      } finally {
        busy.current = false;
      }
    })();
    return "done";
  };
  /**
   * «На паузу» / «Удалить слово» on the answer side: the word leaves review (and the practice round,
   * history included, so an undone grade cannot bring it back); the next card takes its place and
   * the snackbar offers «Отменить».
   */
  const takeOut = (kind: "mute" | "delete") => {
    if (!current || busy.current || holding) return;
    const { id, fr } = current.word;
    busy.current = true;
    void (async () => {
      try {
        if (kind === "delete") await softDeleteWords([id]);
        else await updateWord(id, { muted: true });
        setPinned(null);
        setInstance((n) => n + 1);
        if (practice) {
          const keep = (q: QueueItem[]) => q.filter((i) => i.word.id !== id);
          const rest = keep(practice.queue);
          setPractice(rest.length ? { ...practice, queue: rest, history: practice.history.map((h) => ({ ...h, queue: keep(h.queue) })) } : null);
        }
        snackbar.show({
          message: (
            <>
              {kind === "delete" ? "Удалено" : "На паузе"} ·{" "}
              <span lang="fr" className="font-serif text-[16px] italic">
                {fr}
              </span>
            </>
          ),
          actionLabel: "Отменить",
          onAction: () => void (kind === "delete" ? restoreWords([id]) : updateWord(id, { muted: false })).catch(() => {}),
        });
      } catch (error) {
        snackbar.show({ message: errorText(error) });
      } finally {
        busy.current = false;
      }
    })();
  };

  // The flash below commits after --dur-flash, with the screen as it is then.
  const commitLatest = useRef(commitGrade);
  useLayoutEffect(() => {
    commitLatest.current = commitGrade;
  });

  /**
   * A grade from a button or a key (R6, D1): the button fills with its tone and holds --dur-flash,
   * then the card leaves — on phones in the grade's direction while the next one rises from the
   * stack; from 768 swapped in place, no travel. A pressed button plays its haptic on the press
   * itself (inside the user activation); keys never vibrate. The fill holds a little longer if the
   * previous grade is still being written or read (the next card is answerable meanwhile, R5).
   */
  const gradeWithFlash = (rating: Rating, pressed = false) => {
    if (!current || !revealed || flashing.current || undoing) return;
    const key = current.key;
    if (pressed && hapticsEnabled) haptic(GRADE_HAPTIC[rating]);
    flashing.current = true;
    setFlash(rating);
    const started = performance.now();
    const attempt = () => {
      const result = commitLatest.current(rating, desktop ? null : { kind: "grade", rating }, 0, key);
      if (result === "wait" && performance.now() - started < SAVE_WAIT_MS) {
        window.setTimeout(attempt, 16);
        return;
      }
      flashing.current = false;
      if (result !== "done") setFlash(null);
    };
    window.setTimeout(attempt, tokenMs("--dur-flash", 120));
  };

  const startPractice = async (kind: Practice["kind"], over: SessionFilter = filter) => {
    if (practiceLoading) return;
    setPracticeLoading(kind);
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
      setPracticeLoading(null);
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
    const action = reviewKeyAction(event, { revealed, gradeButtons, letters, desktop, done: doneShown, practice: !!practice });
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
    if (action.type === "edit") {
      if (!current || holding) return;
      event.preventDefault();
      setEditId(current.word.id);
      return;
    }
    if (action.type === "undo") {
      // Right after a grade the log read may lag behind it; the undo then waits for the save.
      if (!canUndo && !busy.current && !holding) return;
      event.preventDefault();
      requestUndo(true);
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
    // While a grade or undo waits for its read the focus stays where it is; it moves to the next
    // question card once that read is in (an answer turned to meanwhile takes it at once).
    if (!target || (holding && (undoing || target === "reveal"))) return;
    // Desktop «Готово на сегодня» places focus itself (on «Повторить ошибки»).
    if (desktop && doneShown) {
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

  /** The card layout: the session's cards, or the last grade's hold before «Готово на сегодня». */
  const cardsShown = (!loading && !emptyLibrary && !emptyFolder && !done && !waitShown) || finishingView;

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
      echo: lastGrade?.practice ? lastGrade : null,
    };
  } else if (shown && waitShown) {
    const c = shown.session.counts;
    progress = {
      left: waitingSummary(shown.session.waiting.length),
      right: formatProgress(c.done, c.total),
      ratio: progressRatio(c.done, c.total),
      echo: lastGrade && !lastGrade.practice ? lastGrade : null,
    };
  } else if (shown && cardsShown) {
    const { counts: c, queue: q, plan } = shown.session;
    const split = queueNew(q, plan, direction === "both" ? undefined : direction);
    const parts = queueSummaryParts(c.due, split.fresh, split.reverse);
    progress = {
      left: parts.join(" · "),
      right: formatProgress(c.done, c.total),
      ratio: progressRatio(c.done, c.total),
      echo: lastGrade && !lastGrade.practice ? lastGrade : null,
      ticks: newTicks(q, c.done, c.total),
      summary: { label: summaryAria(parts), open: planOpen, onOpen: () => setPlanOpen(!planOpen) },
      summaryRef,
    };
  }
  /** «План на сегодня» and the reason subline: the day as planned (every theme), the session's due count. */
  const planData: PlanData | null =
    !practice && shown ? { due: shown.session.counts.due, day: shown.session.day, plan: shown.session.plan } : null;
  const planShown = !!planData && cardsShown && !finishingView;
  if (planOpen && !planShown) setPlanOpen(false);

  /** Cards after this one (the desktop stack shows up to two outlines). */
  const remaining = queue && current ? new Set(queue.map((i) => i.key)).size - 1 : 0;
  /** The placeholder: while loading, and when an undo's read takes too long. */
  const placeholderShown = loading || (undoing && slowUndo);
  /** The card on screen; none while the placeholder shows or after the last card of the session. */
  const card = !placeholderShown ? current : undefined;
  const cardKey = card ? `${card.key}:${instance}` : null;
  const deckShown = cardsShown && !placeholderShown;
  if (!deckShown && leaving.length > 0) setLeaving([]);

  // R1: the card that replaces the placeholder writes its text in; later cards swap in one frame.
  const [afterPlaceholder, setAfterPlaceholder] = useState(true);
  const [writeInKey, setWriteInKey] = useState<string | null>(null);
  if (placeholderShown && !afterPlaceholder) setAfterPlaceholder(true);
  if (cardKey && afterPlaceholder && !placeholderShown) {
    setAfterPlaceholder(false);
    setWriteInKey(cardKey);
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
        onUndo={() => requestUndo()}
        letters={letters}
        // «Готово на сегодня» keeps the running head (without counts): what to review next, the
        // direction and undo stay one click away, as on phones.
        hideOnDesktop={emptyLibrary}
        progress={loading ? PENDING_PROGRESS : cardsShown || waitShown ? progress : null}
        heading={cardsShown ? <h1 className="sr-only">Повторение</h1> : null}
        subline={planShown && planData ? <PlanSubline day={planData.day} /> : null}
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

      {waitShown && session && (
        <WaitScreen
          waiting={session.waiting}
          desktop={desktop}
          onDone={() => setSkipWait({ filter: filterKey, keys: new Set(session.waiting.map((item) => item.key)) })}
        />
      )}

      {doneShown &&
        (doneData ? (
          <SessionDone
            data={doneData}
            moment={moment}
            haptics={hapticsEnabled}
            pending={practiceLoading}
            desktop={desktop}
            letters={letters}
            onRepeatMistakes={() => void startPractice("mistakes")}
            onPractice={() => void startPractice("extra")}
            onAddWords={() => addSheet.open()}
            snackbar={snackbar.render("mb-4", "done")}
            onExerciseNotice={snackbar.show}
            plan={shown?.session.plan}
          />
        ) : (
          <div className="flex-1" />
        ))}

      {/* Loading uses the same layout as the cards (R1): the placeholder in the card's slot, the
          hint row and the grade bar's space reserved, so nothing moves when the queue arrives. */}
      {(loading || cardsShown) && (
        <div className={DESK}>
          {placeholderShown ? (
            <ReviewCardPlaceholder />
          ) : (
            <CardDeck remaining={remaining}>
              {card && cardKey && (
                <ReviewCard
                  key={cardKey}
                  {...faceOf(card)}
                  revealed={revealed}
                  onReveal={reveal}
                  onHide={hide}
                  flip={pinned?.key === card.key ? pinned.flip : undefined}
                  haptics={hapticsEnabled}
                  folderName={folderOf(card)}
                  swipeEnabled={cardSwipe}
                  onSwipe={(outcome, release) =>
                    !flashing.current && commitGrade(outcome === "good" ? 3 : 1, release.exit, release.progress) === "done"
                  }
                  next={nextItem ? faceOf(nextItem) : null}
                  enter={writeInKey === cardKey}
                  arrive={arrival?.key === cardKey ? arrival.arrive : undefined}
                  editKey={desktop && letters}
                  onEdit={() => {
                    if (!holding) setEditId(card.word.id);
                  }}
                  onMute={() => takeOut("mute")}
                  onDelete={() => takeOut("delete")}
                />
              )}
              {leaving.map((l) => (
                <LeavingCard key={l.id} {...l} onDone={() => setLeaving((list) => list.filter((x) => x.id !== l.id))} />
              ))}
            </CardDeck>
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
              className={cx(card && revealed ? GRADE_BAR_IN : "invisible")}
            >
              <GradeBar buttons={gradeButtons} intervals={intervals} flash={flash} onGrade={(r) => gradeWithFlash(r, true)} />
            </div>
          </div>
          {keyHints && card && (
            <HintLine revealed={revealed} practice={!!practice} letters={letters} gradeButtons={gradeButtons} planOpen={desktop && planOpen} />
          )}
        </div>
      )}

      {/* «План на сегодня»: a sheet on phones, the popover under the summary from 768. */}
      {desktop ? (
        <PlanPopover
          open={planOpen && planShown}
          anchorRef={summaryRef}
          data={planData}
          onClose={(refocus) => {
            setPlanOpen(false);
            if (refocus) summaryRef.current?.focus({ preventScroll: true });
          }}
        />
      ) : (
        <PlanSheet open={planOpen && planShown} onOpenChange={setPlanOpen} data={planData} />
      )}

      {/* Editing never grades: the sheet closes back onto the same card, still unanswered. */}
      <WordDetailSheet wordId={editId} onClose={() => setEditId(null)} />

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
