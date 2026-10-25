import { describe, expect, it } from "vitest";
import { passageLines } from "@/lib/core/exercises";
import { optionRows } from "./card";

describe("reading card", () => {
  it("keeps an ad's «Loyer :» labels apart, but not a colon inside an article's sentence", () => {
    const ad = passageLines("À louer — Lyon 7e.\nLoyer : 780 € par mois.\nFrais d'agence : 390 €.\n\nLibre le 1er décembre.");
    expect(ad).toEqual([
      [
        { label: null, text: "À louer — Lyon 7e." },
        { label: "Loyer :", text: "780 € par mois." },
        { label: "Frais d'agence :", text: "390 €." },
      ],
      [{ label: null, text: "Libre le 1er décembre." }],
    ]);
    const article = passageLines("Selon l'auteur : les loyers montent.\nLa banlieue change.");
    expect(article.flat().every((l) => l.label === null)).toBe(true);
  });

  it("lays long options out as rows", () => {
    expect(optionRows(["2 010 €", "840 €"])).toBe(false);
    expect(optionRows(["Le mois, la caution et les frais", "x"])).toBe(true);
  });
});
