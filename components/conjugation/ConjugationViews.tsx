"use client";

// «Спряжение» as shown (mockups: canvas «Спряжение — мокапы», chosen 2026-10-22): phones get one
// card per tense — when it is used, an example from the word's own sentences and the six forms
// (variant C); desktop gets a brief block with the présent and a dialog with the full 6 × 4 table
// (variant E). Both have «Проверь себя» (variant D, placed as F4: an eye beside the pencil in the
// conjugation's header; a status strip under it): the forms hide behind blanks, a tap shows one.
// What changes from person to person (the ending, the auxiliary) is lit in red.
import { useState } from "react";
import { Button, IconButton } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { DialogChrome, Sheet } from "@/components/ui/Sheet";
import {
  CONJ_TENSE_ORDER,
  PAIRED,
  participleOf,
  TENSE_NAMES,
  TENSE_WHEN,
  tenseExample,
  tenseParts,
  type ConjTenseKey,
  type FormParts,
  type TenseExample,
} from "@/lib/core/conj-display";
import type { Conjugation } from "@/lib/types";

export type ConjSentence = { fr: string; ru: string | null };

/** «je me cass|e»: pronouns muted, the changing part in red. */
export function FormText({ parts, className }: { parts: FormParts; className?: string }) {
  return (
    <span lang="fr" className={className}>
      <span className="font-sans text-[0.85em] text-muted">{parts.pro}</span>
      <span className="font-serif">{parts.stem}</span>
      {parts.hl && <span className="font-serif text-red">{parts.hl}</span>}
      {parts.tail && <span className="font-serif">{parts.tail}</span>}
    </span>
  );
}

const keyOf = (tense: ConjTenseKey, i: number) => `${tense}:${i}`;
const ALL_KEYS = CONJ_TENSE_ORDER.flatMap((t) => [0, 1, 2, 3, 4, 5].map((i) => keyOf(t, i)));

/** «Проверь себя»: on, every form is a blank until tapped. */
export function useConjQuiz() {
  const [on, setOn] = useState(false);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  return {
    on,
    toggle: () => {
      setOn((v) => !v);
      setOpen(new Set());
    },
    shown: (key: string) => !on || open.has(key),
    reveal: (key: string) => setOpen((s) => new Set(s).add(key)),
    revealAll: () => setOpen(new Set(ALL_KEYS)),
    hideAll: () => setOpen(new Set()),
    count: open.size,
  };
}

export type Quiz = ReturnType<typeof useConjQuiz>;

/**
 * The conjugation's state where its header and its body live apart (the word card's sheet field):
 * whether all forms are open, and the quiz. Turning the quiz on opens them; closing them ends it.
 */
export function useConjugationView() {
  const quiz = useConjQuiz();
  const [expanded, setExpandedState] = useState(false);
  return {
    quiz,
    expanded,
    setExpanded: (open: boolean) => {
      setExpandedState(open);
      if (!open && quiz.on) quiz.toggle();
    },
    toggleQuiz: () => {
      if (!quiz.on) setExpandedState(true);
      quiz.toggle();
    },
  };
}

/** F4: the eye beside the pencil; pressed (ink disc) while the forms are hidden. */
export function QuizIconButton({ on, onClick, className }: { on: boolean; onClick: () => void; className?: string }) {
  return (
    <IconButton
      icon="eye-off"
      label="Проверь себя"
      title={on ? "Проверь себя — показать формы" : "Проверь себя — спрятать формы"}
      aria-pressed={on}
      iconSize={18}
      onClick={onClick}
      // IconButton's own bg-transparent / text-ink would win over the pressed colours without «!».
      className={cx("rounded-full", on ? "bg-ink! text-on-ink!" : "text-muted hoverable:bg-hover-surface hoverable:text-ink", className)}
    />
  );
}

/** Under the header while the quiz is on: «Проверь себя · открыто N из M», «Показать всё», «Выйти». */
export function QuizStatus({ quiz, total = 24, className }: { quiz: Quiz; total?: number; className?: string }) {
  if (!quiz.on) return null;
  const link = "h-9 shrink-0 bg-transparent p-0 text-[13px] font-medium text-ink underline decoration-1 underline-offset-4 pointer-coarse:h-11";
  return (
    <div className={cx("flex items-center gap-x-3.5 rounded-[6px] bg-surface-2 px-3 py-0.5", className)}>
      <p role="status" className="m-0 min-w-0 flex-1 text-[13px] leading-[18px]">
        <span className="font-medium">Проверь себя</span>
        <span className="text-muted"> · открыто {Math.min(quiz.count, total)} из {total}</span>
      </p>
      <button type="button" onClick={quiz.revealAll} className={link}>
        Показать всё
      </button>
      <button type="button" onClick={quiz.toggle} className={link}>
        Выйти
      </button>
    </div>
  );
}

