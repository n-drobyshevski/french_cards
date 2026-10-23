"use client";

// The exercise player at /exercises/play (SPEC.md «Упражнения» → Player; boards Exercise-S-*,
// D-Exercise-Player; MOTION-SPEC §5.15). It takes the set from the hand-over in
// exercise-request.ts, else `?set=<id>`, else the newest unfinished run, else goes back to the
// list. The round is a pure reducer (player-state.ts) over the core queue (buildQueue / requeue /
// resumeQueue). Every answer is saved at once (recordAnswer upserts the run row), so × leaves
// without a confirm and «Продолжить» picks the run up. Exercises never touch the schedule.
import { useLiveQuery } from "dexie-react-hooks";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useEffectEvent, useReducer, useRef, useState, type ReactNode } from "react";
import { WordDetailSheet } from "@/components/library/WordDetailSheet";
import { HINT_LINE_CSS } from "@/components/review/HintLine";
import { useShell } from "@/components/shell/ShellContext";
import { OPEN_LAYER_SELECTOR } from "@/components/shell/keys";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icons";
import { Kbd } from "@/components/ui/Kbd";
import { SLANG_NAMES_RU } from "@/components/ui/SlangMeter";
import { useSnackbar } from "@/components/ui/Snackbar";
import { revealTabBar } from "@/components/ui/TabBar";
import { haptic } from "@/lib/haptics";
import {
  REGISTER_LEVELS,
  buildQueue,
  finishRun,
  getResumableRun,
  getSet,
  optionsFor,
  pairsBoard,
  playableItemIds,
  playContext,
  recordAnswer,
  resumableRunFor,
  resumeQueue,
  startRun,
  unfinishedRun,
  useLiveWords,
  type PlayContext,
  type QueueEntry,
} from "@/lib/exercises";
import { exitMs, prefersReducedMotion } from "@/lib/motion";
import { getSettings } from "@/lib/settings";
import type { ExerciseAnswer, ExerciseOutcome, ExerciseRun, ExerciseSet } from "@/lib/types";
import { ExerciseDone } from "./ExerciseDone";
import { takePendingExercise, type PendingExercise } from "./exercise-request";
import { FeedbackLine } from "./FeedbackLine";
import { MatchPairs } from "./MatchPairs";
import { NewWordCard } from "./NewWordCard";
import { OptionGrid } from "./OptionGrid";
import { QuestionCard } from "./QuestionCard";
import { RegisterGrid } from "./RegisterGrid";
import { Stamp } from "./Stamp";
import { exerciseKeyAction, INPUT_GUARD_MS, isTypingTarget, keepsActivationKeys, RESULT_LOCK_MS } from "./player-keys";
import {
  EMPTY_PAIRS,
  EMPTY_PLAYER,
  answerRow,
  attemptRandom,
  counterLabel,
  formatCounter,
  pairsTap,
  playerReducer,
  progressOf,
  resultAnnouncement,
  resultTone,
  tileWord,
  type PairsState,
} from "./player-state";
import { useAutoAdvance } from "./use-auto-advance";

/**
 * The player's motion (MOTION-SPEC §5.15), on the global tokens: the stamp lands (1.15 → 1 + fade),
 * the tapped tile flashes its tone, the card leaves left / the next enters from the right (24px +
 * fade; a fade only under reduced motion, via --motion-scale), the hairline drains, a pairs miss
 * flashes the again tone.
 */
export const EXERCISE_CSS = `
@keyframes ex-stamp { from { opacity: 0; scale: calc(1 + 0.15 * var(--motion-scale)); } }
@keyframes ex-fill { 0% { opacity: 0; } 40% { opacity: 1; } to { opacity: 0; } }
@keyframes ex-enter { from { opacity: 0; translate: calc(24px * var(--motion-scale)) 0; } }
@keyframes ex-exit { to { opacity: 0; translate: calc(-24px * var(--motion-scale)) 0; } }
@keyframes ex-drain { from { scale: 1 1; } to { scale: 0 1; } }
@keyframes ex-miss { from { border-color: var(--again); color: var(--again); } }
`;

const ENTER = {
  slide: "animate-[ex-enter_var(--dur-enter)_var(--ease-enter)_both]",
  fade: "animate-[fade-in_var(--dur-quick)_var(--ease-enter)_both]",
} as const;
const EXIT = "pointer-events-none animate-[ex-exit_var(--dur-exit)_var(--ease-exit)_both]";

