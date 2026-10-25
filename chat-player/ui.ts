// The chat player's screens, ported from the app's phone player (pick E3 B, mockups/X-Player-B*)
// and done screen (pick E4 B, mockups/X-Done-B): the question card on its small deck with the
// answer written on the card, the 2×2 slips, the ВЕРНО / НЕВЕРНО stamp, «Дальше» after every
// answer; then «ИТОГ НАБОРА» with the strip and the misses. The components it follows:
// components/exercises/{QuestionCard,OptionGrid,ClozeLine,MatchPairs,Stamp,FeedbackLine,
// NewWordCard,DonePhone}.tsx; a reading item («текст») as Ex-Reading-App: its text on the card, the
// question, the slips (A–D rows when an option is long). Every function builds fresh DOM from the
// round's state. The exam («Мини-TCF») has its own screens in exam-ui.ts.
import { counterLabel, formatCounter, isRussian, resultTone, tileVerdict, type PairsState, type PlayerResult } from "@/components/exercises/player-state";
import type { StripMark } from "@/components/ui/SessionStrip";
import { CLOZE_PROMPT, CONJ_PROMPT, PAIRS_PROMPT, clozeParts, passageLines, type ExerciseOptions } from "@/lib/core/exercises";
import { SLANG_LABELS, type ExerciseItem, type ExerciseNewWord, type ExercisePairTile, type SlangLevel } from "@/lib/types";
import { cardLabel, conjSize, deckEdges, explainParts, frSize, isParagraph, optionRows, posAbbr, selfEvident, showsMeter, skillQuestion, sourceDomain, stampPlace } from "./card";
import { h, icon, type Child } from "./dom";
import { questionLine, type ExamMiss } from "./exam";
import type { Round } from "./round";
import { plural } from "./texts";

export const cls = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

// --- Parts ---------------------------------------------------------------------------------------

const SLANG_NAMES_RU = ["нейтральный", "фамильярный", "арго", "вульгарный"] as const;

/** The 4-segment slang meter (components/ui/SlangMeter): vulg. in red ink, the italic abbreviation after it. */
export function meter(level: SlangLevel, verlan: boolean, row = false): HTMLElement {
  const segs = h("span", { class: cls("segs", row && "sm", level === 3 && "vulg"), "aria-hidden": "true" }, [0, 1, 2, 3].map((i) => h("i", { class: i <= level ? "on" : null })));
  const label = verlan ? `${SLANG_LABELS[level]} · verl.` : SLANG_LABELS[level];
  return h(
    "span",
    { class: "meter", role: "img", "aria-label": `Сленг: ${SLANG_NAMES_RU[level]}, ${level + 1} из 4${verlan ? ", верлан" : ""}` },
    segs,
    !row && h("span", { class: "abbr", "aria-hidden": "true", lang: level === 0 ? null : "fr" }, label),
  );
}

/** The index card's 46px header over the red rule: the mono label left, the meter (or nothing) right. */
function cardHead(label: Child[], right: Child = null): HTMLElement {
  return h("div", { class: "head" }, h("span", { class: "label" }, label), right);
}

/** «≈B1»: a question's level, mono, at the header's end (a reading item, Ex-Reading-App). */
const levelMark = (level: string) => h("span", { class: "lvl", "aria-label": `Уровень ${level}` }, `≈${level}`);

function questionHead(item: ExerciseItem, attempt: number, pairsCount: string | null): HTMLElement {
  const { label, detail } = cardLabel(item);
  return cardHead(
    [h("b", null, label), detail && h("span", null, `· ${detail}`), pairsCount && h("span", null, `· ${pairsCount}`), attempt > 1 && h("span", { class: "tag" }, "Повтор")],
    item.word && showsMeter(item) ? meter(item.word.slang_level, item.word.verlan) : item.type === "reading" && item.level ? levelMark(item.level) : null,
  );
}

