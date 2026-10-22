"use client";

import { Icon } from "@/components/ui/Icons";
import { Kbd } from "@/components/ui/Kbd";
import { cx } from "@/components/ui/cx";
import { useFormatKeys } from "@/lib/key-names";
import { useClipboardPaste, useImageDropAndPaste } from "./clipboard";
import { DeskAlert, deskButton, DeskTag } from "./desk";
import type { PickViewProps } from "./PickView";
import { IMPORT_FOOTNOTE } from "./ProcessingView";

/** Page title + intro shared by the desktop pick and status views. */
export function DeskImportHeading() {
  return (
    <>
      <h1 className="m-0 font-serif text-[28px] leading-9 font-medium tracking-[-0.015em] text-ink">Импорт со скриншота</h1>
      <p className="m-0 mt-2 max-w-[60ch] text-[15px] leading-[22px] text-muted">
        Переписка, пост, субтитры или список слов с переводом. Длинный скриншот разрежем на части.
      </p>
    </>
  );
}

/** Margin notes beside the tray (replace the phone's step list). */
function MarginNotes() {
  const note = "m-0 font-serif text-[14px] leading-5 text-muted italic";
  return (
    <aside aria-label="Примечания" className="flex w-[280px] shrink-0 flex-col gap-4">
      <p className={note}>
        Если перевода на скриншоте нет, мы подберём его и пометим <DeskTag>ДОГАДКА</DeskTag> — такие строки стоит проверить.
      </p>
      <p className={note}>
        Слова, которые уже есть в библиотеке, помечены <DeskTag>УЖЕ ЕСТЬ</DeskTag> и не отмечены.
      </p>
      <p className={note}>{IMPORT_FOOTNOTE}</p>
    </aside>
  );
}

/**
 * Desktop import page, idle (D-Import-Drop): title, the file drop tray (dashed, a red dashed rule
 * 48px from the top; solid while files are dragged over the window) and margin notes.
 */
export function DeskPickView({ onChoose, onFiles, error }: PickViewProps) {
  const dragging = useImageDropAndPaste(onFiles);
  const clipboard = useClipboardPaste(onFiles);
  const keys = useFormatKeys();
  const message = error ?? clipboard.error;

  return (
    <main data-wide="" className="flex flex-1 flex-col px-6 pt-10 pb-10 xl:px-12">
      <div className="max-w-[720px]">
        <DeskImportHeading />
      </div>
      <div className="mt-8 flex flex-wrap items-start gap-8">
        <section
          aria-labelledby="import-tray-title"
          data-dragging={dragging || undefined}
          className={cx(
            "relative flex h-[432px] max-w-[720px] min-w-[480px] flex-[1_1_480px] flex-col rounded-[8px] transition-colors",
            dragging ? "border-2 border-ink bg-surface" : "border border-dashed border-muted bg-transparent",
          )}
        >
          <p className={cx("m-0 font-mono text-[11px] leading-4 text-muted", dragging ? "mt-[15px] ml-[39px]" : "mt-4 ml-10")}>
            PNG, JPEG, WebP · до 4 фрагментов
          </p>
          <div
            aria-hidden="true"
            className={cx(
              "absolute inset-x-0 top-[47px] h-0 border-t",
              dragging ? "-mx-0.5 border-t-2 border-solid border-red" : "border-dashed border-red",
            )}
          />
          <div className={cx("flex flex-col items-start", dragging ? "mt-[63px] ml-[39px]" : "mt-16 ml-10")}>
            <Icon name="image" size={24} strokeWidth={1.5} className="text-muted" />
            <h2 id="import-tray-title" className="m-0 mt-3 font-serif text-[28px] leading-9 font-medium tracking-[-0.015em] text-ink">
              {dragging ? "Отпустите, чтобы распознать" : "Скриншот со словами"}
            </h2>
            <p className="m-0 mt-2 flex h-5 items-center gap-1.5 text-[12px] leading-4 text-muted">
              <span>Можно перетащить сюда или вставить</span>
              <Kbd>{keys("Mod+V")}</Kbd>
            </p>
            <div className="mt-6 flex items-center gap-2">
              <button type="button" onClick={onChoose} className={deskButton("primary")}>
                Выбрать скриншот
              </button>
              {clipboard.supported && (
                <button type="button" onClick={() => void clipboard.paste()} className={deskButton("secondary")}>
                  Вставить из буфера
                </button>
              )}
            </div>
            {message && (
              <div className="mt-4 max-w-[52ch]">
                <DeskAlert>{message}</DeskAlert>
              </div>
            )}
          </div>
        </section>
        <MarginNotes />
      </div>
    </main>
  );
}
