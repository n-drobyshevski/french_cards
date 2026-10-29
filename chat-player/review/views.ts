// The review page's screens (pick A of each, mockups Chat-Levels-A / Chat-Levels-Saved and
// Chat-Words-A / Chat-Words-Theme / Chat-Words-Added): one sheet with the red rule, a row per word,
// the first few in the chat and the rest behind «Показать все» (fullscreen), the write button at the
// foot; once written, the receipt with «Отменить». «Настроить упражнение» and «Повторить слова»: blocks
// of chips, the request preview, «Начать ›». Every function builds fresh DOM from the state.
import type { CardsSetup, CardsSetupChoice, ExerciseSetup, LevelsReview, ReviewFolder, WordsReview } from "@/lib/core/chat-review";
import { TENSE_NAMES, TENSE_WHEN } from "@/lib/core/conj-display";
import { EXERCISE_LEVELS, EXERCISE_TENSES } from "@/lib/core/exercises";
import { CEFR_LEVELS, type Cefr } from "@/lib/core/level";
import { SLANG_LABELS, type Gender, type SlangLevel } from "@/lib/types";
import { h, icon, type Child } from "../dom";
import {
  INLINE_LEVELS,
  INLINE_WORDS,
  addedFolder,
  addedHeadline,
  commonFolder,
  inlineCount,
  levelsReceipt,
  levelsToSave,
  wordsToAdd,
  setupAvailable,
  setupRequest,
  WORDS,
  DUE_EXERCISE_SIZES,
  cardsSetupAvailable,
  cardsSetupRequest,
  todayLine,
  type CardsSetupState,
  type SetupState,
  type LevelRow,
  type LevelsSaved,
  type WordRow,
  type WordsAdded,
} from "./model";
import { plural } from "../texts";

const cls = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

/** The square checkbox (20px, ink when on); a locked or written row's is greyed and inert. */
function checkbox(checked: boolean, label: string, disabled: boolean, onToggle: () => void): HTMLElement {
  return h(
    "button",
    { type: "button", role: "checkbox", class: "cb", "aria-checked": String(checked), "aria-label": label, "aria-disabled": disabled ? "true" : null, onclick: () => !disabled && onToggle() },
    h("span", { class: cls("box", checked && "on", disabled && "off") }, checked && icon("tick", 14, 2.25)),
  );
}

/** «Показать все 15 · ЕЩЁ 8» (fullscreen), or «Свернуть» back in the chat. */
function moreButton(total: number, hidden: number, expanded: boolean, on: { expand(): void; collapse(): void }, iconFirst: boolean): Child {
  if (expanded) {
    return h("button", { type: "button", class: "more", onclick: () => on.collapse() }, iconFirst && icon("collapse", 16, 1.5), h("span", { class: "u" }, "Свернуть"), !iconFirst && icon("collapse", 16, 1.5, "end"));
  }
  if (hidden <= 0) return null;
  return h(
    "button",
    { type: "button", class: "more", "aria-label": `Показать все ${total} — на весь экран`, onclick: () => on.expand() },
    iconFirst && icon("expand", 16, 1.5),
    h("span", { class: "u" }, `Показать все ${total}`),
    !iconFirst && [h("span", { class: "mono" }, `· ещё ${hidden}`), icon("expand", 16, 1.5, "end")],
  );
}

const errorLine = (error: string | null) => error && h("p", { class: "err", role: "alert" }, error);
const noticeLine = (notice: string | null) => notice && h("p", { class: "notice", role: "status" }, notice);

// --- «Уровни слов» -------------------------------------------------------------------------------

export type LevelsPhase = { kind: "edit" } | { kind: "busy" } | { kind: "saved"; saved: LevelsSaved; undoing: boolean };

export interface LevelsProps {
  review: LevelsReview;
  rows: LevelRow[];
  phase: LevelsPhase;
  error: string | null;
  notice: string | null;
  expanded: boolean;
  /** «Следующие 15 ›» was sent to the chat. */
  asked: boolean;
  on: {
    toggle(index: number): void;
    pick(index: number, level: Cefr): void;
    save(): void;
    undo(): void;
    next(): void;
    expand(): void;
    collapse(): void;
  };
}