/** A reading item's text: its kind in mono over the French in serif, «Loyer :» labels in bold, on a left rule. */
export function passageBlock(text: string, label: string | null): HTMLElement {
  return h(
    "figure",
    { class: "passage" },
    label && h("figcaption", { lang: "fr" }, label),
    passageLines(text).map((p) => h("p", { lang: "fr" }, p.map((l, i) => [i > 0 && h("br"), l.label && [h("b", null, l.label), " "], l.text]))),
  );
}

/** «A»…«D» in front of option rows. */
export const LETTERS = ["A", "B", "C", "D", "E", "F"] as const;

/** Deck edges under the card (1–3 by the questions left), deepest first. */
function deck(left: number, card: HTMLElement): HTMLElement {
  const n = deckEdges(left);
  const edges = ["e3", "e2", "e1"].filter((_, i) => n >= 3 - i).map((e) => h("span", { class: `edge ${e}`, "aria-hidden": "true" }));
  return h("div", { class: "deck" }, edges, card);
}

function prompt(text: string): HTMLElement {
  if (isRussian(text)) return isParagraph(text) ? h("p", { lang: "ru", class: "ru-para" }, text) : h("h2", { lang: "ru", class: "ru-word" }, text);
  return h("h2", { lang: "fr", class: `fr ${frSize(text)}` }, text);
}

interface Written {
  right: string;
  wrong: string | null;
}

/** «= ____» while asked; once answered the wrong pick struck through, then the right answer with ✓ on a solid rule. */
function answerLine(lead: Child, written: Written | null): HTMLElement {
  if (!written) return h("div", { class: "aline" }, lead, h("span", { class: "blank", "aria-hidden": "true" }));
  const fr = !isRussian(written.right);
  const wrongRu = written.wrong !== null && isRussian(written.wrong);
  return h(
    "div",
    { class: "aline" },
    lead,
    h(
      "p",
      { class: "written" },
      written.wrong && [
        h("span", { class: "sr" }, "Ваш ответ: "),
        h("s", { lang: wrongRu ? "ru" : "fr", class: wrongRu ? null : "fr-t" }, written.wrong),
        h("span", { class: "sr" }, ", неверно. Верный ответ: "),
      ],
      h("span", { lang: fr ? "fr" : "ru", class: cls("right", fr && "fr-t") }, written.right),
      icon("check", 20, 2),
    ),
  );
}

const equals = () => h("span", { class: "lead", "aria-hidden": "true" }, "=");

/** explain_ru, written once answered; while asked the same height stays empty so nothing moves when it lands. */
function explainLine(text: string | null, answered: boolean, kind: "indent" | "ruled" | "plain"): HTMLElement | null {
  if (!text) return null;
  if (!answered) return h("div", { class: `explain ${kind} empty`, "aria-hidden": "true" });
  const { term, rest } = explainParts(text);
  return h("p", { class: `explain ${kind} fade` }, term && [h("em", { lang: "fr" }, term), " — "], rest);
}

/** A cloze sentence: the dashed gap, then (answered) the wrong pick struck through and the right word. */
function clozeLine(sentence: string, answered: boolean, wrong: string | null): HTMLElement {
  const parts = clozeParts(sentence);
  if (!parts) return h("p", { lang: "fr", class: "cloze" }, sentence.replace(/\[\[|\]\]/g, ""));
  const gap = answered
    ? h(
        "span",
        { class: "fade" },
        wrong && [h("span", { class: "sr" }, "ваш ответ: "), h("s", { class: "gap-w" }, wrong), h("span", { class: "sr" }, ", верный: ")],
        h("span", { class: "gap-r" }, parts.answer),
      )
    : h("span", { class: "gap", role: "img", "aria-label": "пропуск" });
  return h("p", { lang: "fr", class: "cloze" }, parts.before, gap, parts.after);
}

/** «ВЕРНО» / «НЕВЕРНО»: the rubber stamp, rotated −4°, 2px good / again outline on the surface. Decorative. */
function stamp(verdict: "right" | "wrong", place: string): HTMLElement {
  return h("span", { class: cls("stamp", verdict === "right" ? "ok" : "no", place), "aria-hidden": "true" }, verdict === "right" ? "ВЕРНО" : "НЕВЕРНО");
}

