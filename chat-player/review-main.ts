// «Проверка» in the chat: the connector's second MCP App (ui://kartochki/review.html, contract in
// lib/core/chat-review.ts). Claude's proposal comes as the tool result's structuredContent — levels
// for a batch of words («Уровни слов») or new words («Новые слова») — and the user fixes it here.
// Only the user's tap writes: «Сохранить N» calls set_word_levels, «Добавить N» add_words (MCP App
// tools/call), then «Отменить» calls the tool's own undo (set_word_levels with the returned undo,
// delete_words with the returned ids). What was written is told to Claude (ui/update-model-context).
// «Настроить упражнение» (setup_exercise) writes nothing: its «Начать ›» sends the request to Claude
// as the user's message (ui/message). An MCP App only: no artifact mode.
import { asChatReview, reviewFolderUrl, type ChatReview, type ExerciseSetup, type LevelsReview, type ReviewFolder } from "@/lib/core/chat-review";
import { EXERCISE_LEVELS, EXERCISE_TENSES } from "@/lib/core/exercises";
import { isCefr } from "@/lib/core/level";
import { applyHostContext, callTool, connectHost, reportSize, resultText, type Bridge, type HostContext } from "./bridge";
import { h } from "./dom";
import {
  addWordsArguments,
  levelRows,
  levelsContext,
  nextLevelsMessage,
  readLevelsResult,
  readWordsResult,
  setLevelsArguments,
  setupRequest,
  setupState,
  toggled,
  wordRows,
  wordsContext,
  type LevelRow,
  type SetupState,
  type WordRow,
} from "./review/model";
import { levelsView, setupView, waitView, wordsView, type LevelsPhase, type WordsPhase } from "./review/views";

const root = document.getElementById("app") ?? document.body.appendChild(h("div", { id: "app" }));

let bridge: Bridge | null = null;
let review: ChatReview | null = null;
let wait: { text: string; busy: boolean } = { text: "Готовим список…", busy: true };
let levels: { rows: LevelRow[]; phase: LevelsPhase; asked: boolean } | null = null;
let words: { rows: WordRow[]; phase: WordsPhase; picker: string | null } | null = null;
let setup: { state: SetupState; allThemes: boolean } | null = null;
let error: string | null = null;
let notice: string | null = null;
let expanded = false;
let fullscreen = false;
/** The host's display modes (hostContext.availableDisplayModes); null = not said, fullscreen is asked for anyway. */
let displayModes: string[] | null = null;
/** Where focus goes after the next render (a rebuilt control). */
let refocus: string | null = null;

function render() {
  if (review?.kind === "kartochki-levels" && levels) {
    root.replaceChildren(levelsView({ review, rows: levels.rows, phase: levels.phase, error, notice, expanded, asked: levels.asked, on: levelsOn }));
  } else if (review?.kind === "kartochki-words" && words) {
    const appUrl = review.app_url ?? null;
    root.replaceChildren(
      wordsView({
        review,
        rows: words.rows,
        phase: words.phase,
        error,
        notice,
        expanded,
        picker: words.picker,
        on: wordsOn,
        folderUrl: appUrl ? (f: ReviewFolder | null) => (f ? reviewFolderUrl(appUrl, f.id) : appUrl) : null,
      }),
    );
    placePicker();
  } else if (review?.kind === "kartochki-setup" && setup) {
    root.replaceChildren(setupView({ setup: review, state: setup.state, allThemes: setup.allThemes, error, on: setupOn }));
  } else {
    root.replaceChildren(waitView(wait.text, wait.busy));
  }
  document.documentElement.dataset.display = fullscreen ? "fullscreen" : "inline";
  const target = refocus;
  refocus = null;
  if (target && document.hasFocus()) root.querySelector<HTMLElement>(target)?.focus({ preventScroll: true });
}

function show(next: ChatReview) {
  review = next;
  error = null;
  notice = null;
  expanded = false;
  levels = next.kind === "kartochki-levels" ? { rows: levelRows(next), phase: { kind: "edit" }, asked: false } : null;
  words = next.kind === "kartochki-words" ? { rows: wordRows(next), phase: { kind: "edit" }, picker: null } : null;
  setup = next.kind === "kartochki-setup" ? { state: setupState(next), allThemes: false } : null;
  render();
}

/** What the page wrote, for Claude's next turn. */
function tellModel(text: string) {
  bridge?.request("ui/update-model-context", { content: [{ type: "text", text }] }).catch(() => undefined);
}

