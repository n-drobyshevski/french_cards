"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icons";
import { Sheet, SheetCloseButton, SheetTitle } from "@/components/ui/Sheet";

export interface ConnectorHelpSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opened from inside «Попросить набор» (a nested sheet). */
  nested?: boolean;
}

/**
 * «Как подключить коннектор» (Exercise-S-Connector-Help): three steps in claude.ai. The connector's
 * address is personal, like a password, so the app never shows it; step 2 only says who has it.
 */
export function ConnectorHelpSheet({ open, onOpenChange, nested = false }: ConnectorHelpSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} nested={nested} dialogWidth={480} description="Как подключить коннектор «Карточки» в Claude">
      <div className="flex h-11 shrink-0 items-center gap-2 pr-1 pl-4 md:mt-2 md:pl-6">
        <SheetTitle className="min-w-0 flex-1 truncate">Как подключить коннектор</SheetTitle>
        <SheetCloseButton />
      </div>
      <div className="flex flex-col px-4 pb-7 md:px-6 md:pb-6">
        <p className="m-0 text-[15px] leading-[22px] text-muted">
          Наборы составляет Claude в чате. Для этого ему нужен коннектор «Карточки» — один раз.
        </p>
        <ol className="m-0 mt-3.5 flex list-none flex-col border-b border-rule p-0">
          <Step n={1} title="Откройте настройки коннекторов">
            <p className="m-0 flex flex-wrap items-center gap-x-1.5 gap-y-1 font-mono text-[12px] leading-[18px] text-ink">
              {["claude.ai", "Настройки", "Коннекторы", "Добавить свой"].map((part, i) => (
                <span key={part} className="contents">
                  {i > 0 && (
                    <span aria-hidden="true" className="text-boundary">
                      ›
                    </span>
                  )}
                  <span>{part}</span>
                </span>
              ))}
            </p>
          </Step>
          <Step n={2} title="Вставьте адрес коннектора">
            <div className="flex h-11 items-center gap-2 rounded-chip border border-dashed border-boundary bg-surface px-3 text-muted">
              <LockGlyph />
              <span className="min-w-0 flex-1 truncate text-[13px] leading-[18px]">Адрес коннектора — у владельца</span>
            </div>
            <p className="m-0 text-[12px] leading-4 text-muted">Адрес личный, как пароль. В приложении он не показывается.</p>
          </Step>
          <Step n={3} title="Проверьте в новом чате">
            <div className="flex h-11 items-center gap-2.5 rounded-chip border border-rule bg-surface px-3">
              <span className="meta">Инструменты</span>
              <span className="min-w-0 flex-1 text-[15px] leading-5 font-medium">Карточки</span>
              <Icon name="check" size={14} strokeWidth={2} className="text-good" />
            </div>
            <p className="m-0 text-[12px] leading-4 text-muted">«Карточки» должны быть в списке инструментов чата.</p>
          </Step>
        </ol>
        <div role="note" className="mt-3.5 flex items-start gap-2.5 text-muted">
          <Icon name="refresh" size={16} strokeWidth={1.5} className="mt-0.5 shrink-0" />
          <p className="m-0 text-[13px] leading-5">Набор приходит при следующей синхронизации — когда вы вернётесь в приложение.</p>
        </div>
        <Button block className="mt-5" onClick={() => onOpenChange(false)}>
          Понятно
        </Button>
      </div>
    </Sheet>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3 border-t border-rule py-3.5">
      <span
        aria-hidden="true"
        className="flex size-7 items-center justify-center rounded-chip border border-ink bg-surface font-mono text-[12px] font-medium"
      >
        {n}
      </span>
      <div className="flex min-w-0 flex-col gap-2 pt-[3px]">
        <p className="m-0 text-[15px] leading-[22px]">{title}</p>
        {children}
      </div>
    </li>
  );
}

function LockGlyph() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <rect x="5" y="11" width="14" height="9" rx="1" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
