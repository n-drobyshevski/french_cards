import { deckEdges } from "@/components/review/swipe";
import { cx } from "@/components/ui/cx";

/** Deck edges, deepest first: 15 / 10 / 5px in from the sides, 12 / 8 / 4px lower (the review deck's phone edges). */
const EDGES = ["inset-x-[15px] top-3", "inset-x-[10px] top-2", "inset-x-[5px] top-1"] as const;

/**
 * The small deck under the player's question card on phones (X-Player-B): 1–3 hairline edges by the
 * questions left, this one included (`deckEdges`: 3 for 10+, 2 for 2–9, 1 for the last), the same
 * edges as the review deck (ReviewCard CardStack) but static — nothing is dragged here. Put it
 * first inside a `relative` box with `pb-3` around the card, so the edges show under it.
 */
export function DeckEdges({ left }: { left: number }) {
  const edges = deckEdges(left);
  return (
    <>
      {EDGES.map((place, i) => (
        <span
          key={i}
          aria-hidden="true"
          data-deck-edge={edges >= EDGES.length - i ? "" : undefined}
          className={cx(
            "absolute bottom-auto h-[calc(100%-12px)] rounded-card border border-edge bg-surface transition-opacity duration-(--dur-quick) ease-standard",
            place,
            edges < EDGES.length - i && "opacity-0",
          )}
        />
      ))}
    </>
  );
}
