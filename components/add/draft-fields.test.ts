import { describe, expect, it } from "vitest";
import { canAddField, draftFieldsSummary, draftFieldValue, draftToSaveRequest, hasErrors, manualDraft, prefilledDraft, validateDraft, withDraftField } from "./draft";

const SYN = { id: "syn", name: "Синонимы" };
const PRON = { id: "pron", name: "Произношение" };

describe("«Свои поля» in the add form", () => {
  it("a new draft has no fields and saves none", () => {
    const d = manualDraft({ fr: "la thune", ru: "бабки" });
    expect(d.customFields).toEqual([]);
    expect(draftToSaveRequest(d).words[0].custom_fields).toEqual([]);
  });

  it("keeps values as typed while editing and drops a field emptied again", () => {
    let list = withDraftField([], SYN, "le fric ");
    expect(draftFieldValue({ customFields: list }, SYN)).toBe("le fric ");
    list = withDraftField(list, PRON, "[tyn]");
    list = withDraftField(list, SYN, "le fric, l'oseille");
    expect(list.map((f) => f.field_id)).toEqual(["syn", "pron"]);
    list = withDraftField(list, PRON, "");
    expect(list).toEqual([{ field_id: "syn", label: "Синонимы", value: "le fric, l'oseille" }]);
    expect(draftFieldValue({ customFields: list }, PRON)).toBe("");
  });

  it("cleans the values into the save request", () => {
    const d = {
      ...manualDraft({ fr: "la thune", ru: "бабки" }),
      customFields: withDraftField(withDraftField([], SYN, "  le  fric "), PRON, "   "),
    };
    expect(draftToSaveRequest(d).words[0].custom_fields).toEqual([{ field_id: "syn", label: "Синонимы", value: "le fric" }]);
  });

  it("summarises the collapsed row", () => {
    expect(draftFieldsSummary({ customFields: [] }, [SYN, PRON])).toBe("Синонимы, Произношение");
    expect(draftFieldsSummary({ customFields: withDraftField([], PRON, "[tyn]") }, [SYN, PRON])).toBe("заполнено 1 из 2");
  });
});

describe("«+ Поле» in the add form", () => {
  const six = (s: string) => Array.from({ length: 6 }, (_, i) => `${s}${i}`);
  const conj = { auxiliary: "avoir" as const, remark: null, tenses: { present: six("p"), passe_compose: six("c"), imparfait: six("i"), futur: six("f") } };

  it("saves the origin, a full conjugation and the one-off fields", () => {
    const d = {
      ...manualDraft({ fr: "pécho", ru: "склеить" }),
      customFields: withDraftField([], SYN, "choper"),
      origin: "  верлан от  choper ",
      originShown: true,
      conjugation: conj,
      extraFields: [
        { label: " Где услышал ", value: " в клипе " },
        { label: "", value: "" },
      ],
    };
    expect(validateDraft(d)).toEqual({});
    const [w] = draftToSaveRequest(d).words;
    expect(w.origin).toBe("верлан от choper");
    expect(w.conjugation).toEqual(conj);
    expect(w.custom_fields).toEqual([
      { field_id: "syn", label: "Синонимы", value: "choper" },
      { field_id: null, label: "Где услышал", value: "в клипе" },
    ]);
  });

  it("a half-filled conjugation or a nameless field waits; an empty conjugation is dropped", () => {
    const base = manualDraft({ fr: "pécho", ru: "склеить" });
    const half = { ...conj, tenses: { ...conj.tenses, futur: ["", ...six("f").slice(1)] } };
    const errors = validateDraft({ ...base, conjugation: half, extraFields: [{ label: " ", value: "x" }] });
    expect(errors).toEqual({ conjugation: "Заполните все формы — не хватает 1", fields: "Дайте полю название" });
    expect(hasErrors(errors)).toBe(true);
    const blank = () => ["", "", "", "", "", ""];
    const empty = { ...conj, tenses: { present: blank(), passe_compose: blank(), imparfait: blank(), futur: blank() } };
    expect(validateDraft({ ...base, conjugation: empty })).toEqual({});
    expect(draftToSaveRequest({ ...base, conjugation: empty }).words[0].conjugation).toBeNull();
  });

  it("a word from «Контекст» brings its origin along", () => {
    const d = prefilledDraft({ fr: "chelou", ru: "стрёмный", origin: "верлан от louche" });
    expect(d).toMatchObject({ origin: "верлан от louche", originShown: true });
    expect(prefilledDraft({ fr: "chelou", ru: "стрёмный", origin: null })).toMatchObject({ origin: "", originShown: false });
  });

  it("caps the fields at 12 together with the shared ones", () => {
    const d = { ...manualDraft(), customFields: withDraftField([], SYN, "x"), extraFields: Array.from({ length: 10 }, () => ({ label: "a", value: "b" })) };
    expect(canAddField(d)).toBe(true);
    expect(canAddField({ ...d, extraFields: [...d.extraFields, { label: "", value: "" }] })).toBe(false);
  });
});
