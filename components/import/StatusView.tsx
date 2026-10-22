"use client";

import { Button } from "@/components/ui/Button";
import { Header } from "@/components/ui/Header";
import { Icon, type IconName } from "@/components/ui/Icons";
import { IMPORT_FOOTNOTE } from "./ProcessingView";

export interface StatusViewProps {
  icon: IconName;
  title: string;
  message: string;
  /** Primary action, e.g. «Повторить». */
  retryLabel?: string;
  onRetry?: () => void;
  onPickOther: () => void;
}

/** Empty result or failure: what happened and what to do next. */
export function StatusView({ icon, title, message, retryLabel, onRetry, onPickOther }: StatusViewProps) {
  return (
    <>
      <Header title="Импорт со скриншота" fallbackHref="/library" />
      <main className="flex flex-1 flex-col px-4 pt-2 pb-6">
        <section role="alert" className="flex flex-1 flex-col items-start justify-center gap-3 py-10">
          <Icon name={icon} size={24} className="text-muted" />
          <h2 className="m-0 font-serif text-[26px] leading-8 font-medium tracking-[-0.01em]">{title}</h2>
          <p className="m-0 max-w-[36ch] text-[15px] leading-[22px] text-muted">{message}</p>
        </section>
        <div className="flex flex-col gap-3">
          {onRetry && (
            <Button block icon="refresh" onClick={onRetry}>
              {retryLabel ?? "Повторить"}
            </Button>
          )}
          <Button block variant={onRetry ? "secondary" : "primary"} icon="camera" onClick={onPickOther}>
            Выбрать другой скриншот
          </Button>
        </div>
        <p className="m-0 mt-4 text-center text-[12px] leading-4 text-muted">{IMPORT_FOOTNOTE}</p>
      </main>
    </>
  );
}
