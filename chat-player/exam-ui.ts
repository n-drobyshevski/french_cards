// «Мини-TCF» screens (pick A, mockups Chat-TCF-Start / Chat-TCF-Reading-A / Chat-TCF-Done): one
// sheet with the red rule. The start card (what the exam holds, its three rules, «Начать 18:00»: the
// time runs only from there); a question with «07 / 12 · МИНИ-TCF · ТЕКСТ», the countdown (red under
// 2:00) and the progress line, the options as A–D rows, pick then «Ответить», nothing shown about
// the answer; then «ИТОГ · МИНИ-TCF» with the score by level and the misses. Every function builds
// fresh DOM; the countdown alone is updated in place every tick (exam-ui `tickClock`).
import { CEFR_LEVELS } from "@/lib/core/level";
import { clozeParts } from "@/lib/core/exercises";
import type { ExerciseItem } from "@/lib/types";
import { isRussian } from "@/lib/core/text";
import { h, icon, type Child } from "./dom";
import { LOW_TIME_S, clock, clockWords, compositionLine, examLevels, examTypeLabel, examWords, passageKinds, type ExamRound, type LevelScore } from "./exam";
import { plural } from "./texts";
import { LETTERS, cls, missList, passageBlock, type KeepState } from "./ui";

const QUESTIONS = ["вопрос", "вопроса", "вопросов"] as const;
const pad = (n: number) => String(n).padStart(2, "0");

const RULES = ["Без подсказок по ходу", "Назад вернуться нельзя", "Время общее — неотвеченные засчитываются как ошибки"];

/** The start card: nothing runs until «Начать». */
export function examStartView(round: ExamRound, on: { start(): void }): HTMLElement {
  const items = round.items;
  const levels = examLevels(round.set, items);
  // The strip fills the span the questions cover («от A2 до B2»).
  const first = levels.length > 0 ? CEFR_LEVELS.indexOf(levels[0]) : -1;
  const last = levels.length > 0 ? CEFR_LEVELS.indexOf(levels[levels.length - 1]) : -1;
  const words = examWords(items);
  const kinds = passageKinds(items);
  const minutes = Math.round(round.limitS / 60);
  return h(
    "section",
    { class: "sheet", "aria-label": `Мини-TCF: ${round.set.title}` },
    h("div", { class: "shead" }, h("h1", { class: "sl strong" }, `Мини-TCF · ${items.length} ${plural(items.length, QUESTIONS)} · ${minutes} мин`)),
    h(
      "div",
      { class: "sbody" },
      h("h2", { class: "stitle", tabindex: "-1", "data-focus": "" }, round.set.title),
      words && h("p", { lang: "fr", class: "swords" }, words),
      levels.length > 0 &&
        h(
          "div",
          { class: "srow mid" },
          h("span", { class: "skey" }, "Уровни"),
          h(
            "div",
            { class: "lvstrip", role: "img", "aria-label": levels.length === 1 ? `Уровень вопросов: ${levels[0]}` : `Уровни вопросов: от ${levels[0]} до ${levels[levels.length - 1]}` },
            CEFR_LEVELS.map((l, i) => h("span", { class: i >= first && i <= last ? "on" : null }, l)),
          ),
        ),
      h(
        "div",
        { class: "srow" },
        h("span", { class: "skey" }, "Состав"),
        h("span", { class: "sval" }, compositionLine(items), kinds && [h("br"), h("span", { class: "muted" }, kinds)]),
      ),
    ),
    h(
      "ol",
      { class: "rules" },
      RULES.map((r, i) => h("li", null, h("span", { class: "rn", "aria-hidden": "true" }, pad(i + 1)), h("span", null, r))),
    ),
    h(
      "div",
      { class: "sfoot" },
      h(
        "button",
        { type: "button", class: "btn", "data-start": "", onclick: () => on.start() },
        "Начать",
        h("span", { class: "btn-time", "aria-hidden": "true" }, clock(round.limitS)),
        h("span", { class: "sr" }, `, время: ${clockWords(round.limitS)}`),
      ),
      h("p", { class: "shint" }, "Ответы увидите в конце — как на настоящем экзамене."),
    ),
  );
}

/** The countdown: «11:42», red under 2:00; exam-ui's tick rewrites its text in place. */
function timer(seconds: number): HTMLElement {
  const s = Math.ceil(seconds);
  return h(
    "span",
    { class: cls("timer", s <= LOW_TIME_S && "low"), role: "timer", "aria-label": `Осталось ${clockWords(s)}`, "data-clock": "" },
    icon("timer", 16, 1.75),
    h("span", { "data-clock-text": "" }, clock(s)),
  );
}

