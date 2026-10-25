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

/**
 * Start of the import: choose, paste or drop screenshots. Phones (Import-Pick B): one white index
 * card that is itself the «Выбрать скриншот» button, its bottom edge the ink bar; dashed only while
 * a file is dragged over it (pointer:fine). Anki is a quiet text link under the privacy line.
 */
export function PickView({ onChoose, onFiles, error, onAnki }: PickViewProps) {
  const online = useOnline();
  const dragging = useImageDropAndPaste(onFiles);
  const { supported: clipboard, error: clipboardError, paste: pasteFromClipboard } = useClipboardPaste(onFiles);

  const message = error ?? clipboardError;
  const action = online ? "Выбрать скриншот" : "Нужна сеть";

  return (
    <>
      <Header large title="Импорт со скриншота" fallbackHref="/library" />
      <main className="flex flex-1 flex-col px-4 pt-2 pb-6">
        <button
          type="button"
          aria-label={action}
          aria-describedby="import-pick-what"
          disabled={!online}
          onClick={onChoose}
          className={cx(
            "group flex min-h-[260px] flex-1 cursor-pointer flex-col overflow-hidden rounded-card border bg-surface p-0 text-center text-ink transition-[background-color,border-color,scale] duration-(--dur-quick) ease-standard",
            "enabled:active:scale-[.98] enabled:active:bg-surface-2 disabled:cursor-default",
            dragging ? "border-dashed border-ink bg-surface-2" : "border-rule",
          )}
        >
          <span className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8">
            <Icon name="camera" size={28} strokeWidth={1.5} className={online ? "text-ink" : "text-muted"} />
            <span className="font-serif text-[22px] leading-7 font-medium tracking-[-0.01em]">
              {dragging ? "Отпустите, чтобы распознать" : "Скриншот со словами"}
            </span>
            <span id="import-pick-what" className="text-[13px] leading-5 text-muted">
              Переписка, пост или субтитры
            </span>
            <span className="meta hidden [@media(pointer:fine)]:block">Можно перетащить сюда или вставить</span>
          </span>
          <span
            aria-hidden="true"
            className={cx(
              "flex h-[52px] shrink-0 items-center justify-center gap-2 text-[15px] leading-5 font-medium",
              online ? "bg-ink text-on-ink group-active:bg-ink-press" : "border-t border-rule bg-surface text-boundary",
            )}
          >
            <Icon name={online ? "camera" : "cloud-off"} size={18} />
            {action}
          </span>
        </button>
        {!online && <p className="m-0 mt-2 text-[13px] leading-5 text-muted">{OFFLINE_REASON}</p>}

        {message && (
          <p role="alert" className="m-0 mt-4 flex items-start gap-2 text-[13px] leading-5 text-again">
            <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
            <span>{message}</span>
          </p>
        )}

        {clipboard && (
          <Button block variant="secondary" icon="clipboard" disabled={!online} className={cx("mt-3", CANT_CLASS)} onClick={pasteFromClipboard}>
            Вставить из буфера
          </Button>
        )}
        <p className="m-0 mt-4 text-center text-[12px] leading-4 text-muted">{IMPORT_FOOTNOTE}</p>
        {onAnki && (
          <button
            type="button"
            onClick={onAnki}
            className="press-sm mx-auto mt-2 flex min-h-11 items-center gap-0.5 bg-transparent px-2 text-[14px] leading-5 text-ink"
          >
            Или колода Anki
            <Icon name="chevron-right" size={14} strokeWidth={2} className="text-muted" />
          </button>
        )}
      </main>
    </>
  );
}