/** A1…C2 in one segmented strip, Claude's proposal filled; the dictionary's level underlined dotted when it differs. */
function segments(r: LevelRow, index: number, disabled: boolean, on: LevelsProps["on"]): HTMLElement {
  return h(
    "div",
    { role: "radiogroup", class: cls("seg", disabled && "off"), "aria-label": `Уровень языка: ${r.row.fr}`, "data-row": index },
    CEFR_LEVELS.map((l) => {
      const on_ = r.level === l;
      return h(
        "button",
        {
          type: "button",
          role: "radio",
          "aria-checked": String(on_),
          class: cls(on_ && "on", !on_ && r.row.dictionary === l && r.row.dictionary !== r.row.proposed && "dict"),
          tabindex: on_ ? "0" : "-1",
          "aria-disabled": disabled ? "true" : null,
          "data-level": l,
          onclick: () => !disabled && on.pick(index, l),
        },
        l,
      );
    }),
  );
}

export function levelsView(p: LevelsProps): HTMLElement {
  const { review, rows, phase, on } = p;
  const written = phase.kind === "saved";
  const busy = phase.kind === "busy" || (phase.kind === "saved" && phase.undoing);
  const shown = p.expanded ? rows.length : inlineCount(rows.length, INLINE_LEVELS);
  const count = levelsToSave(rows).length;
  const nextLabel = `Следующие ${review.remaining === null ? 15 : Math.min(15, review.remaining)} ›`;
  const canNext = review.remaining !== 0;
  return h(
    "section",
    { class: cls("sheet", written && "written"), "aria-label": `Уровни языка для ${rows.length} ${plural(rows.length, WORDS)}` },
    h(
      "div",
      { class: "rhead" },
      h("h1", { class: "sl strong" }, `Уровни · ${rows.length} ${plural(rows.length, WORDS)}`),
      h("span", { class: "rnote" }, written ? "Сохранено в Карточки" : "Claude предлагает, поправьте"),
    ),
    h(
      "ul",
      { class: "lrows" },
      rows.slice(0, shown).map((r, i) => {
        const locked = r.row.locked;
        const inert = locked || written || busy;
        const dict = !locked && r.row.dictionary && r.row.dictionary !== r.level ? r.row.dictionary : null;
        return h(
          "li",
          { class: cls(locked && "locked", dict && "tall") },
          checkbox(locked ? false : r.checked, locked ? `${r.row.fr} — уровень указали вы, не меняем` : r.row.fr, inert, () => on.toggle(i)),
          h(
            "span",
            { class: "lw" },
            h("span", { lang: "fr", class: "lfr" }, r.row.fr),
            locked ? h("span", { class: "tagline" }, "Вы указали") : h("span", { class: "lru" }, r.row.ru),
          ),
          h("span", { class: "lr" }, segments(r, i, inert, on), dict && h("span", { class: "ldict" }, `≈${dict} по словарю`)),
        );
      }),
    ),
    moreButton(rows.length, rows.length - shown, p.expanded, on, false),
    noticeLine(p.notice),
    phase.kind === "saved"
      ? h(
          "div",
          { class: "rfoot col" },
          h(
            "div",
            { class: "receipt", role: "status" },
            icon("check", 18, 2),
            h("span", { class: "grow" }, levelsReceipt(phase.saved)),
            phase.saved.undo && h("button", { type: "button", class: "link", disabled: busy, onclick: () => on.undo() }, busy ? "Отменяем…" : "Отменить"),
          ),
          errorLine(p.error),
          canNext && h("button", { type: "button", class: "btn line", disabled: p.asked, onclick: () => on.next() }, p.asked ? "Отправлено в чат" : nextLabel),
        )
      : h(
          "div",
          { class: "rfoot" },
          h(
            "button",
            { type: "button", class: "btn grow", disabled: busy || count === 0, "aria-busy": busy ? "true" : null, onclick: () => on.save() },
            busy ? "Сохраняем…" : ["Сохранить ", h("span", { class: "btn-n" }, String(count))],
          ),
          canNext && h("button", { type: "button", class: "link big", disabled: p.asked || busy, onclick: () => on.next() }, p.asked ? "Отправлено" : nextLabel),
        ),
    phase.kind !== "saved" && errorLine(p.error),
  );
}

// --- «Новые слова» -------------------------------------------------------------------------------

export type WordsPhase = { kind: "edit" } | { kind: "busy" } | { kind: "added"; result: WordsAdded; undoing: boolean };