export interface PlayHandlers {
  pick(index: number): void;
  dontKnow(): void;
  next(): void;
  pairTap(side: "fr" | "ru", key: string, row: string | null): void;
}

type Board = { fr: ExercisePairTile[]; ru: ExercisePairTile[] };

/** The row a Russian slip goes into: the French row picked, else the first open one. */
function activeRow(board: Board, state: PairsState): string | null {
  if (state.selected !== null && !state.matched.includes(state.selected)) return state.selected;
  return board.fr.find((t) => !state.matched.includes(t.key))?.key ?? null;
}

/** The pairs board on the card: a row per French word with its blank; a match writes the translation in. */
function pairsRows(board: Board, state: PairsState, revealed: boolean, disabled: boolean, on: PlayHandlers): HTMLElement {
  const active = revealed ? null : activeRow(board, state);
  return h(
    "div",
    { role: "group", "aria-label": "Слова", class: "prows" },
    board.fr.map((t) => {
      const done = state.matched.includes(t.key);
      const current = t.key === active;
      return h(
        "button",
        {
          type: "button",
          class: cls("prow", done && "found", current && "on", revealed && "rev", state.flash?.fr === t.key && "miss-flash"),
          "data-pair": "fr",
          "aria-pressed": done || revealed ? null : String(current),
          disabled: disabled || done || revealed,
          onclick: () => on.pairTap("fr", t.key, null),
        },
        h("span", { lang: "fr", class: "pf" }, t.fr),
        done || revealed
          ? h("span", { class: "pw fade" }, h("span", { lang: "ru", class: "pr" }, t.ru), icon(done ? "check" : "close", 16, 2), h("span", { class: "sr" }, done ? "найдено" : "не найдено"))
          : h("span", { class: "pb", "aria-hidden": "true" }),
      );
    }),
  );
}

/** The Russian words under the card as slips; a slip that found its row leaves a dashed place behind. */
function pairsSlips(board: Board, state: PairsState, revealed: boolean, disabled: boolean, on: PlayHandlers): HTMLElement {
  const row = activeRow(board, state);
  return h(
    "div",
    { role: "group", "aria-label": "Переводы", class: "slips" },
    board.ru.map((t) =>
      state.matched.includes(t.key)
        ? h("span", { class: "slip gone", "aria-hidden": "true" })
        : h(
            "button",
            {
              type: "button",
              class: cls("slip", revealed && "rev", state.flash?.ru === t.key && "miss-flash"),
              "data-pair": "ru",
              disabled: disabled || revealed,
              onclick: () => on.pairTap("ru", t.key, row),
            },
            h("span", { lang: "ru" }, t.ru),
          ),
    ),
  );
}

/** The 2×2 slips: the word on its ruled line at the slip's foot; after the answer right / wrong / dim. */
function optionGrid(options: ExerciseOptions, result: PlayerResult | null, on: PlayHandlers): HTMLElement {
  return h(
    "div",
    { role: "group", "aria-label": "Варианты ответа", class: "grid" },
    options.options.map((text, i) => {
      const verdict = tileVerdict(i, options.correct, result);
      const ru = isRussian(text);
      return h(
        "button",
        { type: "button", class: `opt ${verdict}`, "data-option": i + 1, "aria-keyshortcuts": String(i + 1), disabled: result !== null, onclick: () => on.pick(i) },
        result?.pick === i && h("span", { class: "flash", "aria-hidden": "true" }),
        h("span", { class: "ol" }, h("span", { lang: ru ? "ru" : "fr", class: cls("ot", !ru && "fr-t") }, text)),
        (verdict === "right" || verdict === "wrong") && [icon(verdict === "right" ? "check" : "close", 18, 2, "mark"), h("span", { class: "sr" }, verdict === "right" ? "верный ответ" : "ваш ответ")],
      );
    }),
  );
}

