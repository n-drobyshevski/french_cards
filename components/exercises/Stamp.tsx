import { cx } from "@/components/ui/cx";

/**
 * Where the stamp lands on a phone card (X-Player-B): beside a short headword (`line1`, 26px under
 * the header rule), on the second line of a two-line cloze sentence (`line2`), beside a text's short
 * question (`question`: the card renders it inside the question's block, whatever the text above it
 * takes), or over the header's right end (`head`) where it would cover a long prompt or a pairs board.
 */
export type StampPlace = "line1" | "line2" | "question" | "head";

const PHONE_PLACE: Record<StampPlace, string> = {
  line1: "max-md:top-[72px]",
  line2: "max-md:top-[118px]",
  question: "max-md:top-[6px]",
  head: "max-md:top-[3px]",
};

/**
 * «ВЕРНО» / «НЕВЕРНО» (pick D5 C): a mono rubber stamp that lands on the card — 2px good / again
 * outline, radius 4, rotated −4°, on the `surface` token (never rgba, so the card's text never shows
 * through in dark). From 768 bottom-right above the footer rule; on phones (X-Player-B) near the top,
 * by `place`, beside the answer written on the card. It lands 70 ms after the tap: scale 1.15 → 1
 * with a fade over 160 ms, --ease-enter, no overshoot (MOTION-SPEC §5.15); under reduced motion it
 * only fades. Decorative: the result line announces the verdict.
 */
export function Stamp({ verdict, place = "line1" }: { verdict: "right" | "wrong"; place?: StampPlace }) {
  return (
    <span
      aria-hidden="true"
      data-exercise-stamp={verdict}
      className={cx(
        "pointer-events-none absolute right-[22px] bottom-[58px] z-10 inline-flex h-10 -rotate-4 items-center rounded-[4px] border-2 bg-surface px-3.5 font-mono text-[17px] leading-none font-medium tracking-[.14em] whitespace-nowrap",
        "max-md:right-[18px] max-md:bottom-auto",
        PHONE_PLACE[place],
        "animate-[ex-stamp_160ms_var(--ease-enter)_70ms_both]",
        "md:right-10 md:bottom-[68px] md:h-[46px] md:text-[20px]",
        verdict === "right" ? "border-good text-good" : "border-again text-again",
      )}
    >
      {verdict === "right" ? "ВЕРНО" : "НЕВЕРНО"}
    </span>
  );
}
