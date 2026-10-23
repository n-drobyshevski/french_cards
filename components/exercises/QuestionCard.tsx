"use client";

import type { ReactNode } from "react";
import { CardHeader, cardShell } from "@/components/review/card-parts";
import { posAbbr } from "@/components/review/format";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icons";
import { SlangMeter } from "@/components/ui/SlangMeter";
import { CLOZE_PROMPT, PAIRS_PROMPT, REGISTER_PROMPT } from "@/lib/core/exercises";
import type { ExerciseItem, ExerciseSkill } from "@/lib/types";
import { ClozeLine } from "./ClozeLine";
import { isRussian } from "./player-state";

const SKILL_LABEL: Record<ExerciseSkill, string> = {
  meaning: "Значение",
  form: "Форма",
  neutral: "Нейтрально",
  verlan: "Верлан",
  situation: "Ситуация",
};

/** The card header's label: the bold skill and the muted direction («ЗНАЧЕНИЕ · FR → RU»). */
export function cardLabel(item: Pick<ExerciseItem, "type" | "skill" | "ask">): { label: string; detail: string | null } {
  switch (item.type) {
    case "cloze":
      return { label: "Пропуск", detail: null };
    case "register":
      return { label: "Регистр", detail: null };
    case "pairs":
      return { label: "Пары", detail: null };
    case "choice": {
      const skill = item.skill ?? "meaning";
      const detail =
        skill === "meaning" ? (item.ask === "ru" ? "RU → FR" : "FR → RU") : skill === "form" || skill === "situation" ? "RU → FR" : null;
      return { label: SKILL_LABEL[skill], detail };
    }
  }
}

/**
 * The slang meter shows in the header only where it gives nothing away: not on register items (it is
 * the question), not on situation / neutral choices (it would hint at the answer), not on cloze and pairs.
 */
export function showsMeter(item: Pick<ExerciseItem, "type" | "skill" | "word">): boolean {
  if (!item.word || item.type !== "choice") return false;
  const skill = item.skill ?? "meaning";
  return skill === "meaning" || skill === "form" || skill === "verlan";
}

/** The question under a choice prompt, unless the prompt asks it itself. */
function skillQuestion(item: Pick<ExerciseItem, "skill" | "ask" | "prompt">): string | null {
  if (item.prompt?.trim().endsWith("?")) return null;
  switch (item.skill ?? "meaning") {
    case "meaning":
      return item.ask === "ru" ? "Как сказать по-французски?" : "Что это значит?";
    case "form":
      return "Как сказать по-французски?";
    case "neutral":
      return "Как сказать нейтрально?";
    case "verlan":
      return "Что это значит?";
    case "situation":
      return "Что ответить?";
  }
}

/** French headword size steps down for long expressions (the review card's steps; 56 from 768). */
function frSize(text: string): string {
  if (text.length <= 16) return "text-[40px] leading-[1.1] md:text-[56px] md:leading-[64px]";
  if (text.length <= 28) return "text-[32px] leading-[1.15] md:text-[44px] md:leading-[52px]";
  return "text-[26px] leading-[1.2] md:text-[30px] md:leading-9";
}

/** A choice prompt: a French or Russian headword, or a Russian situation as a paragraph. */
function Prompt({ text }: { text: string }) {
  if (isRussian(text)) {
    const paragraph = text.length > 24 || /[.:!?…»]$/.test(text.trim());
    return paragraph ? (
      <p lang="ru" className="m-0 text-[17px] leading-[26px] text-ink md:text-[19px] md:leading-7">
        {text}
      </p>
    ) : (
      <h2 lang="ru" className="m-0 text-[32px] leading-10 font-medium tracking-[-0.01em] md:text-[44px] md:leading-[52px]">
        {text}
      </h2>
    );
  }
  return (
    <h2 lang="fr" className={cx("m-0 font-serif font-medium tracking-[-0.015em] break-words", frSize(text))}>
      {text}
    </h2>
  );
}

const question = "m-0 mt-5 text-[15px] leading-5 text-muted md:mt-1.5 md:leading-6";

export interface QuestionCardProps {
  item: ExerciseItem;
  /** The set's title, in the footer («НАБОР: …»). */
  setTitle: string;
  /** The attempt (2+ shows «ПОВТОР» and «Ошиблись раньше — ещё раз»). */
  attempt: number;
  /** The card has been answered (a cloze writes its answer into the gap). */
  answered: boolean;
  /** «1 из 5» next to «ПАРЫ». */
  pairsCount?: string;
  /** The stamp, once answered. */
  stamp?: ReactNode;
  /** A pairs item's board. */
  children?: ReactNode;
}