/** Long options as A–D rows (a reading item's French answers): the same verdicts as the slips. */
function optionList(options: ExerciseOptions, result: PlayerResult | null, on: PlayHandlers): HTMLElement {
  return h(
    "div",
    { role: "group", "aria-label": "Варианты ответа", class: "rows" },
    options.options.map((text, i) => {
      const verdict = tileVerdict(i, options.correct, result);
      return h(
        "button",
        { type: "button", class: `xopt ${verdict}`, "data-option": i + 1, "aria-keyshortcuts": String(i + 1), disabled: result !== null, onclick: () => on.pick(i) },
        h("span", { class: "xl", "aria-hidden": "true" }, LETTERS[i]),
        h("span", { lang: isRussian(text) ? "ru" : "fr", class: "xt" }, text),
        (verdict === "right" || verdict === "wrong") && [icon(verdict === "right" ? "check" : "close", 18, 2, "xm"), h("span", { class: "sr" }, verdict === "right" ? "верный ответ" : "ваш ответ")],
      );
    }),
  );
}

function questionCard(round: Round, item: ExerciseItem, options: ExerciseOptions | null, board: Board | null, on: PlayHandlers): HTMLElement {
  const head = round.head;
  const attempt = head?.kind === "item" ? head.attempt : 1;
  const result = round.state.result;
  const answered = result !== null;
  const pairs = round.pairsState();
  const written: Written | null =
    options && result ? { right: options.options[options.correct], wrong: result.pick !== null && result.pick !== options.correct ? options.options[result.pick] : null } : null;
  const word = item.word;
  const tone = resultTone(result);
  const verdict = tone === "right" || tone === "wrong" ? tone : null;
  const place = stampPlace(item);
  let body: Child[] = [];
  switch (item.type) {
    case "choice": {
      const text = item.prompt ?? word?.fr ?? "";
      const q = skillQuestion(item);
      body = [prompt(text), q && h("p", { class: selfEvident(item) ? "sr" : "q" }, q), answerLine(equals(), written), explainLine(item.explain_ru, answered, "indent")];
      break;
    }
    case "cloze":
      body = [
        clozeLine(item.sentence ?? "", answered, written?.wrong ?? null),
        item.sentence_ru && h("p", { class: "sub" }, item.sentence_ru),
        h("p", { class: "sr" }, item.prompt ?? CLOZE_PROMPT),
        explainLine(item.explain_ru, answered, "ruled"),
      ];
      break;
    case "pairs":
      body = [h("p", { class: "sr" }, PAIRS_PROMPT), board && pairsRows(board, pairs, result?.outcome === "dont_know", answered, on)];
      break;
    case "conjugate": {
      const parts = clozeParts(item.sentence ?? "");
      const infinitive = item.prompt ?? word?.fr ?? "";
      body = [
        h("h2", { lang: "fr", class: `fr ${conjSize(infinitive)}` }, infinitive),
        h("p", { class: "sr" }, CONJ_PROMPT),
        parts
          ? [
              answerLine(parts.before.trim() && h("span", { lang: "fr", class: "lead pron" }, parts.before.trim()), written),
              parts.after.trim() && h("p", { lang: "fr", class: "after" }, parts.after.trim()),
            ]
          : h("div", { class: "q" }, clozeLine(item.sentence ?? "", answered, null)),
        explainLine(item.explain_ru, answered, "plain"),
      ];
      break;
    }
    case "reading":
      body = [
        item.passage && passageBlock(item.passage, item.passage_label ?? null),
        // The stamp lands beside the question, wherever the text above ends.
        h("div", { class: "rq" }, h("h2", { lang: "fr", class: "fr rq-t" }, item.prompt ?? ""), verdict && place === "question" && stamp(verdict, "beside")),
        answerLine(equals(), written),
        explainLine(item.explain_ru, answered, "indent"),
      ];
      break;
  }
  const pairsCount = item.type === "pairs" ? `${pairs.matched.length} из ${item.tiles.length}` : null;
  return h(
    "article",
    { class: "card", "aria-label": cardLabel(item).label, "data-exercise-card": item.type, "data-focus": "", tabindex: "-1" },
    questionHead(item, attempt, pairsCount),
    h("div", { class: item.type === "pairs" ? "body pairs" : item.type === "reading" ? "body reading" : "body" }, body),
    verdict && place !== "question" && stamp(verdict, place),
  );
}

