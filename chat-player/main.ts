// «Упражнения в чате»: the exercise player Claude shows in a chat (lib/core/chat-player.ts has the
// contract). One bundle, two pages, told apart by <html data-mode> (scripts/build-chat-player.mjs):
//   app       — an MCP App (the connector's ui:// resource): the set comes with the tool result over
//               the postMessage bridge; «Сохранить в Карточки» calls save_exercise_result.
//   artifact  — a standalone HTML artifact: the set is the page's own `KARTOCHKI_SET`; the result
//               is copied as a line for Claude («Скопировать результат»), who saves it if asked.
// Nothing is saved without the user's tap: a round lives in the page until then.
import { resultAnnouncement, resultTone } from "@/components/exercises/player-state";
import { SAVE_RESULT_TOOL, asChatPlayerSet, playableItems, runLine, saveArguments, type ChatPlayerSet, type ChatRunResult } from "@/lib/core/chat-player";
import { clozeParts } from "@/lib/core/exercises";
import { applyHostContext, connectHost, reportSize, type Bridge, type HostContext } from "./bridge";
import { h } from "./dom";
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
let screen: { kind: "wait"; title: string | null } | { kind: "error"; text: string } | { kind: "play" } | { kind: "done" } = { kind: "wait", title: null };
/** The newest whole round: what «Сохранить» / «Скопировать» keeps (a «Повторить ошибки» round is not a run of the set). */
let full: { result: ChatRunResult; first_try: number; total: number } | null = null;
let keep: KeepState = { kind: "idle" };
let discussed = false;
let bridge: Bridge | null = null;
let animatedStep = -1;
/** The done screen has been drawn once (its write-in plays once, not on every save or copy). */
let doneDrawn = false;
/** Where focus goes after the next render: «Дальше» after an answer, the new card after «Дальше». */
let refocus: "advance" | "card" | null = null;

function render() {
  if (screen.kind === "play" && round) {
    const animate = round.state.step !== animatedStep;
    animatedStep = round.state.step;
    root.replaceChildren(playView(round, play, animate));
  } else if (screen.kind === "done" && round) {
    root.replaceChildren(doneView({ round, mode, full, keep, discussed, animate: !doneDrawn, on: done }));
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
  if (played.items.length === 0) {
    screen = { kind: "error", text: "В наборе нет вопросов, которые можно пройти в чате." };
    return render();
  }
  begin(new Round(played));
}

function begin(next: Round) {
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
  if (!bridge || !round || !source) return;
  const text = roundSummary(source.title, round.kind, round.score(), round.missedWords(), saved);
  bridge.request("ui/update-model-context", { content: [{ type: "text", text }] }).catch(() => undefined);
}

/** The text of a tool result's first text block (an error's reason). */
function resultText(result: unknown): string | null {
  const content = (result as { content?: unknown } | null)?.content;
  if (!Array.isArray(content)) return null;
  const block = content.find((c): c is { type: "text"; text: string } => !!c && typeof c === "object" && c.type === "text" && typeof c.text === "string");
  return block?.text ?? null;
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
    try {
      const result = await bridge.request("tools/call", { name: SAVE_RESULT_TOOL, arguments: saveArguments(source, full.result) });
      if ((result as { isError?: unknown } | null)?.isError) {
        keep = { kind: "error", text: resultText(result) ?? "попробуйте ещё раз" };
      } else {
        keep = { kind: "done" };
        // Saved once: the next save of this set (another round) adds only its run.
        source = { ...source, saved: true };
        if (played) played = { ...played, saved: true };
        tellModel(true);
      }
    } catch (error) {
      keep = { kind: "error", text: error instanceof Error && error.message ? error.message : "нет связи с Карточками" };
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
    if (!bridge || !round || !source || discussed) return;
    const text = mistakesMessage(source.title, round.missedWords());
    discussed = true;
    render();
    bridge.request("ui/message", { role: "user", content: [{ type: "text", text }] }).catch(() => {
      discussed = false;
      render();
    });
  },
};

// Keys as in the app's player: 1–4 pick, 0 «Не знаю», ↵ «Дальше» / «Понятно».
window.addEventListener("keydown", (event) => {
  if (screen.kind !== "play" || !round || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
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