// --- Fullscreen («Показать все») -----------------------------------------------------------------

const display = {
  async expand() {
    expanded = true;
    if (bridge && (displayModes === null || displayModes.includes("fullscreen"))) {
      try {
        const result = (await bridge.request("ui/request-display-mode", { mode: "fullscreen" })) as { mode?: unknown } | null;
        fullscreen = result?.mode === "fullscreen";
      } catch {
        // No fullscreen here: the whole list opens in the chat instead.
        fullscreen = false;
      }
    }
    render();
  },
  async collapse() {
    expanded = false;
    if (bridge && fullscreen) {
      fullscreen = false;
      await bridge.request("ui/request-display-mode", { mode: "inline" }).catch(() => undefined);
    }
    render();
  },
};

// --- «Уровни слов» -------------------------------------------------------------------------------

const levelsOn = {
  toggle(index: number) {
    const r = levels?.rows[index];
    if (!levels || !r || r.row.locked || levels.phase.kind !== "edit") return;
    r.checked = !r.checked;
    refocus = `.lrows li:nth-child(${index + 1}) .cb`;
    render();
  },
  pick(index: number, level: string) {
    const r = levels?.rows[index];
    if (!levels || !r || r.row.locked || levels.phase.kind !== "edit" || !isCefr(level)) return;
    r.level = level;
    // Picking a level is choosing to save it.
    r.checked = true;
    refocus = `[data-row="${index}"] [data-level="${level}"]`;
    render();
  },
  async save() {
    if (!bridge || !levels || levels.phase.kind !== "edit") return;
    const args = setLevelsArguments(levels.rows);
    if (args.items.length === 0) return;
    const lockedNotSent = levels.rows.filter((r) => r.row.locked).length;
    levels.phase = { kind: "busy" };
    error = null;
    notice = null;
    render();
    const outcome = await callTool(bridge, "set_word_levels", args);
    if (!outcome.ok) {
      levels.phase = { kind: "edit" };
      error = `Не сохранилось: ${outcome.error}`;
    } else {
      const saved = readLevelsResult(outcome.data, lockedNotSent);
      levels.phase = { kind: "saved", saved, undoing: false };
      tellModel(levelsContext(levels.rows, saved));
    }
    render();
  },
  async undo() {
    if (!bridge || !levels || levels.phase.kind !== "saved" || !levels.phase.saved.undo || levels.phase.undoing) return;
    const phase = levels.phase;
    levels.phase = { ...phase, undoing: true };
    error = null;
    render();
    // set_word_levels' own undo, passed back unchanged (items with source / expect, overwrite_user).
    const outcome = await callTool(bridge, "set_word_levels", { items: phase.saved.undo!.items, overwrite_user: phase.saved.undo!.overwrite_user });
    if (!outcome.ok) {
      levels.phase = { ...phase, undoing: false };
      error = `Не отменилось: ${outcome.error}`;
    } else {
      levels.phase = { kind: "edit" };
      notice = "Сохранение отменено — уровни как были.";
      tellModel("В окне «Уровни слов» пользователь отменил сохранение: уровни этих слов вернулись к прежним.");
    }
    render();
  },
  next() {
    if (!bridge || !levels || levels.asked || !review || review.kind !== "kartochki-levels") return;
    levels.asked = true;
    render();
    const text = nextLevelsMessage((review as LevelsReview).remaining);
    bridge.request("ui/message", { role: "user", content: [{ type: "text", text }] }).catch(() => {
      if (levels) levels.asked = false;
      render();
    });
  },
  expand: () => void display.expand(),
  collapse: () => void display.collapse(),
};

