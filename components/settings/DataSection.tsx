"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type ChangeEvent } from "react";
import { ANKI_ACCEPT } from "@/components/import/anki-files";
import { handOffImages } from "@/components/import/clipboard";
import { GLOBAL_IMPORT_URL } from "@/components/import/GlobalImportDrop";
import { signOut, useAuthUser } from "@/components/auth/session";
import { isIos } from "@/components/pwa/platform";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icons";
import { useSnackbar } from "@/components/ui/Snackbar";
import { BackupError, backupFileName, exportBackupBlob, importBackup, previewBackupImport, undoBackupImport } from "@/lib/backup";
import { importLegacyHtml } from "@/lib/seed";
import { SYNC_TABLES } from "@/lib/types";
import { useDelayedFlag } from "@/lib/use-delayed-flag";
import { softDeleteWords } from "@/lib/words";
import { BackupImportSheet, type BackupPreview } from "./BackupImportSheet";
import { DeskButtonRow, DeskRow, DeskSection } from "./DesktopControls";
import { describeBackupImport, describeLegacyImport, shortEmail, SYNC_LINE_TEXTS, type SyncLine } from "./format";
import { SettingsButtonRow, SettingsRow, SettingsSection } from "./SettingsList";
import { useSyncLine } from "./useSyncLine";

/** Said once on phones, here, instead of under «План повторения» and «Чаще в упражнениях». */
const SHARED_NOTE = "План повторения и упражнения общие для всех устройств — Claude их тоже видит.";

const DOT: Record<SyncLine["tone"], string> = { good: "bg-good", ink: "bg-ink", again: "bg-again", muted: "bg-boundary" };

/**
 * The phone sync status (T5, board M-Settings-Sync F3): dot + mono text, and for a failure the
 * reason on a second muted line. The slot is as wide as the widest state, so the row never jitters
 * when the text changes; the dot colour crossfades.
 */
function SyncStatus({ line }: { line: SyncLine }) {
  const mono = "font-mono text-[11px] leading-4 tracking-[.02em] whitespace-nowrap";
  return (
    <span className="grid max-w-[70%] min-w-0 shrink-0 justify-items-start text-left">
      {SYNC_LINE_TEXTS.map((text) => (
        <span key={text} aria-hidden="true" className={cx("invisible col-start-1 row-start-1 pl-3.5", mono)}>
          {text}
        </span>
      ))}
      <span className="col-start-1 row-start-1 flex max-w-full min-w-0 items-center gap-2">
        <span
          aria-hidden="true"
          className={cx(
            "size-1.5 shrink-0 rounded-[1px] transition-colors duration-(--dur-quick) ease-standard",
            DOT[line.tone],
            !line.text && "invisible",
          )}
        />
        <span className={cx("min-w-0 truncate", mono, line.tone === "again" ? "text-again" : "text-muted")}>
          {line.text}
          {line.retry && (
            <>
              {" · "}
              <span className="underline underline-offset-[3px]">Повторить</span>
            </>
          )}
        </span>
      </span>
      {line.detail && <span className={cx("col-start-1 row-start-2 max-w-full truncate pl-3.5 text-muted", mono)}>{line.detail}</span>}
    </span>
  );
}

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

/**
 * «Данные»: sync status, JSON export/import, the old-version import and sign-out. `desktop`: the
 * rows of D-Settings (text rows, a dot only for «нет сети» / «ошибка»).
 */
