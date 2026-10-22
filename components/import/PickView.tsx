"use client";

import { Button } from "@/components/ui/Button";
import { Header } from "@/components/ui/Header";
import { Icon } from "@/components/ui/Icons";
import { cx } from "@/components/ui/cx";
import { useOnline } from "@/lib/use-online";
import { useClipboardPaste, useImageDropAndPaste } from "./clipboard";
import { IMPORT_FOOTNOTE } from "./ProcessingView";

export interface PickViewProps {
  /** Opens the file chooser. */
  onChoose: () => void;
  /** Pasted or dropped files. */
  onFiles: (files: File[]) => void;
  /** Problem with the last selection (wrong type, too many). */
  error: string | null;
  /** Opens the chooser for an Anki deck (.apkg or a text export). */
  onAnki?: () => void;
}

/** Why the pick waits for the network (MOTION-SPEC B4): said up front, muted, not as an error. */
export const OFFLINE_REASON = "Распознавание работает только онлайн. Подключитесь к сети, и можно продолжать.";

/** «Нужна сеть»: a button that can't, in the disabled look (white, muted text), not a greyed slab. */
export const CANT_CLASS = "disabled:border-rule disabled:bg-surface disabled:text-boundary disabled:opacity-100!";

/** Start of the import: choose, paste or drop screenshots. */
export function PickView({ onChoose, onFiles, error, onAnki }: PickViewProps) {
  const online = useOnline();
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
          <Button block icon={online ? "camera" : "cloud-off"} disabled={!online} className={CANT_CLASS} onClick={onChoose}>
            {online ? "Выбрать скриншот" : "Нужна сеть"}
          </Button>
          {!online && <p className="m-0 -mt-1 text-[13px] leading-5 text-muted">{OFFLINE_REASON}</p>}
          {clipboard && (
            <Button block variant="secondary" icon="clipboard" disabled={!online} className={CANT_CLASS} onClick={pasteFromClipboard}>
              Вставить из буфера
            </Button>
          )}
        </div>
        <p className="m-0 mt-4 text-center text-[12px] leading-4 text-muted">{IMPORT_FOOTNOTE}</p>
        {onAnki && (
          <button
            type="button"
            onClick={onAnki}
            className="mt-6 flex min-h-11 w-full items-center gap-3 border-y border-rule bg-transparent py-2 text-left active:bg-surface-2"
          >
            <Icon name="cards" size={18} strokeWidth={1.5} className="shrink-0 text-ink" />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] leading-5 text-ink">Колода Anki</span>
              <span className="block text-[13px] leading-5 text-muted">.apkg или текстовый экспорт — недостающее дополним</span>
            </span>
            <Icon name="chevron-right" size={14} strokeWidth={2} className="shrink-0 text-muted" />
          </button>
        )}
      </main>
    </>
  );
}
