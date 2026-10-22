"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useRouter } from "next/navigation";
import { startTransition, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSnackbar } from "@/components/ui/Snackbar";
import { markFoldersChanged } from "@/lib/folder-spotlight";
import { listFolders } from "@/lib/folders";
import { tokenMs } from "@/lib/motion";
import { getSettings } from "@/lib/settings";
import { IMAGE_ACCEPT, ImagePrepError, MAX_TILES, partitionImages } from "@/lib/image-prep";
import { findDuplicates } from "@/lib/text";
import type { Folder } from "@/lib/types";
import { foldersForExtract, useExtract } from "@/lib/use-extract";
import { commitImport, undoImport } from "./commit";
import { useDeskLayout } from "./desk";
import { DeskPickView } from "./DeskPickView";
import { DeskProcessingView } from "./DeskProcessingView";
import { DeskReviewView } from "./DeskReviewView";
import { PickView } from "./PickView";
import { ProcessingView } from "./ProcessingView";
import { ReviewView } from "./ReviewView";
import { buildRows, proposalsOf, wordsRu, type ImportRow } from "./rows";
import { SharedImages } from "./SharedImages";

const NO_FOLDERS: Folder[] = [];

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
 * Phone or desktop variant of a view. Before hydration the layout is unknown, so both render and
 * CSS shows one (no phone-screen flash on a desktop reload).
 */
function byLayout(desk: boolean | null, phone: ReactNode, wide: ReactNode): ReactNode {
  if (desk === true) return wide;
  if (desk === false) return phone;
  return (
    <>
      <div className="contents md:hidden">{phone}</div>
      <div className="contents max-md:hidden">{wide}</div>
    </>
  );
}

/**
 * Screenshot import: pick/paste/drop/share → processing (rows stream in, «Стоп») → review
 * («Найдено N слов», edit, themes) → «Добавить N слов» with an undo snackbar.
 * Nothing is saved before the user confirms. Stop, failure, a rate-limit wait and the finished
 * hold are states of the processing screen (MOTION-SPEC I3–I5), never a cut to another layout.
 */
export function ImportScreen() {
  const router = useRouter();
  const snackbar = useSnackbar();
  const desk = useDeskLayout();
  const { state, start, stop, cancelRetry, reset } = useExtract();
  const liveFolders = useLiveQuery(() => listFolders(), []);
  const folders = liveFolders ?? NO_FOLDERS;
  const [picked, setPicked] = usePickedFiles();
  const [pickError, setPickError] = useState<string | null>(null);
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  // The finished state is held before the review takes over (I3).
  const [reviewing, setReviewing] = useState(false);
  // Stopped: «Дальше с N словами» was pressed (I4).
  const [proceed, setProceed] = useState(false);
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const foldersRef = useRef<Folder[] | undefined>(liveFolders);
  useEffect(() => {
    foldersRef.current = liveFolders;
  }, [liveFolders]);

  const clearRows = useCallback(() => {
    setRows(null);
    setReviewing(false);
    setProceed(false);
  }, []);

  const begin = useCallback(
    async (chosen: File[]) => {
      const { accepted, rejected } = partitionImages(chosen);
      if (accepted.length === 0) {
        setPickError(rejected.length > 0 ? new ImagePrepError("unsupported").message : null);
        return;
      }
      if (accepted.length > MAX_TILES) {
        reset();
        clearRows();
        setPickError(new ImagePrepError("too_many").message);
        return;
      }
      reset();
      clearRows();
      setPickError(null);
      setPicked(accepted);
      const [list, settings] = await Promise.all([
        foldersRef.current ?? listFolders(),
        getSettings(),
      ]);
      await start(accepted, foldersForExtract(list), { model: settings.ai_model_extract, notes: settings.notes_enabled });
    },
    [reset, start, setPicked, clearRows],
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
    clearRows();
    setPickError(null);
    setPicked([]);
  }, [reset, setPicked, clearRows]);

  // Rows are in (or the user goes on with what arrived before «Стоп»): look for words already in
  // the library, then show the review list.
  const finished = state.items.length > 0 && (state.phase === "done" || (state.phase === "stopped" && proceed));
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

  // Done: step 03 ✓ and the full bar hold --dur-done-hold, then the review replaces the stream row
  // for row (I3). After «Дальше» the user asked for it, so it comes at once.
  useEffect(() => {
    if (!rows || reviewing) return;
    const timer = window.setTimeout(() => setReviewing(true), state.phase === "done" ? tokenMs("--dur-done-hold", 400) : 0);
    return () => window.clearTimeout(timer);
  }, [rows, reviewing, state.phase]);

  const proposals = useMemo(() => proposalsOf(state.items), [state.items]);

  const add = async () => {
    if (!rows || saving) return;
    setSaving(true);
    let result: Awaited<ReturnType<typeof commitImport>>;
    try {
      result = await commitImport(rows);
    } catch (error) {
      setSaving(false);
      snackbar.show({ message: error instanceof Error && error.message ? error.message : "Не удалось добавить слова" });
      return;
    }
    if (result.words.length === 0) {
      setSaving(false);
      snackbar.show({ message: result.skipped > 0 ? "Эти слова уже есть в библиотеке" : "Нечего добавить" });
      return;
    }
    // The themes that received words are lit once in the library (§5.10: containers, not rows).
    markFoldersChanged(result.words.map((w) => w.folder_id));
    snackbar.show({
      message: `Добавлено ${wordsRu(result.words.length)}`,
      actionLabel: "Отменить",
      onAction: () => {
        undoImport(result)
          .then(() => snackbar.show({ message: "Импорт отменён" }))
          .catch(() => snackbar.show({ message: "Не удалось отменить" }));
      },
    });
    // «Добавляем…» stays until the library is on screen: the reset rides the navigation's
    // transition, so the pick screen never flashes in between (MOTION-SPEC I7).
    startTransition(() => {
      setSaving(false);
      restart();
      router.replace("/library");
    });
  };

  let view: ReactNode;
  if (rows && reviewing) {
    const props = {
      rows,
      onRowsChange: (update: (rows: ImportRow[]) => ImportRow[]) => setRows((rs) => (rs ? update(rs) : rs)),
      folders,
      proposals,
      thumbs: picked.urls,
      images: state.images,
      tiles: state.tiles,
      incomplete: state.phase === "stopped" ? ("stopped" as const) : state.incomplete ? ("cut" as const) : null,
      saving,
      onAdd: add,
      onRestart: () => void begin(picked.files),
    };
    view = byLayout(desk, <ReviewView {...props} />, <DeskReviewView {...props} onPickOther={restart} />);
  } else if (state.phase === "idle") {
    view = byLayout(
      desk,
      <PickView onChoose={choose} onFiles={onFiles} error={pickError} />,
      <DeskPickView onChoose={choose} onFiles={onFiles} error={pickError} />,
    );
  } else {
    const props = {
      phase: state.phase,
      items: state.items,
      images: state.images,
      tiles: state.tiles,
      thumbs: picked.urls,
      checking: finished && !rows,
      complete: !!rows,
      incomplete: state.incomplete,
      error: state.error,
      onStop: stop,
      onRetry: () => void begin(picked.files),
      onContinue: () => setProceed(true),
      onPickOther: choose,
      onCancelRetry: cancelRetry,
    };
    view = byLayout(desk, <ProcessingView {...props} />, <DeskProcessingView {...props} />);
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
