// The requests «Карточки в чате» sends to Claude as the user's message (ui/message): from «Повторить
// слова» (review page, setup_review) and from the cards page's done screen. The connector's
// instructions route them (lib/mcp/tools.ts SERVER_INSTRUCTIONS): «Повтори карточки здесь в чате …»
// → play_cards (mode schedule; «потом упражнение по ошибкам» → next "exercise"), «Потренируй
// карточки здесь в чате без расписания …» → play_cards (mode practice, the scope named), «Сделай
// упражнение здесь в чате …» → exercise_material (word_ids for «по ошибкам из карточек») and
// play_exercises. «Упражнение» itself is the app's due-words request (review/model.ts
// cardsSetupRequest). Keep the wording in step with those instructions. Pure.
import type { ChatCardsDirection, ChatPracticeScope } from "@/lib/core/chat-cards";
import { plural } from "../texts";

export const CARD_NOUN = ["карточка", "карточки", "карточек"] as const;

export const quoted = (name: string) => `«${name}»`;

/** «, по теме «Еда»», «, по темам «Еда», «Жильё»»; nothing for every theme. */
export function themesPart(names: readonly string[]): string {
  const list = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (list.length === 0) return "";
  return list.length === 1 ? `, по теме ${quoted(list[0])}` : `, по темам ${list.map(quoted).join(", ")}`;
}

/** «, только FR → RU»; nothing for both sides. */
const directionPart = (direction: ChatCardsDirection | null | undefined) =>
  direction === "fr_ru" ? ", только FR → RU" : direction === "ru_fr" ? ", только RU → FR" : "";

export interface CardsRequest {
  size: number;
  /** Theme names; none = every theme. */
  themes: readonly string[];
  direction?: ChatCardsDirection | null;
  /** «потом упражнение по ошибкам» («Карточки, потом упражнение»). */
  thenExercise?: boolean;
  /** «ещё 12 карточек» (the done screen's «Продолжить»). */
  more?: boolean;
}

/** «Повтори карточки здесь в чате, 20 карточек, по темам «Еда», «Жильё», потом упражнение по ошибкам.» */
export function cardsRequest({ size, themes, direction, thenExercise = false, more = false }: CardsRequest): string {
  const count = `${more ? "ещё " : ""}${size} ${plural(size, CARD_NOUN)}`;
  return `Повтори карточки здесь в чате, ${count}${themesPart(themes)}${directionPart(direction)}${thenExercise ? ", потом упражнение по ошибкам" : ""}.`;
}

/** What a «Тренировка» round takes, in the request. */
export const PRACTICE_SCOPE_TEXT: Record<ChatPracticeScope, string> = {
  today: "ошибки сегодня",
  recent: "ошибки последних дней",
  all: "все карточки",
  difficult: "трудные слова",
  due: "карточки к повторению",
};

/** «Потренируй карточки здесь в чате без расписания: ошибки сегодня, 20 карточек, по теме «Еда».» */
export function practiceRequest({ scope, size, themes, direction }: { scope: ChatPracticeScope; size: number; themes: readonly string[]; direction?: ChatCardsDirection | null }): string {
  return `Потренируй карточки здесь в чате без расписания: ${PRACTICE_SCOPE_TEXT[scope]}, ${size} ${plural(size, CARD_NOUN)}${themesPart(themes)}${directionPart(direction)}.`;
}

/** A word of «Упражнение по ошибкам». */
export interface MissedCard {
  word_id: string;
  fr: string;
}

/** Words «Упражнение по ошибкам» names at most (exercise_material takes up to 30 word_ids). */
export const MISTAKES_MAX = 30;

/** «Сделай упражнение здесь в чате по ошибкам из карточек: chelou, la galère (word_ids: w1, w2).» */
export function mistakesExerciseRequest(words: readonly MissedCard[]): string {
  const seen = new Set<string>();
  const list = words.filter((w) => !seen.has(w.word_id) && seen.add(w.word_id)).slice(0, MISTAKES_MAX);
  return `Сделай упражнение здесь в чате по ошибкам из карточек: ${list.map((w) => w.fr).join(", ")} (word_ids: ${list.map((w) => w.word_id).join(", ")}).`;
}
