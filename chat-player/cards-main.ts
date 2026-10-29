// «Карточки в чате»: the connector's third MCP App (ui://kartochki/cards.html, contract in
// lib/core/chat-cards.ts). play_cards hands it a round of cards as the tool result's
// structuredContent. «По расписанию»: each answer is saved by grade_cards (MCP App tools/call) as
// soon as it is tapped — only on the user's tap — and the last one can be taken back with
// undo_grades (Z / «Отменить последний ответ»); «Тренировка» writes nothing. After every save or
// undo, and at the end, one line goes into Claude's context (ui/update-model-context); the done
// screen's «Продолжить ›» and «Упражнение по ошибкам ›» send requests as the user's message
// (ui/message). The rules are cards/model.ts; the screens cards/views.ts. An MCP App only.
import { reviewKeyAction, keepsActivationKeys, isTypingTarget } from "@/components/review/keys";
import { GRADE_TOOL, UNDO_GRADES_TOOL, asChatCardsSession, isCardRating, type ChatCardRating, type ChatCardsSession } from "@/lib/core/chat-cards";
import { applyHostContext, callTool, connectHost, reportSize, resultText, type Bridge, type HostContext } from "./bridge";
import { CALL_TIMEOUT_MS, CardsRound, type Call, type CallOutcome } from "./cards/model";
import { doneView, emptyView, playView, waitView } from "./cards/views";
import { h } from "./dom";

const root = document.getElementById("app") ?? document.body.appendChild(h("div", { id: "app" }));
// Stays mounted outside the rebuilt screens, so a flip or a save is announced.
const live = document.body.appendChild(h("p", { class: "sr", "aria-live": "polite" }));

let bridge: Bridge | null = null;
let session: ChatCardsSession | null = null;
let round: CardsRound | null = null;
let wait: { text: string; busy: boolean } = { text: "Готовим карточки…", busy: true };
/** The grade just tapped: its button fills (--dur-flash) before the card moves on. */
let flash: ChatCardRating | null = null;
let fold = false;
let animatedStep = -1;
let doneDrawn = false;
const asked = new Set<"continue" | "exercise" | "refresh">();
/** Where focus goes after the next render: the card (after a flip, a grade or an undo; as the app's ReviewScreen). */
let refocus: "card" | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

/** Wall clock (the model takes it as an argument). */
const now = () => Date.now();
/** Reduced motion: no flash hold. */
const motion = () => !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function screen(): HTMLElement {
  if (!round) return waitView(wait.text, wait.busy);
  if (round.head) {
    if (doneDrawn) doneDrawn = false;
    const animate = round.step !== animatedStep;
    animatedStep = round.step;
    return playView({ round, now: now(), flash, animate, fold, refreshAsked: asked.has("refresh"), on: play });
  }
  if (round.answers.length === 0) return emptyView(round);
  if (round.saving && !round.trouble) return waitView("Сохраняем последние ответы…");
  const view = doneView({ round, now: now(), animate: !doneDrawn, asked, on: done });
  doneDrawn = true;
  return view;
}

/** A selector for the focused control's counterpart in a rebuilt screen; null when focus is not on one. */
function focusKey(el: Element | null): string | null {
  if (!(el instanceof HTMLElement) || el === root || !root.contains(el)) return null;
  for (const attr of ["data-grade", "data-flip", "data-focus"]) if (el.hasAttribute(attr)) return `[${attr}="${el.getAttribute(attr)}"]`;
  const classes = [...el.classList].map((c) => `.${CSS.escape(c)}`).join("");
  return `${el.tagName.toLowerCase()}${classes}`;
}

