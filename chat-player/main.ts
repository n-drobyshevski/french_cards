// «Упражнения в чате»: the exercise player Claude shows in a chat (lib/core/chat-player.ts has the
// contract). One bundle, two pages, told apart by <html data-mode> (scripts/build-chat-player.mjs):
//   app       — an MCP App (the connector's ui:// resource): the set comes with the tool result over
//               the postMessage bridge; «Сохранить в Карточки» calls save_exercise_result.
//   artifact  — a standalone HTML artifact: the set is the page's own `KARTOCHKI_SET`; the result
//               is copied as a line for Claude («Скопировать результат»), who saves it if asked.
// A set with mode "exam" plays as «Мини-TCF» (exam.ts, exam-ui.ts): the start card, one timer, the
// questions without feedback, the result by level; it is saved the same way.
// Nothing is saved without the user's tap: a round lives in the page until then.
import { resultAnnouncement, resultTone } from "@/components/exercises/player-state";
import { SAVE_RESULT_TOOL, asChatPlayerSet, nextRoundMessage, playableItems, runLine, saveArguments, type ChatPlayerSet, type ChatRunResult } from "@/lib/core/chat-player";
import { clozeParts } from "@/lib/core/exercises";
import { applyHostContext, callTool, connectHost, reportSize, resultText, type Bridge, type HostContext } from "./bridge";
import { h } from "./dom";
import { ExamRound, examMistakesMessage, examSummary } from "./exam";
import { examDoneView, examQuestionView, examStartView, tickClock } from "./exam-ui";
import { Round } from "./round";
import { mistakesMessage, roundSummary } from "./texts";
import { doneView, playView, waitView, type KeepState } from "./ui";

declare global {
  interface Window {
    KARTOCHKI_SET?: unknown;
  }
}

const mode: "app" | "artifact" = document.documentElement.dataset.mode === "artifact" ? "artifact" : "app";
const root = document.getElementById("app") ?? document.body.appendChild(h("div", { id: "app" }));
// Stays mounted outside the rebuilt screens, so a verdict is announced.
const live = document.body.appendChild(h("p", { class: "sr", "aria-live": "polite" }));

/** The set as it came (what saving sends) and the set as played (only the item types the player knows). */
let source: ChatPlayerSet | null = null;
let played: ChatPlayerSet | null = null;
let round: Round | null = null;
/** «Мини-TCF»: the exam round (on its start card until «Начать»). */
let exam: ExamRound | null = null;
let screen: { kind: "wait"; title: string | null } | { kind: "error"; text: string } | { kind: "play" } | { kind: "done" } | { kind: "exam" } = { kind: "wait", title: null };
/** The newest whole round: what «Сохранить» / «Скопировать» keeps (a «Повторить ошибки» round is not a run of the set). */
let full: { result: ChatRunResult; first_try: number; total: number } | null = null;
let keep: KeepState = { kind: "idle" };
let discussed = false;
/** «Следующий раунд ›» was sent for the round on screen. */
let nextAsked = false;
let bridge: Bridge | null = null;
let animatedStep = -1;
/** The done screen has been drawn once (its write-in plays once, not on every save or copy). */
let doneDrawn = false;
/** Where focus goes after the next render: «Дальше» after an answer, the new card after «Дальше». */
let refocus: "advance" | "card" | null = null;

/** Wall clock for the exam timer (exam.ts takes it as an argument). */
const now = () => Date.now();

