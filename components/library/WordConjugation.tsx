"use client";

// «Спряжение» in the word's view (the phone sheet and the desktop pane): a one-line présent preview
// with where it comes from («своё» — saved on the word by hand or from the chat; «из словаря» —
// built on the device from Lexique), and the form that edits the four tenses.
import { useEffect, useState } from "react";
import { TENSE_NAMES } from "@/components/context/data";
import { useUndoSnackbar } from "@/components/library/undo";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { autofillConjugation } from "@/lib/autofill";
import { loadConjData } from "@/lib/conjugation";
import { cleanConjugation, conjugate } from "@/lib/core/conjugate";
import type { Conjugation, Word } from "@/lib/types";
import { updateWord } from "@/lib/words";
import { AutoFillButton } from "./AutoFill";
import { CONJ_TENSE_KEYS, conjDraftOf, type ConjDraft } from "./word-editor";

const PERSONS = ["je", "tu", "il", "nous", "vous", "ils"] as const;

/** The field shows when there is a conjugation to show (the word's own or the dictionary's), or while it is edited. */
export const conjugationShown = (
  word: Pick<Word, "pos" | "conjugation">,
  builtin: Conjugation | null | undefined,
  editing: string | null,
) => editing === "conjugation" || !!cleanConjugation(word.conjugation) || ((word.pos === "verb" || word.pos === "expression") && !!builtin);

/** «+ Поле» offers «Спряжение» for a verb that has none (neither its own nor the dictionary's). */
export const offersConjugation = (word: Pick<Word, "pos" | "conjugation">, builtin: Conjugation | null | undefined) =>
  word.pos === "verb" && !cleanConjugation(word.conjugation) && builtin === null;

/** The conjugation built on the device from Lexique; undefined while the table loads. */
export function useBuiltinConjugation(word: Pick<Word, "fr" | "pos">): Conjugation | null | undefined {
  const [state, setState] = useState<{ fr: string; conj: Conjugation | null } | null>(null);
  const wanted = word.pos === "verb" || word.pos === "expression";
  useEffect(() => {
    if (!wanted) return;
    let live = true;
    void loadConjData().then((data) => live && setState({ fr: word.fr, conj: conjugate(word.fr, data) }));
    return () => {
      live = false;
    };
  }, [word.fr, wanted]);
  if (!wanted) return null;
  return state?.fr === word.fr ? state.conj : undefined;
}

/** «je kiffe · tu kiffes · il kiffe…» with «своё» / «из словаря», or «Нет спряжения». */
export function ConjugationPreview({ saved, builtin, size }: { saved: Conjugation | null; builtin: Conjugation | null | undefined; size: "sheet" | "pane" }) {
  const conj = saved ?? builtin;
  const text = size === "sheet" ? "text-[15px] leading-[22px]" : "text-[14px] leading-5";
  if (!conj) {
    return <span className={cx(text, "text-muted")}>{builtin === undefined ? "…" : "Нет спряжения — можно заполнить"}</span>;
  }
  return (
    <span className="flex flex-col gap-0.5">
      <span lang="fr" className={cx(text, "font-serif")}>
        {conj.tenses.present.slice(0, 3).join(" · ")}…
      </span>
      <span className="meta">{saved ? "своё" : "из словаря"} · {conj.auxiliary}</span>
    </span>
  );
}

/**
 * Four tenses × six forms and the auxiliary; «Вернуть из словаря» when the word has its own, and
 * «Заполнить автоматически» when the dictionary does not know the verb.
 */
export function ConjugationForm({
  draft,
  onChange,
  word,
  onReset,
  autofill = false,
  size,
}: {
  draft: ConjDraft;
  onChange: (next: ConjDraft) => void;
  /** The saved word, or the add form's draft (no id: no «Вернуть из словаря»). */
  word: Pick<Word, "fr" | "ru" | "pos"> & Partial<Pick<Word, "id" | "conjugation">>;
  /** After «Вернуть из словаря» (the form closes). */
  onReset?: () => void;
  /** Offer «Заполнить автоматически» (/api/ai/fill): the dictionary has no conjugation for the verb. */
  autofill?: boolean;
  size: "sheet" | "pane";
}) {
  const showUndo = useUndoSnackbar();
  const own = cleanConjugation(word.conjugation);
  const input =
    size === "sheet"
      ? "h-10 w-full rounded-chip border border-rule bg-surface px-2.5 font-serif text-[16px] text-ink outline-none placeholder:text-muted focus:border-ink"
      : "h-8 w-full rounded-chip border border-rule bg-surface px-2 font-serif text-[15px] text-ink outline-none placeholder:text-muted focus:border-ink";
  const setForm = (tense: (typeof CONJ_TENSE_KEYS)[number], i: number, value: string) =>
    onChange({ ...draft, tenses: { ...draft.tenses, [tense]: draft.tenses[tense].map((f, j) => (j === i ? value : f)) } });

  const reset = async () => {
    const id = word.id;
    if (!id) return;
    const before = word.conjugation ?? null;
    await updateWord(id, { conjugation: null });
    onReset?.();
    showUndo({ message: "Спряжение из словаря", undo: () => void updateWord(id, { conjugation: before }).catch(() => {}) });
  };

  return (
    <div className="mt-1 flex flex-col gap-3">
      {autofill && <AutoFillButton fill={(o) => autofillConjugation(word, o)} onFill={(c) => onChange(conjDraftOf(c))} />}
      <div role="radiogroup" aria-label="Вспомогательный глагол" className="flex items-center gap-1.5">
        <span className="meta mr-1">Вспом. глагол</span>
        {(["avoir", "être"] as const).map((aux) => (
          <button
            key={aux}
            type="button"
            role="radio"
            aria-checked={draft.auxiliary === aux}
            onClick={() => onChange({ ...draft, auxiliary: aux })}
            lang="fr"
            className={cx(
              "h-8 rounded-chip border px-2.5 font-serif text-[15px]",
              draft.auxiliary === aux ? "border-ink bg-ink text-on-ink" : "border-rule bg-surface text-ink hoverable:border-ink",
            )}
          >
            {aux}
          </button>
        ))}
      </div>
      <div className={cx("grid gap-x-4 gap-y-3", size === "pane" ? "grid-cols-2" : "grid-cols-1 min-[420px]:grid-cols-2")}>
        {CONJ_TENSE_KEYS.map((tense) => (
          <fieldset key={tense} className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
            <legend className="meta mb-1 p-0">{TENSE_NAMES[tense]}</legend>
            {draft.tenses[tense].map((form, i) => (
              <input
                key={i}
                lang="fr"
                aria-label={`${TENSE_NAMES[tense]}, ${PERSONS[i]}`}
                value={form}
                placeholder={PERSONS[i]}
                maxLength={80}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                onChange={(e) => setForm(tense, i, e.target.value)}
                className={input}
              />
            ))}
          </fieldset>
        ))}
      </div>
      {own && word.id && (
        <Button type="button" variant="tertiary" size="sm" className="self-start text-[13px]" onClick={() => void reset()}>
          Вернуть из словаря
        </Button>
      )}
    </div>
  );
}
