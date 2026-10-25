"use client";

import type { ReactNode } from "react";
import { CardHeader, cardShell } from "@/components/review/card-parts";
import { posAbbr } from "@/components/review/format";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icons";
import { SLANG_NAMES_RU, SlangMeter } from "@/components/ui/SlangMeter";
import { TENSE_NAMES } from "@/lib/core/conj-display";
import {
  CLOZE_PROMPT,
  CONJ_PROMPT,
  PAIRS_PROMPT,
  REGISTER_LEVELS,
  REGISTER_PROMPT,
  clozeParts,
} from "@/lib/core/exercises";
import type { ExerciseItem, ExerciseSkill, SlangLevel } from "@/lib/types";
import { ClozeLine } from "./ClozeLine";
import { isRussian } from "./player-state";
import type { StampPlace } from "./Stamp";

const SKILL_LABEL: Record<ExerciseSkill, string> = {
  meaning: "Значение",
  form: "Форма",
  neutral: "Нейтрально",
  verlan: "Верлан",
  situation: "Ситуация",
};

/** The card header's label: the bold skill and the muted direction («ЗНАЧЕНИЕ · FR → RU», «СПРЯЖЕНИЕ · PASSÉ COMPOSÉ»). */
export function cardLabel(
  item: Pick<ExerciseItem, "type" | "skill" | "ask"> &
    Partial<Pick<ExerciseItem, "tense">>,
): { label: string; detail: string | null } {
  switch (item.type) {
    case "conjugate":
      return {
        label: "Спряжение",
        detail: item.tense ? (TENSE_NAMES[item.tense] ?? null) : null,
      };
    case "cloze":
      return { label: "Пропуск", detail: null };
    case "register":
      return { label: "Регистр", detail: null };
    case "pairs":
      return { label: "Пары", detail: null };
    case "choice": {
      const skill = item.skill ?? "meaning";
      const detail =
        skill === "meaning"
          ? item.ask === "ru"
            ? "RU → FR"
            : "FR → RU"
          : skill === "form" || skill === "situation"
            ? "RU → FR"
            : null;
      return { label: SKILL_LABEL[skill], detail };
    }
  }
}

/**
 * The slang meter shows in the header only where it gives nothing away: not on register items (it is
 * the question), not on situation / neutral choices (it would hint at the answer), not on cloze and pairs.
 */
export function showsMeter(
  item: Pick<ExerciseItem, "type" | "skill" | "word">,
): boolean {
  if (!item.word || item.type !== "choice") return false;
  const skill = item.skill ?? "meaning";
  return skill === "meaning" || skill === "form" || skill === "verlan";
}

/**
 * A French word asked for its meaning: on phones the hero word and the Russian tiles say it, so the
 * question line is left off the screen (L-ExPlayer-B; screen readers keep it); from 768 it shows.
 */
function selfEvident(
  item: Pick<ExerciseItem, "skill" | "ask" | "prompt" | "word">,
): boolean {
  const skill = item.skill ?? "meaning";
  const prompt = item.prompt ?? item.word?.fr ?? "";
  return (
    (skill === "verlan" || (skill === "meaning" && item.ask !== "ru")) &&
    !isRussian(prompt)
  );
}

