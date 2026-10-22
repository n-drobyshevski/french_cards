"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { WordDetailSheet } from "@/components/library/WordDetailSheet";
import { useAddSheet } from "@/components/providers/AddSheetContext";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { Snackbar, useSnackbar } from "@/components/ui/Snackbar";
import { detectDirection } from "@/lib/ai/normalize";
import type { EnrichResult, Suggestion } from "@/lib/ai/schemas";
import { fillSavedWords, type EnrichInput } from "@/lib/enrich";
import { listFolders } from "@/lib/folders";
import { isLexiqueLoaded, loadLexique, prefixSearch, type LexiqueHit } from "@/lib/lexique";
import { getSettings } from "@/lib/settings";
import { normalizeLemma } from "@/lib/text";
import type { Folder } from "@/lib/types";
import { toFolderInputs, useSuggest } from "@/lib/use-suggest";
import { loadAddContext, loadDuplicate, loadListDuplicates } from "./data";
import {
  applyEnrichment,
  draftFromSuggestion,
  draftToSaveRequest,
  enrichKey,
  enrichScope,
  hasErrors,
  manualDraft,
  validateDraft,
  type DraftErrors,
  type WordDraft,
} from "./draft";
import { INBOX_CHOICE, type FolderChoice } from "./folder-choice";
import { ListPanel, type ListRow } from "./ListPanel";
import { cardNumber, nWords, plural } from "./match";
import { parseWordList } from "./parse-list";
import { AddSheetChrome, ToolButton, ToolLink } from "./parts";
import { saveWords, undoSave, type SaveRequest, type SaveResult } from "./save";
import { SearchPanel, type QuickFields } from "./SearchPanel";
import { FORM_ENRICH_DEBOUNCE_MS, LIST_ENRICH_DEBOUNCE_MS, useAutoEnrich } from "./use-auto-enrich";
import { WordForm } from "./WordForm";

type Mode = "search" | "form" | "list";
type FocusTarget = "search" | "fr" | "ru" | "list";

const NO_FOLDERS: Folder[] = [];
const FULL_SCOPE = { slang: true, example: true, pos: true } as const;

type ListEnrichInput = EnrichInput & { rowKey: string };
const EMPTY_QUICK: QuickFields = { other: "", folder: INBOX_CHOICE, error: null };
const DICTIONARY_ROWS = 3;
/** How long the in-sheet «Отменить» bar stays after «Добавить и ещё». */
const UNDO_BAR_MS = 7000;

/**
 * The quick-add bottom sheet, mounted once by AppProviders and opened with useAddSheet().open().
 * Each opening starts fresh (keyed by the provider's `session`).
 */
export function QuickAddSheet() {
  const sheet = useAddSheet();
  const [detailId, setDetailId] = useState<string | null>(null);

  const openWord = (id: string) => {
    sheet.setOpen(false);
    setDetailId(id);
  };

  return (
    <>
      <AddSession
        key={sheet.session}
        open={sheet.isOpen}
        onOpenChange={sheet.setOpen}
        initialFr={sheet.initial.fr ?? ""}
        onOpenWord={openWord}
      />
      <WordDetailSheet wordId={detailId} onClose={() => setDetailId(null)} />
    </>
  );
}

interface AddSessionProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialFr: string;
  onOpenWord: (id: string) => void;
}

