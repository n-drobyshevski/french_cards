"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { WordDetailBody } from "./WordDetailBody";

export interface WordDetailSheetProps {
  /** Word to show; null closes the sheet. */
  wordId: string | null;
  onClose: () => void;
}

/** Full-height sheet with a word's entry, editable fields, schedule, history and actions (phones). */
export function WordDetailSheet({ wordId, onClose }: WordDetailSheetProps) {
  // Keep showing the last word while the sheet animates closed.
  const [shownId, setShownId] = useState<string | null>(wordId);
  if (wordId !== null && wordId !== shownId) setShownId(wordId);

  return (
    <Sheet
      open={wordId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      onClosed={() => setShownId(null)}
      height="full"
      title="Карточка слова"
    >
      {shownId && <WordDetailBody key={shownId} wordId={shownId} variant="sheet" onClose={onClose} />}
    </Sheet>
  );
}