export interface WordsProps {
  review: WordsReview;
  rows: WordRow[];
  phase: WordsPhase;
  error: string | null;
  notice: string | null;
  expanded: boolean;
  /** The theme picker open: a row's key, or "all" for «Тема для всех». */
  picker: string | null;
  on: {
    toggle(key: string): void;
    toggleAll(): void;
    openPicker(key: string): void;
    pickFolder(key: string, folder: ReviewFolder): void;
    add(): void;
    undo(): void;
    open(url: string): void;
    expand(): void;
    collapse(): void;
  };
  /** The app's page for a theme, when the app's address is known. */
  folderUrl: ((folder: ReviewFolder | null) => string) | null;
}

const GENDER: Partial<Record<Gender, string>> = { m: "m.", f: "f.", mf: "m./f." };

/** The slang meter of the word rows: four segments and «fam.» in italic (Chat-Words-A). */
function slang(level: SlangLevel, verlan: boolean): Child {
  if (level === 0 && !verlan) return null;
  const names = ["нейтральный", "фамильярный", "арго", "вульгарный"];
  return h(
    "span",
    { class: "wmeter" },
    h("span", { class: cls("segs", level === 3 && "vulg"), role: "img", "aria-label": `Сленг: ${names[level]}, ${level + 1} из 4${verlan ? ", верлан" : ""}` }, [0, 1, 2, 3].map((i) => h("i", { class: i <= level ? "on" : null }))),
    h("span", { lang: "fr", class: "wabbr", "aria-hidden": "true" }, verlan ? `${SLANG_LABELS[level]} · verl.` : SLANG_LABELS[level]),
  );
}

const levelTag = (level: Cefr | null) => level && h("span", { class: "wlvl", "aria-label": `Уровень языка: примерно ${level}` }, `≈${level}`);

/** The theme list (Chat-Words-Theme): ✓ on the current one, the counts, «Входящие» underlined dashed. */
function picker(title: Child, folders: readonly ReviewFolder[], current: ReviewFolder | null, onPick: (f: ReviewFolder) => void): HTMLElement {
  return h(
    "div",
    { class: "picker", role: "dialog", "aria-label": "Тема", "data-picker": "" },
    h("p", { class: "ptitle" }, title),
    h(
      "div",
      { role: "listbox", "aria-label": "Темы", class: "plist" },
      folders.map((f) => {
        const on_ = current !== null && current.id === f.id;
        return h(
          "button",
          { type: "button", role: "option", "aria-selected": String(on_), class: cls("popt", on_ && "on"), onclick: () => onPick(f) },
          h("span", { class: "pcheck", "aria-hidden": "true" }, on_ && icon("check", 14, 2)),
          h("span", { class: cls("pname", f.id === null && "inbox") }, f.name),
          h("span", { class: "pcount" }, String(f.count)),
        );
      }),
    ),
  );
}

export function wordsView(p: WordsProps): HTMLElement {
  return p.phase.kind === "added" ? addedView(p, p.phase.result, p.phase.undoing) : editView(p);
}