/** The desktop hint line (D-Exercise-Player): «1–4 ВЫБРАТЬ · 0 НЕ ЗНАЮ · ENTER ДАЛЬШЕ · ESC ВЫЙТИ». */
const QUESTION_HINTS = [
  ["1–4", "выбрать"],
  ["0", "не знаю"],
  ["Enter", "дальше"],
  ["Esc", "выйти"],
] as const;
const PAIRS_HINTS = [
  ["0", "не знаю"],
  ["Enter", "дальше"],
  ["Esc", "выйти"],
] as const;
const INTRO_HINTS = [
  ["Enter", "понятно"],
  ["Esc", "выйти"],
] as const;

/** After «Дальше через 1 с» is held by a tap, a click landing on «Дальше» in the same gesture is not a second tap. */
const HOLD_CLICK_MS = 350;

interface Boot {
  set: ExerciseSet;
  run: ExerciseRun;
  queue: QueueEntry[];
  ctx: PlayContext;
}

/** Nothing of the set can be played: its words were deleted or paused since it was made. */
const NOTHING_TO_PLAY = "blocked" as const;

async function resumeOf(set: ExerciseSet, run: ExerciseRun): Promise<Boot> {
  const ctx = await playContext(set);
  return { set, run, queue: run.finished_at === null ? resumeQueue(set, run, ctx) : [], ctx };
}

async function startOf(set: ExerciseSet, kind: "set" | "mistakes", itemIds?: readonly string[], known?: PlayContext): Promise<Boot | typeof NOTHING_TO_PLAY> {
  const ctx = known ?? (await playContext(set));
  const playable = playableItemIds(set, ctx.blocked);
  const wanted = itemIds ? playable.filter((id) => itemIds.includes(id)) : playable;
  if (wanted.length === 0) return NOTHING_TO_PLAY;
  // A whole-set run lists its items only when some are left out (item_ids [] = every item).
  const ids = kind === "mistakes" || wanted.length < set.items.length ? wanted : undefined;
  const run = await startRun(set, { kind, itemIds: ids });
  return { set, run, queue: buildQueue(set, { itemIds: run.item_ids, intros: kind !== "mistakes", ...ctx }), ctx };
}

/**
 * What to play: the hand-over, else ?set=<id> (its unfinished run, or a new one), else the newest
 * unfinished run. Only runs started on this device resume (another device's starts afresh).
 */
async function bootFrom(pending: PendingExercise | null, search: string): Promise<Boot | typeof NOTHING_TO_PLAY | null> {
  if (pending) {
    const set = await getSet(pending.setId);
    if (set) {
      if (pending.runId) {
        const run = await getResumableRun(pending.runId, set);
        if (run) return resumeOf(set, run);
      }
      return startOf(set, pending.kind ?? "set", pending.itemIds);
    }
  }
  const setId = new URLSearchParams(search).get("set");
  if (setId) {
    const set = await getSet(setId);
    if (set) {
      const open = await resumableRunFor(set);
      return open ? resumeOf(set, open) : startOf(set, "set");
    }
  }
  const open = await unfinishedRun();
  return open ? resumeOf(open.set, open.run) : null;
}

/**
 * The route's client root. Keyed on `bfcacheId`: a fresh navigation to the player (a new set from
 * the list) starts a fresh session, while browser back / forward restores the one in progress
 * (Next keeps visited routes alive in <Activity>, DESKTOP and phone alike).
 */
export function ExercisePlayer() {
  const { bfcacheId } = useRouter();
  return <PlayerSession key={bfcacheId} />;
}

