import { describe, expect, it } from "vitest";
import { draftFieldsSummary, draftFieldValue, draftToSaveRequest, manualDraft, withDraftField } from "./draft";

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
