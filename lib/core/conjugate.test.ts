import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { conjugate, ruleForms, type ConjData } from "./conjugate";

const data = JSON.parse(readFileSync("public/lexique/fr-conj.json", "utf8")) as ConjData;
const c = (w: string) => conjugate(w, data);

describe("conjugate", () => {
  it("regular -er verbs by rule, with pronouns and elision", () => {
    const k = c("kiffer")!;
    expect(k.auxiliary).toBe("avoir");
    expect(k.remark).toBe("правильный на -er");
    expect(k.tenses.present).toEqual(["je kiffe", "tu kiffes", "il kiffe", "nous kiffons", "vous kiffez", "ils kiffent"]);
    expect(k.tenses.passe_compose[0]).toBe("j'ai kiffé");
    expect(k.tenses.imparfait[3]).toBe("nous kiffions");
    expect(k.tenses.futur[5]).toBe("ils kifferont");
    expect(c("habiter")!.tenses.present[0]).toBe("j'habite");
    expect(c("hurler")!.tenses.present[0]).toBe("je hurle");
  });

  it("spelling changes", () => {
    expect(c("manger")!.tenses.present[3]).toBe("nous mangeons");
    expect(c("manger")!.tenses.imparfait[0]).toBe("je mangeais");
    expect(c("lancer")!.tenses.present[3]).toBe("nous lançons");
    expect(c("acheter")!.tenses.present[0]).toBe("j'achète");
    expect(c("acheter")!.tenses.futur[0]).toBe("j'achèterai");
    expect(c("céder")!.tenses.present[5]).toBe("ils cèdent");
    expect(c("appeler")!.tenses.present[0]).toBe("j'appelle");
    expect(c("nettoyer")!.tenses.futur[0]).toBe("je nettoierai");
    expect(c("envoyer")!.tenses.futur[0]).toBe("j'enverrai");
    expect(c("parier")!.tenses.imparfait[3]).toBe("nous pariions");
  });

  it("irregular verbs from the table, être verbs and pronominal verbs", () => {
    expect(c("aller")!.tenses.present).toEqual(["je vais", "tu vas", "il va", "nous allons", "vous allez", "ils vont"]);
    expect(c("aller")!.tenses.passe_compose[3]).toBe("nous sommes allés");
    expect(c("être")!.tenses.imparfait[0]).toBe("j'étais");
    expect(c("faire")!.tenses.present[4]).toBe("vous faites");
    expect(c("prendre")!.tenses.futur[0]).toBe("je prendrai");
    expect(c("se casser")!.tenses.passe_compose).toEqual([
      "je me suis cassé",
      "tu t'es cassé",
      "il s'est cassé",
      "nous nous sommes cassés",
      "vous vous êtes cassés",
      "ils se sont cassés",
    ]);
    expect(c("s'habiller")!.tenses.present[0]).toBe("je m'habille");
    expect(c("s'en aller")!.tenses.present[0]).toBe("je m'en vais");
    expect(c("finir")!.tenses.present[3]).toBe("nous finissons");
    expect(c("partir")!.tenses.present[0]).toBe("je pars");
  });

  it("keeps the rest of an expression", () => {
    expect(c("faire la gueule")!.tenses.present[0]).toBe("je fais la gueule");
    expect(c("avoir la flemme")!.tenses.passe_compose[0]).toBe("j'ai eu la flemme");
  });

  it("null when there is no rule and no table row", () => {
    expect(c("falloir")).toBeNull();
    expect(c("bidulre")).toBeNull();
    // An -ir verb not known to be second group is not guessed.
    expect(ruleForms("partir", new Set())).toBeNull();
  });
});