/** The question under a choice prompt, unless the prompt asks it itself. */
function skillQuestion(
  item: Pick<ExerciseItem, "skill" | "ask" | "prompt">,
): string | null {
  if (item.prompt?.trim().endsWith("?")) return null;
  switch (item.skill ?? "meaning") {
    case "meaning":
      return item.ask === "ru"
        ? "Как сказать по-французски?"
        : "Что это значит?";
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

/**
 * French headword size steps down for long expressions (the review card's steps; 56 from 768). A
 * short one is the phone hero (L-ExPlayer-B): --prompt-fit, 40–56px with the width, unless one of
 * its words is too long for the card at that size (it would break mid-word): then 40px as before.
 */
function frSize(text: string): string {
  const longest = Math.max(0, ...text.split(/\s+/).map((w) => w.length));
  if (text.length <= 16) {
    const phone =
      longest <= 13
        ? "text-prompt-fit leading-[1.05] tracking-[-0.02em]"
        : "text-[40px] leading-[1.1] tracking-[-0.015em]";
    return `${phone} max-md:[text-wrap:balance] md:text-[56px] md:leading-[64px] md:tracking-[-0.015em]`;
  }
  if (text.length <= 28)
    return "text-[32px] leading-[1.15] tracking-[-0.015em] md:text-[44px] md:leading-[52px]";
  return "text-[26px] leading-[1.2] tracking-[-0.015em] md:text-[30px] md:leading-9";
}

/**
 * A choice prompt: a French or Russian headword, or a Russian situation as a paragraph. `open`
 * (phones, once answered): a headword opens the word sheet (the button sits inside the heading).
 */
function Prompt({ text, open }: { text: string; open?: WordLink | null }) {
  const content = open ? <WordButton {...open}>{text}</WordButton> : text;
  if (isRussian(text)) {
    const paragraph = text.length > 24 || /[.:!?…»]$/.test(text.trim());
    return paragraph ? (
      <p
        lang="ru"
        className="m-0 text-[17px] leading-[26px] text-ink md:text-[19px] md:leading-7"
      >
        {text}
      </p>
    ) : (
      <h2
        lang="ru"
        className="m-0 text-[32px] leading-10 font-medium tracking-[-0.01em] md:text-[44px] md:leading-[52px]"
      >
        {content}
      </h2>
    );
  }
  return (
    <h2
      lang="fr"
      className={cx("m-0 font-serif font-medium break-words", frSize(text))}
    >
      {content}
    </h2>
  );
}

const question =
  "m-0 mt-5 text-[15px] leading-5 text-muted md:mt-1.5 md:leading-6";

/**
 * The conjugate infinitive, one step below frSize on md: the infinitive, the pronoun line and the
 * question must fit the 296px card with «Ошиблись раньше — ещё раз» on a retry.
 */
function conjSize(text: string): string {
  return text.length <= 28
    ? "text-[32px] leading-[1.15] md:text-[40px] md:leading-[48px]"
    : frSize(text);
}

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
  /** Phones (X-Player-B): the card writes the answer on itself. Default: the desktop card. */
  phone?: boolean;
  /** Phones, once answered: the right option and the wrong pick (null for a right answer or «Не знаю»). */
  written?: Written | null;
  /** Phones: explain_ru, written on the card under the answer once answered. */
  explain?: string | null;
  /** Phones, once answered: the French word on the card opens the word sheet (a live library word only). */
  onWord?: (() => void) | null;
}

/** What a phone card writes into its blank once answered. */
export interface Written {
  right: string;
  wrong: string | null;
}

/**
 * The question as the review index card (SPEC.md «Упражнения» → Player): 46px header with the red
 * rule — mono skill label left (ЗНАЧЕНИЕ · FR → RU / ФОРМА · RU → FR / ВЕРЛАН / СИТУАЦИЯ / ПРОПУСК /
 * РЕГИСТР / ПАРЫ / СПРЯЖЕНИЕ · PASSÉ COMPOSÉ), «ПОВТОР» on a requeued item, the slang meter right — the question, the stamp, and
 * the footer «НАБОР: … · ИЗ ЧАТА». Phones (L-ExPlayer-B): it fills the column above the grid with the
 * skill word, the meter and the hero prompt — no direction, footer, cloze question or repeat line.
 * From 768 a 296px card.
 */
export function QuestionCard(props: QuestionCardProps) {
  if (props.phone) return <PhoneQuestionCard {...props} />;
  const { item, setTitle, attempt, answered, pairsCount, stamp, children } =
    props;
  const { label } = cardLabel(item);
  const repeat = attempt > 1;
  const word = item.word;
  const pos = word ? posAbbr(word) : null;

  let body: ReactNode;
  switch (item.type) {
    case "choice": {
      const q = skillQuestion(item);
      const showPos =
        (item.skill ?? "meaning") === "meaning" && item.ask !== "ru" && pos;
      body = (
        <>
          <Prompt text={item.prompt ?? word?.fr ?? ""} />
          {(q || showPos) && (
            <p
              className={cx(
                question,
                "flex items-baseline gap-3",
                selfEvident(item) && "max-md:sr-only",
              )}
            >
              {showPos && (
                <span
                  lang="fr"
                  className="hidden font-serif text-[17px] italic md:inline"
                >
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
          {item.sentence_ru && (
            <p className="m-0 mt-3 text-[15px] leading-5 text-muted">
              {item.sentence_ru}
            </p>
          )}
          {/* Phones: the dashed gap asks it on screen (L-ExPlayer-B); screen readers still hear it. */}
          <p className={cx(question, "max-md:sr-only md:mt-3")}>
            {item.prompt ?? CLOZE_PROMPT}
          </p>
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
          <p className="m-0 mb-4 text-[15px] leading-5 text-muted">
            {PAIRS_PROMPT}
          </p>
          {children}
        </>
      );
      break;
    case "conjugate":
      // The infinitive, then the pronouns with the gap («tu ___»), filled once answered.
      body = (
        <>
          <h2
            lang="fr"
            className={cx(
              "m-0 font-serif font-medium tracking-[-0.015em] break-words",
              conjSize(item.prompt ?? word?.fr ?? ""),
            )}
          >
            {item.prompt ?? word?.fr ?? ""}
          </h2>
          <div className="mt-3 md:mt-2">
            <ClozeLine sentence={item.sentence ?? ""} answered={answered} />
          </div>
          <p className="m-0 mt-5 text-[15px] leading-5 text-muted md:mt-1 md:leading-6">
            {CONJ_PROMPT}
          </p>
        </>
      );
      break;
  }

  return (
    <article
      aria-label={label}
      data-exercise-card={item.type}
      // The player moves focus here when the card appears (keyboard and screen-reader users).
      data-exercise-focus=""
      tabIndex={-1}
      className={cx(
        cardShell,
        "relative min-h-[220px] outline-none flex-1 max-md:[@media(max-height:740px)]:min-h-[180px] md:min-h-0 md:flex-none",
        item.type === "pairs" ? "md:min-h-[296px]" : "md:h-[296px]",
      )}
    >
      <QuestionHeader item={item} repeat={repeat} pairsCount={pairsCount} />
      <div
        className={cx(
          "flex min-h-0 flex-1 flex-col px-6 md:px-10",
          item.type === "pairs"
            ? "justify-center py-4 md:justify-start md:pt-6"
            : "justify-center pb-6 md:justify-start md:pt-8 md:pb-2",
        )}
      >
        {body}
        {/* From 768 only: on phones the ПОВТОР tag and the hollow tick say it. */}
        {repeat && (
          <p className="m-0 mt-1.5 flex items-center gap-1.5 text-[13px] leading-5 text-muted max-md:hidden">
            <Icon name="undo" size={16} strokeWidth={1.5} />
            <span>Ошиблись раньше — ещё раз</span>
          </p>
        )}
      </div>
      {stamp}
      {/* The footer from 768 only: phones keep the card for the question (L-ExPlayer-B). */}
      <div className="mx-10 hidden h-12 shrink-0 items-center gap-2 border-t border-rule font-mono text-[11px] tracking-[.06em] text-muted uppercase md:flex">
        <span className="min-w-0 truncate">
          набор: <span className="text-ink">{setTitle}</span>
        </span>
        <span className="flex-1" />
        <span className="shrink-0">из чата</span>
      </div>
    </article>
  );
}

/** The card's header: the skill label, «· 1 ИЗ 5» on a pairs board, «ПОВТОР», the slang meter right. */
function QuestionHeader({
  item,
  repeat,
  pairsCount,
}: {
  item: ExerciseItem;
  repeat: boolean;
  pairsCount?: string;
}) {
  const { label, detail } = cardLabel(item);
  const word = item.word;
  return (
    <CardHeader
      label={
        <span className="inline-flex items-center gap-2">
          <span className="font-medium text-ink uppercase">{label}</span>
          {/* Phones: the skill word only; the prompt says the direction (L-ExPlayer-B). A conjugate
              item keeps its tense: the question cannot be answered without it. */}
          {detail && (
            <span
              className={
                item.type === "conjugate" ? undefined : "max-md:hidden"
              }
            >
              · {detail}
            </span>
          )}
          {pairsCount && <span>· {pairsCount.toUpperCase()}</span>}
          {repeat && (
            <span className="inline-flex h-[18px] items-center rounded-[3px] border border-ink px-[5px] text-[10px] font-medium text-ink">
              ПОВТОР
            </span>
          )}
        </span>
      }
    >
      {word && showsMeter(item) && (
        <SlangMeter level={word.slang_level} verlan={word.verlan} />
      )}
    </CardHeader>
  );
}

// --- Phones (X-Player-B) ------------------------------------------------------------------------

/** The French word on the card a headword tap opens: the prompt when it is French, else the item's word. */
function headwordText(
  item: Pick<ExerciseItem, "type" | "prompt" | "word">,
): string {
  if (item.type === "register") return item.word?.fr ?? item.prompt ?? "";
  return item.prompt ?? item.word?.fr ?? "";
}

/** A choice prompt that reads as a paragraph (a Russian situation), not a headword. */
function isParagraph(text: string): boolean {
  return isRussian(text) && (text.length > 24 || /[.:!?…»]$/.test(text.trim()));
}

/**
 * Where the stamp lands on a phone card (X-Player-B): beside the headword when it is short enough to
 * leave the right end free (hero French up to 9 letters, a 32px Russian word up to 11, a conjugate
 * infinitive up to 14), on the second line of a cloze sentence that takes two lines with a short
 * second one (20–30 characters), else over the header's right end — never over the prompt.
 */
export function stampPlace(
  item: Pick<ExerciseItem, "type" | "prompt" | "word" | "sentence">,
): StampPlace {
  const text = headwordText(item);
  switch (item.type) {
    case "pairs":
      return "head";
    case "cloze": {
      const n = (item.sentence ?? "").replace(/\[\[|\]\]/g, "").length;
      return n >= 20 && n <= 30 ? "line2" : "head";
    }
    case "conjugate":
      return text.length <= 14 ? "line1" : "head";
    case "register":
    case "choice":
      if (isParagraph(text)) return "head";
      return text.length <= (isRussian(text) ? 11 : 9) ? "line1" : "head";
  }
}

/** «flic — разговорное «полицейский»»: the French term before the dash is set in italic Newsreader. */
export function explainParts(text: string): {
  term: string | null;
  rest: string;
} {
  const m = /^(.{1,40}?) — ([\s\S]+)$/.exec(text.trim());
  if (m && !isRussian(m[1])) return { term: m[1], rest: m[2] };
  return { term: null, rest: text.trim() };
}

/** The word a tap on the card opens: its French form (the button's name) and the handler. */
interface WordLink {
  fr: string;
  onWord: () => void;
}

/** The open-the-word button on the French word of the card (phones: the board drops «Слово ›»). */
function WordButton({
  fr,
  onWord,
  children,
}: WordLink & { children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onWord}
      aria-label={`Открыть карточку слова «${fr}»`}
      className="press-sm rounded-chip text-left"
    >
      {children}
    </button>
  );
}

const LEAD = "shrink-0 pb-0.5 font-serif text-[28px] leading-7 text-boundary";

/**
 * The ruled answer line under the headword (X-Player-B): «= ____» — a darker dashed blank — while
 * asked; once answered the wrong pick struck through in the again tone, then the right answer in
 * the good tone with ✓ on a solid ink rule. `lead` is «=» or the pronouns of a conjugate line.
 */
function AnswerLine({
  lead,
  written,
  empty,
  right,
  wrong,
}: {
  lead: ReactNode;
  written: Written | null;
  /** Before the dashes while asked (the register item's empty meter). */
  empty?: ReactNode;
  /** The right answer as written (default: the text, French in Newsreader). */
  right?: ReactNode;
  wrong?: ReactNode;
}) {
  if (!written) {
    return (
      <div className="mt-[22px] flex h-11 items-end gap-2.5">
        {lead}
        {empty}
        <span
          aria-hidden="true"
          className="mb-1 h-0 min-w-8 flex-1 border-b-[1.5px] border-dashed border-boundary"
        />
      </div>
    );
  }
  const fr = !isRussian(written.right);
  return (
    <div className="mt-[22px] flex min-h-11 items-end gap-2.5">
      {lead}
      <p className="m-0 flex min-h-10 min-w-0 flex-1 flex-wrap items-baseline gap-x-3 border-b border-ink pt-1.5 animate-[fade-in_var(--dur-quick)_var(--ease-enter)]">
        {written.wrong && (
          <>
            <span className="sr-only">Ваш ответ: </span>
            {wrong ?? (
              <s
                lang={isRussian(written.wrong) ? "ru" : "fr"}
                className={cx(
                  "text-again decoration-[1.5px]",
                  isRussian(written.wrong)
                    ? "text-[17px] leading-6"
                    : "font-serif text-[19px] leading-6",
                )}
              >
                {written.wrong}
              </s>
            )}
            <span className="sr-only">, неверно. Верный ответ: </span>
          </>
        )}
        {right ?? (
          <span
            lang={fr ? "fr" : "ru"}
            className={cx(
              "min-w-0 font-medium break-words text-good",
              fr ? "font-serif text-[26px] leading-8" : "text-[24px] leading-8",
            )}
          >
            {written.right}
          </span>
        )}
        <Icon
          name="check"
          size={20}
          strokeWidth={2}
          className="shrink-0 self-center text-good"
        />
      </p>
    </div>
  );
}

/**
 * explain_ru under the answer line, written once answered; while asked the same height stays empty
 * so nothing moves when it lands. `ruled`: a cloze card's (a hairline above, full width).
 */
function ExplainLine({
  text,
  answered,
  ruled = false,
  indent = false,
}: {
  text: string | null | undefined;
  answered: boolean;
  ruled?: boolean;
  indent?: boolean;
}) {
  if (!text) return null;
  const box = cx(
    "m-0 min-h-10 text-[15px] leading-5 text-muted",
    ruled ? "mt-5 border-t pt-3" : "mt-2.5",
    indent && "pl-[30px]",
  );
  if (!answered)
    return (
      <div
        aria-hidden="true"
        className={cx(box, ruled && "border-transparent")}
      />
    );
  const { term, rest } = explainParts(text);
  return (
    <p
      className={cx(
        box,
        ruled && "border-rule",
        "animate-[fade-in_var(--dur-quick)_var(--ease-enter)]",
      )}
    >
      {term && (
        <>
          <span lang="fr" className="font-serif text-[17px] text-ink italic">
            {term}
          </span>{" "}
          —{" "}
        </>
      )}
      {rest}
    </p>
  );
}

/** The register item's blank: the meter's four segments as empty outlines. */
const EMPTY_METER = (
  <span aria-hidden="true" className="mb-[5px] inline-flex shrink-0 gap-[2px]">
    {[0, 1, 2, 3].map((i) => (
      <span key={i} className="h-[5px] w-3.5 border border-boundary" />
    ))}
  </span>
);

/**
 * The phone question card (X-Player-B): the index card sized to its content on a small deck (the
 * player draws the edges), the headword and under it the dashed blank «= ____» where the answer is
 * written once given — the stamp beside it, then explain_ru. The French word on the card opens the
 * word sheet after the answer. Cloze: the gap in the sentence is the blank. Register: an empty meter
 * blank. Pairs: the board's rows (the player passes them as children). Conjugate: the infinitive,
 * then the pronouns with the blank, the tense in the header.
 */
function PhoneQuestionCard({
  item,
  attempt,
  answered,
  pairsCount,
  stamp,
  children,
  written = null,
  explain = null,
  onWord = null,
}: QuestionCardProps) {
  const repeat = attempt > 1;
  const word = item.word;
  const pos = word ? posAbbr(word) : null;
  const fr = word?.fr ?? headwordText(item);
  const open = answered ? onWord : null;
  const shown = answered ? written : null;
  const equals = (
    <span aria-hidden="true" className={LEAD}>
      =
    </span>
  );

  let body: ReactNode;
  switch (item.type) {
    case "choice": {
      const text = item.prompt ?? word?.fr ?? "";
      const q = skillQuestion(item);
      const frPrompt = !isRussian(text);
      body = (
        <>
          <Prompt
            text={text}
            open={open && frPrompt ? { fr, onWord: open } : null}
          />
          {q && (
            <p
              className={cx(
                "m-0 mt-3 text-[15px] leading-5 text-muted",
                selfEvident(item) && "sr-only",
              )}
            >
              {q}
            </p>
          )}
          <AnswerLine
            lead={equals}
            written={shown}
            right={
              open && !frPrompt && shown ? (
                <WordButton fr={fr} onWord={open}>
                  <span
                    lang="fr"
                    className="font-serif text-[26px] leading-8 font-medium text-good"
                  >
                    {shown.right}
                  </span>
                </WordButton>
              ) : undefined
            }
          />
          <ExplainLine text={explain} answered={answered} indent />
        </>
      );
      break;
    }
    case "cloze":
      body = (
        <>
          <ClozeLine
            sentence={item.sentence ?? ""}
            answered={answered}
            phone
            wrong={shown?.wrong ?? null}
            onWord={open}
          />
          {item.sentence_ru && (
            <p className="m-0 mt-2.5 text-[15px] leading-5 text-muted">
              {item.sentence_ru}
            </p>
          )}
          {/* The dashed gap asks it on screen; screen readers still hear it. */}
          <p className="sr-only">{item.prompt ?? CLOZE_PROMPT}</p>
          <ExplainLine text={explain} answered={answered} ruled />
        </>
      );
      break;
    case "register": {
      const level = (lv: string | null) =>
        lv === null ? -1 : (REGISTER_LEVELS as readonly string[]).indexOf(lv);
      const right = shown ? level(shown.right) : -1;
      body = (
        <>
          <Prompt
            text={word?.fr ?? item.prompt ?? ""}
            open={open ? { fr, onWord: open } : null}
          />
          {pos && (
            <span
              lang="fr"
              className="mt-1 font-serif text-[15px] leading-5 text-muted italic"
            >
              {pos}
            </span>
          )}
          {/* The empty meter asks it on screen; screen readers still hear it. */}
          <p className="sr-only">{item.prompt ?? REGISTER_PROMPT}</p>
          <AnswerLine
            lead={equals}
            written={shown}
            empty={EMPTY_METER}
            wrong={
              shown?.wrong && (
                <s
                  lang={level(shown.wrong) === 0 ? "ru" : "fr"}
                  className="font-serif text-[17px] leading-6 text-again italic decoration-[1.5px]"
                >
                  {shown.wrong}
                </s>
              )
            }
            right={
              right >= 0 && (
                <span className="inline-flex items-center gap-3 self-center">
                  <SlangMeter level={right as SlangLevel} size="lg" />
                  <span className="text-[17px] leading-6 font-medium text-good">
                    {SLANG_NAMES_RU[right]}
                  </span>
                </span>
              )
            }
          />
          <ExplainLine text={explain} answered={answered} indent />
        </>
      );
      break;
    }
    case "pairs":
      body = (
        <>
          <p className="sr-only">{PAIRS_PROMPT}</p>
          {children}
        </>
      );
      break;
    case "conjugate": {
      const parts = clozeParts(item.sentence ?? "");
      const infinitive = item.prompt ?? word?.fr ?? "";
      body = (
        <>
          <h2
            lang="fr"
            className={cx(
              "m-0 font-serif font-medium tracking-[-0.015em] break-words",
              conjSize(infinitive),
            )}
          >
            {open ? (
              <WordButton fr={fr} onWord={open}>
                {infinitive}
              </WordButton>
            ) : (
              infinitive
            )}
          </h2>
          <p className="sr-only">{CONJ_PROMPT}</p>
          {parts ? (
            <>
              <AnswerLine
                lead={
                  parts.before.trim() && (
                    <span
                      lang="fr"
                      className="shrink-0 font-serif text-[28px] leading-10"
                    >
                      {parts.before.trim()}
                    </span>
                  )
                }
                written={shown}
              />
              {parts.after.trim() && (
                <p
                  lang="fr"
                  className="m-0 mt-1 font-serif text-[28px] leading-10"
                >
                  {parts.after.trim()}
                </p>
              )}
            </>
          ) : (
            <div className="mt-3">
              <ClozeLine
                sentence={item.sentence ?? ""}
                answered={answered}
                phone
              />
            </div>
          )}
          <ExplainLine text={explain} answered={answered} />
        </>
      );
      break;
    }
  }

  return (
    <article
      aria-label={cardLabel(item).label}
      data-exercise-card={item.type}
      // The player moves focus here when the card appears (keyboard and screen-reader users).
      data-exercise-focus=""
      tabIndex={-1}
      className={cx(cardShell, "relative outline-none")}
    >
      <QuestionHeader item={item} repeat={repeat} pairsCount={pairsCount} />
      <div
        className={cx(
          "flex flex-col px-6",
          item.type === "pairs" ? "pt-4 pb-5" : "pt-[30px] pb-5",
        )}
      >
        {body}
      </div>
      {stamp}
    </article>
  );
}