function render() {
  if (screen.kind === "exam" && exam) {
    if (!exam.started) root.replaceChildren(examStartView(exam, examOn));
    else if (!exam.done) {
      const animate = exam.index !== animatedStep;
      animatedStep = exam.index;
      root.replaceChildren(examQuestionView(exam, exam.remaining(now()), examOn, animate));
    } else {
      root.replaceChildren(examDoneView({ round: exam, mode, keep, discussed, animate: !doneDrawn, on: examDone }));
      doneDrawn = true;
    }
  } else if (screen.kind === "play" && round) {
    const animate = round.state.step !== animatedStep;
    animatedStep = round.state.step;
    root.replaceChildren(playView(round, play, animate));
  } else if (screen.kind === "done" && round) {
    root.replaceChildren(doneView({ round, mode, full, keep, discussed, nextAsked, animate: !doneDrawn, on: done }));
    doneDrawn = true;
  } else if (screen.kind === "error") {
    root.replaceChildren(waitView(source?.title ?? null, screen.text, false));
  } else {
    root.replaceChildren(waitView(screen.kind === "wait" ? screen.title : null));
  }
  const target = refocus;
  refocus = null;
  if (!target || !document.hasFocus()) return;
  const el = target === "advance" ? root.querySelector<HTMLElement>("[data-advance]") : root.querySelector<HTMLElement>("[data-focus]");
  el?.focus({ preventScroll: true });
}

/** Focus is in the player (on a card about to be rebuilt): it is moved on, so Tab and screen readers keep their place. */
const focusInside = () => document.hasFocus() && (document.activeElement === document.body || root.contains(document.activeElement));

function start(set: ChatPlayerSet) {
  source = set;
  played = { ...set, items: playableItems(set.items) };
  full = null;
  keep = { kind: "idle" };
  if (set.mode === "exam") {
    const next = new ExamRound(played);
    if (next.items.length > 0) return beginExam(next);
  }
  if (played.items.length === 0) {
    screen = { kind: "error", text: "В наборе нет вопросов, которые можно пройти в чате." };
    return render();
  }
  begin(new Round(played));
}

function begin(next: Round) {
  stopTicker();
  exam = null;
  round = next;
  discussed = false;
  live.textContent = "";
  screen = { kind: "play" };
  render();
}

function announce() {
  const item = round?.item;
  if (!round || !item) return;
  const tone = resultTone(round.state.result);
  let answer = item.answer;
  // A conjugate answer reads as the whole form, pronouns included («tu as kiffé»).
  if (item.type === "conjugate" && item.answer) answer = `${clozeParts(item.sentence ?? "")?.before ?? ""}${item.answer}`;
  live.textContent = resultAnnouncement(tone, round.state.result?.misses ?? 0, item.type === "pairs" ? null : answer);
}

const play = {
  pick(index: number) {
    const inside = focusInside();
    if (!round?.pick(index)) return;
    if (inside) refocus = "advance";
    announce();
    render();
  },
  dontKnow() {
    const inside = focusInside();
    if (!round?.dontKnow()) return;
    if (inside) refocus = "advance";
    announce();
    render();
  },
  pairTap(side: "fr" | "ru", key: string, row: string | null) {
    const inside = focusInside();
    const answered = round?.state.result;
    if (!round?.pairTap(side, key, row)) return;
    if (!answered && round.state.result) {
      if (inside) refocus = "advance";
      announce();
    }
    render();
  },
  next() {
    const inside = focusInside();
    if (!round?.next()) return;
    live.textContent = "";
    if (round.done) return finish();
    if (inside) refocus = "card";
    render();
  },
};

function finish() {
  if (!round || !source) return;
  const score = round.score();
  if (round.kind === "set") {
    full = { result: round.result(), first_try: score.first_try, total: score.total };
    keep = { kind: "idle" };
  }
  screen = { kind: "done" };
  doneDrawn = false;
  refocus = "card";
  render();
  tellModel(false);
}

/** One line for Claude when a round ends or is saved (ui/update-model-context): what was played and how. */
function tellModel(saved: boolean) {
  if (!bridge || !source) return;
  let text: string | null = null;
  if (screen.kind === "exam" && exam?.done) {
    text = examSummary(source.title, exam.score(), exam.used(now()), exam.limitS, exam.timedOut, saved);
  } else if (round) {
    text = roundSummary(source.title, round.kind, round.score(), round.missedWords(), saved, round.missedQuestions());
  }
  if (text) bridge.request("ui/update-model-context", { content: [{ type: "text", text }] }).catch(() => undefined);
}

