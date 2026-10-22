"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSnackbar } from "@/components/ui/Snackbar";
import { listFolders } from "@/lib/folders";
import { getSettings } from "@/lib/settings";
import { IMAGE_ACCEPT, ImagePrepError, MAX_TILES, partitionImages } from "@/lib/image-prep";
import { findDuplicates } from "@/lib/text";
import type { Folder } from "@/lib/types";
import { foldersForExtract, useExtract, type ExtractError } from "@/lib/use-extract";
import { commitImport, undoImport } from "./commit";
import { PickView } from "./PickView";
import { ProcessingView } from "./ProcessingView";
import { ReviewView } from "./ReviewView";
import { buildRows, proposalsOf, type ImportRow } from "./rows";
import { SharedImages } from "./SharedImages";
import { StatusView } from "./StatusView";

const NO_FOLDERS: Folder[] = [];

function errorTitle(error: ExtractError): string {
  if (error.code === "offline") return "Нет сети";
  if (error.code === "rate_limited") return "Подождите немного";
  if (error.code === "unauthenticated" || error.code === "forbidden") return "Нужен вход";
  return "Не получилось";
}

/** Keeps object URLs for the picked screenshots and revokes them when replaced or unmounted. */
function usePickedFiles() {
  const [picked, setPicked] = useState<{ files: File[]; urls: string[] }>({ files: [], urls: [] });
  const urls = useRef<string[]>([]);
  useEffect(
    () => () => {
      for (const u of urls.current) URL.revokeObjectURL(u);
      urls.current = [];
    },
    [],
  );
  const set = useCallback((files: File[]) => {
    for (const u of urls.current) URL.revokeObjectURL(u);
    urls.current = files.map((f) => URL.createObjectURL(f));
    setPicked({ files, urls: urls.current });
  }, []);
  return [picked, set] as const;
}

/**
 * Screenshot import: pick/paste/drop/share → processing (rows stream in, «Стоп») → review
 * («Найдено N слов», edit, themes) → «Добавить N слов» with an undo snackbar.
 * Nothing is saved before the user confirms.
 */
