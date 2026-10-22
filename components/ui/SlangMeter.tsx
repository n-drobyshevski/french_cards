import { SLANG_LABELS, type SlangLevel } from "@/lib/types";
import { AbbrHint } from "./AbbrHint";
import { cx } from "./cx";

/** Full Russian names for screen readers, by level. */
export const SLANG_NAMES_RU = ["нейтральный", "фамильярный", "арго", "вульгарный"] as const;

/** «Уровень сленга: арго, 3 из 4, верлан» */
export function slangAriaLabel(level: SlangLevel, verlan = false): string {
  return `Уровень сленга: ${SLANG_NAMES_RU[level]}, ${level + 1} из 4${verlan ? ", верлан" : ""}`;
}

/** «arg.» / «fam. · verl.» */
export function slangAbbr(level: SlangLevel, verlan = false): string {
  return verlan ? `${SLANG_LABELS[level]} · verl.` : SLANG_LABELS[level];
}

export interface SlangMeterProps {
  level: SlangLevel;
  verlan?: boolean;
  /** Show the italic abbreviation after the segments. Default true; folder rows use the meter only. */
  showLabel?: boolean;
  /** md: 10×3 segments + 15px abbreviation (default). sm: 8×2 segments + 13px. lg: 14×4 segments + 17px. */
  size?: "sm" | "md" | "lg";
  /** The abbreviations explain themselves on a tap (not inside another button). */
  hints?: boolean;
  /** Which edge the hints line up with. */
  hintAlign?: "start" | "end";
  className?: string;
}

const SEG = { sm: "h-[2px] w-2", md: "h-[3px] w-2.5", lg: "h-1 w-3.5" } as const;
const TEXT = { sm: "text-[13px] leading-4", md: "text-[15px] leading-5", lg: "text-[17px] leading-6" } as const;

/**
 * 4-segment slang meter: нейтр. fills 1, fam. 2, arg. 3, vulg. 4 (vulg. in red ink),
 * followed by the italic dictionary abbreviation and «verl.» when the word is verlan.
 */
export function SlangMeter({
  level,
  verlan = false,
  showLabel = true,
  size = "md",
  hints = false,
  hintAlign = "start",
  className,
}: SlangMeterProps) {
  const filled = level + 1;
  const fill = level === 3 ? "bg-red" : "bg-ink";
  const interactive = hints && showLabel;
  return (
    <span
      role={interactive ? "group" : "img"}
      aria-label={slangAriaLabel(level, verlan)}
      className={cx("inline-flex shrink-0 items-center", size === "sm" ? "gap-1.5" : "gap-2", className)}
    >
      <span aria-hidden="true" className="inline-flex items-center gap-[2px]">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cx(SEG[size], i < filled ? fill : "bg-rule")} />
        ))}
      </span>
      {interactive ? (
        <span className={cx("inline-flex items-baseline gap-1 whitespace-nowrap", TEXT[size])}>
          <AbbrHint abbr={SLANG_LABELS[level]} lang={level === 0 ? "ru" : "fr"} align={hintAlign} />
          {verlan && (
            <>
              <span aria-hidden="true" className="abbr">
                ·
              </span>
              <AbbrHint abbr="verl." align={hintAlign} />
            </>
          )}
        </span>
      ) : (
        showLabel && (
          <span aria-hidden="true" lang={level === 0 ? undefined : "fr"} className={cx("abbr whitespace-nowrap", TEXT[size])}>
            {slangAbbr(level, verlan)}
          </span>
        )
      )}
    </span>
  );
}
