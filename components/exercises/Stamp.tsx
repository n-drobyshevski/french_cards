import { cx } from "@/components/ui/cx";

/**
 * «ВЕРНО» / «НЕВЕРНО» (pick D5 C): a mono rubber stamp that lands on the card, bottom-right above
 * the footer rule — 2px good / again outline, radius 4, rotated −4°, on the `surface` token (never
 * rgba, so the card's text never shows through in dark). It lands 70 ms after the tap: scale
 * 1.15 → 1 with a fade over 160 ms, --ease-enter, no overshoot (MOTION-SPEC §5.15); under reduced
 * motion it only fades. Decorative: the result line announces the verdict.
 */
export function Stamp({ verdict }: { verdict: "right" | "wrong" }) {
  return (
    <span
      aria-hidden="true"
      data-exercise-stamp={verdict}
      className={cx(
        "pointer-events-none absolute right-[22px] bottom-[58px] z-10 inline-flex h-10 -rotate-4 items-center rounded-[4px] border-2 bg-surface px-3.5 font-mono text-[17px] leading-none font-medium tracking-[.14em] whitespace-nowrap",
        "animate-[ex-stamp_160ms_var(--ease-enter)_70ms_both]",
        "md:right-10 md:bottom-[68px] md:h-[46px] md:text-[20px]",
        verdict === "right" ? "border-good text-good" : "border-again text-again",
      )}
    >
      {verdict === "right" ? "ВЕРНО" : "НЕВЕРНО"}
    </span>
  );
}