export function ImportScreen() {
  const router = useRouter();
  const snackbar = useSnackbar();
  const { state, start, stop, reset } = useExtract();
  const liveFolders = useLiveQuery(() => listFolders(), []);
  const folders = liveFolders ?? NO_FOLDERS;
  const [picked, setPicked] = usePickedFiles();
  const [pickError, setPickError] = useState<string | null>(null);
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const foldersRef = useRef<Folder[] | undefined>(liveFolders);
  useEffect(() => {
    foldersRef.current = liveFolders;
  }, [liveFolders]);

  const begin = useCallback(
    async (chosen: File[]) => {
      const { accepted, rejected } = partitionImages(chosen);
      if (accepted.length === 0) {
        setPickError(rejected.length > 0 ? new ImagePrepError("unsupported").message : null);
        return;
      }
      if (accepted.length > MAX_TILES) {
        reset();
        setRows(null);
        setPickError(new ImagePrepError("too_many").message);
        return;
      }
      reset();
      setRows(null);
      setPickError(null);
      setPicked(accepted);
      const [list, settings] = await Promise.all([
        foldersRef.current ?? listFolders(),
        getSettings(),
      ]);
      await start(accepted, foldersForExtract(list), { model: settings.ai_model_extract, notes: settings.notes_enabled });
    },
    [reset, start, setPicked],
  );

  const choose = useCallback(() => input.current?.click(), []);
  const onFiles = useCallback((files: File[]) => void begin(files), [begin]);

  // A file dropped outside the pick view must not make the browser navigate to it.
  useEffect(() => {
    const block = (e: DragEvent) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files")) e.preventDefault();
    };
    window.addEventListener("dragover", block);
    window.addEventListener("drop", block);
    return () => {
      window.removeEventListener("dragover", block);
      window.removeEventListener("drop", block);
    };
  }, []);

  const restart = useCallback(() => {
    reset();
    setRows(null);
    setPickError(null);
    setPicked([]);
  }, [reset, setPicked]);

  // Rows are in: look for words already in the library, then show the review list.
  const finished = (state.phase === "done" || state.phase === "stopped") && state.items.length > 0;
  useEffect(() => {
    if (!finished || rows) return;
    let cancelled = false;
    const items = state.items;
    Promise.all([findDuplicates(items.map((i) => i.fr)), listFolders(), getSettings()])
      .then(([dups, fs, settings]) => {
        if (!cancelled) {
          setRows(
            buildRows(items, fs, dups, {
              autoSort: settings.auto_sort_enabled,
              slang: settings.slang_detect_enabled,
              examples: settings.examples_enabled,
            }),
          );
        }
      })
      .catch(() => {
        if (!cancelled) setRows(buildRows(items, foldersRef.current ?? [], new Map()));
      });
    return () => {
      cancelled = true;
    };
  }, [finished, rows, state.items]);

  const proposals = useMemo(() => proposalsOf(state.items), [state.items]);

  const add = async () => {
    if (!rows || saving) return;
    setSaving(true);
    try {
      const result = await commitImport(rows);
      if (result.words.length === 0) {
        snackbar.show({ message: result.skipped > 0 ? "Эти слова уже есть в библиотеке" : "Нечего добавить" });
        return;
      }
      let id = 0;
      id = snackbar.show({
        message: (
          <>
            Добавлено {result.words.length} ·{" "}
            <Link
              href="/"
              onClick={() => snackbar.hide(id)}
              className="text-on-ink underline decoration-1 underline-offset-[3px]"
            >
              Повторить сейчас
            </Link>
          </>
        ),
        actionLabel: "Отменить",
        onAction: () => {
          undoImport(result)
            .then(() => snackbar.show({ message: "Импорт отменён" }))
            .catch(() => snackbar.show({ message: "Не удалось отменить" }));
        },
      });
      restart();
      router.replace("/library");
    } catch (error) {
      snackbar.show({ message: error instanceof Error && error.message ? error.message : "Не удалось добавить слова" });
    } finally {
      setSaving(false);
    }
  };

  let view: ReactNode;
  if (rows) {
    view = (
      <ReviewView
        rows={rows}
        onRowsChange={(update) => setRows((rs) => (rs ? update(rs) : rs))}
        folders={folders}
        proposals={proposals}
        thumbs={picked.urls}
        tiles={state.tiles}
        incomplete={state.phase === "stopped" ? "stopped" : state.incomplete ? "cut" : null}
        saving={saving}
        onAdd={add}
        onRestart={() => void begin(picked.files)}
      />
    );
  } else if (state.phase === "idle") {
    view = <PickView onChoose={choose} onFiles={onFiles} error={pickError} />;
  } else if (state.phase === "error" && state.error) {
    const error = state.error;
    view = (
      <StatusView
        icon={error.code === "offline" ? "cloud-off" : "alert"}
        title={errorTitle(error)}
        message={error.message}
        onRetry={error.retryable && picked.files.length > 0 ? () => void begin(picked.files) : undefined}
        onPickOther={choose}
      />
    );
  } else if (state.phase === "done" && state.items.length === 0) {
    view = (
      <StatusView
        icon="search"
        title="Слов не найдено"
        message="На скриншоте не нашлось французских слов. Попробуйте другой скриншот или обрежьте лишнее."
        onPickOther={choose}
      />
    );
  } else {
    view = (
      <ProcessingView
        phase={state.phase}
        items={state.items}
        images={state.images}
        tiles={state.tiles}
        thumbs={picked.urls}
        checking={finished}
        onStop={stop}
      />
    );
  }

  return (
    <>
      {view}
      <input
        ref={input}
        type="file"
        accept={IMAGE_ACCEPT}
        multiple
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length > 0) void begin(files);
        }}
      />
      <Suspense fallback={null}>
        <SharedImages
          onFiles={onFiles}
          onEmpty={() => setPickError("Не удалось получить скриншот. Поделитесь им ещё раз или выберите файл.")}
        />
      </Suspense>
    </>
  );
}
