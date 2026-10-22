// /api/ai/fill: tidying the model's answer for one built-in word field.
import { cleanConjugation, cleanOrigin } from "@/lib/core/conjugate";
import type { Conjugation } from "@/lib/types";
import type { FillConjugationModel, FillOriginModel } from "./schemas";

export function finalizeOrigin(raw: FillOriginModel): string | null {
  return cleanOrigin(raw.origin);
}

/** Six forms per tense or nothing: a half answer is worse than the empty form. */
export function finalizeConjugation(raw: FillConjugationModel): Conjugation | null {
  if (!raw.conjugates) return null;
  const { auxiliary, remark, present, passe_compose, imparfait, futur } = raw;
  return cleanConjugation({ auxiliary, remark, tenses: { present, passe_compose, imparfait, futur } });
}