export function DataSection({ desktop = false }: { desktop?: boolean }) {
  const toast = useSnackbar();
  const auth = useAuthUser();
  const { line, busy: syncBusy, sync } = useSyncLine();
  const [busy, setBusy] = useState<null | "export" | "json" | "html" | "signout">(null);
  const jsonInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<(BackupPreview & { text: string }) | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const htmlInput = useRef<HTMLInputElement>(null);
  const ankiInput = useRef<HTMLInputElement>(null);
  const router = useRouter();
  // The deck goes to the import screen, which reads it and asks what to take.
  const onAnkiFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    handOffImages([file]);
    router.push(GLOBAL_IMPORT_URL);
  };

  // The phone rows swap their label in place (T6): after 150 ms for local work, at once for the
  // network (sign-out), then for at least 500 ms. They never grey out.
  const exporting = useDelayedFlag(busy === "export", { delay: 150, min: 500 });
  const readingJson = useDelayedFlag(busy === "json", { delay: 150, min: 500 });
  const readingHtml = useDelayedFlag(busy === "html", { delay: 150, min: 500 });
  const signingOut = useDelayedFlag(busy === "signout", { delay: 0, min: 500 });
  const signedIn = auth.status === "signed_in" || auth.status === "offline";

  const onExport = async () => {
    setBusy("export");
    try {
      const result = await saveBackup();
      // Phones: the share sheet / download is the confirmation; no success bar without an undo.
      if (result === "saved" && desktop) toast.show({ message: "Резервная копия сохранена" });
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
                  () => desktop && toast.show({ message: "Импорт отменён" }),
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

  const syncText = `${line.text}${line.retry ? " · Повторить" : ""}`;
  const syncLabel = `Синхронизация: ${syncText}${line.detail ? `. ${line.detail}` : ""}. Синхронизировать сейчас`;
  const deskDot = line.tone === "again" ? "again" : line.text.startsWith("Нет сети") ? "muted" : null;
  const deskStatus = (
    <span className="flex min-w-0 shrink flex-col items-end">
      <span className="flex max-w-full min-w-0 items-center gap-2">
        {deskDot && <span aria-hidden="true" className={cx("size-1.5 shrink-0 rounded-full", DOT[deskDot])} />}
        <span className={cx("truncate text-[13px] leading-4 tabular-nums", deskDot === "again" ? "text-again" : "text-muted")}>{syncText}</span>
      </span>
      {line.detail && <span className="max-w-full truncate text-[12px] leading-4 text-muted tabular-nums">{line.detail}</span>}
    </span>
  );
  const account = auth.email ? (
    <span className="truncate font-mono text-[11px] leading-4 tracking-[.02em] text-muted">{shortEmail(auth.email)}</span>
  ) : undefined;

  const rows = desktop ? (
    <DeskSection id="set-data" title="Данные">
      {line.canSync || syncBusy ? (
        <DeskButtonRow label="Синхронизация" aria-label={syncLabel} aria-busy={syncBusy || undefined} onClick={sync} trailing={deskStatus} />
      ) : (
        <DeskRow label="Синхронизация">{deskStatus}</DeskRow>
      )}
      <DeskButtonRow
        label={busy === "export" ? "Сохраняем…" : "Экспорт JSON"}
        disabled={busy !== null}
        aria-busy={busy === "export" || undefined}
        onClick={() => void onExport()}
      />
      <DeskButtonRow
        label={busy === "json" ? "Читаем файл…" : "Импорт JSON"}
        disabled={busy !== null}
        aria-busy={busy === "json" || undefined}
        onClick={() => jsonInput.current?.click()}
      />
      <DeskButtonRow
        label={busy === "html" ? "Читаем файл…" : "Импорт из старой версии (HTML)"}
        disabled={busy !== null}
        aria-busy={busy === "html" || undefined}
        onClick={() => htmlInput.current?.click()}
      />
      <DeskButtonRow label="Импорт из Anki" disabled={busy !== null} onClick={() => ankiInput.current?.click()} />
      {signedIn && (
        <DeskButtonRow
          label={busy === "signout" ? "Выходим…" : "Выйти"}
          tone="again"
          disabled={busy !== null}
          aria-busy={busy === "signout" || undefined}
          onClick={() => void onSignOut()}
          trailing={account}
        />
      )}
    </DeskSection>
  ) : null;

  return (
    <>
      {rows ?? (
        <SettingsSection
          title="Данные"
          anchor="set-data"
          footer={<p className="m-0 border-t border-rule pt-2 text-[12px] leading-4 text-muted">{SHARED_NOTE}</p>}
        >
          {line.canSync || syncBusy ? (
            <SettingsButtonRow
              label="Синхронизация"
              aria-label={syncLabel}
              pending={syncBusy}
              onClick={sync}
              trailing={<SyncStatus line={line} />}
              className="min-h-14"
            />
          ) : (
            <SettingsRow label="Синхронизация" className="min-h-14">
              <SyncStatus line={line} />
            </SettingsRow>
          )}

          <SettingsButtonRow
            label="Экспорт JSON"
            pendingLabel="Сохраняем…"
            pending={busy === "export"}
            swapped={exporting}
            blocked={busy !== null}
            onClick={() => void onExport()}
            trailing={<Icon name="download" size={16} className="text-muted" />}
          />

          <SettingsButtonRow
            label="Импорт JSON"
            pendingLabel="Читаем файл…"
            pending={busy === "json"}
            swapped={readingJson}
            blocked={busy !== null}
            onClick={() => jsonInput.current?.click()}
            trailing={<Icon name="chevron-right" size={14} strokeWidth={2} className="text-muted" />}
          />
          <SettingsButtonRow
            label="Импорт из старой версии (HTML)"
            pendingLabel="Читаем файл…"
            pending={busy === "html"}
            swapped={readingHtml}
            blocked={busy !== null}
            onClick={() => htmlInput.current?.click()}
            trailing={<Icon name="chevron-right" size={14} strokeWidth={2} className="text-muted" />}
          />
          <SettingsButtonRow
            label="Импорт из Anki"
            blocked={busy !== null}
            onClick={() => ankiInput.current?.click()}
            trailing={<Icon name="chevron-right" size={14} strokeWidth={2} className="text-muted" />}
          />
          {signedIn && (
            <SettingsButtonRow
              label="Выйти"
              tone="again"
              pendingLabel="Выходим…"
              pending={busy === "signout"}
              swapped={signingOut}
              blocked={busy !== null}
              onClick={() => void onSignOut()}
              trailing={account}
            />
          )}
        </SettingsSection>
      )}
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
      <input ref={ankiInput} type="file" accept={ANKI_ACCEPT} className="hidden" tabIndex={-1} aria-hidden="true" onChange={onAnkiFile} />
    </>
  );
}
