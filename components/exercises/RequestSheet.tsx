"use client";

import { useState } from "react";
import {
  Sheet,
  SheetCloseButton,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/Sheet";
import type { ExerciseSet } from "@/lib/types";
import { useLayoutClass } from "@/lib/use-media";
import { ConnectorHelpSheet } from "./ConnectorHelpSheet";
import { RequestBuilder, type ThemeChoice } from "./RequestBuilder";

export interface RequestSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  themes: readonly ThemeChoice[];
  sets: readonly ExerciseSet[];
  online: boolean;
  /** The request reached the clipboard: the sheet closes and the list shows «Ждём набор из чата». */
  onCopied?: (via: "copy" | "open") => void;
}

/**
 * «Попросить набор» over the list. Phones (X-Request-B, pick E2 B): an auto-height sheet — grabber,
 * the title, ✕ for screen readers only — holding the kind row, the request sentence and the two
 * hand-off steps (RequestBuilder `compact`). From 768 the dialog keeps the builder of
 * `Exercise-S-Request-Sheet`.
 */
export function RequestSheet({
  open,
  onOpenChange,
  themes,
  sets,
  online,
  onCopied,
}: RequestSheetProps) {
  const [help, setHelp] = useState(false);
  const phone = useLayoutClass() === "compact";
  return (
    // Paper under white chips, toggle and request box (Exercise-S-Request-Sheet; X-Request-B).
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      dialogWidth={520}
      description="Запрос для чата Claude"
      className="!bg-paper"
    >
      {phone ? (
        <SheetHeader title="Попросить набор" className="mt-1.5" />
      ) : (
        <div className="flex h-11 shrink-0 items-center gap-2 pr-1 pl-4 md:mt-2 md:pl-6">
          <SheetTitle className="min-w-0 flex-1 truncate">
            Попросить набор
          </SheetTitle>
          <SheetCloseButton />
        </div>
      )}
      <RequestBuilder
        variant="sheet"
        compact={phone}
        themes={themes}
        sets={sets}
        online={online}
        onHelp={() => setHelp(true)}
        onCopied={(ok, via) => {
          if (!ok) return;
          onOpenChange(false);
          onCopied?.(via);
        }}
        className={phone ? "px-4 pt-1 pb-7" : "px-4 pt-1 pb-7 md:px-6 md:pb-6"}
      />
      <ConnectorHelpSheet open={help} onOpenChange={setHelp} nested />
    </Sheet>
  );
}