// Arrows move along a level strip (one tab stop per row), as in a radio group.
root.addEventListener("keydown", (event) => {
  const target = event.target as HTMLElement;
  const group = target.closest<HTMLElement>("[role=radiogroup][data-row]");
  if (!group || !levels || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
  const index = Number(group.dataset.row);
  const r = levels.rows[index];
  if (!r) return;
  const order = ["A1", "A2", "B1", "B2", "C1", "C2"];
  const at = order.indexOf(r.level) + (event.key === "ArrowRight" ? 1 : -1);
  if (at < 0 || at >= order.length) return;
  event.preventDefault();
  levelsOn.pick(index, order[at]);
});

// --- «Новые слова» -------------------------------------------------------------------------------

const wordsOn = {
  toggle(key: string) {
    const r = words?.rows.find((x) => x.row.key === key);
    if (!words || !r || r.row.duplicate || words.phase.kind !== "edit") return;
    r.checked = !r.checked;
    refocus = `.wrows li:nth-child(${words.rows.indexOf(r) + 1}) .cb`;
    render();
  },
  toggleAll() {
    if (!words || words.phase.kind !== "edit") return;
    const any = words.rows.some((r) => r.checked && !r.row.duplicate);
    for (const r of words.rows) if (!r.row.duplicate) r.checked = !any;
    render();
  },
  openPicker(key: string) {
    if (!words || words.phase.kind !== "edit") return;
    words.picker = words.picker === key ? null : key;
    refocus = words.picker ? "[data-picker] [aria-selected=true], [data-picker] .popt" : `[data-chip="${CSS.escape(key)}"]`;
    render();
  },
  pickFolder(key: string, folder: ReviewFolder) {
    if (!words) return;
    // A theme the user picks here counts as named by the user (folder_chosen_by_user).
    for (const r of words.rows) {
      if (r.row.duplicate || (key !== "all" && r.row.key !== key)) continue;
      r.folder = folder;
      r.chosen = true;
    }
    words.picker = null;
    refocus = `[data-chip="${CSS.escape(key)}"]`;
    render();
  },
  async add() {
    if (!bridge || !words || words.phase.kind !== "edit") return;
    const args = addWordsArguments(words.rows);
    if (args.words.length === 0) return;
    words.phase = { kind: "busy" };
    words.picker = null;
    error = null;
    notice = null;
    render();
    const outcome = await callTool(bridge, "add_words", args);
    if (!outcome.ok) {
      words.phase = { kind: "edit" };
      error = `Не добавилось: ${outcome.error}`;
    } else {
      const result = readWordsResult(outcome.data);
      words.phase = { kind: "added", result, undoing: false };
      const added = new Set(result.added.map((w) => w.fr));
      tellModel(wordsContext(result, words.rows.filter((r) => !added.has(r.row.fr)).map((r) => r.row.fr)));
      // The receipt is shorter than the list: back to the chat's own size.
      if (fullscreen) void display.collapse();
    }
    render();
  },
  async undo() {
    if (!bridge || !words || words.phase.kind !== "added" || words.phase.undoing) return;
    const phase = words.phase;
    words.phase = { ...phase, undoing: true };
    error = null;
    render();
    const outcome = await callTool(bridge, "delete_words", { ids: phase.result.undoIds });
    if (!outcome.ok) {
      words.phase = { ...phase, undoing: false };
      error = `Не отменилось: ${outcome.error}`;
    } else {
      words.phase = { kind: "edit" };
      notice = "Добавление отменено — слова удалены.";
      tellModel(`В окне «Новые слова» пользователь отменил добавление: удалены ${phase.result.added.map((w) => w.fr).join(", ")}.`);
    }
    render();
  },
  open(url: string) {
    bridge?.request("ui/open-link", { url }).catch(() => undefined);
  },
  expand: () => void display.expand(),
  collapse: () => void display.collapse(),
};

// --- «Настроить упражнение» ---------------------------------------------------------------------

/** Changes a pick while the request is not sent yet, and keeps focus on the control tapped. */
function editSetup(focus: string | null, change: (state: SetupState, review: ExerciseSetup) => void) {
  if (!setup || setup.state.sent || review?.kind !== "kartochki-setup") return;
  change(setup.state, review);
  error = null;
  refocus = focus;
  render();
}

const setupOn = {
  theme: (id: string | null) =>
    editSetup(`[data-theme="${CSS.escape(id ?? "inbox")}"]`, (s, r) => {
      s.folders = toggled(r.themes.map((t) => t.id), s.folders, id);
    }),
  allThemes() {
    if (!setup) return;
    setup.allThemes = true;
    render();
  },
  clearThemes: () =>
    editSetup('[data-theme="all"]', (s) => {
      s.folders = [];
    }),
  verbs: () =>
    editSetup(".setup .cb", (s) => {
      s.verbs = !s.verbs;
    }),
  tense: (tense: string) =>
    editSetup(`[data-tense="${CSS.escape(tense)}"]`, (s) => {
      const t = EXERCISE_TENSES.find((x) => x === tense);
      if (!t) return;
      // From «Все», a tap picks that one tense; all four on is «Все» again.
      const from = s.tenses.length === EXERCISE_TENSES.length ? [] : s.tenses;
      const next = toggled(EXERCISE_TENSES, from, t);
      s.tenses = next.length === EXERCISE_TENSES.length ? [] : next;
    }),
  allTenses: () =>
    editSetup('[data-tense="all"]', (s) => {
      s.tenses = [];
    }),
  size: (n: number) =>
    editSetup(`[data-size="${n}"]`, (s) => {
      if (s.verbs) s.verbSize = n;
      else s.size = n;
    }),
  level: (level: string) =>
    editSetup(`[data-level="${CSS.escape(level)}"]`, (s) => {
      const l = EXERCISE_LEVELS.find((x) => x === level);
      if (l) s.levels = toggled(EXERCISE_LEVELS, s.levels, l);
    }),
  autoLevel: () =>
    editSetup('[data-level="auto"]', (s) => {
      s.levels = [];
    }),
  start() {
    if (!bridge || !setup || setup.state.sent || review?.kind !== "kartochki-setup") return;
    const text = setupRequest(review, setup.state);
    setup.state.sent = true;
    error = null;
    render();
    bridge.request("ui/message", { role: "user", content: [{ type: "text", text }] }).catch(() => {
      if (setup) setup.state.sent = false;
      error = "Не отправилось в чат — попробуйте ещё раз или напишите запрос сами.";
      render();
    });
  },
};

/** The picker sits under its chip (over the rows), or above it when the sheet ends first. */
function placePicker() {
  const pop = root.querySelector<HTMLElement>("[data-picker]");
  const key = words?.picker;
  if (!pop || !key) return;
  const sheet = pop.offsetParent as HTMLElement | null;
  const chip = root.querySelector<HTMLElement>(`[data-chip="${CSS.escape(key)}"]`);
  if (!sheet || !chip) return;
  const s = sheet.getBoundingClientRect();
  const c = chip.getBoundingClientRect();
  const below = c.bottom - s.top + 4;
  const above = c.top - s.top - pop.offsetHeight - 4;
  pop.style.top = `${below + pop.offsetHeight <= s.height || above < 0 ? below : above}px`;
  if (key === "all") pop.style.left = `${Math.max(12, c.left - s.left - 8)}px`;
  else pop.style.right = "12px";
}

document.addEventListener("click", (event) => {
  if (!words?.picker) return;
  const target = event.target as HTMLElement;
  if (target.closest("[data-picker]") || target.closest("[data-chip]")) return;
  words.picker = null;
  render();
});

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !words?.picker) return;
  const key = words.picker;
  words.picker = null;
  refocus = `[data-chip="${CSS.escape(key)}"]`;
  render();
});

