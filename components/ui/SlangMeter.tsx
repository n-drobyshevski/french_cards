import type { CSSProperties } from "react";
import { SLANG_LABELS, type SlangLevel } from "@/lib/types";
import { AbbrHint } from "./AbbrHint";
import { cx } from "./cx";

/** Full Russian names for screen readers, by level. */
export const SLANG_NAMES_RU = ["нейтральный", "фамильярный", "арго", "вульгарный"] as const;

/** «Сленг: арго, 3 из 4, верлан» (was «Уровень сленга: …» before «Уровень языка»). */
export function slangAriaLabel(level: SlangLevel, verlan = false): string {
  return `Сленг: ${SLANG_NAMES_RU[level]}, ${level + 1} из 4${verlan ? ", верлан" : ""}`;
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
  /**
   * Fill on reveal (D4 Bold): the filled segments grow in one by one, 40ms apart, once on mount
   * (mount it with the revealed side). Reduced motion: filled at once.
   */
  fillIn?: boolean;
  /** Wait before the first segment fills, in ms. */
  fillDelay?: number;
  /**
   * Render nothing for a neutral word (mockups/L-Kit.dc.html §06 «нейтр. — без шкалы»; synthesis
   * §1.10). A neutral verlan word with its label still shows «нейтр. · verl.».
   */
  hideNeutral?: boolean;
  /**
   * The list-row variant (mockups/L-Kit.dc.html §06): the 8×2 meter alone, nothing for a neutral
   * word. Same as size="sm" showLabel={false} hideNeutral; explicit props still win.
   */
  row?: boolean;
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
  row = false,
  showLabel = !row,
  size = row ? "sm" : "md",
  hints = false,
  hintAlign = "start",
  fillIn = false,
  fillDelay = 0,
  hideNeutral = row,
  className,
}: SlangMeterProps) {
  if (hideNeutral && level === 0 && !(verlan && showLabel)) return null;
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
        {[0, 1, 2, 3].map((i) =>
          fillIn && i < filled ? (
            // The rule track stays put; the ink grows over it.
            <span key={i} className={cx(SEG[size], "relative bg-rule")}>
              <span
                style={{ "--seg": i, "--seg-delay": `${fillDelay}ms` } as CSSProperties}
                className={cx("seg-fill absolute inset-0", fill)}
              />
            </span>
          ) : (
            <span key={i} className={cx(SEG[size], i < filled ? fill : "bg-rule")} />
          ),
        )}
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