function editView(p: WordsProps): HTMLElement {
  const { review, rows, on } = p;
  const busy = p.phase.kind === "busy";
  const shown = p.expanded ? rows.length : inlineCount(rows.length, INLINE_WORDS);
  const count = wordsToAdd(rows).length;
  const all = commonFolder(rows);
  const anyChecked = rows.some((r) => r.checked && !r.row.duplicate);
  return h(
    "section",
    { class: "sheet", "aria-label": `Карточки: новые слова, отмечено ${count} из ${rows.length}` },
    h(
      "div",
      { class: "rhead" },
      h("h1", { class: "sl strong" }, "Новые слова · ", h("span", null, String(count)), " ", h("span", { class: "dim" }, `из ${rows.length}`)),
      review.source_label && h("span", { class: "sl" }, review.source_label),
    ),
    h(
      "div",
      { class: "wbar" },
      h("span", { class: "wbar-k" }, "Тема для всех:"),
      h(
        "button",
        { type: "button", class: "wall", "aria-haspopup": "listbox", "aria-expanded": String(p.picker === "all"), "data-chip": "all", disabled: busy, onclick: () => on.openPicker("all") },
        h("span", { class: "u" }, all ? all.name : "разные"),
        icon("chevron", 14, 1.75),
      ),
      h("button", { type: "button", class: "wbar-x", disabled: busy, onclick: () => on.toggleAll() }, anyChecked ? "Снять все" : "Отметить все"),
    ),
    h(
      "ul",
      { class: "wrows", "aria-label": `Слова, ${rows.length}` },
      rows.slice(0, shown).map((r) => {
        const dup = r.row.duplicate;
        if (dup) {
          return h(
            "li",
            { class: "dup" },
            checkbox(false, `${r.row.fr} — уже есть в «${dup.folder_name}», не добавится`, true, () => undefined),
            h("span", { class: "lw" }, h("s", { lang: "fr", class: "lfr" }, r.row.fr), h("span", { class: "lru" }, `уже есть в «${dup.folder_name}»`)),
            h("span", { class: "already" }, "Уже есть"),
          );
        }
        const gender = r.row.pos === "noun" ? GENDER[r.row.gender] : null;
        return h(
          "li",
          { class: cls(p.picker === r.row.key && "open") },
          checkbox(r.checked, r.row.fr, busy, () => on.toggle(r.row.key)),
          h(
            "span",
            { class: "lw" },
            h("span", { class: "wfr" }, h("span", { lang: "fr", class: "lfr" }, r.row.fr), gender && h("span", { class: "wg" }, gender)),
            h("span", { class: "lru" }, r.row.ru),
          ),
          h(
            "span",
            { class: "wr" },
            h("span", { class: "wtop" }, slang(r.row.slang_level, r.row.verlan), levelTag(r.row.level)),
            h(
              "button",
              {
                type: "button",
                class: "chip",
                "aria-haspopup": "listbox",
                "aria-expanded": String(p.picker === r.row.key),
                "aria-label": `Тема слова «${r.row.fr}»: ${r.folder.name}`,
                "data-chip": r.row.key,
                disabled: busy,
                onclick: () => on.openPicker(r.row.key),
              },
              h("span", null, r.folder.name, icon("chevron", 12, 1.75)),
            ),
          ),
        );
      }),
    ),
    noticeLine(p.notice),
    h(
      "div",
      { class: "rfoot" },
      moreButton(rows.length, rows.length - shown, p.expanded, on, true),
      h("button", { type: "button", class: "btn grow", disabled: busy || count === 0, "aria-busy": busy ? "true" : null, onclick: () => on.add() }, busy ? "Добавляем…" : `Добавить ${count}`),
    ),
    errorLine(p.error),
    p.picker !== null &&
      (() => {
        const row = p.picker === "all" ? null : rows.find((r) => r.row.key === p.picker);
        const title = row ? ["Тема слова · ", h("span", { lang: "fr", class: "keep" }, row.row.fr)] : "Тема для всех";
        return picker(title, review.folders, row ? row.folder : all, (f) => on.pickFolder(p.picker!, f));
      })(),
  );
}

function addedView(p: WordsProps, result: WordsAdded, undoing: boolean): HTMLElement {
  const { review, rows, on } = p;
  // Skipped as already saved: the rows the review flagged, then what the server found at adding.
  const skipped = [
    ...rows.filter((r) => r.row.duplicate).map((r) => ({ fr: r.row.fr, folder_name: r.row.duplicate!.folder_name })),
    ...result.duplicates.filter((d) => !rows.some((r) => r.row.duplicate && r.row.fr === d.fr)),
  ];
  const folder = addedFolder(result.added);
  const url = p.folderUrl ? p.folderUrl(folder) : null;
  const n = result.added.length;
  return h(
    "section",
    { class: "sheet", "aria-label": `Карточки: добавлено ${n} ${plural(n, WORDS)}` },
    h("div", { class: "rhead" }, h("h1", { class: "sl strong" }, "Новые слова · ", h("span", { class: "good" }, "Добавлено")), review.source_label && h("span", { class: "sl" }, review.source_label)),
    h(
      "div",
      { class: "added", role: "status" },
      h("p", { class: "ahead" }, n > 0 ? addedHeadline(result.added) : "Ничего не добавлено"),
      result.undoIds.length > 0 && [
        h("span", { class: "dot", "aria-hidden": "true" }, "·"),
        h("button", { type: "button", class: "link", disabled: undoing, "aria-label": `Отменить добавление ${n} ${plural(n, WORDS)}`, onclick: () => on.undo() }, undoing ? "Отменяем…" : "Отменить"),
      ],
    ),
    n > 0 &&
      h(
        "ul",
        { class: "arows", "aria-label": `Добавленные слова, ${n}` },
        result.added.map((w) =>
          h("li", null, icon("check", 16, 2, "ok"), h("span", { lang: "fr", class: "lfr" }, w.fr), h("span", { class: "lru grow" }, w.ru), levelTag(w.level)),
        ),
      ),
    skipped.length > 0 &&
      h(
        "div",
        { class: "skipped" },
        h("p", { class: "sl" }, `${skipped.length} пропущено: уже есть`),
        h(
          "ul",
          { class: "arows" },
          skipped.map((d) => h("li", { class: "off" }, icon("dash", 16, 2), h("span", { lang: "fr", class: "lfr grow" }, d.fr), h("span", { class: "lru" }, `уже в «${d.folder_name}»`))),
        ),
      ),
    errorLine(p.error),
    url &&
      h(
        "div",
        { class: "rfoot" },
        h("button", { type: "button", class: "btn line grow", onclick: () => on.open(url) }, folder ? `Открыть «${folder.name}» в Карточках` : "Открыть Карточки", icon("external", 16, 1.75)),
      ),
  );
}

