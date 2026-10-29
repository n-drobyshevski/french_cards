// The cards page's screens, as the app's phone review (mockups L-Review-Q-A card with L-Review-Q-B
// chrome, L-Review-Ans-B answer, the GradeBar, L-Done-B): the direction and themes over the
// progress line («07 / 20»), the index card on its deck — «FR · № 007» and «НОВОЕ» over the red rule,
// the prompt; flipped, the headword, the translation, the example with the word underlined in red
// ink and «Ещё · …» — then «Не знаю / Сложно / Знаю» with their intervals. «Тренировка»: the rule
// dashed, «FR · ПРАКТИКА», no intervals. Under the card the save line. Then the round's result
// strip and what comes next. Every function builds fresh DOM from the round's state.
import { GRADE_LABELS, RATINGS, type ChatCard, type ChatCardRating } from "@/lib/core/chat-cards";
import { h, icon, type Child } from "../dom";
import { cardHead, cls, deck, meter, tally } from "../parts";
import { plural } from "../texts";
import { answerSize, callNumber, exampleMatch, foldSummary, gradeLabel, moreFields, promptOf, promptSize } from "./face";
import { planLine, saveLine, summaryLine, waitingLine, type CardsRound } from "./model";
import { CARD_NOUN, PRACTICE_SCOPE_TEXT } from "./requests";

const POS_ABBR: Record<string, string> = { adj: "adj.", adv: "adv.", expression: "expr." };