/** Updates the countdown in place (no rebuild: the picked option and focus stay as they are). */
export function tickClock(root: HTMLElement, seconds: number): void {
  const el = root.querySelector<HTMLElement>("[data-clock]");
  const text = el?.querySelector<HTMLElement>("[data-clock-text]");
  if (!el || !text) return;
  const s = Math.ceil(seconds);
  text.textContent = clock(s);
  el.classList.toggle("low", s <= LOW_TIME_S);
  // The label changes once a minute (and every second of the last 10), so a screen reader isn't flooded.
  if (s % 60 === 0 || s <= 10) el.setAttribute("aria-label", `Осталось ${clockWords(s)}`);
}

/** The question as the exam shows it: a reading item's text and question; a word, a sentence with its gap. */
function examPrompt(item: ExerciseItem): Child[] {
  switch (item.type) {
    case "reading":
      return [item.passage && passageBlock(item.passage, item.passage_label ?? null), h("p", { lang: "fr", class: "xq", id: "xq" }, item.prompt ?? "")];
    case "cloze":
    case "conjugate": {
      const parts = clozeParts(item.sentence ?? "");
      const sentence = parts ? [parts.before, h("span", { class: "gap", role: "img", "aria-label": "пропуск" }), parts.after] : [item.sentence ?? ""];
      return [
        item.type === "conjugate" && item.prompt && h("p", { lang: "fr", class: "xw" }, item.prompt),
        h("p", { lang: "fr", class: "xq", id: "xq" }, sentence),
        item.type === "cloze" && item.sentence_ru && h("p", { class: "xsub" }, item.sentence_ru),
      ];
    }
    default: {
      const text = item.prompt ?? item.word?.fr ?? "";
      const ru = isRussian(text);
      const question = item.ask === "ru" || item.skill === "form" ? "Как сказать по-французски?" : item.skill === "neutral" ? "Как сказать нейтрально?" : item.skill === "situation" ? "Что ответить?" : "Что это значит?";
      return [h("p", { lang: ru ? "ru" : "fr", class: cls("xw", ru && "ru"), id: "xq" }, text), !text.trim().endsWith("?") && h("p", { class: "xsub" }, question)];
    }
  }
}

export interface ExamPlayHandlers {
  select(index: number): void;
  submit(): void;
}

/** One question: header with the count and the countdown, the progress line, the rows, «Ответить». */
export function examQuestionView(round: ExamRound, seconds: number, on: ExamPlayHandlers, animate: boolean): HTMLElement {
  const item = round.item!;
  const options = round.options();
  const n = round.items.length;
  const position = round.index + 1;
  return h(
    "section",
    { class: "sheet", "aria-label": `Мини-TCF, вопрос ${position} из ${n}` },
    h(
      "div",
      { class: "xhead" },
      h("span", { class: "xcount", "aria-hidden": "true" }, pad(position), h("span", null, ` / ${pad(n)}`)),
      h("span", { class: "sl" }, `Мини-TCF · ${examTypeLabel(item)}`),
      timer(seconds),
    ),
    h("div", { class: "xprog", role: "progressbar", "aria-label": `Вопрос ${position} из ${n}`, "aria-valuemin": "0", "aria-valuemax": String(n), "aria-valuenow": String(round.index) }, h("span", { style: `width:${(round.index / n) * 100}%` })),
    h(
      "div",
      { class: cls("xbody", animate && "enter"), tabindex: "-1", "data-focus": "" },
      examPrompt(item),
      options &&
        h(
          "div",
          { role: "radiogroup", "aria-labelledby": "xq", class: "rows" },
          options.options.map((text, i) => {
            const on_ = round.picked === i;
            return h(
              "button",
              { type: "button", role: "radio", "aria-checked": String(on_), class: cls("xopt", on_ && "picked"), "data-option": i + 1, "aria-keyshortcuts": `${i + 1} ${LETTERS[i]}`, onclick: () => on.select(i) },
              h("span", { class: "xl", "aria-hidden": "true" }, LETTERS[i]),
              h("span", { lang: isRussian(text) ? "ru" : "fr", class: "xt" }, text),
            );
          }),
        ),
    ),
    h("div", { class: "xfoot" }, h("button", { type: "button", class: "btn", "data-advance": "", disabled: round.picked === null, onclick: () => on.submit() }, "Ответить")),
  );
}