/** Before the review arrives (Claude still writing the call). */
export function waitView(text = "Готовим список…", busy = true): HTMLElement {
  return h("section", { class: "sheet", "aria-busy": busy ? "true" : null }, h("div", { class: "rhead" }, h("span", { class: "sl strong" }, "Карточки")), h("p", { class: busy ? "wait" : "wait still", role: "status" }, text));
}

// --- «Настроить упражнение» ----------------------------------------------------------------------

/** Themes shown before «ещё N» (the picked ones always show). */
export const INLINE_THEMES = 10;

export interface SetupProps {
  setup: ExerciseSetup;
  state: SetupState;
  /** Every theme shown («ещё N» tapped). */
  allThemes: boolean;
  error: string | null;
  on: {
    theme(id: string | null): void;
    allThemes(): void;
    clearThemes(): void;
    verbs(): void;
    tense(tense: string): void;
    allTenses(): void;
    size(n: number): void;
    level(level: string): void;
    autoLevel(): void;
    start(): void;
  };
}

/** A toggle chip of the card: ink when on, a tick when several can be on. */
function opt(label: Child, on: boolean, attrs: Record<string, string | null>, onClick: () => void, tick = false): HTMLElement {
  return h(
    "button",
    { type: "button", class: cls("opt", on && "on"), "aria-pressed": String(on), onclick: onClick, ...attrs },
    tick && on && icon("check", 14, 2),
    label,
  );
}

const block = (label: string, id: string, ...children: Child[]) =>
  h("div", { class: "sblock" }, h("p", { class: "sl", id }, label), ...children);

