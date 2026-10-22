"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { Header } from "@/components/ui/Header";
import { Icon } from "@/components/ui/Icons";
import { cx } from "@/components/ui/cx";
import { isAcceptedImage } from "@/lib/image-prep";
import { IMPORT_FOOTNOTE } from "./ProcessingView";

/** Image files from a paste or drop (DataTransfer). */
function imagesFrom(data: DataTransfer | null): File[] {
  if (!data) return [];
  const files = Array.from(data.files);
  if (files.length > 0) return files;
  return Array.from(data.items)
    .filter((i) => i.kind === "file")
    .map((i) => i.getAsFile())
    .filter((f): f is File => !!f);
}

const noSubscribe = () => () => {};

function canReadClipboardImages(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.clipboard?.read === "function";
}

async function readClipboardImages(): Promise<File[]> {
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

export interface PickViewProps {
  /** Opens the file chooser. */
  onChoose: () => void;
  /** Pasted or dropped files. */
  onFiles: (files: File[]) => void;
  /** Problem with the last selection (wrong type, too many). */
  error: string | null;
}

/** Start of the import: choose, paste or drop screenshots. */
export function PickView({ onChoose, onFiles, error }: PickViewProps) {
  const [dragging, setDragging] = useState(false);
  const [clipboardError, setClipboardError] = useState<string | null>(null);
  // Feature detection that renders false on the server and during hydration.
  const clipboard = useSyncExternalStore(noSubscribe, canReadClipboardImages, () => false);
  const dragDepth = useRef(0);

  // Paste and drag-and-drop anywhere on the page (a drop outside a handler would open the image).
  useEffect(() => {
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files");
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
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [onFiles]);

  const pasteFromClipboard = async () => {
    setClipboardError(null);
    try {
      const files = await readClipboardImages();
      if (files.length === 0) setClipboardError("В буфере обмена нет изображения.");
      else onFiles(files);
    } catch {
      setClipboardError("Нет доступа к буферу обмена. Вставьте скриншот сочетанием клавиш или выберите файл.");
    }
  };

  const message = error ?? clipboardError;

  return (
    <>
      <Header title="Импорт со скриншота" fallbackHref="/library" />
      <main className="flex flex-1 flex-col px-4 pt-2 pb-6">
        <div
          className={cx(
            "flex min-h-[300px] flex-1 flex-col items-center justify-center gap-3 rounded-card border border-dashed px-6 py-8 text-center transition-colors",
            dragging ? "border-solid border-ink bg-surface-2" : "border-muted bg-surface",
          )}
        >
          <Icon name="camera" size={28} strokeWidth={1.5} className="text-ink" />
          <h2 className="m-0 font-serif text-[22px] leading-7 font-medium tracking-[-0.01em]">
            {dragging ? "Отпустите, чтобы распознать" : "Скриншот со словами"}
          </h2>
          <p className="m-0 max-w-[32ch] text-[13px] leading-5 text-muted">
            Переписка, пост, субтитры или список слов с переводом. Длинный скриншот разрежем на части.
          </p>
          <p className="meta m-0">PNG, JPEG, WebP · до 4 фрагментов</p>
          <p className="meta m-0 hidden [@media(pointer:fine)]:block">Можно перетащить сюда или вставить</p>
        </div>

        {message && (
          <p role="alert" className="m-0 mt-4 flex items-start gap-2 text-[13px] leading-5 text-again">
            <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
            <span>{message}</span>
          </p>
        )}

        <div className="mt-6 flex flex-col gap-3">
          <Button block icon="camera" onClick={onChoose}>
            Выбрать скриншот
          </Button>
          {clipboard && (
            <Button block variant="secondary" icon="clipboard" onClick={pasteFromClipboard}>
              Вставить из буфера
            </Button>
          )}
        </div>
        <p className="m-0 mt-4 text-center text-[12px] leading-4 text-muted">{IMPORT_FOOTNOTE}</p>
      </main>
    </>
  );
}