/** A user message into the chat («Обсудить ошибки», «Разобрать ошибки»); the button stays off once sent. */
function sendMessage(text: string) {
  if (!bridge || discussed) return;
  discussed = true;
  render();
  bridge.request("ui/message", { role: "user", content: [{ type: "text", text }] }).catch(() => {
    discussed = false;
    render();
  });
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Sandboxed frames often deny the async clipboard: the old way still works inside the tap.
    const area = h("textarea", { readonly: true, style: "position:fixed;top:0;left:0;opacity:0" }) as HTMLTextAreaElement;
    area.value = text;
    document.body.append(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

const done = {
  async keep() {
    if (!full || !source || keep.kind === "busy" || keep.kind === "done") return;
    if (mode === "artifact") {
      const line = runLine(full.result);
      keep = (await copyText(line)) ? { kind: "done" } : { kind: "manual", text: line };
      return render();
    }
    if (!bridge) return;
    keep = { kind: "busy" };
    render();
    const outcome = await callTool(bridge, SAVE_RESULT_TOOL, { ...saveArguments(source, full.result) });
    if (!outcome.ok) {
      keep = { kind: "error", text: outcome.error };
    } else {
      keep = { kind: "done" };
      // Saved once: the next save of this set (another round) adds only its run.
      source = { ...source, saved: true };
      if (played) played = { ...played, saved: true };
      tellModel(true);
    }
    render();
  },
  again() {
    if (played) begin(new Round(played));
  },
  repeat() {
    if (!round || !played) return;
    const ids = round.missedItemIds();
    if (ids.length > 0) begin(new Round(played, ids));
  },
  discuss() {
    if (!round || !source) return;
    sendMessage(mistakesMessage(source.title, round.missedWords(), round.missedQuestions()));
  },
  // A series («все глаголы из тем 01, 02»): Claude writes the next round when asked in the chat.
  next() {
    const series = source?.series;
    if (!bridge || !source || !series || nextAsked) return;
    nextAsked = true;
    render();
    bridge.request("ui/message", { role: "user", content: [{ type: "text", text: nextRoundMessage(source.title, series) }] }).catch(() => {
      nextAsked = false;
      render();
    });
  },
};

// --- «Мини-TCF» --------------------------------------------------------------------------------

let ticker: ReturnType<typeof setInterval> | null = null;

function beginExam(next: ExamRound) {
  stopTicker();
  exam = next;
  round = null;
  discussed = false;
  animatedStep = -1;
  keep = { kind: "idle" };
  screen = { kind: "exam" };
  refocus = "card";
  render();
}

function stopTicker() {
  if (ticker !== null) clearInterval(ticker);
  ticker = null;
}

/** Every 250 ms (and when the page comes back): the countdown in place, the end when time is up. */
function tick() {
  if (!exam || !exam.started || exam.done) return stopTicker();
  if (exam.expired(now())) {
    exam.timeout(now());
    return finishExam();
  }
  tickClock(root, exam.remaining(now()));
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") tick();
});

const examOn = {
  start() {
    if (!exam || exam.started) return;
    exam.start(now());
    ticker = setInterval(tick, 250);
    refocus = "card";
    render();
  },
  select(index: number) {
    if (!exam || exam.expired(now())) return tick();
    if (!exam.select(index)) return;
    const inside = focusInside();
    render();
    // The rows are rebuilt: the picked one keeps the focus.
    if (inside) root.querySelector<HTMLElement>(`[data-option="${index + 1}"]`)?.focus({ preventScroll: true });
  },
  submit() {
    if (!exam) return;
    const inside = focusInside();
    if (!exam.submit(now())) return;
    if (exam.done) return finishExam();
    if (inside) refocus = "card";
    render();
  },
};

function finishExam() {
  stopTicker();
  if (!exam) return;
  full = { result: exam.result(), first_try: exam.score().correct, total: exam.items.length };
  keep = { kind: "idle" };
  doneDrawn = false;
  refocus = "card";
  render();
  tellModel(false);
}

const examDone = {
  keep: () => done.keep(),
  again() {
    if (played) beginExam(new ExamRound(played));
  },
  discuss() {
    if (!bridge || !exam || !source || discussed) return;
    const text = examMistakesMessage(source.title, exam.score().misses);
    sendMessage(text);
  },
};

// Keys as in the app's player: 1–4 pick, 0 «Не знаю», ↵ «Дальше» / «Понятно»; in the exam 1–4 or
// A–D pick and ↵ sends.
window.addEventListener("keydown", (event) => {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
  if (screen.kind === "exam" && exam?.started && !exam.done) {
    const letter = "abcdef".indexOf(event.key.toLowerCase());
    const index = /^[1-6]$/.test(event.key) ? Number(event.key) - 1 : event.key.length === 1 ? letter : -1;
    const row = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>("[data-option]") : null;
    if (index >= 0) {
      event.preventDefault();
      examOn.select(index);
    } else if (event.key === "Enter" && row && Number(row.dataset.option) - 1 !== exam.picked) {
      // ↵ on a row not picked yet picks it (as a click would), never sends the one picked before.
      event.preventDefault();
      examOn.select(Number(row.dataset.option) - 1);
    } else if (event.key === "Enter" && !(event.target instanceof HTMLButtonElement && !event.target.matches("[data-advance], [data-option]"))) {
      // ↵ on the picked row sends it too (Space picks, as on any button).
      event.preventDefault();
      examOn.submit();
    }
    return;
  }
  if (screen.kind !== "play" || !round) return;
  const onButton = event.target instanceof HTMLButtonElement && !event.target.hasAttribute("data-advance");
  if (event.key === "Enter" && !onButton) {
    event.preventDefault();
    play.next();
  } else if (/^[1-4]$/.test(event.key) && round.options()) {
    event.preventDefault();
    play.pick(Number(event.key) - 1);
  } else if (event.key === "0") {
    event.preventDefault();
    play.dontKnow();
  }
});

function onHost(method: string, params: Record<string, unknown>) {
  switch (method) {
    case "ui/notifications/tool-input-partial":
    case "ui/notifications/tool-input": {
      // The arguments stream in while Claude writes the set: the skeleton names it once it can.
      if (source) return;
      const args = params.arguments as { title?: unknown } | undefined;
      screen = { kind: "wait", title: typeof args?.title === "string" ? args.title : null };
      return render();
    }
    case "ui/notifications/tool-result": {
      const set = asChatPlayerSet(params.structuredContent);
      if (set) {
        // The same set again (a host re-sends the result): the round in progress stays.
        if (source?.client_ref !== set.client_ref) start(set);
        return;
      }
      if (!source) {
        screen = { kind: "error", text: resultText(params) ?? "Набор не открылся." };
        render();
      }
      return;
    }
    case "ui/notifications/tool-cancelled":
      if (!source) {
        screen = { kind: "error", text: "Набор не открылся." };
        render();
      }
      return;
    case "ui/notifications/host-context-changed":
      return applyHostContext(params as HostContext);
  }
}

if (mode === "artifact") {
  const set = asChatPlayerSet(window.KARTOCHKI_SET);
  if (set) start(set);
  else {
    screen = { kind: "error", text: "В этой странице нет набора." };
    render();
  }
} else if (window.parent === window) {
  screen = { kind: "error", text: "Плеер открывается в чате с Claude." };
  render();
} else {
  render();
  bridge = connectHost(onHost);
  const connected = bridge;
  void connected.ready.then((ctx) => {
    if (ctx) applyHostContext(ctx);
    reportSize(connected);
  });
}