export function setupView(p: SetupProps): HTMLElement {
  const { setup, state, on } = p;
  const sent = state.sent;
  const available = setupAvailable(setup, state);
  const picked = new Set(state.folders);
  const hidden = p.allThemes ? [] : setup.themes.slice(INLINE_THEMES).filter((t) => !picked.has(t.id));
  const themes = setup.themes.filter((t) => !hidden.includes(t));
  const allTenses = state.tenses.length === 0 || state.tenses.length === EXERCISE_TENSES.length;
  const sizes = state.verbs ? setup.verb_sizes : setup.sizes;
  const size = state.verbs ? state.verbSize : state.size;
  const request = setupRequest(setup, state);
  const unit = state.verbs ? (["глагол", "глагола", "глаголов"] as const) : WORDS;
  return h(
    "section",
    { class: cls("sheet setup", sent && "written"), "aria-label": "Настроить упражнение" },
    h("div", { class: "rhead" }, h("h1", { class: "sl strong" }, "Упражнение в чате"), h("span", { class: "rnote" }, sent ? "Запрос отправлен" : "Выберите и начните")),
    h(
      "fieldset",
      { class: "sform", disabled: sent },
      block(
        "Темы",
        "su-themes",
        h(
          "div",
          { class: "opts", role: "group", "aria-labelledby": "su-themes" },
          opt("Все темы", picked.size === 0, { "data-theme": "all" }, () => on.clearThemes()),
          themes.map((t) =>
            opt([h("span", null, t.name), h("span", { class: "n" }, String(state.verbs ? t.verbs : t.count))], picked.has(t.id), { "data-theme": t.id ?? "inbox", "aria-label": `${t.name}: ${state.verbs ? t.verbs : t.count} ${plural(state.verbs ? t.verbs : t.count, unit)}` }, () => on.theme(t.id), true),
          ),
          hidden.length > 0 && h("button", { type: "button", class: "opt more-opt", onclick: () => on.allThemes() }, `ещё ${hidden.length}`),
        ),
      ),
      h(
        "div",
        { class: "sblock row" },
        checkbox(state.verbs, "Спряжение глаголов", sent, () => on.verbs()),
        h("span", { class: "grow col" }, h("span", { class: "stitle" }, "Спряжение глаголов"), h("span", { class: "scap" }, "Только глаголы, короткий тест")),
      ),
      state.verbs &&
        block(
          "Времена",
          "su-tenses",
          h(
            "div",
            { class: "opts", role: "group", "aria-labelledby": "su-tenses" },
            opt("Все", allTenses, { "data-tense": "all" }, () => on.allTenses()),
            EXERCISE_TENSES.map((t) => opt(h("span", { lang: "fr" }, TENSE_NAMES[t]), !allTenses && state.tenses.includes(t), { "data-tense": t }, () => on.tense(t), true)),
          ),
          h("p", { class: "scap" }, allTenses ? "Все четыре времени вперемешку." : state.tenses.map((t) => `${TENSE_NAMES[t]} — ${TENSE_WHEN[t]}`).join(" · ")),
        ),
      block(
        "Вопросов",
        "su-size",
        h(
          "div",
          { class: "seg wide", role: "radiogroup", "aria-labelledby": "su-size" },
          sizes.map((n) =>
            h("button", { type: "button", role: "radio", "aria-checked": String(n === size), class: cls(n === size && "on"), "data-size": String(n), onclick: () => on.size(n) }, String(n)),
          ),
        ),
      ),
      block(
        "Уровень",
        "su-level",
        h(
          "div",
          { class: "opts", role: "group", "aria-labelledby": "su-level" },
          opt("Авто", state.levels.length === 0, { "data-level": "auto" }, () => on.autoLevel()),
          EXERCISE_LEVELS.map((l) => opt(l, state.levels.includes(l), { "data-level": l }, () => on.level(l), state.levels.length > 1)),
        ),
      ),
    ),
    h("p", { class: "sreq", "aria-label": `Запрос: ${request}` }, request),
    h(
      "div",
      { class: "rfoot col" },
      sent
        ? h("div", { class: "receipt", role: "status" }, icon("check", 18, 2), h("span", { class: "grow" }, "Запрос отправлен — Claude готовит раунд"))
        : h(
            "button",
            { type: "button", class: "btn", disabled: available === 0, onclick: () => on.start() },
            available === 0 ? (state.verbs ? "Нет глаголов в этих темах" : "Нет слов в этих темах") : "Начать ›",
          ),
      errorLine(p.error),
    ),
  );
}

// --- «Повторить слова» ---------------------------------------------------------------------------

export interface CardsSetupProps {
  setup: CardsSetup;
  state: CardsSetupState;
  /** Every theme shown («ещё N» tapped). */
  allThemes: boolean;
  error: string | null;
  on: {
    choice(choice: CardsSetupChoice): void;
    theme(id: string | null): void;
    allThemes(): void;
    clearThemes(): void;
    scope(scope: string): void;
    size(n: number): void;
    start(): void;
  };
}

/** The four ways, with what each does: the user picks one. */
const CHOICES: { choice: CardsSetupChoice; title: string; caption: string }[] = [
  { choice: "cards", title: "Карточки", caption: "По расписанию, оценки сохраняются" },
  { choice: "cards_then_exercise", title: "Карточки, потом упражнение", caption: "Затем упражнение по ошибкам" },
  { choice: "exercise", title: "Упражнение", caption: "По словам к повторению" },
  { choice: "practice", title: "Тренировка", caption: "Без расписания, ничего не меняет" },
];

const CARD_FORMS = ["карточка", "карточки", "карточек"] as const;

/** What «Начать ›» says when there is nothing to start. */
function nothingLabel(choice: CardsSetupChoice): string {
  if (choice === "practice") return "Тренировать нечего";
  if (choice === "exercise") return "Нет слов к повторению";
  return "Сегодня повторять нечего";
}