/** The intro card before a web word's first question: dashed (not in the library yet), then «Понятно». */
function introCard(word: ExerciseNewWord, on: PlayHandlers): HTMLElement[] {
  const pos = posAbbr(word);
  const domain = sourceDomain(word.source_url);
  return [
    h(
      "article",
      { class: "card new", "aria-label": "Новое слово", "data-focus": "", tabindex: "-1" },
      cardHead([h("b", null, "Новое слово"), h("span", null, "· из веба")], meter(word.slang_level, word.verlan)),
      h(
        "div",
        { class: "nw" },
        h("h2", { lang: "fr", class: "fr" }, word.fr),
        pos && h("span", { lang: "fr", class: "pos" }, pos),
        h("p", { class: "nw-ru" }, word.ru),
        word.note && h("p", { class: "note" }, word.note),
        word.example_fr && h("div", { class: "ex" }, h("span", { lang: "fr", class: "fr-ex" }, word.example_fr), word.example_ru && h("span", { class: "ru-ex" }, word.example_ru)),
        h("p", { class: "nw-hint" }, "Слова ещё нет в библиотеке — Claude может добавить его в Карточки."),
      ),
      domain && h("div", { class: "foot" }, h("span", null, "источник: ", h("b", null, domain))),
    ),
    h("div", { class: "act" }, h("button", { type: "button", class: "btn", "data-advance": "", onclick: () => on.next() }, "Понятно")),
  ];
}

/** «набор: …» over the tick row (the chat has no × and no running head: the set's name goes here). */
const metaLine = (title: string | null) => h("p", { class: "meta" }, title ? ["набор: ", h("b", null, title)] : "упражнение");

function topBar(round: Round): HTMLElement {
  const progress = round.progress();
  return h(
    "div",
    { class: "top" },
    h("span", { class: "ticks", "aria-hidden": "true" }, round.ticks().map((m) => h("span", { class: `tick ${m}` }))),
    h(
      "span",
      { class: "count" },
      h("span", { "aria-hidden": "true" }, formatCounter(progress.position, progress.total), progress.repeats > 0 && h("i", null, `+${progress.repeats}`)),
      h("span", { class: "sr" }, counterLabel(progress)),
    ),
  );
}

// --- Screens -------------------------------------------------------------------------------------

/** The round on its current card. `animate`: a new card (it enters from the right). */
export function playView(round: Round, on: PlayHandlers, animate: boolean): HTMLElement {
  const item = round.item;
  const intro = round.intro;
  let stage: Child[] = [];
  if (intro) {
    stage = introCard(intro, on);
  } else if (item) {
    const options = round.options();
    const board = round.board();
    const result = round.state.result;
    const left = round.state.queue.filter((e) => e.kind === "item").length;
    stage = [
      deck(left, questionCard(round, item, options, board, on)),
      board && pairsSlips(board, round.pairsState(), result?.outcome === "dont_know", result !== null, on),
      options && (optionRows(options.options) ? optionList(options, result, on) : optionGrid(options, result, on)),
      // The fixed action zone: «Не знаю», then «Дальше» in the same place (no layout shift).
      h(
        "div",
        { class: "act" },
        result
          ? h("button", { type: "button", class: "btn", "data-advance": "", onclick: () => on.next() }, "Дальше")
          : h("button", { type: "button", class: "quiet", "aria-keyshortcuts": "0", onclick: () => on.dontKnow() }, "Не знаю"),
      ),
    ];
  }
  return h("div", { class: "play" }, h("h1", { class: "sr" }, `Упражнение: ${round.set.title}`), metaLine(round.set.title), topBar(round), h("div", { class: cls("stage", animate && "enter") }, stage));
}

