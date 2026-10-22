"use client";

import { Button } from "@/components/ui/Button";
import { Sheet, SheetCloseButton, SheetTitle } from "@/components/ui/Sheet";
import type { ImportResult } from "@/lib/backup";
import { describeBackupPreview } from "./format";

export interface BackupPreview {
  fileName: string;
  result: ImportResult & { exported_at: string | null };
}

export interface BackupImportSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: BackupPreview | null;
  busy: boolean;
  onConfirm: () => void;
  onClosed?: () => void;
}

const exportedOn = (iso: string) =>
  new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));

/** «Импорт JSON» confirmation: what the backup adds, replaces and deletes before anything is written. */
export function BackupImportSheet({ open, onOpenChange, preview, busy, onConfirm, onClosed }: BackupImportSheetProps) {
  const lines = preview ? describeBackupPreview(preview.result) : [];
  const empty = !!preview && lines.length === 0;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
      onClosed={onClosed}
      height="auto"
      footer={
        empty ? (
          <Button variant="secondary" block onClick={() => onOpenChange(false)}>
            Закрыть
          </Button>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" block disabled={busy} onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button block loading={busy} disabled={!preview} onClick={onConfirm}>
              Импортировать
            </Button>
          </div>
        )
      }
    >
      <div className="flex items-center justify-between pt-2 pr-1 pl-4">
        <SheetTitle>Импорт копии</SheetTitle>
        <SheetCloseButton />
      </div>
      {preview && (
        <div className="px-4 pb-4">
          <p className="meta m-0 truncate leading-4">
            {preview.fileName}
            {preview.result.exported_at && ` · от ${exportedOn(preview.result.exported_at)}`}
          </p>
          {empty ? (
            <p className="mt-4 mb-0 text-[15px] leading-[22px]">Ничего нового — всё уже есть.</p>
          ) : (
            <>
              <dl className="m-0 mt-3 border-t border-rule">
                {lines.map((line) => (
                  <div key={line.label} className="flex min-h-12 items-center justify-between gap-3 border-b border-rule">
                    <dt className="text-[15px] leading-5">{line.label}</dt>
                    <dd className="m-0 text-right font-mono text-[12px] leading-4 tracking-[.02em] text-muted">{line.text}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 mb-0 text-[13px] leading-[18px] text-muted">
                Из копии берутся записи, которые новее, чем на этом устройстве. Сразу после импорта его можно отменить.
              </p>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}
