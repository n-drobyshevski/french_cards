import { describe, expect, it } from "vitest";
import type { LookupResponse } from "./ai/schemas";
import { mergeExamples } from "./context";
import { parseTatoeba, requestTatoeba, tatoebaHit, tatoebaQuery } from "./tatoeba";

const base: Pick<LookupResponse, "fr" | "pos" | "conjugation"> = { fr: "kiffer", pos: "verb", conjugation: null };
const present = (forms: string[]) => ({ auxiliary: "avoir" as const, remark: null, tenses: { present: forms, passe_compose: [], imparfait: [], futur: [] } });

describe("tatoebaQuery", () => {
  it("one word as it is, without its article or «se»", () => {
    expect(tatoebaQuery(base)).toBe("kiffer");
    expect(tatoebaQuery({ ...base, fr: "la thune", pos: "noun" })).toBe("thune");
    expect(tatoebaQuery({ ...base, fr: "l'oseille", pos: "noun" })).toBe("oseille");
    expect(tatoebaQuery({ ...base, fr: "se casser" })).toBe("casser");
  });

  it("a verb expression: any present form plus the other words", () => {
    const conj = present(["je fais gaffe", "tu fais gaffe", "il fait gaffe", "nous faisons gaffe", "vous faites gaffe", "ils font gaffe"]);
    expect(tatoebaQuery({ fr: "faire gaffe", pos: "expression", conjugation: conj })).toBe("faire|fais|fait|faisons|faites|font gaffe");
    const flemme = present(["j'ai la flemme", "tu as la flemme", "il a la flemme", "nous avons la flemme", "vous avez la flemme", "ils ont la flemme"]);
    expect(tatoebaQuery({ fr: "avoir la flemme", pos: "expression", conjugation: flemme })).toBe("avoir|ai|as|a|avons|avez|ont flemme");
  });

  it("other expressions: their content words", () => {
    expect(tatoebaQuery({ fr: "c'est relou", pos: "expression", conjugation: null })).toBe("c'est relou");
  });
});

describe("tatoebaHit", () => {
  it("finds the word form in the sentence", () => {
    expect(tatoebaHit("Tu kiffes le café ?", "kiffer")).toBe("kiffes");
    expect(tatoebaHit("Il est pété de thune.", "la thune")).toBe("thune");
    expect(tatoebaHit("Il s'est cassé hier.", "se casser")).toBe("cassé");
    expect(tatoebaHit("Rien à voir.", "kiffer")).toBe("");
  });
});

const sentence = (id: number, text: string, translations: unknown[], extra: Record<string, unknown> = {}) => ({ id, text, lang: "fra", is_unapproved: false, translations, ...extra });
const rus = (text: string, is_direct = true) => ({ text, lang: "rus", is_direct, is_unapproved: false });

describe("parseTatoeba", () => {
  it("keeps sentences with a Russian translation, direct ones first, without repeats", () => {
    const rows = parseTatoeba(
      {
        data: [
          sentence(1, "Il te kiffe.", [rus("Он тебя любит.", false), rus("Ты ему нравишься.")]),
          sentence(2, "Il te kiffe !", [rus("x")]),
          sentence(3, "Tu kiffes le café ?", [[{ text: "Do you like coffee?", lang: "eng" }], [rus("Вам нравится кофе?")]]),
          sentence(4, "Kiffe.", [rus("y")]),
          sentence(5, "Elle kiffe.", [{ text: "She likes it.", lang: "eng" }]),
          sentence(6, "On kiffe.", [rus("z")], { is_unapproved: true }),
        ],
      },
      "kiffer",
    );
    expect(rows).toEqual([
      { fr: "Il te kiffe.", ru: "Ты ему нравишься.", hit: "kiffe", meaning: null, kind: "tatoeba", url: "https://tatoeba.org/ru/sentences/show/1", domain: "tatoeba.org", title: null },
      { fr: "Tu kiffes le café ?", ru: "Вам нравится кофе?", hit: "kiffes", meaning: null, kind: "tatoeba", url: "https://tatoeba.org/ru/sentences/show/3", domain: "tatoeba.org", title: null },
    ]);
    expect(parseTatoeba({ error: "x" }, "kiffer")).toEqual([]);
  });

  it("requestTatoeba asks for Russian translations", async () => {
    let url = "";
    const fetchImpl = (async (u: string) => {
      url = u;
      return new Response(JSON.stringify({ data: [sentence(1, "Il te kiffe.", [rus("Ты ему нравишься.")])] }));
    }) as unknown as typeof fetch;
    const r = await requestTatoeba(base, { fetchImpl });
    expect(new URL(url).searchParams.get("trans:lang")).toBe("rus");
    expect(new URL(url).searchParams.get("q")).toBe("kiffer");
    expect(r).toMatchObject({ sources: 1, web: false });
  });
});

describe("mergeExamples", () => {
  it("Tatoeba first, the web's new sentences after", () => {
    const t = parseTatoeba({ data: [sentence(1, "Il te kiffe.", [rus("Ты ему нравишься.")])] }, "kiffer");
    const web = { examples: [{ ...t[0], kind: "forum" as const, url: "https://f.fr" }, { ...t[0], fr: "On a kiffé la soirée.", kind: "forum" as const }], sources: 4 };
    const merged = mergeExamples({ examples: t, sources: 1, web: false }, web);
    expect(merged.examples.map((e) => e.fr)).toEqual(["Il te kiffe.", "On a kiffé la soirée."]);
    expect(merged).toMatchObject({ sources: 5, web: true });
  });
});
