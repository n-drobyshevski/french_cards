// Dragging words onto a theme (desktop): rows set the payload with setDraggedWords(); sidebar and
// rail theme rows (and «Входящие») accept it via useThemeDrop(), move the words and show an undo
// snackbar. Drop targets light up while a drag is in progress (DESKTOP-SPEC §3 drag tokens).
import { useCallback, useState, useSyncExternalStore, type DragEvent } from "react";
import { useSnackbar } from "@/components/ui/Snackbar";
import { moveWords, restoreMoves } from "@/lib/words";

/** DataTransfer type for dragged words: a JSON array of word ids. */
export const WORDS_MIME = "application/x-kartochki-words";

interface DragTransferLike {
  types: readonly string[] | DOMStringList;
  getData(format: string): string;
}

let draggedCount = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function endDrag() {
  window.removeEventListener("dragend", endDrag, true);
  window.removeEventListener("drop", endDragSoon, true);
  if (draggedCount === 0) return;
  draggedCount = 0;
  notify();
}

// The drop handler runs after the capture listener; keep the count for its «+N» until then.
function endDragSoon() {
  setTimeout(endDrag, 0);
}

/**
 * Call in a row's onDragStart: puts the word ids on the drag and marks a word drag as active (so
 * theme rows show as drop targets). Also sets a plain-text fallback and effectAllowed = "move".
 */
export function setDraggedWords(dataTransfer: DataTransfer, ids: readonly string[]): void {
  dataTransfer.setData(WORDS_MIME, JSON.stringify(ids));
  dataTransfer.effectAllowed = "move";
  draggedCount = ids.length;
  notify();
  window.addEventListener("dragend", endDrag, true);
  window.addEventListener("drop", endDragSoon, true);
}

/** True when a drag carries words (readable during dragover, unlike the data itself). */
export function hasDraggedWords(dataTransfer: Pick<DragTransferLike, "types"> | null | undefined): boolean {
  if (!dataTransfer) return false;
  return Array.from(dataTransfer.types as ArrayLike<string>).includes(WORDS_MIME);
}

/** Word ids from a drop, or null when the payload is missing or malformed. */
export function readDraggedWords(dataTransfer: DragTransferLike | null | undefined): string[] | null {
  if (!hasDraggedWords(dataTransfer)) return null;
  try {
    const ids: unknown = JSON.parse(dataTransfer!.getData(WORDS_MIME));
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) return null;
    return ids.length ? ids : null;
  } catch {
    return null;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Number of words in the drag started in this tab (0 = no word drag). */
export function useDraggedWordCount(): number {
  return useSyncExternalStore(
    subscribe,
    () => draggedCount,
    () => 0,
  );
}

export interface ThemeDropTarget {
  /** Folder id; null = «Входящие». */
  id: string | null;
  name: string;
}

export interface ThemeDrop {
  /** A word drag is in progress: show the dashed «valid target» outline. */
  dragging: boolean;
  /** The drag is over this target: white bg, 2px ink outline, «+N» instead of the count. */
  over: boolean;
  /** Words in the drag (for «+N»); 0 when the drag started in another tab. */
  count: number;
  /** Spread on the target element. */
  dropProps: {
    onDragEnter: (event: DragEvent<HTMLElement>) => void;
    onDragOver: (event: DragEvent<HTMLElement>) => void;
    onDragLeave: (event: DragEvent<HTMLElement>) => void;
    onDrop: (event: DragEvent<HTMLElement>) => void;
  };
}

/** Drop target for words: moves them into the theme and shows «Перемещено в «X»» with «Отменить». */
export function useThemeDrop(target: ThemeDropTarget): ThemeDrop {
  const snackbar = useSnackbar();
  const count = useDraggedWordCount();
  const [over, setOver] = useState(false);
  const { id, name } = target;

  const accept = useCallback((event: DragEvent<HTMLElement>) => {
    if (!hasDraggedWords(event.dataTransfer)) return false;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    return true;
  }, []);

  const onDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      setOver(false);
      const ids = readDraggedWords(event.dataTransfer);
      if (!ids) return;
      event.preventDefault();
      void moveWords(ids, id)
        .then((records) => {
          if (records.length === 0) return;
          snackbar.show({
            message: `Перемещено в «${name}»`,
            actionLabel: "Отменить",
            onAction: () => void restoreMoves(records),
          });
        })
        .catch((error: unknown) => {
          console.error("Moving words failed", error);
          snackbar.show({ message: "Не получилось переместить слова" });
        });
    },
    [id, name, snackbar],
  );

  return {
    dragging: count > 0,
    over,
    count,
    dropProps: {
      onDragEnter: (event) => {
        if (accept(event)) setOver(true);
      },
      onDragOver: (event) => {
        if (accept(event)) setOver(true);
      },
      onDragLeave: (event) => {
        const next = event.relatedTarget as Node | null;
        if (!next || !event.currentTarget.contains(next)) setOver(false);
      },
      onDrop,
    },
  };
}
