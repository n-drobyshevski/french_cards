// What the player tells Claude: the one-line result it puts into the model's context when a round
// ends (ui/update-model-context), and the user message «Обсудить ошибки» sends (ui/message).
import type { MissedWord, RunScore } from "@/lib/core/exercises";

export const plural = (n: number, forms: readonly [string, string, string]) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1];
  return forms[2];
};

const listed = (missed: readonly MissedWord[]) => missed.map((m) => `${m.fr} (${m.ru})`).join(", ");

/**
 * «Упражнение «Сленг» в чате: 3 из 5 с первого раза; ошибки: les flics (копы). Не сохранено в Карточки.»
 * `saved`: the round was saved to the app; a «Повторить ошибки» round is never saved on its own.
 */
export function roundSummary(title: string, kind: "set" | "mistakes", score: RunScore, missed: readonly MissedWord[], saved: boolean): string {
  const head = kind === "mistakes" ? `Повтор ошибок упражнения «${title}» в чате` : `Упражнение «${title}» в чате`;
  const errors = missed.length > 0 ? `; ошибки: ${listed(missed)}` : "; без ошибок";
  const tail = kind === "mistakes" ? "" : saved ? " Результат сохранён в Карточки." : " Результат не сохранён в Карточки (сохраняется только по кнопке в плеере).";
  return `${head}: ${score.first_try} из ${score.total} с первого раза${errors}.${tail}`;
}

/** «Разбери мои ошибки в упражнении «…»: les flics — копы (мой ответ: «давай»); …» */
export function mistakesMessage(title: string, missed: readonly MissedWord[]): string {
  const lines = missed.map((m) => `${m.fr} — ${m.ru}${m.chosen.length ? ` (мой ответ: ${m.chosen.map((c) => `«${c}»`).join(", ")})` : ""}`);
  return `Разбери мои ошибки в упражнении «${title}»: ${lines.join("; ")}.`;
}
