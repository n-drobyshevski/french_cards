import { cx } from "@/components/ui/cx";
import type { LevelInfo } from "@/lib/core/level";
import { levelAria, levelText } from "./level";

/**
 * «Уровень языка» as data (D5 A): mono «≈B1», «B1» for the user's own level, «—» without one.
 * `row`: 11px, 30px wide and right-aligned after the slang meter, an estimate muted; `header`
 * (word card, review card answer side): 12px ink; `cell` (desktop column): 12px.
 */
export function LevelMark({ info, size = "row", className }: { info: LevelInfo | null; size?: "row" | "header" | "cell"; className?: string }) {
  return (
    <span
      role="img"
      aria-label={levelAria(info)}
      data-level={info?.level ?? "none"}
      className={cx(
        "shrink-0 font-mono leading-4 tracking-[.04em] whitespace-nowrap",
        size === "row" ? "w-[30px] text-right text-[11px]" : "text-[12px]",
        !info ? "text-boundary" : !info.estimated ? "font-medium text-ink" : size === "header" ? "text-ink" : "text-muted",
        className,
      )}
    >
      {levelText(info)}
    </span>
  );
}
