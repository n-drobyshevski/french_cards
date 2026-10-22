"use client";

import { useCallback } from "react";
import { updateFolder } from "@/lib/folders";
import type { Folder } from "@/lib/types";
import { useUndoSnackbar } from "./undo";

/** Caption of the «На паузе» toggle in both theme menus. */
export const THEME_PAUSE_CAPTION = "Слова темы останутся в библиотеке, но не будут попадать в повторения.";

/** «Тема на паузе» on or off, with «Отменить»: the words stay, their cards leave review (or come back). */
export function useThemePause(): (folder: Pick<Folder, "id" | "name">, muted: boolean) => Promise<void> {
  const showUndo = useUndoSnackbar();
  return useCallback(
    async (folder, muted) => {
      await updateFolder(folder.id, { muted });
      showUndo({
        message: muted ? `Тема «${folder.name}» на паузе` : `Тема «${folder.name}» снова в повторениях`,
        undo: () => void updateFolder(folder.id, { muted: !muted }).catch(() => {}),
      });
    },
    [showUndo],
  );
}
