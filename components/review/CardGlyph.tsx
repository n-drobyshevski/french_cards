// The index-card outline as a small glyph (the app mark's card, mobile-research «Wait screen» B and
// «Готово на сегодня» B): one card on the wait screen's return timeline, a stack of three beside
// «Завтра — 18 слов». Hairlines only, decorative (aria-hidden); the numbers are in the text.
import type { CSSProperties } from "react";
import { cx } from "@/components/ui/cx";

/** One 10×14 card outline. */
export function CardGlyph({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg aria-hidden="true" width="10" height="14" viewBox="0 0 10 14" fill="none" style={style} className={cx("shrink-0", className)}>
      <rect x="0.5" y="0.5" width="9" height="13" rx="1" className="fill-surface stroke-ink" />
    </svg>
  );
}

/** Three card outlines stacked back to front, the front one in ink (26×20). */
export function CardStackGlyph({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" width="26" height="20" viewBox="0 0 26 20" fill="none" strokeWidth="1" className={cx("shrink-0", className)}>
      <rect x="10.5" y="0.5" width="15" height="11" rx="1" className="fill-surface stroke-boundary" />
      <rect x="5.5" y="4" width="15" height="11" rx="1" className="fill-surface stroke-boundary" />
      <rect x="0.5" y="7.5" width="15" height="11" rx="1" className="fill-surface stroke-ink" />
    </svg>
  );
}