/** One form, or (quiz on, not tapped yet) its pronoun and a blank that shows it. */
function QuizForm({ parts, quiz, id, className }: { parts: FormParts; quiz: Quiz; id: string; className?: string }) {
  if (quiz.shown(id)) return <FormText parts={parts} className={className} />;
  return (
    <button
      type="button"
      onClick={() => quiz.reveal(id)}
      aria-label={`Показать форму: ${parts.pro.trim() || "…"}`}
      className={cx("flex min-h-7 w-full items-center gap-1.5 bg-transparent p-0 text-left pointer-coarse:min-h-11", className)}
    >
      <span lang="fr" className="font-sans text-[0.85em] text-muted">
        {parts.pro}
      </span>
      <span aria-hidden="true" className="h-4 max-w-[96px] flex-1 border-b-[1.5px] border-dashed border-muted" />
    </button>
  );
}

/** «вспом. être · причастие cassé · remark». */
function ConjFacts({ conj, className }: { conj: Conjugation; className?: string }) {
  const participle = participleOf(conj);
  return (
    <p className={cx("m-0 text-[13px] leading-[18px] text-muted", className)}>
      вспом.{" "}
      <span lang="fr" className="font-serif text-[15px] text-ink italic">
        {conj.auxiliary}
      </span>
      {participle && (
        <>
          {" · причастие "}
          <span lang="fr" className="font-serif text-[15px] text-ink italic">
            {participle}
          </span>
        </>
      )}
      {conj.remark && ` · ${conj.remark}`}
    </p>
  );
}

/** The sentence with the form underlined. */
function ExampleLine({ example, className }: { example: TenseExample; className?: string }) {
  const { fr, at, length } = example;
  return (
    <figure className={cx("m-0 rounded-[6px] bg-surface-2 px-3 py-2", className)}>
      <blockquote lang="fr" className="m-0 font-serif text-[16px] leading-[22px] italic">
        {fr.slice(0, at)}
        <span className="font-medium not-italic underline decoration-1 underline-offset-4">{fr.slice(at, at + length)}</span>
        {fr.slice(at + length)}
      </blockquote>
      {example.ru && <figcaption className="mt-0.5 text-[13px] leading-[18px] text-muted">{example.ru}</figcaption>}
    </figure>
  );
}

// ---------------------------------------------------------------------------------------------
// Phones (variant C): a card per tense.