/**
 * The question as the review index card (SPEC.md «Упражнения» → Player): 46px header with the red
 * rule — mono skill label left (ЗНАЧЕНИЕ · FR → RU / ФОРМА · RU → FR / ВЕРЛАН / СИТУАЦИЯ / ПРОПУСК /
 * РЕГИСТР / ПАРЫ), «ПОВТОР» on a requeued item, the slang meter right — the question, the stamp, and
 * the footer «НАБОР: … · ИЗ ЧАТА». Phones: it fills the column above the grid; from 768 a 296px card.
 */
export function QuestionCard({ item, setTitle, attempt, answered, pairsCount, stamp, children }: QuestionCardProps) {
  const { label, detail } = cardLabel(item);
  const repeat = attempt > 1;
  const word = item.word;
  const pos = word ? posAbbr(word) : null;

  let body: ReactNode;
  switch (item.type) {
    case "choice": {
      const q = skillQuestion(item);
      const showPos = (item.skill ?? "meaning") === "meaning" && item.ask !== "ru" && pos;
      body = (
        <>
          <Prompt text={item.prompt ?? word?.fr ?? ""} />
          {(q || showPos) && (
            <p className={cx(question, "flex items-baseline gap-3")}>
              {showPos && (
                <span lang="fr" className="hidden font-serif text-[17px] italic md:inline">
                  {pos}
                </span>
              )}
              {q && <span>{q}</span>}
            </p>
          )}
        </>
      );
      break;
    }
    case "cloze":
      body = (
        <>
          <ClozeLine sentence={item.sentence ?? ""} answered={answered} />
          {item.sentence_ru && <p className="m-0 mt-3 text-[15px] leading-5 text-muted">{item.sentence_ru}</p>}
          <p className={cx(question, "md:mt-3")}>{item.prompt ?? CLOZE_PROMPT}</p>
        </>
      );
      break;
    case "register":
      body = (
        <>
          <Prompt text={word?.fr ?? item.prompt ?? ""} />
          {word && (
            <span className="mt-2 font-serif text-[15px] leading-5 text-muted italic md:text-[17px] md:leading-6">
              {pos && <span lang="fr">{pos} </span>}— {word.ru}
            </span>
          )}
          <p className={question}>{item.prompt ?? REGISTER_PROMPT}</p>
        </>
      );
      break;
    case "pairs":
      body = (
        <>
          <p className="m-0 mb-4 text-[15px] leading-5 text-muted">{PAIRS_PROMPT}</p>
          {children}
        </>
      );
      break;
  }

  return (
    <article
      aria-label={label}
      data-exercise-card={item.type}
      className={cx(
        cardShell,
        "relative min-h-[220px] flex-1 max-md:[@media(max-height:740px)]:min-h-[180px] md:min-h-0 md:flex-none",
        item.type === "pairs" ? "md:min-h-[296px]" : "md:h-[296px]",
      )}
    >
      <CardHeader
        label={
          <span className="inline-flex items-center gap-2">
            <span className="font-medium text-ink uppercase">{label}</span>
            {detail && <span>· {detail}</span>}
            {pairsCount && <span>· {pairsCount.toUpperCase()}</span>}
            {repeat && (
              <span className="inline-flex h-[18px] items-center rounded-[3px] border border-ink px-[5px] text-[10px] font-medium text-ink">
                ПОВТОР
              </span>
            )}
          </span>
        }
      >
        {word && showsMeter(item) && <SlangMeter level={word.slang_level} verlan={word.verlan} />}
      </CardHeader>
      <div
        className={cx(
          "flex min-h-0 flex-1 flex-col px-6 md:px-10",
          item.type === "pairs" ? "justify-start pt-6 pb-4 md:pt-6" : "justify-center pb-2 md:justify-start md:pt-8",
        )}
      >
        {body}
        {repeat && (
          <p className="m-0 mt-1.5 flex items-center gap-1.5 text-[13px] leading-5 text-muted">
            <Icon name="undo" size={16} strokeWidth={1.5} />
            <span>Ошиблись раньше — ещё раз</span>
          </p>
        )}
      </div>
      {stamp}
      <div className="mx-5 flex h-11 shrink-0 items-center gap-2 border-t border-rule font-mono text-[11px] tracking-[.06em] text-muted uppercase md:mx-10 md:h-12">
        <span className="min-w-0 truncate">
          набор: <span className="text-ink">{setTitle}</span>
        </span>
        <span className="flex-1" />
        <span className="shrink-0">из чата</span>
      </div>
    </article>
  );
}
