"use client";

import { useState } from "react";
import { Sheet, SheetCloseButton, SheetTitle } from "@/components/ui/Sheet";
import type { ExerciseSet } from "@/lib/types";
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

/** «Попросить набор» (Exercise-S-Request-Sheet): the request builder in a sheet over the list. */
export function RequestSheet({ open, onOpenChange, themes, sets, online, onCopied }: RequestSheetProps) {
  const [help, setHelp] = useState(false);
  return (
    <Sheet open={open} onOpenChange={onOpenChange} dialogWidth={520} description="Запрос для чата Claude">
      <div className="flex h-11 shrink-0 items-center gap-2 pr-1 pl-4 md:mt-2 md:pl-6">
        <SheetTitle className="min-w-0 flex-1 truncate">Попросить набор</SheetTitle>
        <SheetCloseButton />
      </div>
      <RequestBuilder
        variant="sheet"
        themes={themes}
        sets={sets}
        online={online}
        onHelp={() => setHelp(true)}
        onCopied={(ok, via) => {
          if (!ok) return;
          onOpenChange(false);
          onCopied?.(via);
        }}
        className="px-4 pt-1 pb-7 md:px-6 md:pb-6"
      />
      <ConnectorHelpSheet open={help} onOpenChange={setHelp} nested />
    </Sheet>
  );
}