export function cardsSetupView(p: CardsSetupProps): HTMLElement {
  const { setup, state, on } = p;
  const sent = state.sent;
  const available = cardsSetupAvailable(setup, state);
  const picked = new Set(state.folders);
  const hidden = p.allThemes ? [] : setup.themes.slice(INLINE_THEMES).filter((t) => !picked.has(t.id));
  const themes = setup.themes.filter((t) => !hidden.includes(t));
  const exercise = state.choice === "exercise";
  const sizes = exercise ? DUE_EXERCISE_SIZES : setup.sizes;
  const size = exercise ? state.exerciseSize : state.size;
  const request = cardsSetupRequest(setup, state);
  // A theme's number: its cards due (and new, for a round by the schedule).
  const themeCount = (t: CardsSetup["themes"][number]) => (state.choice === "cards" || state.choice === "cards_then_exercise" ? t.due + t.new : t.due);
  return h(
    "section",
    { class: cls("sheet setup", sent && "written"), "aria-label": "Повторить слова" },
    h("div", { class: "rhead" }, h("h1", { class: "sl strong" }, "Повторить слова"), h("span", { class: "rnote" }, sent ? "Запрос отправлен" : "Выберите и начните")),
    h("div", { class: "today" }, h("p", { class: "sl" }, "Сегодня"), h("p", { class: "tline" }, todayLine(setup.today))),
    h(
      "fieldset",
      { class: "sform", disabled: sent },
      block(
        "Как",
        "cs-choice",
        h(
          "div",
          { class: "choices", role: "radiogroup", "aria-labelledby": "cs-choice" },
          CHOICES.map((c) =>
            h(
              "button",
              { type: "button", role: "radio", "aria-checked": String(state.choice === c.choice), class: cls("choice", state.choice === c.choice && "on"), "data-choice": c.choice, onclick: () => on.choice(c.choice) },
              h("span", { class: "ct" }, c.title),
              h("span", { class: "cc" }, c.caption),
            ),
          ),
        ),
      ),
      state.choice === "practice" &&
        setup.scopes.length > 0 &&
        block(
          "Что тренировать",
          "cs-scope",
          h(
            "div",
            { class: "opts", role: "radiogroup", "aria-labelledby": "cs-scope" },
            setup.scopes.map((s) =>
              h(
                "button",
                { type: "button", role: "radio", "aria-checked": String(s.scope === state.scope), class: cls("opt", s.scope === state.scope && "on"), "data-scope": s.scope, onclick: () => on.scope(s.scope) },
                h("span", null, s.label),
                h("span", { class: "n" }, String(s.count)),
              ),
            ),
          ),
        ),
      setup.themes.length > 0 &&
        block(
          "Темы",
          "cs-themes",
          h(
            "div",
            { class: "opts", role: "group", "aria-labelledby": "cs-themes" },
            opt("Все темы", picked.size === 0, { "data-theme": "all" }, () => on.clearThemes()),
            themes.map((t) =>
              opt(
                [h("span", null, t.name), h("span", { class: "n" }, String(themeCount(t)))],
                picked.has(t.id),
                { "data-theme": t.id ?? "inbox", "aria-label": `${t.name}: ${themeCount(t)} ${plural(themeCount(t), CARD_FORMS)}` },
                () => on.theme(t.id),
                true,
              ),
            ),
            hidden.length > 0 && h("button", { type: "button", class: "opt more-opt", onclick: () => on.allThemes() }, `ещё ${hidden.length}`),
          ),
        ),
      sizes.length > 0 &&
        block(
          exercise ? "Вопросов" : "Карточек",
          "cs-size",
          h(
            "div",
            { class: "seg wide", role: "radiogroup", "aria-labelledby": "cs-size" },
            sizes.map((n) => h("button", { type: "button", role: "radio", "aria-checked": String(n === size), class: cls(n === size && "on"), "data-size": String(n), onclick: () => on.size(n) }, String(n))),
          ),
        ),
    ),
    h("p", { class: "sreq", "aria-label": `Запрос: ${request}` }, request),
    h(
      "div",
      { class: "rfoot col" },
      sent
        ? h("div", { class: "receipt", role: "status" }, icon("check", 18, 2), h("span", { class: "grow" }, "Запрос отправлен — Claude готовит раунд"))
        : h("button", { type: "button", class: "btn", disabled: available === 0, onclick: () => on.start() }, available === 0 ? nothingLabel(state.choice) : "Начать ›"),
      errorLine(p.error),
    ),
  );
}