/** «n. f.», «v. pron.» (components/review/format posAbbr, as chat-player/card.ts copies it). */
function posAbbr(card: Pick<ChatCard, "fr" | "pos" | "gender">): string | null {
  if (card.pos === "noun") return card.gender === "m" ? "n. m." : card.gender === "f" ? "n. f." : card.gender === "mf" ? "n. m. et f." : "n.";
  if (card.pos === "verb") return /^(se\s|s['’])/i.test(card.fr.trim()) ? "v. pron." : "v.";
  return POS_ABBR[card.pos] ?? null;
}

/** «07 / 20» (components/review/format formatProgress). */
const progressText = (position: number, total: number) => `${String(position).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;

/** The example with the headword under a red ink line (InkExample). */
function inkExample(example: string, headword: string): Child[] {
  const m = exampleMatch(example, headword);
  if (!m) return [example];
  return [example.slice(0, m[0]), h("span", { class: "ink" }, example.slice(m[0], m[1])), example.slice(m[1])];
}

export interface PlayHandlers {
  flip(): void;
  grade(rating: ChatCardRating): void;
  undo(): void;
  retry(): void;
  fold(): void;
  refresh(): void;
}

export interface PlayProps {
  round: CardsRound;
  now: number;
  /** The grade just tapped (or keyed): its button fills before the card moves on. */
  flash: ChatCardRating | null;
  /** A new card on screen: it enters from the right. */
  animate: boolean;
  /** «Ещё · …» is open. */
  fold: boolean;
  /** «Обновить ›» was sent. */
  refreshAsked: boolean;
  on: PlayHandlers;
}

/** The chrome over the card: direction and themes, «Отменить последний ответ», the plan and «07 / 20» over the 1px line. */
function topBar(round: CardsRound, on: PlayHandlers): HTMLElement[] {
  const s = round.session;
  const { position, total } = round.progress();
  const scope = round.practice && s.scope ? PRACTICE_SCOPE_TEXT[s.scope] : null;
  const plan = planLine(s, scope);
  const canUndo = round.canUndo();
  return [
    h(
      "div",
      { class: "bar" },
      h("p", { class: "meta" }, h("b", null, s.direction_label), ` · ${s.folder_label}`),
      h("button", { type: "button", class: "undo", "aria-label": "Отменить последний ответ", "aria-keyshortcuts": "Z", disabled: !canUndo, onclick: () => on.undo() }, icon("undo", 20, 1.5)),
    ),
    h(
      "div",
      { class: "prog" },
      h("span", { class: "plan" }, plan),
      h("span", { class: "count", "aria-label": `Карточка ${position} из ${total}` }, progressText(position, total)),
    ),
    h("div", { class: "pline", "aria-hidden": "true" }, h("span", { class: "fill", style: `width:${total ? ((position - 1) / total) * 100 : 0}%` })),
  ];
}

function questionCard(round: CardsRound, card: ChatCard, on: PlayHandlers): HTMLElement {
  const prompt = promptOf(card);
  const fromFr = card.direction === "fr_ru";
  const pos = fromFr ? posAbbr(card) : null;
  return h(
    "article",
    {
      class: cls("card rcard", round.practice && "practice"),
      "data-card": "",
      "data-focus": "",
      tabindex: "-1",
      "aria-label": `${prompt}${card.is_new ? ", новая карточка" : ""}. Нажмите или Пробел — показать ответ`,
      onclick: () => on.flip(),
    },
    cardHead([callNumber(card.direction, card.number, round.practice)], card.is_new && h("span", { class: "ntag", "aria-hidden": "true" }, "Новое")),
    h("div", { class: "qbody" }, h("span", { lang: fromFr ? "fr" : "ru", class: cls("prompt", promptSize(prompt)) }, prompt), pos && h("span", { lang: "fr", class: "pos" }, pos)),
    h("p", { class: "qfoot", "aria-hidden": "true" }, "Нажмите или ", h("span", { class: "kbd" }, "Пробел"), " — ответ"),
  );
}

function foldList(card: ChatCard): HTMLElement {
  const line = (label: string, value: Child, fr = false) => h("div", { class: "fl" }, h("dt", null, label), h("dd", { lang: fr ? "fr" : null, class: fr ? "fv" : null }, value));
  return h(
    "dl",
    { class: "fold-list fade" },
    card.note && line("Заметка", card.note),
    card.origin && line("Откуда", card.origin),
    card.fields.map((f) => line(f.label, f.value)),
    card.fields_more > 0 && h("p", { class: "fmore" }, moreFields(card.fields_more)),
    card.level && line("Уровень", `${card.level_estimated ? "≈" : ""}${card.level}`),
    card.folder_name && line("Тема", card.folder_name),
  );
}

function answerCard(round: CardsRound, card: ChatCard, open: boolean, on: PlayHandlers): HTMLElement {
  const pos = posAbbr(card);
  const summary = foldSummary(card);
  const showMeter = card.slang_level > 0 || card.verlan;
  return h(
    "article",
    { class: cls("card rcard", round.practice && "practice"), "data-card": "", "data-focus": "", tabindex: "-1", "aria-label": `Ответ: ${card.fr} — ${card.ru}` },
    cardHead([callNumber(card.direction, card.number, round.practice)], showMeter && meter(card.slang_level, card.verlan)),
    h(
      "div",
      { class: "abody fade" },
      h("h2", { lang: "fr", class: cls("hw", answerSize(card.fr)) }, card.fr),
      pos && h("span", { lang: "fr", class: "pos" }, pos),
      h("p", { class: "tr" }, card.ru),
      (card.example_fr || card.example_ru) &&
        h(
          "div",
          { class: "exs" },
          card.example_fr && h("span", { lang: "fr", class: "exfr" }, inkExample(card.example_fr, card.fr)),
          card.example_ru && h("span", { class: "exru" }, card.example_ru),
        ),
    ),
    summary &&
      h(
        "div",
        { class: "fold" },
        h(
          "button",
          { type: "button", class: "fold-btn", "aria-expanded": String(open), onclick: () => on.fold() },
          h("span", { class: "fs" }, h("b", null, "Ещё"), h("span", null, ` · ${summary}`)),
          icon("chevron", 16, 1.75, open ? "up" : undefined),
        ),
        open && foldList(card),
      ),
  );
}

/** «Не знаю / Сложно / Знаю» (GradeBar, 3 buttons): outlined in their tones, the interval in mono under each («Тренировка»: none). */
function gradeBar(card: ChatCard, practice: boolean, flash: ChatCardRating | null, on: PlayHandlers): HTMLElement {
  const intervals = practice ? null : card.intervals;
  return h(
    "div",
    { class: "grades", role: "group", "aria-label": "Оценка" },
    RATINGS.map((r) => {
      const sub = intervals?.[r];
      return h(
        "button",
        {
          type: "button",
          class: cls("gbtn", `g${r}`, flash === r && "on"),
          "data-grade": String(r),
          "aria-keyshortcuts": String(r),
          "aria-label": sub ? gradeLabel(r, intervals) : null,
          disabled: flash !== null,
          onclick: () => on.grade(r),
        },
        h("span", { class: "gl" }, GRADE_LABELS[r]),
        sub && h("span", { class: "gi" }, sub),
      );
    }),
  );
}

/** «Сохраняем…», «Не сохранилось: … · Повторить», or the practice note. */
function saveRow(round: CardsRound, now: number, on: PlayHandlers): HTMLElement {
  if (round.practice) return h("p", { class: "save" }, "Тренировка — расписание не меняется");
  const line = saveLine(round, now);
  return h(
    "p",
    { class: cls("save", line?.error && "err"), role: "status" },
    line && [line.text, line.retry && [" · ", h("button", { type: "button", class: "link", onclick: () => on.retry() }, "Повторить")]],
  );
}

function staleCard(round: CardsRound, asked: boolean, on: PlayHandlers): HTMLElement {
  return h(
    "article",
    { class: "card rcard", "data-focus": "", tabindex: "-1" },
    cardHead([h("b", null, "Раунд устарел")]),
    h(
      "div",
      { class: "note-body" },
      h("p", null, "Начался новый учебный день: оценки этого раунда закончились. Claude соберёт карточки на сегодня."),
      h("button", { type: "button", class: "btn", disabled: asked, onclick: () => on.refresh() }, asked ? "Запрос отправлен" : "Обновить ›"),
    ),
  );
}

/** The round on its current card (or «Раунд устарел» after the study day). */
export function playView(p: PlayProps): HTMLElement {
  const { round, on } = p;
  const turn = round.head!;
  const card = turn.card;
  const stale = round.stale(p.now);
  const answer = round.phase === "answer";
  let face: HTMLElement;
  if (stale) face = staleCard(round, p.refreshAsked, on);
  else face = answer ? answerCard(round, card, p.fold, on) : questionCard(round, card, on);
  return h(
    "div",
    { class: "play" },
    h("h1", { class: "sr" }, `Карточки: ${round.session.title || "повторение"}`),
    topBar(round, on),
    h("div", { class: cls("stage", p.animate && "enter") }, deck(round.queue.length - 1, face)),
    !stale &&
      h(
        "div",
        { class: "act" },
        answer ? gradeBar(card, round.practice, p.flash, on) : h("button", { type: "button", class: "btn line", "data-flip": "", onclick: () => on.flip() }, "Показать ответ"),
      ),
    saveRow(round, p.now, on),
  );
}

/** Before the round arrives, or while the last answers are saved (a card may still come back). */
export function waitView(text: string, busy = true): HTMLElement {
  return h(
    "div",
    { class: "play", "aria-busy": busy ? "true" : null },
    h("div", { class: "stage" }, deck(busy ? 5 : 0, h("article", { class: "card rcard" }, cardHead([h("b", null, "Карточки")]), h("div", { class: "note-body" }, h("p", { class: busy ? "wait" : null, role: "status" }, text))))),
  );
}

export interface DoneProps {
  round: CardsRound;
  now: number;
  /** The heading and the strip write in (the first render only). */
  animate: boolean;
  /** Requests sent (their buttons stay off). */
  asked: ReadonlySet<"continue" | "exercise" | "refresh">;
  on: { continue(): void; exercise(): void; again(): void; retry(): void };
}

/** The round's result (L-Done-B as a chat card): the strip, «20 КАРТОЧЕК · 80 % · 4 НОВЫХ», the hard words, what comes next. */
export function doneView(p: DoneProps): HTMLElement {
  const { round, on } = p;
  const s = round.session;
  const summary = round.summary();
  const hard = round.hardWords();
  const remaining = round.remaining;
  const waiting = round.practice ? null : waitingLine(round.waiting(p.now), p.now);
  const busy = round.saving;
  const heading = round.practice ? "Тренировка пройдена" : remaining === 0 && !waiting ? "Готово на сегодня" : "Раунд пройден";
  const exercise =
    hard.length > 0 &&
    h(
      "button",
      { type: "button", class: s.next === "exercise" || remaining === 0 ? "btn" : "text-act", disabled: busy || p.asked.has("exercise"), onclick: () => on.exercise() },
      p.asked.has("exercise") ? "Упражнение запрошено" : "Упражнение по ошибкам ›",
    );
  const more =
    remaining > 0 &&
    h(
      "button",
      { type: "button", class: s.next === "exercise" && hard.length > 0 ? "text-act" : "btn", disabled: busy || p.asked.has("continue"), onclick: () => on.continue() },
      p.asked.has("continue") ? "Следующий раунд запрошен" : `Ещё ${remaining} к повторению · Продолжить ›`,
    );
  const firstExercise = s.next === "exercise" || remaining === 0;
  const line = saveLine(round, p.now);
  return h(
    "div",
    { class: cls("done", p.animate && "anim") },
    h("h1", { tabindex: "-1", "data-focus": "" }, heading),
    tally(s.title || "Повторение", round.marks(), summary.total, round.practice ? "тренировка" : null, {
      head: "Итог раунда",
      noun: CARD_NOUN,
      score: h("span", { class: "sum" }, summaryLine(summary)),
    }),
    hard.length > 0 &&
      h(
        "p",
        { class: "hard" },
        h("span", { class: "hl" }, "Трудные: "),
        hard.map((w, i) => [i > 0 && ", ", h("span", { lang: "fr" }, w.fr)]),
      ),
    waiting && h("p", { class: "next" }, waiting),
    round.notices.length > 0 && h("ul", { class: "notes" }, round.notices.map((n) => h("li", null, h("span", { lang: "fr" }, n.fr), ` — ${n.text}`))),
    line && h("p", { class: cls("save", line.error && "err"), role: "status" }, line.text, line.retry && [" · ", h("button", { type: "button", class: "link", onclick: () => on.retry() }, "Повторить")]),
    h(
      "div",
      { class: "actions" },
      firstExercise ? [exercise, more] : [more, exercise],
      round.practice && h("button", { type: "button", class: hard.length > 0 ? "text-act" : "btn line", onclick: () => on.again() }, "Ещё раз"),
      busy && !line?.error && h("p", { class: "hint" }, "Дальше — когда сохранятся все ответы."),
    ),
  );
}

/** «Карточек в раунде нет»: an empty round (nothing due in those themes). */
export function emptyView(round: CardsRound): HTMLElement {
  const n = round.session.counts.waiting;
  const text = round.practice ? "Тренировать пока нечего: в этих темах нет таких карточек." : n > 0 ? `Сейчас повторять нечего: ${n} ${plural(n, CARD_NOUN)} ещё ждут своего времени.` : "На сегодня всё повторено.";
  return waitView(text, false);
}