/** Its header (with the eye) is the caller's; the quiz state comes from there. */
export function ConjugationCards({ conj, sentences = [], quiz, className }: { conj: Conjugation; sentences?: readonly ConjSentence[]; quiz: Quiz; className?: string }) {
  return (
    <div className={cx("flex flex-col gap-3", className)}>
      <ConjFacts conj={conj} />
      {CONJ_TENSE_ORDER.map((tense) => {
        const parts = tenseParts(conj.tenses[tense], tense);
        const example = quiz.on ? null : tenseExample(conj.tenses[tense], sentences);
        return (
          <article key={tense} aria-label={TENSE_NAMES[tense]} className="flex flex-col gap-2.5 rounded-card border border-rule bg-surface px-3.5 pt-3 pb-2.5">
            <header className="flex items-baseline justify-between gap-3">
              <h3 lang="fr" className="m-0 font-serif text-[19px] leading-6 font-medium">
                {TENSE_NAMES[tense]}
              </h3>
              <span className="text-right text-[13px] leading-[18px] text-muted">{TENSE_WHEN[tense]}</span>
            </header>
            {example && <ExampleLine example={example} />}
            <ul className="m-0 grid list-none grid-cols-2 gap-x-3.5 p-0">
              {PAIRED.map((i) => (
                <li key={i} className="flex min-h-8 items-center border-b border-surface-2 py-1 text-[17px] leading-[22px]">
                  <QuizForm parts={parts[i]} quiz={quiz} id={keyOf(tense, i)} />
                </li>
              ))}
            </ul>
          </article>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Desktop (variant E): the présent in the narrow pane or rail, the full table in a dialog.

/** The pane's or rail's block: facts, the présent in two columns, «Таблица спряжения». */
export function ConjugationBrief({
  conj,
  sentences = [],
  word,
  quiz,
  className,
}: {
  conj: Conjugation;
  sentences?: readonly ConjSentence[];
  /** The headword, for the dialog's title. */
  word: string;
  /** Shared with the dialog: the eye in the caller's header and the one in the dialog are the same. */
  quiz: Quiz;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const parts = tenseParts(conj.tenses.present, "present");
  return (
    <div className={cx("flex flex-col", className)}>
      <QuizStatus quiz={quiz} className="mb-2" />
      <ConjFacts conj={conj} />
      <p className="meta m-0 mt-2">{TENSE_NAMES.present}</p>
      <ul className="m-0 grid list-none grid-cols-2 gap-x-4 p-0">
        {PAIRED.map((i) => (
          <li key={i} className="flex min-h-7 items-center border-b border-surface-2 py-0.5 text-[16px] leading-5">
            <QuizForm parts={parts[i]} quiz={quiz} id={keyOf("present", i)} />
          </li>
        ))}
      </ul>
      <Button variant="tertiary" size="sm" className="mt-1 -ml-0.5 h-9 self-start px-0 text-[14px]" onClick={() => setOpen(true)}>
        Таблица спряжения — 4 времени
      </Button>
      <ConjugationTableDialog open={open} onOpenChange={setOpen} conj={conj} sentences={sentences} word={word} quiz={quiz} />
    </div>
  );
}

/** Variant E: facts, the 6 × 4 table (pronouns, red changes, a darker rule before the plural), an example. */
export function ConjugationTableDialog({
  open,
  onOpenChange,
  conj,
  sentences,
  word,
  quiz,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conj: Conjugation;
  sentences: readonly ConjSentence[];
  word: string;
  quiz: Quiz;
}) {
  const parts = Object.fromEntries(CONJ_TENSE_ORDER.map((t) => [t, tenseParts(conj.tenses[t], t)])) as Record<ConjTenseKey, FormParts[]>;
  let example: (TenseExample & { tense: ConjTenseKey }) | null = null;
  for (const t of CONJ_TENSE_ORDER) {
    const found = tenseExample(conj.tenses[t], sentences);
    if (found) {
      example = { ...found, tense: t };
      break;
    }
  }
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Спряжение: ${word}`}
      dialogWidth={800}
      header={
        <DialogChrome
          label="Спряжение"
          actions={<QuizIconButton on={quiz.on} onClick={quiz.toggle} className="md:size-8" />}
          title={<span lang="fr">{word}</span>}
        />
      }
    >
      <div className="flex flex-col gap-3 px-6 pt-4 pb-6">
        <QuizStatus quiz={quiz} />
        <ConjFacts conj={conj} />
        <table lang="fr" className="w-full table-fixed border-collapse">
          <caption className="sr-only">Спряжение {word} в четырёх временах</caption>
          <thead>
            <tr>
              {CONJ_TENSE_ORDER.map((t) => (
                <th key={t} scope="col" className="pr-3 pb-1.5 text-left align-bottom">
                  <span className="block font-serif text-[17px] leading-6 font-medium">{TENSE_NAMES[t]}</span>
                  <span lang="ru" className="block text-[12px] leading-4 font-normal text-muted">
                    {TENSE_WHEN[t]}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <tr key={i} className={cx("border-t", i === 0 ? "border-rule" : i === 3 ? "border-ink" : "border-surface-2")}>
                {CONJ_TENSE_ORDER.map((t) => (
                  <td key={t} className="py-2 pr-3 align-top text-[17px] leading-[22px]">
                    <QuizForm parts={parts[t][i]} quiz={quiz} id={keyOf(t, i)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {example && !quiz.on && (
          <div className="flex items-baseline gap-3">
            <span className="meta shrink-0">{TENSE_NAMES[example.tense]}</span>
            <ExampleLine example={example} className="flex-1" />
          </div>
        )}
        <p className="m-0 text-[12px] leading-4 text-muted">Красным — что меняется от лица к лицу.</p>
      </div>
    </Sheet>
  );
}
