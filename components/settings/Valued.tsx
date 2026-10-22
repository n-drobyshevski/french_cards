import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";

// Settings rows before their values are known (MOTION-SPEC T1: first run, no localStorage mirror,
// or the server render): labels as usual, controls without a value — an empty switch track, no
// selected segment or option, no number, an empty checkbox — and no input. When the values arrive
// they fade in (`--dur-quick`); the frames never move.

/** Marks fade instead of snapping when the values arrive. */
const MARKS =
  "[&_[role=switch]>span>span]:transition-opacity [&_[role=switch]>span>span]:duration-(--dur-quick) " +
  "[&_[role=radio]>span]:transition-colors [&_[role=radio]>span]:duration-(--dur-quick) " +
  "[&_[data-text-option]]:transition-colors [&_[data-text-option]]:duration-(--dur-quick) " +
  "[&_[data-check]]:transition-colors [&_[data-check]]:duration-(--dur-quick) [&_[data-check]>*]:transition-opacity [&_[data-check]>*]:duration-(--dur-quick) " +
  "[&_output]:transition-colors [&_output]:duration-(--dur-quick) [&_[role=spinbutton]]:transition-colors [&_[role=spinbutton]]:duration-(--dur-quick) " +
  "[&_[data-value]]:transition-opacity [&_[data-value]]:duration-(--dur-quick)";

const VALUELESS =
  // Toggle: an empty track, no thumb.
  "[&_[role=switch]>span]:border! [&_[role=switch]>span]:border-rule! [&_[role=switch]>span]:bg-surface! [&_[role=switch]>span>span]:opacity-0! " +
  // Segmented (phone): no selected segment.
  "[&_[role=radio]>span]:bg-surface! [&_[role=radio]>span]:font-normal! [&_[role=radio]>span]:text-ink! " +
  // Text options (desktop): no selected word.
  "[&_[data-text-option]]:font-medium! [&_[data-text-option]]:text-muted! [&_[data-text-option]]:no-underline! " +
  // Checkbox (desktop): an empty box.
  "[&_[data-check]]:border-muted! [&_[data-check]]:bg-surface! [&_[data-check]>*]:opacity-0! " +
  // Steppers: no number.
  "[&_output]:text-transparent! [&_[role=spinbutton]]:text-transparent! " +
  // Plain values («FR → RU»).
  "[&_[data-value]]:opacity-0!";

/** Wraps settings rows: `known` false draws their controls without values and blocks input. */
export function Valued({ known, children }: { known: boolean; children: ReactNode }) {
  return (
    <div inert={!known} aria-busy={!known || undefined} className={cx("contents", MARKS, !known && VALUELESS)}>
      {children}
    </div>
  );
}
