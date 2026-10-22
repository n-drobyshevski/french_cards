import { describe, expect, it } from "vitest";
import { buildWord } from "@/lib/core/words";
import { conjDraftError, draftOf, isDirty, patchFor, undoFor, withConjugationDraft } from "./word-editor";

const word = buildWord({ fr: "relou", ru: "занудный", pos: "adj" }, new Date("2026-10-22T10:00:00Z"));

describe("word editor: origin", () => {
  it("drafts, patches and undoes the origin", () => {
    const draft = { ...draftOf(word, []), origin: "верлан от lourd" };
    expect(draftOf(word, []).origin).toBe("");
    expect(isDirty(word, "origin", draftOf(word, []))).toBe(false);
    expect(isDirty(word, "origin", draft)).toBe(true);
    const patch = patchFor("origin", draft);
    expect(patch).toEqual({ origin: "верлан от lourd" });
    expect(undoFor(word, patch)).toEqual({ origin: null });
    const saved = { ...word, origin: "верлан от lourd" };
    expect(isDirty(saved, "origin", { ...draft, origin: " верлан от lourd " })).toBe(false);
  });
});

describe("word editor: conjugation", () => {
  const verb = buildWord({ fr: "kiffer", ru: "тащиться", pos: "verb" }, new Date("2026-10-22T10:00:00Z"));
  const six = (v: string) => [`je ${v}`, `tu ${v}`, `il ${v}`, `nous ${v}`, `vous ${v}`, `ils ${v}`];
  const builtin = { auxiliary: "avoir" as const, remark: null, tenses: { present: six("kiffe"), passe_compose: six("a kiffé"), imparfait: six("kiffait"), futur: six("kiffera") } };

  it("an untouched copy of the dictionary's forms is no change; an edit is", () => {
    const draft = withConjugationDraft(draftOf(verb, []), builtin);
    expect(isDirty(verb, "conjugation", draft)).toBe(false);
    const edited = { ...draft, conjugation: { ...draft.conjugation, tenses: { ...draft.conjugation.tenses, present: ["j'kiffe", ...six("kiffe").slice(1)] } } };
    expect(isDirty(verb, "conjugation", edited)).toBe(true);
    expect(patchFor("conjugation", edited)).toEqual({ conjugation: { auxiliary: "avoir", remark: null, tenses: { ...builtin.tenses, present: ["j'kiffe", ...six("kiffe").slice(1)] } } });
    expect(undoFor(verb, patchFor("conjugation", edited))).toEqual({ conjugation: null });
  });

  it("an empty form starts with six blanks per tense and asks for every form", () => {
    const draft = draftOf(verb, []);
    expect(draft.conjugation.tenses.futur).toEqual(["", "", "", "", "", ""]);
    expect(conjDraftError(draft.conjugation)).toBe("Заполните формы спряжения");
    const filled = withConjugationDraft(draft, builtin).conjugation;
    expect(conjDraftError(filled)).toBeNull();
    expect(conjDraftError({ ...filled, tenses: { ...filled.tenses, futur: ["", "", ...six("kiffera").slice(2)] } })).toBe("Заполните все формы — не хватает 2");
  });
});

describe("«+ Поле» kinds", () => {
  it("offers «Спряжение» only for a verb with no conjugation anywhere; shows the field when there is one", async () => {
    const { offersConjugation, conjugationShown } = await import("./WordConjugation");
    const six = (v: string) => [`je ${v}`, `tu ${v}`, `il ${v}`, `nous ${v}`, `vous ${v}`, `ils ${v}`];
    const conj = { auxiliary: "avoir" as const, remark: null, tenses: { present: six("x"), passe_compose: six("a x"), imparfait: six("x"), futur: six("x") } };
    const verb = buildWord({ fr: "bédave", ru: "курить", pos: "verb" }, new Date());
    const noun = buildWord({ fr: "la thune", ru: "бабки", pos: "noun" }, new Date());
    expect(offersConjugation(verb, null)).toBe(true);
    expect(offersConjugation(verb, undefined)).toBe(false); // still loading
    expect(offersConjugation(verb, conj)).toBe(false);
    expect(offersConjugation({ ...verb, conjugation: conj }, null)).toBe(false);
    expect(offersConjugation(noun, null)).toBe(false);
    expect(conjugationShown(verb, null, null)).toBe(false);
    expect(conjugationShown(verb, null, "conjugation")).toBe(true);
    expect(conjugationShown(verb, conj, null)).toBe(true);
    expect(conjugationShown(noun, conj, null)).toBe(false);
  });
});
