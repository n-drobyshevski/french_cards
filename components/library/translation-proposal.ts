// «Вариант» under «Русский» in the word's edit form: a translation for what «Французский» says now,
// asked for by itself (debounced, like «Варианты» in the add sheet) and never written into the field
// without a tap. Follows Settings «ИИ» «Автоподсказки при вводе» and «Модель».
import { useEffect, useMemo } from "react";
import { dedupeKey } from "@/lib/ai/normalize";
import type { Suggestion } from "@/lib/ai/schemas";
import { normalizeQuery, useSuggest, type SuggestPreferences } from "@/lib/use-suggest";
import { useSettings } from "@/lib/use-settings";

const NO_FOLDERS: never[] = [];

const sameText = (a: string, b: string) => a.replace(/\s+/g, " ").trim().toLowerCase() === b.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * The translation to propose for `fr`, or null: the suggestion for this very word (else the first
 * one), when its Russian differs from what the field already holds.
 */
export function proposedTranslation(results: readonly Pick<Suggestion, "fr" | "ru">[], fr: string, ru: string): string | null {
  const key = dedupeKey(fr);
  const pick = results.find((s) => dedupeKey(s.fr) === key) ?? results[0];
  const proposal = pick?.ru.trim();
  if (!proposal || sameText(proposal, ru)) return null;
  return proposal;
}

export interface TranslationProposal {
  /** Proposals are asked for (form open, the setting on): the line keeps its place. */
  enabled: boolean;
  /** The Russian to offer, null when there is none or it is what the field says. */
  ru: string | null;
  /** A request for the current French is in flight (after the debounce). */
  pending: boolean;
}

/** Asks for a translation of `fr` while `active` (the entry form is open). */
export function useTranslationProposal(fr: string, ru: string, active: boolean): TranslationProposal {
  const { settings } = useSettings();
  const enabled = active && (settings?.suggestions_enabled ?? true);
  const model = settings?.ai_model ?? "fast";
  // One answer is enough here; no notes, any register: only the translation is used.
  const preferences = useMemo<SuggestPreferences>(() => ({ model, max: 1, register: "any", notes: false }), [model]);
  const suggest = useSuggest({ folders: NO_FOLDERS, enabled, preferences });
  const { setQuery } = suggest;

  useEffect(() => {
    setQuery(enabled ? fr : "");
  }, [setQuery, enabled, fr]);

  const current = enabled && suggest.direction === "fr" && suggest.query === normalizeQuery(fr);
  return {
    enabled,
    ru: current ? proposedTranslation(suggest.results, fr, ru) : null,
    pending: current && suggest.requesting,
  };
}