function render() {
  const next = screen();
  const target = refocus;
  refocus = null;
  const current = root.firstElementChild;
  // Nothing changed (the clock's tick): the screen stays, focus and all.
  if (!target && current && root.childElementCount === 1 && current.isEqualNode(next)) return;
  const active = document.activeElement;
  const kept = focusKey(active);
  const label = active instanceof HTMLElement ? active.textContent : null;
  root.replaceChildren(next);
  if (!document.hasFocus()) return;
  let el: HTMLElement | null = null;
  if (target) el = root.querySelector<HTMLElement>("[data-focus]");
  else if (kept) {
    // Focus stays on the same control: a grade, the card, or the button with the same name.
    const all = [...root.querySelectorAll<HTMLElement>(kept)];
    el = all.find((e) => e.textContent === label) ?? (all.length === 1 ? all[0] : null);
  }
  el?.focus({ preventScroll: true });
}

/** Focus is in the page (on a control about to be rebuilt): it moves on with the card. */
const focusInside = () => document.hasFocus() && (document.activeElement === document.body || root.contains(document.activeElement));

function start(next: ChatCardsSession) {
  session = next;
  round = new CardsRound(next);
  asked.clear();
  flash = null;
  fold = false;
  doneDrawn = false;
  animatedStep = -1;
  live.textContent = "";
  render();
}

/** One line for Claude: what was answered and saved so far (ui/update-model-context). */
function tellModel() {
  if (!bridge || !round) return;
  bridge.request("ui/update-model-context", { content: [{ type: "text", text: round.contextLine() }] }).catch(() => undefined);
}

// --- The outbox ---------------------------------------------------------------------------------

/** Sends what waits, one call at a time; a rate-limit wait comes back here when it ends. */
function pump() {
  if (!bridge || !round) return;
  if (retryTimer !== null) clearTimeout(retryTimer);
  retryTimer = null;
  const current = round;
  const call = current.nextCall(now());
  if (!call) {
    const t = current.trouble;
    if (t?.kind === "wait") {
      // The countdown in the save line, then the call.
      retryTimer = setTimeout(() => {
        render();
        pump();
      }, Math.min(1000, Math.max(0, t.until - now())));
    }
    return;
  }
  render();
  void send(current, call);
}

async function send(current: CardsRound, call: Call) {
  if (!bridge) return;
  const name = call.kind === "grade" ? GRADE_TOOL : UNDO_GRADES_TOOL;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const lost = new Promise<"lost">((resolve) => {
    timer = setTimeout(() => resolve("lost"), CALL_TIMEOUT_MS);
  });
  const result = callTool(bridge, name, { ...call.args });
  const first = await Promise.race([result, lost]);
  if (timer !== null) clearTimeout(timer);
  if (current !== round) return;
  if (first === "lost") {
    current.callLost(call);
    render();
    tellModel();
    // A late answer still counts (the same row: already_saved on a resend).
    void result.then((late) => settle(current, call, late));
    return;
  }
  settle(current, call, first);
}

function settle(current: CardsRound, call: Call, outcome: CallOutcome) {
  if (current !== round) return;
  const inside = focusInside();
  const step = current.step;
  current.callDone(call, outcome, now());
  if (current.step !== step && inside) refocus = "card";
  if (outcome.ok) live.textContent = call.kind === "undo" ? "Ответ отменён" : "";
  render();
  tellModel();
  pump();
}

// --- Playing ------------------------------------------------------------------------------------

const play = {
  flip() {
    if (!round || flash !== null || round.stale(now())) return;
    const inside = focusInside();
    if (!round.flip()) return;
    fold = false;
    // The answer card, not «Не знаю»: Space / Enter on it flips back, and never grades by accident.
    if (inside) refocus = "card";
    const card = round.head?.card;
    if (card) live.textContent = `${card.fr} — ${card.ru}`;
    render();
  },
  unflip() {
    if (!round || flash !== null || !round.unflip()) return;
    refocus = "card";
    render();
  },
  grade(rating: ChatCardRating) {
    if (!round || flash !== null || round.phase !== "answer" || round.stale(now())) return;
    const inside = focusInside();
    const commit = () => {
      flash = null;
      if (!round?.grade(rating, now())) return render();
      fold = false;
      if (inside) refocus = "card";
      live.textContent = "";
      render();
      if (!round.head) tellModel();
      pump();
    };
    if (!motion()) return commit();
    flash = rating;
    render();
    setTimeout(commit, 120);
  },
  undo() {
    if (!round || flash !== null) return;
    const inside = focusInside();
    if (!round.undo()) return;
    fold = false;
    if (inside) refocus = "card";
    live.textContent = "Последний ответ отменён — карточка снова перед вами";
    render();
    if (round.practice) return;
    tellModel();
    pump();
  },
  retry() {
    if (!round?.retry()) return;
    render();
    pump();
  },
  fold() {
    fold = !fold;
    render();
    if (fold) root.querySelector<HTMLElement>(".fold-btn")?.focus({ preventScroll: true });
  },
  refresh() {
    if (round) sendMessage("refresh", round.refreshMessage());
  },
};