function AddSession({ open, onOpenChange, initialFr, onOpenWord }: AddSessionProps) {
  const snackbar = useSnackbar();
  const folders = useLiveQuery(listFolders, [], NO_FOLDERS);
  const settings = useLiveQuery(getSettings);
  const context = useLiveQuery(() => loadAddContext(), []);
  const suggestionsEnabled = settings?.suggestions_enabled ?? true;
  const autoSort = settings?.auto_sort_enabled ?? true;
  const folderInputs = useMemo(() => toFolderInputs(folders), [folders]);
  const suggest = useSuggest({ folders: folderInputs, enabled: suggestionsEnabled });
  const { setQuery: requestSuggestions, cancel: cancelSuggestions } = suggest;

  const [mode, setMode] = useState<Mode>("search");
  const [query, setQuery] = useState(initialFr);
  const [draft, setDraft] = useState<WordDraft | null>(null);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [ackDuplicate, setAckDuplicate] = useState<string | null>(null);
  const [quick, setQuick] = useState<QuickFields>(EMPTY_QUICK);
  const [listText, setListText] = useState("");
  const [listFolder, setListFolder] = useState<FolderChoice>(INBOX_CHOICE);
  const [listToggled, setListToggled] = useState<ReadonlySet<string>>(() => new Set());
  const [listEnriched, setListEnriched] = useState<ReadonlyMap<string, EnrichResult>>(() => new Map());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lexReady, setLexReady] = useState(isLexiqueLoaded);
  const [focusRequest, setFocusRequest] = useState<{ target: FocusTarget } | null>(null);
  // After «Добавить и ещё» the undo bar lives in the sheet footer, which stays above the
  // on-screen keyboard (the page snackbar would sit under it).
  const [undoBar, setUndoBar] = useState<{ id: number; message: string; result: SaveResult } | null>(null);
  const undoSeq = useRef(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const frRef = useRef<HTMLInputElement>(null);
  const ruRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLTextAreaElement>(null);

  // Local dictionary: load once when the sheet opens; rows appear as soon as it is in memory.
  useEffect(() => {
    if (lexReady || !open) return;
    let live = true;
    loadLexique().then(
      () => live && setLexReady(true),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [lexReady, open]);

  // Prefill from useAddSheet().open({fr}).
  useEffect(() => {
    if (initialFr.trim()) requestSuggestions(initialFr);
  }, [initialFr, requestSuggestions]);

  useEffect(() => {
    if (!open) cancelSuggestions();
  }, [open, cancelSuggestions]);

  useEffect(() => {
    if (!undoBar) return;
    const timer = setTimeout(() => setUndoBar((u) => (u?.id === undoBar.id ? null : u)), UNDO_BAR_MS);
    return () => clearTimeout(timer);
  }, [undoBar]);

  useEffect(() => {
    if (!focusRequest) return;
    const refs = { search: inputRef, fr: frRef, ru: ruRef, list: listRef };
    refs[focusRequest.target].current?.focus();
  }, [focusRequest]);

  const trimmed = query.trim();
  const direction = detectDirection(trimmed);

  const dictionary = useMemo<LexiqueHit[]>(
    () => (lexReady && mode === "search" && trimmed && direction === "fr" ? prefixSearch(query, DICTIONARY_ROWS) : []),
    [lexReady, mode, query, trimmed, direction],
  );

  // Duplicate check: the typed French headword, or the form's French field.
  const dupText = mode === "form" ? (draft?.fr ?? "") : mode === "search" && direction === "fr" ? query : "";
  const dupKey = normalizeLemma(dupText);
  const duplicateRow = useLiveQuery(() => (dupKey.length >= 2 ? loadDuplicate(dupText) : null), [dupText]);
  const duplicate =
    duplicateRow && dupKey.length >= 2 && normalizeLemma(duplicateRow.word.fr) === dupKey && ackDuplicate !== dupKey
      ? duplicateRow
      : null;

  const quickVisible =
    mode === "search" && trimmed.length > 0 && (!suggestionsEnabled || (suggest.status === "error" && suggest.results.length === 0));

  // «Список» rows: parsed lines, flagged when already in the library or repeated in the list.
  const parsed = useMemo(() => (mode === "list" ? parseWordList(listText) : []), [mode, listText]);
  const listFrs = useMemo(() => parsed.filter((r) => r.fr).map((r) => r.fr), [parsed]);
  const listDuplicates = useLiveQuery(() => loadListDuplicates(listFrs), [listFrs]);
  const listRows = useMemo<ListRow[]>(() => {
    const seen = new Map<string, number>();
    return parsed.map((r) => {
      const lemma = normalizeLemma(r.fr);
      const occurrence = seen.get(lemma) ?? 0;
      seen.set(lemma, occurrence + 1);
      const key = `${lemma}\u0001${r.ru.toLocaleLowerCase("ru")}\u0001${occurrence}`;
      const status: ListRow["status"] = r.problem
        ? "invalid"
        : occurrence > 0
          ? "repeat"
          : listDuplicates?.has(lemma)
            ? "duplicate"
            : "ok";
      const checked = status !== "invalid" && (status === "ok") !== listToggled.has(key);
      return { ...r, key, status, checked, enrich: listEnriched.get(key) ?? null };
    });
  }, [parsed, listDuplicates, listToggled, listEnriched]);
  const listSelected = listRows.filter((r) => r.checked);

  // Slang level and example: for the manual form while both sides are filled, and for the
  // pasted rows not detected yet. Shown before saving; anything set by hand stays.
  const formKey = mode === "form" && draft && suggestionsEnabled ? enrichKey(draft) : null;
  const formEnrichWords = useMemo<EnrichInput[] | null>(() => {
    if (!formKey) return null;
    const [fr, ru] = formKey.split("\u0001");
    return [{ id: "w1", fr, ru }];
  }, [formKey]);
  const formEnriching = useAutoEnrich(
    formEnrichWords,
    (results, [sent]) => {
      const result = results.get(sent.id);
      if (!result) return;
      const sentKey = `${sent.fr}\u0001${sent.ru}`;
      setDraft((d) => (d && enrichKey(d) === sentKey ? applyEnrichment(d, result) : d));
    },
    FORM_ENRICH_DEBOUNCE_MS,
  );
  const listEnrichWords = useMemo<ListEnrichInput[] | null>(() => {
    if (mode !== "list" || !suggestionsEnabled) return null;
    const missing = listRows.filter((r) => r.status !== "invalid" && !r.enrich);
    return missing.length > 0 ? missing.map((r, i) => ({ id: `l${i + 1}`, fr: r.fr, ru: r.ru, rowKey: r.key })) : null;
  }, [mode, suggestionsEnabled, listRows]);
  useAutoEnrich(
    listEnrichWords,
    (results, sent) =>
      setListEnriched((prev) => {
        const next = new Map(prev);
        for (const w of sent) {
          const r = results.get(w.id);
          if (r) next.set(w.rowKey, r);
        }
        return next;
      }),
    LIST_ENRICH_DEBOUNCE_MS,
  );

  // ---------------------------------------------------------------------------------------
  // Actions

  const changeQuery = (value: string) => {
    setQuery(value);
    requestSuggestions(value);
    setSaveError(null);
  };

  const pickHit = (hit: LexiqueHit) => {
    setQuery(hit.fr);
    requestSuggestions(hit.fr, { force: true });
    setFocusRequest({ target: "search" });
  };

  const pickSuggestion = (s: Suggestion) => {
    setDraft(draftFromSuggestion(s, folders, { autoSort }));
    setErrors({});
    setSaveError(null);
    setMode("form");
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  };

  const openManual = () => {
    const other = quick.other.trim();
    const next =
      direction === "ru"
        ? manualDraft({ fr: other, ru: trimmed, folder: quick.folder })
        : manualDraft({ fr: trimmed, ru: other, folder: quick.folder });
    setDraft(next);
    setErrors({});
    setSaveError(null);
    setMode("form");
    setFocusRequest({ target: !next.fr ? "fr" : !next.ru ? "ru" : "fr" });
  };

  const backToSearch = () => {
    setMode("search");
    setDraft(null);
    setErrors({});
    setSaveError(null);
    setFocusRequest({ target: "search" });
  };

  const openList = (text?: string) => {
    if (text !== undefined) setListText(text);
    setMode("list");
    setSaveError(null);
    setFocusRequest({ target: "list" });
  };

  const startOver = () => {
    setMode("search");
    setQuery("");
    requestSuggestions("");
    setDraft(null);
    setErrors({});
    setAckDuplicate(null);
    setQuick(EMPTY_QUICK);
    setFocusRequest({ target: "search" });
  };

  const undo = (result: SaveResult) => {
    undoSave(result).catch(() => snackbar.show({ message: "Не получилось отменить" }));
  };

  const showUndoSnackbar = (message: string, result: SaveResult) =>
    snackbar.show({ message, actionLabel: "Отменить", onAction: () => undo(result) });

  /** Closing hands a pending in-sheet undo over to the page snackbar. */
  const handleOpenChange = (next: boolean) => {
    if (!next && undoBar) {
      showUndoSnackbar(undoBar.message, undoBar.result);
      setUndoBar(null);
    }
    onOpenChange(next);
  };

  const openWord = (id: string) => {
    if (undoBar) {
      showUndoSnackbar(undoBar.message, undoBar.result);
      setUndoBar(null);
    }
    onOpenWord(id);
  };

  const commit = async (request: SaveRequest, message: string, andMore: boolean): Promise<SaveResult | null> => {
    setSaving(true);
    setSaveError(null);
    try {
      const result = await saveWords(request);
      if (andMore) {
        setUndoBar({ id: ++undoSeq.current, message, result });
        startOver();
      } else {
        setUndoBar(null);
        showUndoSnackbar(message, result);
        onOpenChange(false);
      }
      return result;
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Не получилось сохранить");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const saveForm = (andMore: boolean) => {
    if (!draft || saving) return;
    const found = validateDraft(draft);
    setErrors(found);
    if (hasErrors(found)) {
      setFocusRequest({ target: found.fr ? "fr" : "ru" });
      return;
    }
    // Saved before detection came back: fill what the user has not set once it does.
    const fillLater = formEnriching ? enrichScope(draft) : null;
    void commit(draftToSaveRequest(draft), `Добавлено · ${draft.fr.trim()}`, andMore).then((result) => {
      if (result && fillLater) void fillSavedWords(result.words.map((word) => ({ word, scope: fillLater })));
    });
  };

  const saveQuick = () => {
    if (saving || !trimmed) return;
    const other = quick.other.trim();
    if (!other) {
      setQuick((q) => ({ ...q, error: direction === "ru" ? "Нужно французское слово" : "Нужен перевод" }));
      return;
    }
    const fr = direction === "ru" ? other : trimmed;
    const ru = direction === "ru" ? trimmed : other;
    void commit(draftToSaveRequest(manualDraft({ fr, ru, folder: quick.folder })), `Добавлено · ${fr}`, false).then((result) => {
      if (result) void fillSavedWords(result.words.map((word) => ({ word, scope: FULL_SCOPE })));
    });
  };

  const saveList = () => {
    if (saving || listSelected.length === 0) return;
    void commit(
      {
        words: listSelected.map((r) => ({
          fr: r.fr,
          ru: r.ru,
          source: "import" as const,
          ...(r.enrich && {
            pos: r.enrich.pos,
            gender: r.enrich.gender,
            slang_level: r.enrich.slang_level,
            verlan: r.enrich.verlan,
            example_fr: r.enrich.example_fr,
            example_ru: r.enrich.example_ru,
          }),
        })),
        folder: listFolder,
        folderSource: listFolder.kind === "inbox" ? "auto" : "user",
        folderConfidence: null,
        newFolderCreatedBy: "user",
      },
      `Добавлено ${nWords(listSelected.length)}`,
      false,
    ).then((result) => {
      if (!result) return;
      const later = result.words.filter((_, i) => !listSelected[i]?.enrich);
      if (later.length > 0) void fillSavedWords(later.map((word) => ({ word, scope: FULL_SCOPE })));
    });
  };

  const submitSearch = () => {
    if (!trimmed) return;
    if (quickVisible) saveQuick();
    else if (suggest.results.length > 0) pickSuggestion(suggest.results[0]);
    else if (suggest.status === "loading") suggest.flush();
    else openManual();
  };

  const toggleListRow = (key: string) =>
    setListToggled((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  // ---------------------------------------------------------------------------------------
  // Render

  const errorLine = saveError && (
    <p role="alert" className="m-0 mb-3 text-[13px] leading-5 text-again">
      {saveError}
    </p>
  );

  const undoLine = undoBar && (
    <Snackbar
      message={undoBar.message}
      actionLabel="Отменить"
      onAction={() => {
        undo(undoBar.result);
        setUndoBar(null);
        setFocusRequest({ target: "search" });
      }}
      className="mb-3"
    />
  );

  let footer: ReactNode = undoLine || null;
  if (mode === "form") {
    footer = (
      <>
        {undoLine}
        {errorLine}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" block disabled={saving} onClick={() => saveForm(true)}>
            Добавить и ещё
          </Button>
          <Button block loading={saving} onClick={() => saveForm(false)}>
            Добавить
          </Button>
        </div>
      </>
    );
  } else if (mode === "list") {
    footer = (
      <>
        {undoLine}
        {errorLine}
        <Button block loading={saving} disabled={listSelected.length === 0} onClick={saveList}>
          {listSelected.length > 0 ? `Добавить ${nWords(listSelected.length)}` : "Добавить"}
        </Button>
      </>
    );
  } else if (quickVisible) {
    footer = (
      <>
        {undoLine}
        {errorLine}
        <Button block loading={saving} onClick={saveQuick}>
          Добавить
        </Button>
      </>
    );
  }

  const tools =
    mode === "list" ? undefined : (
      <>
        <ToolLink icon="camera" href="/import" onClick={() => handleOpenChange(false)}>
          Скриншот
        </ToolLink>
        <ToolButton icon="clipboard" onClick={() => openList()}>
          Список
        </ToolButton>
      </>
    );

  const label =
    mode === "list"
      ? `Список · ${parsed.length} ${plural(parsed.length, ["строка", "строки", "строк"])}`
      : `Карточка ${cardNumber((context?.total ?? 0) + 1)}`;

  return (
    <Sheet
      open={open}
      onOpenChange={handleOpenChange}
      height={mode === "search" ? "large" : "full"}
      footer={footer}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        inputRef.current?.focus();
      }}
    >
      <div className="sticky top-0 z-10 bg-surface">
        <AddSheetChrome
          label={label}
          title={mode === "list" ? "Несколько слов" : "Новое слово"}
          tools={tools}
          onBack={mode === "search" ? undefined : backToSearch}
          backLabel="Назад к поиску"
        />
      </div>

      {mode === "search" && (
        <SearchPanel
          inputRef={inputRef}
          value={query}
          onValueChange={changeQuery}
          onClear={() => {
            changeQuery("");
            setFocusRequest({ target: "search" });
          }}
          onSubmit={submitSearch}
          onPasteList={openList}
          suggest={suggest}
          suggestionsEnabled={suggestionsEnabled}
          autoSort={autoSort}
          folders={folders}
          context={context}
          dictionary={dictionary}
          onPickHit={pickHit}
          onPickSuggestion={pickSuggestion}
          onManual={openManual}
          duplicate={duplicate}
          onOpenWord={openWord}
          onAddAnyway={() => setAckDuplicate(dupKey)}
          quick={quickVisible ? quick : null}
          onQuickChange={(patch) => setQuick((q) => ({ ...q, ...patch }))}
        />
      )}

      {mode === "form" && draft && (
        <WordForm
          draft={draft}
          onChange={(patch) => {
            setDraft((d) => (d ? { ...d, ...patch } : d));
            if ("fr" in patch) setErrors((e) => ({ ...e, fr: undefined }));
            if ("ru" in patch) setErrors((e) => ({ ...e, ru: undefined }));
          }}
          folders={folders}
          errors={errors}
          frRef={frRef}
          ruRef={ruRef}
          duplicate={duplicate}
          onOpenWord={openWord}
          onAddAnyway={() => setAckDuplicate(dupKey)}
          onSubmit={() => saveForm(false)}
          enriching={formEnriching}
        />
      )}

      {mode === "list" && (
        <ListPanel
          textareaRef={listRef}
          text={listText}
          onText={setListText}
          rows={listRows}
          onToggle={toggleListRow}
          folder={listFolder}
          onFolder={setListFolder}
          folders={folders}
        />
      )}
    </Sheet>
  );
}
