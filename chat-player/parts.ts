// The index card's parts the chat pages share (the exercise player, ui.ts, and the cards page,
// cards/views.ts): the deck of edges under the card, the card's header, the slang meter and the
// result strip. Their look is chat-player/deck.css. Every function builds fresh DOM.
import type { StripMark } from "@/components/ui/SessionStrip";
import { SLANG_LABELS, type SlangLevel } from "@/lib/types";
import { deckEdges } from "./card";
import { h, type Child } from "./dom";
import { plural } from "./texts";

export const cls = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

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
export function cardHead(label: Child[], right: Child = null, className?: string): HTMLElement {
  return h("div", { class: cls("head", className) }, h("span", { class: "label" }, label), right);
}

/** Deck edges under the card (1–3 by the cards left), deepest first. */
export function deck(left: number, card: HTMLElement): HTMLElement {
  const n = deckEdges(left);
  const edges = ["e3", "e2", "e1"].filter((_, i) => n >= 3 - i).map((e) => h("span", { class: `edge ${e}`, "aria-hidden": "true" }));
  return h("div", { class: "deck" }, edges, card);
}

const QUESTION_NOUN = ["вопрос", "вопроса", "вопросов"] as const;

export interface TallyOptions {
  /** The mono head: «Итог набора» (the player), «Итог раунда» (the cards page). */
  head?: string;
  /** What a cell is, for the strip's label. */
  noun?: readonly [string, string, string];
  /** The line under the strip; default «3 из 5 с первого раза». */
  score?: Child;
}

/** «ИТОГ НАБОРА», the title, the strip (one cell per attempt) and «3 из 5 с первого раза». */
export function tally(title: string, marks: readonly StripMark[], total: number, note: string | null, options: TallyOptions = {}): HTMLElement {
  const head = options.head ?? "Итог набора";
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
    { class: "tally", "aria-label": `${head} «${title}»` },
    h("div", { class: "th" }, h("span", null, head), note && h("span", null, `· ${note}`)),
    h(
      "div",
      { class: "tb" },
      h("p", { class: "tt" }, title),
      marks.length > 0 &&
        h(
          "span",
          { class: "cells", role: "img", "aria-label": `${total} ${plural(total, options.noun ?? QUESTION_NOUN)}: ${parts.join(", ")}` },
          marks.map((m, i) => h("span", { class: `cell ${m}`, style: `--g:${Math.floor(i / group)}` })),
        ),
      h("p", { class: "score", "aria-hidden": marks.length > 0 ? "true" : null }, options.score ?? [h("b", null, `${c.first} из ${total}`), " с первого раза"]),
    ),
  );
}