/** A request into the chat as the user's message; its button stays off once sent. */
function sendMessage(kind: "continue" | "exercise" | "refresh", text: string) {
  if (!bridge || asked.has(kind)) return;
  asked.add(kind);
  render();
  bridge.request("ui/message", { role: "user", content: [{ type: "text", text }] }).catch(() => {
    asked.delete(kind);
    render();
  });
}

const done = {
  continue() {
    if (round && !round.saving) sendMessage("continue", round.continueMessage());
  },
  exercise() {
    if (round && !round.saving) sendMessage("exercise", round.mistakesMessage());
  },
  again() {
    if (session && round?.practice) start(session);
  },
  retry: () => play.retry(),
};

// Keys as on the app's review screen (components/review/keys.ts): Space / Enter flip and flip back,
// 1 / 2 / 3 grade, ← / → «Не знаю» / «Знаю», Z undoes. A control reached with the keyboard keeps
// Space and Enter.
let pointerAt = 0;
let focusedByPointer = false;
document.addEventListener("pointerdown", () => (pointerAt = Date.now()), true);
document.addEventListener("focusin", () => (focusedByPointer = Date.now() - pointerAt < 600), true);

window.addEventListener("keydown", (event) => {
  if (!round || event.defaultPrevented || isTypingTarget(event.target)) return;
  const target = event.target as Element | null;
  const onCard = target instanceof Element && !!target.closest("[data-card]");
  const activation = event.key === " " || event.key === "Enter";
  if (activation && !onCard && keepsActivationKeys(target, focusedByPointer)) return;
  const action = reviewKeyAction(event, { revealed: round.phase === "answer", gradeButtons: 3, done: !round.head });
  if (!action) return;
  if (action.type === "undo") {
    event.preventDefault();
    play.undo();
  } else if (action.type === "flip") {
    event.preventDefault();
    play.flip();
  } else if (action.type === "unflip") {
    event.preventDefault();
    play.unflip();
  } else if (action.type === "grade" && isCardRating(action.rating)) {
    event.preventDefault();
    play.grade(action.rating);
  }
});

// The stale line, the waiting minutes and the save countdown keep up with the clock.
setInterval(() => {
  if (round && (round.head || round.answers.length > 0)) render();
}, 30_000);

function onHost(method: string, params: Record<string, unknown>) {
  switch (method) {
    case "ui/notifications/tool-input-partial":
    case "ui/notifications/tool-input":
      return;
    case "ui/notifications/tool-result": {
      const next = asChatCardsSession(params.structuredContent);
      if (next) {
        // The same round again (a host re-sends the result): the round in progress stays.
        if (session?.round_id !== next.round_id) start(next);
        return;
      }
      if (!session) {
        wait = { text: resultText(params) ?? "Карточки не открылись.", busy: false };
        render();
      }
      return;
    }
    case "ui/notifications/tool-cancelled":
      if (!session) {
        wait = { text: "Карточки не открылись.", busy: false };
        render();
      }
      return;
    case "ui/notifications/host-context-changed":
      return applyHostContext(params as HostContext);
  }
}

if (window.parent === window) {
  wait = { text: "Эта страница открывается в чате с Claude.", busy: false };
  render();
} else {
  render();
  bridge = connectHost(onHost, "kartochki-cards");
  const connected = bridge;
  void connected.ready.then((ctx) => {
    if (ctx) applyHostContext(ctx);
    reportSize(connected);
  });
}
