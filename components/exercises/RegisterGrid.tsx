"use client";

import { SLANG_NAMES_RU, SlangMeter } from "@/components/ui/SlangMeter";
import type { SlangLevel } from "@/lib/types";
import { OptionGrid } from "./OptionGrid";
import type { PlayerResult } from "./player-state";

export interface RegisterGridProps {
  /** REGISTER_LEVELS (index = slang level), as optionsFor lists them. */
  options: readonly string[];
  correct: number;
  result: PlayerResult | null;
  onPick: (index: number) => void;
  locked?: boolean;
}

/**
 * A register item's four levels in the same 2×2 grid (Exercise-S-Register): the meter (14×4
 * segments) with the italic нейтр. / fam. / arg. / vulg. — vulg. in red ink — and the full name
 * under it. Keys 1–4 pick them in level order.
 */
export function RegisterGrid({ options, correct, result, onPick, locked }: RegisterGridProps) {
  return (
    <OptionGrid
      options={options}
      correct={correct}
      result={result}
      onPick={onPick}
      locked={locked}
      renderOption={(_, i) => (
        <span className="flex min-w-0 flex-col items-start gap-1.5 md:flex-row md:items-center md:gap-3">
          <SlangMeter level={i as SlangLevel} size="lg" />
          <span className="text-[13px] leading-5 text-current opacity-80">{SLANG_NAMES_RU[i]}</span>
        </span>
      )}
    />
  );
}
