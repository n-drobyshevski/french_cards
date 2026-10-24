import { describe, expect, it } from "vitest";
import { buildWord } from "@/lib/core/words";
import { conjDraftError, draftOf, isDirty, levelPatch, patchFor, undoFor, withConjugationDraft } from "./word-editor";

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

describe("word editor: «Уровень языка»", () => {
  const at = new Date("2026-10-22T10:00:00Z");
  const plain = buildWord({ fr: "la démarche", ru: "процедура", pos: "noun" }, at);
  const mine = { ...plain, cefr: "B1" as const, cefr_source: "user" as const };
  const claude = { ...plain, cefr: "B2" as const, cefr_source: "chat" as const };

  it("«Авто» is checked unless the user set the level; an untouched choice saves nothing", () => {
    expect(draftOf(plain, []).cefr).toBe("auto");
    expect(draftOf(claude, []).cefr).toBe("auto");
    expect(draftOf(mine, []).cefr).toBe("B1");
    for (const w of [plain, claude, mine]) {
      expect(levelPatch(draftOf(w, []))).toEqual({});
      expect(isDirty(w, "level", draftOf(w, []))).toBe(false);
      expect(isDirty(w, "entry", draftOf(w, []))).toBe(false);
    }
  });

  it("a pick is the user's level, also over Claude's same level; «Авто» over the user's clears it", () => {
    const pick = { ...draftOf(claude, []), cefr: "B2" as const };
    expect(patchFor("level", pick)).toEqual({ cefr: "B2", cefr_source: "user" });
    expect(isDirty(claude, "level", pick)).toBe(true);
    expect(patchFor("entry", pick)).toMatchObject({ fr: "la démarche", cefr: "B2", cefr_source: "user" });
    const auto = { ...draftOf(mine, []), cefr: "auto" as const };
    expect(patchFor("level", auto)).toEqual({ cefr: null, cefr_source: null });
    expect(undoFor(mine, patchFor("level", auto))).toEqual({ cefr: "B1", cefr_source: "user" });
  });

  it("undo on a row from before the level columns puts no level back", () => {
    const old = { ...plain } as Partial<typeof plain>;
    delete old.cefr;
    delete old.cefr_source;
    const patch = patchFor("level", { ...draftOf(old as typeof plain, []), cefr: "A2" });
    expect(undoFor(old as typeof plain, patch)).toEqual({ cefr: null, cefr_source: null });
  });
});