/** Before the set arrives (tool input streaming in): the card's outline and «Готовим набор…». */
export function waitView(title: string | null, text = "Готовим набор…", busy = true): HTMLElement {
  return h(
    "div",
    { class: "play", "aria-busy": busy ? "true" : null },
    metaLine(title),
    h("div", { class: "top" }, h("span", { class: "ticks", "aria-hidden": "true" }, [0, 1, 2, 3, 4].map(() => h("span", { class: "tick" })))),
    h(
      "div",
      { class: "stage" },
      deck(busy ? 5 : 1, h("article", { class: "card" }, cardHead([h("b", null, "Упражнение")]), h("div", { class: "body" }, h("p", { class: busy ? "wait" : "q", role: "status" }, text)))),
      busy && h("div", { class: "grid", "aria-hidden": "true" }, [0, 1, 2, 3].map(() => h("span", { class: "opt ghost" }))),
    ),
  );
}

const QUESTION_NOUN = ["вопрос", "вопроса", "вопросов"] as const;

/** «ИТОГ НАБОРА», the title, the strip (one cell per attempt) and «3 из 5 с первого раза». */
function tally(title: string, marks: readonly StripMark[], total: number, note: string | null): HTMLElement {
  const c = { first: 0, miss: 0, requeued: 0 };
  for (const m of marks) if (m === "first" || m === "miss" || m === "requeued") c[m]++;
  const parts = [
    `${c.first} с первого раза`,
    c.miss > 0 && `${c.miss} ${plural(c.miss, ["ошибка", "ошибки", "ошибок"])}`,
    c.requeued > 0 && `${c.requeued} ${plural(c.requeued, ["повтор", "повтора", "повторов"])}`,
  ].filter(Boolean);
  const group = Math.max(1, Math.ceil(marks.length / 4));
  return h(
    "article",
    { class: "tally", "aria-label": `Итог набора «${title}»` },
    h("div", { class: "th" }, h("span", null, "Итог набора"), note && h("span", null, `· ${note}`)),
    h(
      "div",
      { class: "tb" },
      h("p", { class: "tt" }, title),
      marks.length > 0 &&
        h(
          "span",
          { class: "cells", role: "img", "aria-label": `${total} ${plural(total, QUESTION_NOUN)}: ${parts.join(", ")}` },
          marks.map((m, i) => h("span", { class: `cell ${m}`, style: `--g:${Math.floor(i / group)}` })),
        ),
      h("p", { class: "score", "aria-hidden": marks.length > 0 ? "true" : null }, h("b", null, `${c.first} из ${total}`), " с первого раза"),
    ),
  );
}

export type KeepState =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "done" }
  | { kind: "error"; text: string }
  /** The artifact's copy failed: the line is shown to copy by hand. */
  | { kind: "manual"; text: string };

export interface DoneProps {
  round: Round;
  mode: "app" | "artifact";
  /** What «Сохранить» / «Скопировать» keeps: the newest whole round («3 из 5»); null before one ended. */
  full: { first_try: number; total: number } | null;
  keep: KeepState;
  discussed: boolean;
  /** The screen's first render: the heading and the strip write in (later renders keep them still). */
  animate: boolean;
  on: { keep(): void; again(): void; repeat(): void; discuss(): void };
}

function keepBlock({ round, mode, full, keep, on }: DoneProps): Child[] {
  if (!full) return [];
  const later = round.kind === "mistakes" ? `Сохранится первый круг: ${full.first_try} из ${full.total} с первого раза.` : null;
  if (mode === "artifact") {
    if (keep.kind === "manual") {
      return [
        h("textarea", { class: "line-box", readonly: true, rows: 3, "aria-label": "Результат", onfocus: (e: Event) => (e.target as HTMLTextAreaElement).select() }, keep.text),
        h("p", { class: "hint" }, "Скопируйте строку и вставьте в чат — Claude сохранит результат в Карточки, если захотите."),
      ];
    }
    return [
      keep.kind === "done"
        ? h("p", { class: "status", role: "status" }, icon("check", 20, 2), "Скопировано")
        : h("button", { type: "button", class: "btn line", onclick: () => on.keep() }, "Скопировать результат"),
      h("p", { class: "hint" }, later ? `${later} ` : "", "Вставьте в чат — Claude сохранит результат в Карточки, если захотите."),
    ];
  }
  if (keep.kind === "done") return [h("p", { class: "status", role: "status" }, icon("check", 20, 2), "Сохранено в «Упражнения»")];
  const busy = keep.kind === "busy";
  const hint =
    keep.kind === "error"
      ? h("p", { class: "hint err", role: "alert" }, `Не сохранилось: ${keep.text}`)
      : h("p", { class: "hint" }, later ?? (round.set.saved ? "Набор уже в «Упражнениях» — добавится результат этого круга." : "Набор и результат появятся в «Упражнениях»."));
  return [h("button", { type: "button", class: "btn line", disabled: busy, "aria-busy": busy ? "true" : null, onclick: () => on.keep() }, busy ? "Сохраняем…" : "Сохранить в Карточки"), hint];
}

