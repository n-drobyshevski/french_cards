"use client";

import { Icon } from "@/components/ui/Icons";
import { deskButton } from "./desk";
import { DeskImportHeading } from "./DeskPickView";
import { IMPORT_FOOTNOTE } from "./ProcessingView";
import type { StatusViewProps } from "./StatusView";

/** Desktop: empty result or failure, laid out like the pick page (title, then what happened and what next). */
export function DeskStatusView({ icon, title, message, retryLabel, onRetry, onPickOther }: StatusViewProps) {
  return (
    <main data-wide="" className="flex flex-1 flex-col px-6 pt-10 pb-10 xl:px-12">
      <div className="max-w-[720px]">
        <DeskImportHeading />
        <section role="alert" className="mt-12 flex flex-col items-start">
          <Icon name={icon} size={24} strokeWidth={1.5} className="text-muted" />
          <h2 className="m-0 mt-3 font-serif text-[28px] leading-9 font-medium tracking-[-0.015em] text-ink">{title}</h2>
          <p className="m-0 mt-2 max-w-[60ch] text-[15px] leading-[22px] text-muted">{message}</p>
        </section>
        <div className="mt-6 flex items-center gap-2">
          {onRetry && (
            <button type="button" onClick={onRetry} className={deskButton("primary")}>
              {retryLabel ?? "Повторить"}
            </button>
          )}
          <button type="button" onClick={onPickOther} className={deskButton(onRetry ? "secondary" : "primary")}>
            Выбрать другой скриншот
          </button>
        </div>
        <p className="m-0 mt-6 text-[12px] leading-4 text-muted">{IMPORT_FOOTNOTE}</p>
      </div>
    </main>
  );
}
