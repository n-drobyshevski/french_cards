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
import { haptic } from "@/lib/haptics";
import {
  REGISTER_LEVELS,
  buildQueue,
  finishRun,
  getRun,
  getSet,
  latestRunFor,
  optionsFor,
  pairsBoard,
  recordAnswer,
  resumeQueue,
  startRun,
  unfinishedRun,
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
}

function resumeOf(set: ExerciseSet, run: ExerciseRun): Boot {
  return { set, run, queue: run.finished_at === null ? resumeQueue(set, run) : [] };
}

async function startOf(set: ExerciseSet, kind: "set" | "mistakes", itemIds?: readonly string[]): Promise<Boot> {
  const run = await startRun(set, kind === "mistakes" ? { kind, itemIds } : { kind });
  return { set, run, queue: buildQueue(set, { itemIds: run.item_ids, intros: kind !== "mistakes" }) };
}

/** What to play: the hand-over, else ?set=<id> (its unfinished run, or a new one), else the newest unfinished run. */
async function bootFrom(pending: PendingExercise | null, search: string): Promise<Boot | null> {
  if (pending) {
    const set = await getSet(pending.setId);
    if (set) {
      if (pending.runId) {
        const run = await getRun(pending.runId);
        if (run && run.set_id === set.id) return resumeOf(set, run);
      }
      return startOf(set, pending.kind ?? "set", pending.itemIds);
    }
  }
  const setId = new URLSearchParams(search).get("set");
  if (setId) {
    const set = await getSet(setId);
    if (set) {
      const latest = await latestRunFor(set.id);
      return latest && latest.finished_at === null ? resumeOf(set, latest) : startOf(set, "set");
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
  const { openShortcuts } = useShell();
  const keyHints = useLiveQuery(async () => (await getSettings()).key_hints, [], true);

  const [session, setSession] = useState<{ set: ExerciseSet; run: ExerciseRun } | null>(null);
  const [view, setView] = useState<"loading" | "play" | "done">("loading");
  const [state, dispatch] = useReducer(playerReducer, EMPTY_PLAYER);
  const [doneRun, setDoneRun] = useState<ExerciseRun | null>(null);
  const [enter, setEnter] = useState<keyof typeof ENTER>("fade");
  const [leaving, setLeaving] = useState(false);
  const [pairs, setPairs] = useState<{ step: number; state: PairsState }>({ step: -1, state: EMPTY_PAIRS });
  const [wordId, setWordId] = useState<string | null>(null);
  const [repeatPending, setRepeatPending] = useState(false);

  const bootRef = useRef<Promise<Boot | null> | null>(null);
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

  const begin = (boot: Boot) => {
    setSession({ set: boot.set, run: boot.run });
    answers.current = [...boot.run.answers];
    finishing.current = false;
    setDoneRun(null);
    setEnter("fade");
    dispatch({ type: "load", queue: boot.queue, total: boot.run.total });
    guardUntil.current = performance.now() + INPUT_GUARD_MS;
    setView("play");
  };

  useEffect(() => {
    let alive = true;
    // Once per session: the StrictMode re-run and an <Activity> show reuse the first boot.
    bootRef.current ??= bootFrom(takePendingExercise(), window.location.search).catch(() => null);
    void bootRef.current.then((boot) => {
      if (!alive || booted.current) return;
      booted.current = true;
      if (boot) begin(boot);
      else router.replace("/exercises");
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

  /** Commits the current card's answer: once per card, saved at once, with its haptic (taps only, never keys: MOTION-SPEC §5.13). */
  const commit = (outcome: ExerciseOutcome, pick: number | null, chosen: string | null, misses?: number, fromKey = false) => {
    if (!item || head?.kind !== "item" || state.result || leavingRef.current) return;
    if (answeredStep.current === state.step) return;
    answeredStep.current = state.step;
    dispatch({ type: "answer", outcome, pick, misses });
    lockUntil.current = performance.now() + RESULT_LOCK_MS;
    if (!fromKey) haptic(outcome === "correct" ? "good" : "again");
    save(answerRow(item, head.attempt, outcome, chosen, performance.now() - shownAt.current, new Date()));
  };

  const pick = (index: number, fromKey = false) => {
    if (!options || index < 0 || index >= options.options.length) return;
    commit(index === options.correct ? "correct" : "wrong", index, options.options[index], undefined, fromKey);
  };

  const dontKnow = (fromKey = false) => commit("dont_know", null, null, undefined, fromKey);

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

  const leave = () => router.replace("/exercises");

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (view !== "play" || !head) return;
    if (event.defaultPrevented || isTypingTarget(event.target)) return;
    if (wordId !== null || document.querySelector(OPEN_LAYER_SELECTOR)) return;
    if (event.timeStamp < guardUntil.current) return;
    const phase = head.kind === "intro" ? "intro" : state.result ? "answered" : "question";
    const action = exerciseKeyAction(event, { phase, options: options?.options.length ?? 0 });
    if (!action) return;
    // ↵ / Space on a control reached with Tab is that control's own press.
    if (action.type === "next" && keepsActivationKeys(event.target, focusByPointer.current)) return;
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

  const repeatMistakes = async (itemIds: string[]) => {
    if (!set || repeatPending) return;
    setRepeatPending(true);
    try {
      begin(await startOf(set, "mistakes", itemIds));
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
    card = <NewWordCard word={intro} setTitle={set.title} onNext={() => next()} autoFocus={false} />;
  } else if (item && head.kind === "item") {
    const misses = result?.misses ?? 0;
    const verdict = tone === "right" ? "right" : tone === "wrong" ? "wrong" : null;
    const onWord =
      item.type !== "pairs" && item.word_id
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

      <div className="mt-4 flex min-h-0 flex-1 flex-col md:mx-auto md:mt-0 md:w-[640px] md:max-w-[calc(100%-48px)] md:flex-none md:pt-10 xl:w-[720px]">
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
