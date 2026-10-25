import { describe, expect, it } from "vitest";
import type { Conjugation } from "../types";
import { participleOf, splitForm, tenseExample, tenseParts } from "./conj-display";

const P = ["je me", "tu te", "il se", "nous nous", "vous vous", "ils se"];
const SE_CASSER: Conjugation = {
  auxiliary: "être",
  remark: null,
  tenses: {
    present: ["casse", "casses", "casse", "cassons", "cassez", "cassent"].map((v, i) => `${P[i]} ${v}`),
    passe_compose: ["je me suis cassé", "tu t'es cassé", "il s'est cassé", "nous nous sommes cassés", "vous vous êtes cassés", "ils se sont cassés"],
    imparfait: ["cassais", "cassais", "cassait", "cassions", "cassiez", "cassaient"].map((v, i) => `${P[i]} ${v}`),
    futur: ["casserai", "casseras", "cassera", "casserons", "casserez", "casseront"].map((v, i) => `${P[i]} ${v}`),
  },
};
const join = (p: { pro: string; stem: string; hl: string; tail: string }) => `${p.pro}${p.stem}[${p.hl}]${p.tail}`;

describe("conjugation display", () => {
  it("splits subject and reflexive pronouns, elided ones too", () => {
    expect(splitForm("tu te casses")).toEqual({ pro: "tu te ", verb: "casses" });
    expect(splitForm("tu t'es cassé")).toEqual({ pro: "tu t'", verb: "es cassé" });
    expect(splitForm("j’aime")).toEqual({ pro: "j’", verb: "aime" });
    expect(splitForm("nous cassons")).toEqual({ pro: "nous ", verb: "cassons" });
    // Slash-joined subjects, as textbooks write them.
    expect(splitForm("il/elle/on kiffe")).toEqual({ pro: "il/elle/on ", verb: "kiffe" });
    expect(splitForm("il/on se casse")).toEqual({ pro: "il/on se ", verb: "casse" });
    expect(splitForm("elles/ils kiffent")).toEqual({ pro: "elles/ils ", verb: "kiffent" });
  });

  it("lights the endings of a simple tense and the auxiliary of the passé composé", () => {
    expect(tenseParts(SE_CASSER.tenses.present, "present").map(join)).toEqual([
      "je me cass[e]",
      "tu te cass[es]",
      "il se cass[e]",
      "nous nous cass[ons]",
      "vous vous cass[ez]",
      "ils se cass[ent]",
    ]);
    expect(tenseParts(SE_CASSER.tenses.futur, "futur").map(join)[5]).toBe("ils se casser[ont]");
    expect(tenseParts(SE_CASSER.tenses.passe_compose, "passe_compose").map(join)).toEqual([
      "je me [suis] cassé",
      "tu t'[es] cassé",
      "il s'[est] cassé",
      "nous nous [sommes] cassés",
      "vous vous [êtes] cassés",
      "ils se [sont] cassés",
    ]);
    expect(participleOf(SE_CASSER)).toBe("cassé");
  });

  it("lights nothing when the forms share no stem, and keeps an expression's words plain", () => {
    const etre = ["je suis", "tu es", "il est", "nous sommes", "vous êtes", "ils sont"];
    expect(tenseParts(etre, "present").map(join)).toEqual(["je suis[]", "tu es[]", "il est[]", "nous sommes[]", "vous êtes[]", "ils sont[]"]);
    const flemme = ["j'ai la flemme", "tu as la flemme", "il a la flemme", "nous avons la flemme", "vous avez la flemme", "ils ont la flemme"];
    expect(tenseParts(flemme, "present").map(join)[3]).toBe("nous avons[] la flemme");
    const galerer = ["je galère", "tu galères", "il galère", "nous galérons", "vous galérez", "ils galèrent"];
    expect(tenseParts(galerer, "present").map(join)[0]).toBe("je gal[ère]");
  });

  it("finds an example per tense among the sentences, whole words only", () => {
    const sentences = [
      { fr: "Il casse tout.", ru: "Он всё ломает." },
      { fr: "Bon, je me casse.", ru: "Ладно, я сваливаю." },
      { fr: "Il s’est cassé sans rien dire.", ru: "Он свалил, ничего не сказав." },
      { fr: "On se cassait toujours avant la fin.", ru: null },
    ];
    const pres = tenseExample(SE_CASSER.tenses.present, sentences);
    expect(pres && pres.fr.slice(pres.at, pres.at + pres.length)).toBe("me casse");
    const pc = tenseExample(SE_CASSER.tenses.passe_compose, sentences);
    expect(pc && pc.fr.slice(pc.at, pc.at + pc.length)).toBe("s’est cassé");
    // «se cassait» is the il form; «On» is not in the needle.
    expect(tenseExample(SE_CASSER.tenses.imparfait, sentences)?.fr).toBe("On se cassait toujours avant la fin.");
    expect(tenseExample(SE_CASSER.tenses.futur, sentences)).toBeNull();
  });
});
