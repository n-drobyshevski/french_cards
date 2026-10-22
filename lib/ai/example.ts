// /api/ai/example: tidying the model's answer.
import type { ExampleModel, ExampleResponse } from "./schemas";

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
/** Letters and digits only, lower case: «C'est chelou !» and «c’est chelou» are the same sentence. */
const key = (s: string) => s.toLocaleLowerCase("fr").replace(/[^\p{L}\p{N}]+/gu, "");

/** The model's answer, or null when it is empty or repeats an example the card already has. */
export function finalizeExample(raw: ExampleModel, avoid: readonly string[]): ExampleResponse["example"] {
  const fr = clean(raw.example_fr);
  if (!fr || avoid.some((a) => key(a) === key(fr))) return null;
  return { fr, ru: clean(raw.example_ru) || null };
}