// --- Host ----------------------------------------------------------------------------------------

function onHost(method: string, params: Record<string, unknown>) {
  switch (method) {
    case "ui/notifications/tool-input-partial":
    case "ui/notifications/tool-input":
      return;
    case "ui/notifications/tool-result": {
      const next = asChatReview(params.structuredContent);
      if (next) {
        // The same review again (a host re-sends the result): the user's edits stay.
        if (JSON.stringify(next) !== JSON.stringify(review)) show(next);
        return;
      }
      if (!review) {
        wait = { text: resultText(params) ?? "Список не открылся.", busy: false };
        render();
      }
      return;
    }
    case "ui/notifications/tool-cancelled":
      if (!review) {
        wait = { text: "Список не открылся.", busy: false };
        render();
      }
      return;
    case "ui/notifications/host-context-changed":
      return hostContext(params as HostContext);
  }
}

function hostContext(ctx: HostContext) {
  applyHostContext(ctx);
  if (Array.isArray(ctx.availableDisplayModes)) displayModes = ctx.availableDisplayModes.filter((m): m is string => typeof m === "string");
  if (ctx.displayMode === "inline" || ctx.displayMode === "fullscreen") {
    const was = fullscreen;
    fullscreen = ctx.displayMode === "fullscreen";
    // The host left fullscreen (its own close button): the list folds back.
    if (was && !fullscreen) expanded = false;
    if (was !== fullscreen) render();
  }
}

if (window.parent === window) {
  wait = { text: "Эта страница открывается в чате с Claude.", busy: false };
  render();
} else {
  render();
  bridge = connectHost(onHost, "kartochki-review");
  const connected = bridge;
  void connected.ready.then((ctx) => {
    if (ctx) hostContext(ctx);
    reportSize(connected);
  });
}