/** The done screen (X-Done-B): «Готово», the result card, «Ошибки» as slips, then keeping and the next round. */
export function doneView(props: DoneProps): HTMLElement {
  const { round, mode, discussed, animate, on } = props;
  const score = round.score();
  const missed = round.missedWords();
  const questions = round.missedQuestions();
  const missedItems = round.missedItemIds();
  const repeat = missedItems.length > 0 ? missed.length || missedItems.length : 0;
  return h(
    "div",
    { class: cls("done", animate && "anim") },
    h("h1", { tabindex: "-1", "data-focus": "" }, "Готово"),
    tally(round.set.title, round.marks(), score.total, round.kind === "mistakes" ? "повтор ошибок" : null),
    missed.length > 0 &&
      h(
        "section",
        { class: "sec", "aria-label": "Ошибки" },
        h("h2", null, "Ошибки"),
        h(
          "ul",
          { class: "misses" },
          missed.map((m) =>
            h(
              "li",
              { class: "mslip" },
              h("span", { class: "cell miss", "aria-hidden": "true" }),
              h(
                "span",
                { class: "mw" },
                h("span", { lang: "fr", class: "mf" }, m.fr),
                h("span", { class: "mr" }, h("span", { lang: "ru" }, m.ru), m.word && (m.word.slang_level > 0 || m.word.verlan) && meter(m.word.slang_level, m.word.verlan, true)),
              ),
            ),
          ),
        ),
      ),
    questions.length > 0 && h("section", { class: "sec", "aria-label": "Вопросы к текстам" }, h("h2", null, "Вопросы к текстам"), missList(questions)),
    h(
      "div",
      { class: "actions" },
      keepBlock(props),
      repeat > 0 && h("button", { type: "button", class: "btn", onclick: () => on.repeat() }, `Повторить ошибки (${repeat})`),
      h(
        "div",
        { class: "row" },
        h("button", { type: "button", class: "text-act", onclick: () => on.again() }, "Ещё раз"),
        mode === "app" && missed.length + questions.length > 0 && h("button", { type: "button", class: "text-act", disabled: discussed, onclick: () => on.discuss() }, discussed ? "Отправлено в чат" : "Обсудить ошибки"),
      ),
    ),
  );
}

/** Missed questions as rows (Chat-TCF-Done «Ошибки»): the level, the question, your answer struck, the right one. */
export function missList(misses: readonly ExamMiss[]): HTMLElement {
  return h(
    "ol",
    { class: "xmiss" },
    misses.map((m) =>
      h(
        "li",
        null,
        h("span", { class: "xml" }, m.item.level ?? ""),
        h(
          "span",
          { class: "xmb" },
          h("span", { lang: "fr", class: "xmq" }, questionLine(m.item)),
          h(
            "span",
            { class: "xma" },
            m.chosen === null
              ? h("span", { class: "xmn" }, "нет ответа")
              : [h("span", { class: "sr" }, "Ваш ответ: "), h("s", { lang: isRussian(m.chosen) ? "ru" : "fr" }, m.chosen)],
            h("span", { class: "sr" }, ". Верный ответ: "),
            h("span", { lang: isRussian(m.right) ? "ru" : "fr", class: "xmr" }, m.right),
          ),
        ),
      ),
    ),
  );
}

