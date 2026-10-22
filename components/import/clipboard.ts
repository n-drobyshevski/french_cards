"use client";

// Screenshots from a paste, a drop or the async clipboard, shared by the import screen (phone and
// desktop) and the app-wide drop/⌘V handler (GlobalImportDrop). Also the in-memory hand-over that
// carries files picked up elsewhere in the app to /import (next to the share target's cache path).
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { isAcceptedImage } from "@/lib/image-prep";

interface DataTransferLike {
  files?: ArrayLike<File> | null;
  items?: ArrayLike<{ kind: string; getAsFile(): File | null }> | null;
  types?: ArrayLike<string> | null;
}

/** Image files from a paste or drop (DataTransfer). */
export function imagesFrom(data: DataTransferLike | null | undefined): File[] {
  if (!data) return [];
  const files = Array.from(data.files ?? []);
  if (files.length > 0) return files;
  return Array.from(data.items ?? [])
    .filter((i) => i.kind === "file")
    .map((i) => i.getAsFile())
    .filter((f): f is File => !!f);
}

/** True when a drag carries files (not text or one of the app's own word drags). */
export function dragHasFiles(data: DataTransferLike | null | undefined): boolean {
  return !!data && Array.from(data.types ?? []).includes("Files");
}

export function canReadClipboardImages(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.clipboard?.read === "function";
}

/** Images in the system clipboard (async Clipboard API; asks for permission on some browsers). */
export async function readClipboardImages(): Promise<File[]> {
  const items = await navigator.clipboard.read();
  const files: File[] = [];
  for (const [i, item] of items.entries()) {
    const type = item.types.find((t) => isAcceptedImage({ type: t, name: "" }));
    if (!type) continue;
    const blob = await item.getType(type);
    files.push(new File([blob], `clipboard-${i + 1}.${type.split("/")[1]}`, { type, lastModified: Date.now() }));
  }
  return files;
}

const noSubscribe = () => () => {};

/**
 * «Вставить из буфера»: `supported` is false on the server, during hydration and where the async
 * clipboard cannot be read (the button is then hidden); `error` explains a failed or empty read.
 */
export function useClipboardPaste(onFiles: (files: File[]) => void) {
  const supported = useSyncExternalStore(noSubscribe, canReadClipboardImages, () => false);
  const [error, setError] = useState<string | null>(null);
  const paste = useCallback(async () => {
    setError(null);
    try {
      const files = await readClipboardImages();
      if (files.length === 0) setError("В буфере обмена нет изображения.");
      else onFiles(files);
    } catch {
      setError("Нет доступа к буферу обмена. Вставьте скриншот сочетанием клавиш или выберите файл.");
    }
  }, [onFiles]);
  return { supported, error, paste };
}

/**
 * Paste and drag-and-drop anywhere on the page while mounted (a drop outside a handler would open
 * the image in the tab). Returns true while files are dragged over the window.
 */
export function useImageDropAndPaste(onFiles: (files: File[]) => void): boolean {
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  useEffect(() => {
    const hasFiles = (e: DragEvent) => dragHasFiles(e.dataTransfer);
    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current++;
      setDragging(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      const files = imagesFrom(e.dataTransfer);
      if (files.length > 0) onFiles(files);
    };
    const onPaste = (event: ClipboardEvent) => {
      const files = imagesFrom(event.clipboardData);
      if (files.length === 0) return;
      event.preventDefault();
      onFiles(files);
    };
    window.addEventListener("paste", onPaste);
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      dragDepth.current = 0;
      setDragging(false);
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [onFiles]);

  return dragging;
}

// --- Hand-over to /import -------------------------------------------------------------------
// Files dropped or pasted elsewhere in the app wait here until the import screen takes them on
// /import?shared=1 (components/import/SharedImages.tsx), the same URL the share target uses.
// Module memory survives client-side navigation; a reload drops it, which is the point: the
// screenshot is never stored.

let handed: File[] = [];

export function handOffImages(files: readonly File[]): void {
  handed = [...files];
}

/** Takes (and forgets) the handed-over files; empty when there are none. */
export function takeHandedOffImages(): File[] {
  const files = handed;
  handed = [];
  return files;
}
