import { describe, expect, it } from "vitest";
import { FIELD_VALUE_MAX } from "@/lib/core/custom-fields";
import { fieldRefMap, finalizeCustom, finalizeEnrichment } from "./enrich";
import type { EnrichmentItemModel } from "./schemas";

const words = [{ id: "word-a" }, { id: "word-b" }];
const fields = [{ id: "def-syn" }, { id: "def-ipa" }];

function item(ref: string, extra: Partial<EnrichmentItemModel> = {}): EnrichmentItemModel {
  return {
    ref,
    pos: "adj",
    gender: "f",
    slang_level: "arg",
    verlan: true,
    example_fr: "Il est chelou, ton pote.",
    example_ru: "Стрёмный у тебя кореш.",
    confidence: "high",
    ...extra,
  };
}

describe("finalizeCustom", () => {
  it("maps refs to ids; drops unknown refs, repeats, null, empty and placeholder values; cuts long ones", () => {
    const refs = fieldRefMap(fields);
    expect([...refs]).toEqual([
      ["f1", "def-syn"],
      ["f2", "def-ipa"],
    ]);
    const out = finalizeCustom(
      [
        { field: " f1 ", value: "  louche,\n bizarre " },
        { field: "f1", value: "again" },
        { field: "f2", value: null },
        { field: "f3", value: "ghost" },
      ],
      refs,
    );
    expect(out).toEqual([{ id: "def-syn", value: "louche, bizarre" }]);
    expect(
      finalizeCustom(
        [
          { field: "f2", value: "—" },
          { field: "f1", value: "null" },
        ],
        refs,
      ),
    ).toEqual([]);
    expect(finalizeCustom([{ field: "f2", value: "x".repeat(400) }], refs)[0].value).toHaveLength(FIELD_VALUE_MAX);
    expect(finalizeCustom(undefined, refs)).toEqual([]);
  });
});

describe("finalizeEnrichment", () => {
  it("fills custom per word from the fields sent; empty without them", () => {
    const out = finalizeEnrichment(
      {
        items: [
          item("w1", {
            custom: [
              { field: "f1", value: "louche, bizarre" },
              { field: "f2", value: "[ʃəlu]" },
            ],
          }),
          item("w2", { custom: [{ field: "f2", value: null }] }),
        ],
      },
      words,
      null,
      fields,
    );
    expect(out.map((r) => [r.id, r.custom])).toEqual([
      [
        "word-a",
        [
          { id: "def-syn", value: "louche, bizarre" },
          { id: "def-ipa", value: "[ʃəlu]" },
        ],
      ],
      ["word-b", []],
    ]);
    // No fields sent: refs the model made up are not mapped.
    const none = finalizeEnrichment({ items: [item("w1", { custom: [{ field: "f1", value: "louche" }] })] }, words);
    expect(none[0].custom).toEqual([]);
  });
});
