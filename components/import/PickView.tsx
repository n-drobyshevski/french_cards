"use client";

import { Button } from "@/components/ui/Button";
import { Header } from "@/components/ui/Header";
import { Icon } from "@/components/ui/Icons";
import { cx } from "@/components/ui/cx";
import { useClipboardPaste, useImageDropAndPaste } from "./clipboard";
import { IMPORT_FOOTNOTE } from "./ProcessingView";

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
  const dragging = useImageDropAndPaste(onFiles);
  const { supported: clipboard, error: clipboardError, paste: pasteFromClipboard } = useClipboardPaste(onFiles);

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
