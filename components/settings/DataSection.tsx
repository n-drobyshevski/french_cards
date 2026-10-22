"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { signOut, useAuthUser } from "@/components/auth/session";
import { isIos } from "@/components/pwa/platform";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icons";
import { useSnackbar } from "@/components/ui/Snackbar";
import { BackupError, backupFileName, exportBackupBlob, importBackup, previewBackupImport, undoBackupImport } from "@/lib/backup";
import { importLegacyHtml } from "@/lib/seed";
import { syncNow, useSyncStatus } from "@/lib/sync";
import { SYNC_TABLES } from "@/lib/types";
import { softDeleteWords } from "@/lib/words";
import { BackupImportSheet, type BackupPreview } from "./BackupImportSheet";
import { describeBackupImport, describeLegacyImport, syncLine } from "./format";
import { SettingsButtonRow, SettingsRow, SettingsSection } from "./SettingsList";
import { useClock } from "./useClock";

const DOT: Record<"good" | "again" | "muted", string> = { good: "bg-good", again: "bg-again", muted: "bg-muted" };

/** Saves the backup: share sheet on iOS (where download links open a preview), a download elsewhere. */
async function saveBackup(): Promise<"saved" | "cancelled"> {
  const now = new Date();
  const blob = await exportBackupBlob(now);
  const name = backupFileName(now);
  if (isIos() && typeof navigator.share === "function" && typeof File === "function") {
    const file = new File([blob], name, { type: "application/json" });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
        return "saved";
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
        // Fall through to a plain download.
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "saved";
}

const message = (error: unknown, fallback: string) =>
  error instanceof BackupError || (error instanceof Error && /[а-яё]/i.test(error.message)) ? (error as Error).message : fallback;

/** «Данные»: sync status, JSON export/import, the old-version import and sign-out. */
export function DataSection() {
  const toast = useSnackbar();
  const auth = useAuthUser();
  const sync = useSyncStatus();
  const nowMs = useClock();
  const [busy, setBusy] = useState<null | "export" | "json" | "html" | "signout">(null);
  const jsonInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<(BackupPreview & { text: string }) | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const htmlInput = useRef<HTMLInputElement>(null);

  const line = syncLine({ auth, sync, nowMs });
  const signedIn = auth.status === "signed_in" || auth.status === "offline";

  const onExport = async () => {
    setBusy("export");
    try {
      const result = await saveBackup();
      if (result === "saved") toast.show({ message: "Резервная копия сохранена" });
    } catch (error) {
      toast.show({ message: message(error, "Не получилось сохранить копию") });
    } finally {
      setBusy(null);
    }
  };

  /** «Импорт JSON» step 1: read the file and show what it would change. Nothing is written yet. */
  const onJsonFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy("json");
    try {
      const text = await file.text();
      const result = await previewBackupImport(text);
      setPending({ fileName: file.name, result, text });
      setConfirmOpen(true);
    } catch (error) {
      toast.show({ message: message(error, "Не получилось прочитать файл") });
    } finally {
      setBusy(null);
    }
  };

  /** Step 2, after «Импортировать»: merge, then offer «Отменить». */
  const onConfirmImport = async () => {
    if (!pending || importing) return;
    setImporting(true);
    try {
      const result = await importBackup(pending.text);
      setConfirmOpen(false);
      const changed =
        result.settings === "imported" || SYNC_TABLES.some((t) => result[t].inserted + result[t].updated > 0);
      toast.show({
        message: describeBackupImport(result),
        ...(changed
          ? {
              actionLabel: "Отменить",
              onAction: () => {
                undoBackupImport(result.undo).then(
                  () => toast.show({ message: "Импорт отменён" }),
                  () => toast.show({ message: "Не получилось отменить импорт" }),
                );
              },
            }
          : {}),
      });
    } catch (error) {
      toast.show({ message: message(error, "Не получилось импортировать копию") });
    } finally {
      setImporting(false);
    }
  };

  const onHtmlFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy("html");
    try {
      const { added, skipped } = await importLegacyHtml(await file.text());
      const ids = added.map((w) => w.id);
      toast.show({
        message: describeLegacyImport(added.length, skipped),
        ...(ids.length
          ? {
              actionLabel: "Отменить",
              onAction: () => {
                void softDeleteWords(ids).catch(() => toast.show({ message: "Не получилось отменить импорт" }));
              },
            }
          : {}),
      });
    } catch (error) {
      toast.show({ message: message(error, "Не получилось прочитать файл") });
    } finally {
      setBusy(null);
    }
  };

  const onSignOut = async () => {
    setBusy("signout");
    try {
      await signOut();
    } catch {
      toast.show({ message: "Не получилось выйти — проверьте сеть" });
      setBusy(null);
    }
  };

  const status = (
    <>
      <span aria-hidden="true" className={cx("size-1.5 shrink-0 rounded-[1px]", DOT[line.tone])} />
      <span
        className={cx(
          "max-w-[62%] truncate font-mono text-[11px] leading-4 tracking-[.02em]",
          line.tone === "again" ? "text-again" : "text-muted",
        )}
      >
        {line.text}
      </span>
    </>
  );

  return (
    <>
      <SettingsSection title="Данные">
        {line.canSync ? (
          <SettingsButtonRow
            label="Синхронизация"
            aria-label={`Синхронизация: ${line.text}. Синхронизировать сейчас`}
            onClick={() => void syncNow()}
            trailing={status}
          />
        ) : (
          <SettingsRow label="Синхронизация">{status}</SettingsRow>
        )}

        <SettingsButtonRow
          label="Экспорт JSON"
          disabled={busy !== null}
          aria-busy={busy === "export" || undefined}
          onClick={() => void onExport()}
          trailing={<Icon name="download" size={16} className="text-muted" />}
        />

        <SettingsButtonRow
          label="Импорт JSON"
          disabled={busy !== null}
          aria-busy={busy === "json" || undefined}
          onClick={() => jsonInput.current?.click()}
          trailing={<Icon name="chevron-right" size={14} strokeWidth={2} className="text-muted" />}
        />
        <SettingsButtonRow
          label="Импорт из старой версии (HTML)"
          disabled={busy !== null}
          aria-busy={busy === "html" || undefined}
          onClick={() => htmlInput.current?.click()}
          trailing={<Icon name="chevron-right" size={14} strokeWidth={2} className="text-muted" />}
        />
        {signedIn && (
          <SettingsButtonRow
            label="Выйти"
            tone="again"
            disabled={busy !== null}
            aria-busy={busy === "signout" || undefined}
            onClick={() => void onSignOut()}
          />
        )}
      </SettingsSection>
      <input
        ref={jsonInput}
        type="file"
        accept="application/json,.json"
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => void onJsonFile(e)}
      />

      <BackupImportSheet
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        preview={pending}
        busy={importing}
        onConfirm={() => void onConfirmImport()}
        onClosed={() => setPending(null)}
      />

      <input
        ref={htmlInput}
        type="file"
        accept="text/html,.html,.htm"
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => void onHtmlFile(e)}
      />
    </>
  );
}