function PlayerSession() {
  const router = useRouter();
  const snackbar = useSnackbar();
  const { openShortcuts } = useShell();
  const keyHints = useLiveQuery(async () => (await getSettings()).key_hints, [], true);

  const [session, setSession] = useState<{ set: ExerciseSet; run: ExerciseRun; ctx: PlayContext } | null>(null);
  const [view, setView] = useState<"loading" | "play" | "done">("loading");
  const [state, dispatch] = useReducer(playerReducer, EMPTY_PLAYER);
  const [doneRun, setDoneRun] = useState<ExerciseRun | null>(null);
  const [enter, setEnter] = useState<keyof typeof ENTER>("fade");
  const [leaving, setLeaving] = useState(false);
  const [pairs, setPairs] = useState<{ step: number; state: PairsState }>({ step: -1, state: EMPTY_PAIRS });
  const [wordId, setWordId] = useState<string | null>(null);
  const [repeatPending, setRepeatPending] = useState(false);

  const bootRef = useRef<Promise<Boot | typeof NOTHING_TO_PLAY | null> | null>(null);
  const booted = useRef(false);
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  const answers = useRef<ExerciseAnswer[]>([]);
  const finishing = useRef(false);
  const shownAt = useRef(0);
  const answeredStep = useRef(-1);
  const lockUntil = useRef(0);
  const guardUntil = useRef(0);
  const heldAt = useRef(-Infinity);
  const leavingRef = useRef(false);
  const focusByPointer = useRef(false);
  /** Where focus goes after this render: the result line's «Дальше» after an answer, the new card after «Дальше». */
  const refocus = useRef<"advance" | "card" | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const set = session?.set ?? null;
  const run = session?.run ?? null;
  const head = state.queue[0];
  const item = head?.kind === "item" && set ? set.items.find((i) => i.id === head.item_id) : undefined;
  const intro = head?.kind === "intro" && set ? set.new_words.find((w) => w.ref === head.new_ref) : undefined;
  const result = state.result;
  const random = item && run && head?.kind === "item" ? attemptRandom(run.id, item.id, head.attempt) : null;
  const options = item && random && item.type !== "pairs" ? optionsFor(item, random) : null;
  const board = item && random && item.type === "pairs" ? pairsBoard(item, random) : null;
  const pairsState = pairs.step === state.step ? pairs.state : EMPTY_PAIRS;
  const progress = progressOf(state);
  // «Слово ›» only for a word still in the library (a deleted one would open a sheet that closes at once).
  const liveWords = useLiveWords(item?.word_id ? [item.word_id] : []);

  // SPEC «Упражнения» → Done: the tab bar comes back on the done screen (the route still hides it while playing).
  useEffect(() => {
    revealTabBar(view === "done");
    return () => revealTabBar(false);
  }, [view]);

  const begin = (boot: Boot) => {
    setSession({ set: boot.set, run: boot.run, ctx: boot.ctx });
    answers.current = [...boot.run.answers];
    finishing.current = false;
    refocus.current = null;
    setDoneRun(null);
    setEnter("fade");
    dispatch({ type: "load", queue: boot.queue, total: boot.run.total });
    guardUntil.current = performance.now() + INPUT_GUARD_MS;
    setView("play");
  };

  const onNothingToPlay = useEffectEvent(() => snackbar.show({ message: "В наборе нечего повторять: его слова удалены или на паузе" }));

  useEffect(() => {
    let alive = true;
    // Once per session: the StrictMode re-run and an <Activity> show reuse the first boot.
    bootRef.current ??= bootFrom(takePendingExercise(), window.location.search).catch(() => null);
    void bootRef.current.then((boot) => {
      if (!alive || booted.current) return;
      booted.current = true;
      if (boot && boot !== NOTHING_TO_PLAY) return begin(boot);
      if (boot === NOTHING_TO_PLAY) onNothingToPlay();
      router.replace("/exercises");
    });
    return () => {
      alive = false;
    };
  }, [router]);

  // The answer timer starts when a card shows.
  useEffect(() => {
    shownAt.current = performance.now();
  }, [state.step]);

  const save = (answer: ExerciseAnswer) => {
    if (!run) return;
    answers.current = [...answers.current, answer];
    const id = run.id;
    writes.current = writes.current.then(() => recordAnswer(id, answer)).catch(() => undefined);
  };

  const finish = useEffectEvent(async () => {
    if (!run || finishing.current) return;
    finishing.current = true;
    const done = await writes.current.then(() => finishRun(run.id)).catch(() => undefined);
    setDoneRun(done ?? { ...run, answers: answers.current, finished_at: new Date().toISOString() });
    setView("done");
  });

  useEffect(() => {
    if (view === "play" && state.queue.length === 0) void finish();
  }, [view, state.queue.length]);

  /** Focus is on the card (about to be disabled or swapped) or nowhere: it is moved on, so Tab and screen readers keep their place. */
  const focusInStage = () => {
    const active = document.activeElement;
    return !active || active === document.body || !!stageRef.current?.contains(active);
  };

  /**
   * Commits the current card's answer: once per card, saved at once, with its haptic (taps only,
   * never keys: MOTION-SPEC §5.13). `words`: one row per word instead (a pairs «Не знаю» names
   * every pair still open, so each counts as missed).
   */
  const commit = (
    outcome: ExerciseOutcome,
    pick: number | null,
    chosen: string | null,
    misses?: number,
    fromKey = false,
    words?: { word_id: string | null; new_ref: string | null }[],
  ) => {
    if (!item || head?.kind !== "item" || state.result || leavingRef.current) return;
    if (answeredStep.current === state.step) return;
    answeredStep.current = state.step;
    if (focusInStage()) refocus.current = "advance";
    dispatch({ type: "answer", outcome, pick, misses });
    lockUntil.current = performance.now() + RESULT_LOCK_MS;
    if (!fromKey) haptic(outcome === "correct" ? "good" : "again");
    const ms = performance.now() - shownAt.current;
    const at = new Date();
    if (words?.length) for (const word of words) save(answerRow(item, head.attempt, outcome, chosen, ms, at, word));
    else save(answerRow(item, head.attempt, outcome, chosen, ms, at));
  };

  const pick = (index: number, fromKey = false) => {
    if (!options || index < 0 || index >= options.options.length) return;
    commit(index === options.correct ? "correct" : "wrong", index, options.options[index], undefined, fromKey);
  };

  const dontKnow = (fromKey = false) => {
    const open = item?.type === "pairs" && set ? item.tiles.filter((t) => !pairsState.matched.includes(t.key)).map((t) => tileWord(set, t.key)) : undefined;
    commit("dont_know", null, null, undefined, fromKey, open);
  };

  const onPairTap = (side: "fr" | "ru", key: string) => {
    if (!item || !set || head?.kind !== "item" || state.result || leavingRef.current) return;
    const step = pairsTap(pairsState, side, key, item.tiles.length);
    setPairs({ step: state.step, state: step.state });
    const event = step.event;
    if (event?.type === "miss") {
      haptic("again");
      const ru = item.tiles.find((t) => t.key === event.ru)?.ru ?? null;
      save(answerRow(item, head.attempt, "wrong", ru, performance.now() - shownAt.current, new Date(), tileWord(set, event.fr)));
    } else if (event?.type === "match" && event.complete) {
      commit("correct", null, null, step.state.misses);
    }
  };

  const next = (viaKey = false) => {
    if (!head || leavingRef.current) return;
    if (head.kind === "item" && !state.result) return;
    const now = performance.now();
    if (now < lockUntil.current || now - heldAt.current < HOLD_CLICK_MS) return;
    refocus.current = focusInStage() ? "card" : null;
    // Keys (DESKTOP-SPEC §4) and reduced motion: the next card fades in place, no travel.
    if (viaKey || prefersReducedMotion()) {
      setEnter("fade");
      dispatch({ type: "next" });
      return;
    }
    leavingRef.current = true;
    setLeaving(true);
    window.setTimeout(() => {
      leavingRef.current = false;
      setLeaving(false);
      setEnter("slide");
      dispatch({ type: "next" });
    }, exitMs());
  };

  const right = result?.outcome === "correct" && !result.misses;
  const auto = useAutoAdvance(right ? state.step : null, () => next());

  const hold = () => {
    if (auto.phase !== "running") return;
    heldAt.current = performance.now();
    auto.hold();
  };

  // A tap anywhere holds the hairline (but «Дальше» itself goes on).
  const onPointerHold = useEffectEvent((event: PointerEvent) => {
    const target = event.target as Element | null;
    if (target && typeof target.closest === "function" && target.closest("[data-advance]")) return;
    hold();
  });
  useEffect(() => {
    if (auto.phase !== "running") return;
    const listener = (event: PointerEvent) => onPointerHold(event);
    window.addEventListener("pointerdown", listener, true);
    return () => window.removeEventListener("pointerdown", listener, true);
  }, [auto.phase]);

  /**
   * × / Esc: every answer is already saved. A run left on its last card after answering it (every
   * item settled, the «Дальше» that would end it not pressed) is marked finished on the way out.
   */
  const leave = () => {
    if (view === "play" && session && !finishing.current) {
      const left = resumeQueue(session.set, { ...session.run, answers: answers.current }, session.ctx);
      if (left.length === 0) {
        finishing.current = true;
        const id = session.run.id;
        writes.current = writes.current.then(() => finishRun(id)).catch(() => undefined);
      }
    }
    router.replace("/exercises");
  };

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (view !== "play" || !head) return;
    if (event.defaultPrevented || isTypingTarget(event.target)) return;
    if (wordId !== null || document.querySelector(OPEN_LAYER_SELECTOR)) return;
    if (event.timeStamp < guardUntil.current) return;
    const phase = head.kind === "intro" ? "intro" : state.result ? "answered" : "question";
    const action = exerciseKeyAction(event, { phase, options: options?.options.length ?? 0 });
    if (!action) return;
    // ↵ / Space on a control reached with Tab is that control's own press; ↵ on «Дальше» (where the
    // player puts focus after an answer) stays the key's own «next» (a fade, DESKTOP-SPEC §4).
    const onAdvance = event.target instanceof Element && !!event.target.closest("[data-advance]");
    if (action.type === "next" && !onAdvance && keepsActivationKeys(event.target, focusByPointer.current)) return;
    event.preventDefault();
    if (action.type === "leave") leave();
    else if (action.type === "pick") pick(action.index, true);
    else if (action.type === "dont-know") dontKnow(true);
    else if (action.type === "next") {
      // ↵ skips the hairline (DESKTOP-SPEC §4); keys during the stamp's landing are dropped.
      next(true);
    }
  });

  useEffect(() => {
    const onPointerDown = () => {
      focusByPointer.current = true;
    };
    const onTab = (event: KeyboardEvent) => {
      if (event.key === "Tab") focusByPointer.current = false;
    };
    const listener = (event: KeyboardEvent) => onKeyDown(event);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onTab, true);
    window.addEventListener("keydown", listener);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onTab, true);
      window.removeEventListener("keydown", listener);
    };
  }, []);

  // A card whose item or new word is gone from the set (it changed under the run) is skipped.
  useEffect(() => {
    if (view !== "play" || !set || !head) return;
    if (head.kind === "item" && !item) {
      dispatch({ type: "answer", outcome: "correct", pick: null });
      dispatch({ type: "next" });
    } else if (head.kind === "intro" && !intro) {
      dispatch({ type: "next" });
    }
  }, [view, set, head, item, intro]);

  // Focus follows the answer and the card (as the review screen): the visible «Дальше» once a miss
  // waits for it (or the result line while the 1 s timer runs), then the new card itself — never an
  // option, so a held ↵ cannot answer the next question.
  useEffect(() => {
    const target = refocus.current;
    const root = stageRef.current;
    if (!target || view !== "play" || !root || leaving) return;
    const visible = (el: HTMLElement) => el.getClientRects().length > 0;
    let el: HTMLElement | null | undefined;
    if (target === "advance") {
      if (!result) return;
      const line = root.querySelector<HTMLElement>("[data-exercise-result]");
      el = auto.phase === "running" ? line : ([...root.querySelectorAll<HTMLElement>("[data-advance]")].find(visible) ?? line);
    } else {
      if (result) return;
      el = root.querySelector<HTMLElement>("[data-exercise-focus]");
    }
    if (!el) return;
    refocus.current = null;
    el.focus({ preventScroll: true });
  });

  const repeatMistakes = async (itemIds: string[]) => {
    if (!session || repeatPending) return;
    setRepeatPending(true);
    try {
      const boot = await startOf(session.set, "mistakes", itemIds, session.ctx);
      if (boot !== NOTHING_TO_PLAY) begin(boot);
    } catch {
      // Nothing to repeat (the items left the set): stay on the done screen.
    } finally {
      setRepeatPending(false);
    }
  };

  const wordSheet = <WordDetailSheet wordId={wordId} onClose={() => setWordId(null)} />;

  if (view === "done" && set && doneRun) {
    return (
      <main data-wide="" data-exercise-player="done" className="flex flex-1 flex-col">
        <ExerciseDone
          set={set}
          run={doneRun}
          onRepeat={(ids) => void repeatMistakes(ids)}
          repeatPending={repeatPending}
          onLeave={leave}
          onWord={setWordId}
        />
        {wordSheet}
      </main>
    );
  }

  if (view !== "play" || !set || !run || !head) {
    return <main data-wide="" data-exercise-player="loading" aria-busy="true" className="flex flex-1 flex-col" />;
  }

  // --- The card --------------------------------------------------------------------------------

  const tone = item ? resultTone(result) : null;
  let answerLabel: string | null = item?.answer ?? null;
  if (item?.type === "register" && options) {
    const level = options.correct;
    answerLabel = level >= 0 ? `${REGISTER_LEVELS[level]} · ${SLANG_NAMES_RU[level]}` : null;
  }
  const announcement = resultAnnouncement(tone, result?.misses ?? 0, item?.type === "pairs" ? null : answerLabel);

  let card: ReactNode = null;
  if (head.kind === "intro" && intro) {
    card = <NewWordCard word={intro} setTitle={set.title} onNext={() => next()} />;
  } else if (item && head.kind === "item") {
    const misses = result?.misses ?? 0;
    const verdict = tone === "right" ? "right" : tone === "wrong" ? "wrong" : null;
    const onWord =
      item.type !== "pairs" && item.word_id && liveWords?.has(item.word_id)
        ? () => {
            hold();
            setWordId(item.word_id);
          }
        : null;

    card = (
      <>
        <QuestionCard
          item={item}
          setTitle={set.title}
          attempt={head.attempt}
          answered={result !== null}
          pairsCount={item.type === "pairs" ? `${pairsState.matched.length} из ${item.tiles.length}` : undefined}
          stamp={verdict && <Stamp verdict={verdict} />}
        >
          {board && (
            <MatchPairs
              board={board}
              state={pairsState}
              onTap={onPairTap}
              revealed={result?.outcome === "dont_know"}
              disabled={result !== null || leaving}
            />
          )}
        </QuestionCard>
        {options && item.type === "register" && (
          <RegisterGrid options={options.options} correct={options.correct} result={result} onPick={pick} locked={leaving} />
        )}
        {options && item.type !== "register" && (
          <OptionGrid options={options.options} correct={options.correct} result={result} onPick={pick} locked={leaving} />
        )}
        {/* The fixed action zone: «Не знаю», then the result line in the same place (no layout shift). */}
        <div className="mt-4 h-[200px] shrink-0 pb-4 max-md:[@media(max-height:740px)]:h-[136px] md:h-16 md:pb-0">
          {tone ? (
            <FeedbackLine
              tone={tone}
              answer={tone === "wrong" && item.type !== "pairs" ? answerLabel : null}
              answerText={item.type === "register" ? null : item.answer}
              explain={item.explain_ru}
              misses={misses}
              onWord={onWord}
              phase={auto.phase}
              onHold={hold}
              onNext={() => next()}
            />
          ) : (
            <div className="flex h-full flex-col justify-end md:flex-row md:items-center md:justify-start">
              <button
                type="button"
                aria-keyshortcuts="0"
                onClick={() => dontKnow()}
                disabled={leaving}
                className="press-sm inline-flex h-11 items-center justify-center gap-2 self-center px-4 text-[15px] font-medium text-muted md:self-auto md:px-0 md:text-ink"
              >
                Не знаю
                <Kbd aria-hidden="true" className="max-md:hidden">
                  0
                </Kbd>
              </button>
            </div>
          )}
        </div>
      </>
    );
  }

  const counterText = counterLabel(progress);
  // aria-label on a plain span is not read: the digits are hidden and the sentence is sr-only text.
  const counter = (
    <>
      <span aria-hidden="true">{formatCounter(progress.position, progress.total)}</span>
      {progress.repeats > 0 && (
        <span aria-hidden="true" className="ml-1.5 text-muted">
          +{progress.repeats}
        </span>
      )}
      <span className="sr-only">{counterText}</span>
    </>
  );
  const bar = (
    <span
      aria-hidden="true"
      className="absolute left-0 h-[2px] w-full origin-left bg-red transition-[scale] duration-(--dur-move) ease-standard"
      style={{ scale: `${progress.ratio} 1` }}
    />
  );

  return (
    <main data-wide="" data-exercise-player="play" className="relative flex flex-1 flex-col px-4 pt-4 md:px-0 md:pt-0">
      <style>{EXERCISE_CSS + HINT_LINE_CSS}</style>
      <h1 className="sr-only">Упражнение: {set.title}</h1>
      {/* Stays mounted across cards (outside the keyed card), so the verdict is announced. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {/* Phones: ×, the hairline with its red fill, «07 / 12», and the schedule line. */}
      <div className="shrink-0 md:hidden">
        <header className="flex h-11 items-center gap-3">
          <button
            type="button"
            aria-label="Выйти"
            onClick={leave}
            className="press-sm -ml-3 inline-flex size-11 shrink-0 items-center justify-center rounded-chip text-ink active:bg-surface-2"
          >
            <Icon name="close" size={20} strokeWidth={1.5} />
          </button>
          <div
            role="progressbar"
            aria-label="Пройдено вопросов"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={Math.round(progress.ratio * progress.total)}
            className="relative h-[5px] flex-1 [&>span:last-child]:top-[1.5px]"
          >
            <span aria-hidden="true" className="absolute inset-x-0 top-[2px] h-px bg-rule" />
            {bar}
          </div>
          <span className="inline-flex shrink-0 items-baseline font-mono text-[11px] leading-4 font-medium tracking-[.06em] tabular-nums">
            {counter}
          </span>
        </header>
        <p className="meta m-0 mt-1">Упражнение · не влияет на расписание</p>
      </div>

      {/* From 768: the running head — ×, the set, the line, «07 / 12», «?» — ruled with the progress fill. */}
      <header className="relative hidden h-14 shrink-0 items-center gap-3 pr-8 pl-6 md:flex">
        <button
          type="button"
          aria-label="Выйти"
          aria-keyshortcuts="Escape"
          title="Выйти (Esc)"
          onClick={leave}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-[4px] text-ink hover-fade hoverable:bg-hover"
        >
          <Icon name="close" size={20} strokeWidth={1.5} />
        </button>
        <span className="min-w-0 truncate font-serif text-[17px] leading-6 font-medium">{set.title}</span>
        <span className="meta shrink-0 whitespace-nowrap max-lg:hidden">Упражнение · не влияет на расписание</span>
        <span className="flex-1" />
        <span className="shrink-0 font-mono text-[13px] font-medium tabular-nums">{counter}</span>
        <button
          type="button"
          aria-label="Все клавиши"
          aria-haspopup="dialog"
          aria-keyshortcuts="Shift+Slash"
          onClick={openShortcuts}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-[4px] border border-boundary bg-surface font-mono text-[13px] leading-none text-ink hoverable:bg-hover-surface"
        >
          ?
        </button>
        <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-px bg-rule" />
        <div
          role="progressbar"
          aria-label="Пройдено вопросов"
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={Math.round(progress.ratio * progress.total)}
          className="absolute inset-x-0 -bottom-px h-[2px] [&>span]:top-0"
        >
          {bar}
        </div>
      </header>

      <div
        ref={stageRef}
        className="mt-4 flex min-h-0 flex-1 flex-col md:mx-auto md:mt-0 md:w-[640px] md:max-w-[calc(100%-48px)] md:flex-none md:pt-10 xl:w-[720px]"
      >
        <div key={state.step} className={cx("flex min-h-0 flex-1 flex-col", leaving ? EXIT : ENTER[enter])}>
          {card}
        </div>
      </div>

      {keyHints && (
        <p
          data-review-hints=""
          aria-label="Клавиши"
          className="pointer-events-none m-0 mt-auto box-content h-4 w-[640px] max-w-[calc(100%-48px)] items-center gap-1.5 self-center pb-6 font-mono text-[11px] leading-4 tracking-[.06em] whitespace-nowrap text-muted uppercase xl:w-[720px]"
        >
          {(head.kind === "intro" ? INTRO_HINTS : item?.type === "pairs" ? PAIRS_HINTS : QUESTION_HINTS).map(([key, label], i) => (
            <Fragment key={key}>
              {i > 0 && <span aria-hidden="true">·</span>}
              <span className="text-ink">{key}</span>
              <span>{label}</span>
            </Fragment>
          ))}
        </p>
      )}
      {wordSheet}
    </main>
  );
}