function levelChip(l: LevelScore, i: number): HTMLElement {
  return h(
    "li",
    { class: `chip ${l.verdict}`, "aria-label": `${l.level}: ${l.correct} из ${l.total}`, style: `--i:${i}` },
    h("b", null, l.level),
    l.verdict === "mid" ? h("span", { class: "tilde", "aria-hidden": "true" }, "~") : icon(l.verdict === "ok" ? "check" : "close", 14, 2),
    h("span", null, `${l.correct}/${l.total}`),
  );
}

export interface ExamDoneProps {
  round: ExamRound;
  mode: "app" | "artifact";
  keep: KeepState;
  discussed: boolean;
  animate: boolean;
  on: { keep(): void; again(): void; discuss(): void };
}

/** The keeping part: «Сохранить в Карточки» (app) or «Скопировать результат» (artifact), as in the practice done screen. */
function keepButton({ mode, keep, on }: ExamDoneProps): { button: Child; note: Child } {
  if (mode === "artifact") {
    if (keep.kind === "manual") {
      return {
        button: null,
        note: [
          h("textarea", { class: "line-box", readonly: true, rows: 3, "aria-label": "Результат", onfocus: (e: Event) => (e.target as HTMLTextAreaElement).select() }, keep.text),
          h("p", { class: "hint" }, "Скопируйте строку и вставьте в чат — Claude сохранит результат в Карточки, если захотите."),
        ],
      };
    }
    return {
      button:
        keep.kind === "done"
          ? h("p", { class: "status grow", role: "status" }, icon("check", 20, 2), "Скопировано")
          : h("button", { type: "button", class: "btn line grow", onclick: () => on.keep() }, "Скопировать результат"),
      note: h("p", { class: "hint" }, "Вставьте в чат — Claude сохранит результат в Карточки, если захотите."),
    };
  }
  if (keep.kind === "done") return { button: h("p", { class: "status grow", role: "status" }, icon("check", 20, 2), "Сохранено в Карточки"), note: null };
  const busy = keep.kind === "busy";
  return {
    button: h("button", { type: "button", class: "btn line grow", disabled: busy, "aria-busy": busy ? "true" : null, onclick: () => on.keep() }, busy ? "Сохраняем…" : "Сохранить в Карточки"),
    note: keep.kind === "error" ? h("p", { class: "hint err", role: "alert" }, `Не сохранилось: ${keep.text}`) : null,
  };
}

/** «ИТОГ · МИНИ-TCF»: the score and time, the chips by level, «Это ориентир, не балл TCF.», the misses, then the actions. */
export function examDoneView(props: ExamDoneProps): HTMLElement {
  const { round, mode, discussed, animate, on } = props;
  const score = round.score();
  const used = round.used(round.endMs ?? 0);
  const topic = round.set.topic && round.set.topic.length <= 24 ? round.set.topic : null;
  const { button, note } = keepButton(props);
  return h(
    "section",
    { class: cls("sheet", "xdone", animate && "anim"), "aria-label": "Итог мини-TCF" },
    h("div", { class: "shead" }, h("h1", { class: "sl strong grow", tabindex: "-1", "data-focus": "" }, "Итог · мини-TCF"), topic && h("span", { class: "sl" }, topic)),
    h(
      "div",
      { class: "dsum" },
      h(
        "p",
        { class: "dscore" },
        h("span", { class: "big" }, `${score.correct} из ${score.total}`),
        h("span", { class: "dtime", "aria-label": `за ${clockWords(used)} из ${clockWords(round.limitS)}` }, `· ${clock(used)}`, round.timedOut && " · время вышло"),
      ),
      score.levels.length > 0 && h("ul", { class: "chips", "aria-label": "По уровням", style: `--n:${Math.min(3, score.levels.length)}` }, score.levels.map(levelChip)),
      h("p", { class: "dnote" }, "Это ориентир, не балл TCF."),
    ),
    score.misses.length > 0 &&
      h("section", { class: "derr", "aria-label": "Ошибки" }, h("h2", null, "Ошибки ", h("span", { class: "mono" }, `· ${score.misses.length}`)), missList(score.misses)),
    h(
      "div",
      { class: "xfoot col" },
      mode === "app" &&
        score.misses.length > 0 &&
        h("button", { type: "button", class: "btn", disabled: discussed, onclick: () => on.discuss() }, discussed ? "Отправлено в чат" : "Разобрать ошибки"),
      h("div", { class: "drow" }, button, h("button", { type: "button", class: "text-act", onclick: () => on.again() }, "Ещё раз")),
      note,
    ),
  );
}
