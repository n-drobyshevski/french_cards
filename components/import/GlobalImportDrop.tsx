"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { blocksGlobalKeys, OPEN_LAYER_SELECTOR } from "@/components/shell/keys";
import { Icon } from "@/components/ui/Icons";
import { useSnackbar } from "@/components/ui/Snackbar";
import { partitionImages } from "@/lib/image-prep";
import { useLayoutClass } from "@/lib/use-media";
import { ankiFileOf } from "./anki-files";
import { dragHasFiles, handOffImages, imagesFrom } from "./clipboard";

/** Where the hand-over lands (SharedImages takes the files there). */
export const GLOBAL_IMPORT_URL = "/import?shared=1";

const onImportRoute = () => window.location.pathname.startsWith("/import");

/** A dialog, sheet or menu is open, or focus is in a text field: paste belongs to it. */
const pasteBelongsElsewhere = (target: EventTarget | null) =>
  blocksGlobalKeys(target) || blocksGlobalKeys(document.activeElement) || !!document.querySelector(OPEN_LAYER_SELECTOR);

/**
 * Desktop (≥ 768) screenshot import from anywhere in the app (DESKTOP-SPEC §1 «global file drop +
 * global ⌘V»): dropping an image file on the window, or ⌘V / Ctrl+V with an image in the clipboard
 * while focus is not in a text field and no dialog is open, hands the files to /import and starts
 * recognising. While files are dragged over the window a paper overlay covers the content area.
 * /import itself handles drop and paste on its own (ImportScreen), so this stays out of the way there.
 */
export function GlobalImportDrop() {
  const layout = useLayoutClass();
  const router = useRouter();
  const snackbar = useSnackbar();
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const active = layout !== "compact";

  useEffect(() => {
    if (!active) return;

    const start = (files: File[]) => {
      const deck = ankiFileOf(files);
      if (deck) {
        handOffImages([deck]);
        router.push(GLOBAL_IMPORT_URL);
        return;
      }
      const { accepted } = partitionImages(files);
      if (accepted.length === 0) {
        snackbar.show({ message: "Подходят PNG, JPEG, WebP или колода Anki." });
        return;
      }
      handOffImages(files);
      router.push(GLOBAL_IMPORT_URL);
    };

    const ours = (e: DragEvent) => dragHasFiles(e.dataTransfer) && !onImportRoute();
    const onDragEnter = (e: DragEvent) => {
      if (!ours(e)) return;
      e.preventDefault();
      depth.current++;
      if (!document.querySelector(OPEN_LAYER_SELECTOR)) setDragging(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (!ours(e)) return;
      // Without this the browser would open the image in the tab on drop.
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = document.querySelector(OPEN_LAYER_SELECTOR) ? "none" : "copy";
    };
    const onDragLeave = (e: DragEvent) => {
      if (!ours(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!ours(e)) return;
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      if (document.querySelector(OPEN_LAYER_SELECTOR)) return;
      const files = imagesFrom(e.dataTransfer);
      if (files.length > 0) start(files);
    };
    const onPaste = (e: ClipboardEvent) => {
      if (e.defaultPrevented || onImportRoute() || pasteBelongsElsewhere(e.target)) return;
      const files = imagesFrom(e.clipboardData);
      if (partitionImages(files).accepted.length === 0) return;
      e.preventDefault();
      start(files);
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    window.addEventListener("paste", onPaste);
    return () => {
      depth.current = 0;
      setDragging(false);
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("paste", onPaste);
    };
  }, [active, router, snackbar]);

  if (!active || !dragging) return null;
  return (
    <div
      data-import-drop-overlay=""
      className="pointer-events-none fixed inset-y-0 right-0 left-(--shell-nav) z-[70] bg-paper"
    >
      <div className="absolute inset-4 flex flex-col items-center justify-center gap-3 rounded-[8px] border border-dashed border-ink text-center">
        <Icon name="image" size={24} strokeWidth={1.5} className="text-muted" />
        <p role="status" className="m-0 font-serif text-[28px] leading-9 font-medium tracking-[-0.015em] text-ink">
          Отпустите, чтобы распознать
        </p>
        <p className="m-0 font-mono text-[11px] leading-4 text-muted">PNG, JPEG, WebP · до 4 фрагментов</p>
      </div>
    </div>
  );
}
