"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from "react";
import { WordDetailSheet } from "@/components/library/WordDetailSheet";
import { useAddSheet } from "@/components/providers/AddSheetContext";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { Sheet } from "@/components/ui/Sheet";
import { Snackbar, useSnackbar } from "@/components/ui/Snackbar";
import { detectDirection } from "@/lib/ai/normalize";
import type { EnrichResult, Suggestion } from "@/lib/ai/schemas";
import { fillSavedWords, type EnrichInput } from "@/lib/enrich";
import { listFolders } from "@/lib/folders";
import { isLexiqueLoaded, loadLexique, prefixSearch, type LexiqueHit } from "@/lib/lexique";
import { exitMs, sheetCloseMs, tokenMs } from "@/lib/motion";
import { getSettings } from "@/lib/settings";
import { normalizeLemma } from "@/lib/text";
import type { Folder } from "@/lib/types";
import { useLayoutClass } from "@/lib/use-media";
import { toFolderInputs, useSuggest, type SuggestPreferences } from "@/lib/use-suggest";
import { MANUAL_KEY, variantKey } from "./combobox";
import { loadAddContext, loadDuplicate, loadListDuplicates, type DuplicateInfo } from "./data";
import {
  applyEnrichment,
  draftFromSuggestion,
  filledByDetection,
  filledByPick,
  draftToSaveRequest,
  enrichKey,
  enrichScope,
  hasErrors,
  manualDraft,
  prefilledDraft,
  validateDraft,
  type DraftErrors,
  type DraftPrefill,
  type WordDraft,
} from "./draft";
import { choiceKey, INBOX_CHOICE, listFolderChoices, type FolderChoice } from "./folder-choice";
import { DeskChrome, UndoLine } from "./desk-parts";
import { DeskListPanel } from "./DeskListPanel";
import { DeskSearchPanel } from "./DeskSearchPanel";
import { DeskWordForm } from "./DeskWordForm";
import { ListPanel, type ListDetection, type ListRow } from "./ListPanel";
import { cardNumber, nWords, plural } from "./match";
import { parseWordList } from "./parse-list";
import { AddSheetChrome, DICTIONARY_ROWS, ToolButton, ToolLink, type FieldSpot, type FormDetection, type SpotField } from "./parts";
import { saveWordGroups, undoSave, type SaveRequest, type SaveResult } from "./save";
import { SearchPanel, type QuickFields } from "./SearchPanel";
import { FORM_ENRICH_DEBOUNCE_MS, LIST_ENRICH_DEBOUNCE_MS, useAutoEnrich } from "./use-auto-enrich";
import { WordForm } from "./WordForm";

type Mode = "search" | "form" | "list";
type FocusTarget = "search" | "fr" | "ru" | "list";

const NO_FOLDERS: Folder[] = [];
const FULL_SCOPE = { slang: true, example: true, pos: true } as const;
/** Detection already applied: only the custom fields marked for the automatic fill are still asked for. */
const FIELDS_ONLY = { slang: false, example: false, pos: false, folder: false } as const;

type ListEnrichInput = EnrichInput & { rowKey: string };
const EMPTY_QUICK: QuickFields = { other: "", folder: INBOX_CHOICE, error: null };
/** How long the in-sheet «Отменить» bar stays after «Добавить и ещё». */
const UNDO_BAR_MS = 7000;

type SaveKind = "add" | "more";

/** What the sheet showed when «Добавить» was pressed: kept on screen while it closes (A8). */
interface Frozen {
  label: string;
  duplicate: DuplicateInfo | null;
  listRows: ListRow[];
}

/**
 * The quick-add bottom sheet, mounted once by AppProviders and opened with useAddSheet().open().
 * Each opening starts fresh (keyed by the provider's `session`); before the first one there is no
 * session, so none of its live queries run.
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
      {sheet.session > 0 && (
        <AddSession
          key={sheet.session}
          open={sheet.isOpen}
          onOpenChange={sheet.setOpen}
          initialFr={sheet.initial.draft?.fr ?? sheet.initial.fr ?? ""}
          initialDraft={sheet.initial.draft}
          onOpenWord={openWord}
        />
      )}
      <WordDetailSheet wordId={detailId} onClose={() => setDetailId(null)} />
    </>
  );
}

interface AddSessionProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialFr: string;
  /** Opens in the filled form instead of the search. */
  initialDraft?: DraftPrefill;
  onOpenWord: (id: string) => void;
}

function AddSession({ open, onOpenChange, initialFr, initialDraft, onOpenWord }: AddSessionProps) {
  const snackbar = useSnackbar();
  const folders = useLiveQuery(listFolders, [], NO_FOLDERS);
  const settings = useLiveQuery(getSettings);
  const context = useLiveQuery(() => loadAddContext(), []);
  const suggestionsEnabled = settings?.suggestions_enabled ?? true;
  const autoSort = settings?.auto_sort_enabled ?? true;
  const slangDetect = settings?.slang_detect_enabled ?? true;
  const examplesOn = settings?.examples_enabled ?? true;
  const model = settings?.ai_model ?? "fast";
  // Detection for typed and pasted words runs when it has anything to fill in.
  const detect = slangDetect || examplesOn || autoSort;
  const detectPrefs = useMemo(() => ({ slang: slangDetect, examples: examplesOn }), [slangDetect, examplesOn]);
  const folderInputs = useMemo(() => toFolderInputs(folders), [folders]);
  const count = settings?.suggest_count ?? 3;
  const register = settings?.suggest_register ?? "any";
  const notes = settings?.notes_enabled ?? true;
  const preferences = useMemo<SuggestPreferences>(() => ({ model, max: count, register, notes }), [model, count, register, notes]);
  const suggest = useSuggest({ folders: folderInputs, enabled: suggestionsEnabled, preferences });
  const { setQuery: requestSuggestions, cancel: cancelSuggestions } = suggest;

  // From 768 up the sheet is the desktop dialog (mockups D-Add-*): its own panels and keys.
  const desk = useLayoutClass() !== "compact";
  const [mode, setMode] = useState<Mode>(initialDraft ? "form" : "search");
  const [query, setQuery] = useState(initialFr);
  const [draft, setDraft] = useState<WordDraft | null>(() => (initialDraft ? prefilledDraft(initialDraft) : null));
  // Which headword and option the draft came from. On desktop Esc goes back to the search with the
  // draft kept; ↵ on the same option reopens it until the headword changes.
  const [draftOrigin, setDraftOrigin] = useState<{ query: string; key: string } | null>(() =>
    initialDraft ? { query: initialFr, key: MANUAL_KEY } : null,
  );
  const [errors, setErrors] = useState<DraftErrors>({});
  const [ackDuplicate, setAckDuplicate] = useState<string | null>(null);
  const [quick, setQuick] = useState<QuickFields>(EMPTY_QUICK);
  const [listText, setListText] = useState("");
  /** null = each pasted word to its own detected theme (with automatic sorting on). */
  const [listFolder, setListFolder] = useState<FolderChoice | null>(null);
  const [listToggled, setListToggled] = useState<ReadonlySet<string>>(() => new Set());
  const [listEnriched, setListEnriched] = useState<ReadonlyMap<string, EnrichResult>>(() => new Map());
  // Which save is running: «Добавить» (closes the sheet) or «Добавить и ещё» (starts over).
  const [saving, setSaving] = useState<SaveKind | null>(null);
  // While «Добавить» saves and the sheet sinks, the body shows what was submitted (A8).
  const [frozen, setFrozen] = useState<Frozen | null>(null);
  // After «Добавить и ещё»: the fields fade out, then the search comes back with the new word on top.
  const [leaving, setLeaving] = useState(false);
  const [freshId, setFreshId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lex, setLex] = useState<"loading" | "ready" | "failed">(() => (isLexiqueLoaded() ? "ready" : "loading"));
  // The fields a pick or a detection just filled (A5, A6), and the «Вариант» ink-filled on its pick.
  const [spot, setSpot] = useState<FieldSpot | null>(null);
  const spotSeq = useRef(0);
  const [picked, setPicked] = useState<string | null>(null);
  const pickTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (pickTimer.current !== null) window.clearTimeout(pickTimer.current);
  }, []);
  const light = (fields: readonly SpotField[]) => setSpot(fields.length > 0 ? { seq: ++spotSeq.current, fields } : null);
  const [focusRequest, setFocusRequest] = useState<{ target: FocusTarget } | null>(null);
  // After «Добавить и ещё» the undo bar lives in the sheet footer, which stays above the
  // on-screen keyboard (the page snackbar would sit under it).
  const [undoBar, setUndoBar] = useState<{ id: number; message: string; result: SaveResult } | null>(null);
  const undoSeq = useRef(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const frRef = useRef<HTMLInputElement>(null);
  const ruRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLTextAreaElement>(null);

  // Local dictionary: load once when the sheet opens; while it loads «Словарь» holds its slots (A4)
  // and the rows fill them as soon as it is in memory. A failed load lets the slots go.
  useEffect(() => {
    if (lex !== "loading" || !open) return;
    let live = true;
    loadLexique().then(
      () => live && setLex("ready"),
      () => live && setLex("failed"),
    );
    return () => {
      live = false;
    };
  }, [lex, open]);

  // Prefill from useAddSheet().open({fr}). A filled form ({draft}) asks for nothing.
  const prefilled = initialDraft !== undefined;
  useEffect(() => {
    if (initialFr.trim() && !prefilled) requestSuggestions(initialFr);
  }, [initialFr, prefilled, requestSuggestions]);

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
    () => (lex === "ready" && mode === "search" && trimmed && direction === "fr" ? prefixSearch(query, DICTIONARY_ROWS) : []),
    [lex, mode, query, trimmed, direction],
  );
  const dictionaryLoading = lex === "loading" && trimmed !== "" && direction === "fr";

  // Duplicate check: the typed French headword, or the form's French field.
  // Stopped once «Добавить» is pressed: the word just saved must not flag itself as a duplicate.
  const dupText = frozen ? "" : mode === "form" ? (draft?.fr ?? "") : mode === "search" && direction === "fr" ? query : "";
  const dupKey = normalizeLemma(dupText);
  const duplicateRow = useLiveQuery(() => (dupKey.length >= 2 ? loadDuplicate(dupText) : null), [dupText]);
  const liveDuplicate =
    duplicateRow && dupKey.length >= 2 && normalizeLemma(duplicateRow.word.fr) === dupKey && ackDuplicate !== dupKey
      ? duplicateRow
      : null;
  const duplicate = frozen ? frozen.duplicate : liveDuplicate;

  const quickVisible =
    mode === "search" && trimmed.length > 0 && (!suggestionsEnabled || (suggest.status === "error" && suggest.results.length === 0));

  // «Список» rows: parsed lines, flagged when already in the library or repeated in the list.
  const parsed = useMemo(() => (mode === "list" ? parseWordList(listText) : []), [mode, listText]);
  const listFrs = useMemo(() => (frozen ? [] : parsed.filter((r) => r.fr).map((r) => r.fr)), [parsed, frozen]);
  const listDuplicates = useLiveQuery(() => loadListDuplicates(listFrs), [listFrs]);
  const listAuto = listFolder === null && autoSort;
  const liveListRows = useMemo<ListRow[]>(() => {
    const seen = new Map<string, number>();
    const rows = parsed.map((r): ListRow => {
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
      const existing = status === "duplicate" ? (listDuplicates?.get(lemma) ?? null) : null;
      return { ...r, key, status, checked, enrich: listEnriched.get(key) ?? null, autoFolder: null, existing };
    });
    if (!listAuto) return rows;
    const choices = listFolderChoices(
      rows.map((r) => (r.status === "invalid" ? null : r.enrich)),
      folders,
    );
    return rows.map((r, i) => ({ ...r, autoFolder: choices[i] }));
  }, [parsed, listDuplicates, listToggled, listEnriched, listAuto, folders]);
  const listRows = frozen ? frozen.listRows : liveListRows;

  const liveLabel =
    mode === "list"
      ? `Список · ${parsed.length} ${plural(parsed.length, ["строка", "строки", "строк"])}`
      : `Карточка ${cardNumber((context?.total ?? 0) + 1)}`;
  const label = frozen ? frozen.label : liveLabel;
  const listSelected = listRows.filter((r) => r.checked);

  // Slang level, example and theme: for the manual form while both sides are filled, and for
  // the pasted rows not detected yet. Shown before saving; anything set by hand stays.
  const formKey = mode === "form" && draft && detect ? enrichKey(draft) : null;
  const formEnrichWords = useMemo<EnrichInput[] | null>(() => {
    if (!formKey) return null;
    const [fr, ru] = formKey.split("\u0001");
    return [{ id: "w1", fr, ru }];
  }, [formKey]);
  const formEnrich = useAutoEnrich(
    formEnrichWords,
    { folders: autoSort ? folderInputs : undefined, model },
    (results, [sent]) => {
      const result = results.get(sent.id);
      if (!result || !draft || enrichKey(draft) !== `${sent.fr}\u0001${sent.ru}`) return;
      // What lands is lit, field by field as one detection (A6); what the user set stays.
      const next = applyEnrichment(draft, result, folders, detectPrefs);
      setDraft(next);
      light(filledByDetection(draft, next));
    },
    FORM_ENRICH_DEBOUNCE_MS,
  );
  const detection: FormDetection = {
    waiting: formEnrich.waiting,
    failed: formEnrich.failed,
    slang: slangDetect,
    examples: examplesOn,
    themes: autoSort,
  };
  const listEnrichWords = useMemo<ListEnrichInput[] | null>(() => {
    if (mode !== "list" || !detect) return null;
    const missing = listRows.filter((r) => r.status !== "invalid" && (!r.enrich || (listAuto && r.enrich.folder === null)));
    return missing.length > 0 ? missing.map((r, i) => ({ id: `l${i + 1}`, fr: r.fr, ru: r.ru, rowKey: r.key })) : null;
  }, [mode, detect, listRows, listAuto]);
  const listEnrich = useAutoEnrich(
    listEnrichWords,
    { folders: listAuto ? folderInputs : undefined, model },
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
  const listDetection: ListDetection | undefined = detect
    ? { pending: listEnrich.pending, waiting: listEnrich.waiting, failed: listEnrich.failed, progress: listEnrich.progress, themes: listAuto }
    : undefined;

  // ---------------------------------------------------------------------------------------
  // Actions

  /** A kept draft lasts while the headword it came from stays. */
  const dropKeptDraft = (nextQuery: string) => {
    if (mode === "search" && draftOrigin && nextQuery !== draftOrigin.query) {
      setDraft(null);
      setDraftOrigin(null);
      setErrors({});
    }
  };

  const changeQuery = (value: string) => {
    dropKeptDraft(value);
    if (value.trim()) setFreshId(null);
    setQuery(value);
    requestSuggestions(value);
    setSaveError(null);
  };

  const pickHit = (hit: LexiqueHit) => {
    dropKeptDraft(hit.fr);
    setQuery(hit.fr);
    requestSuggestions(hit.fr, { force: true });
    setFocusRequest({ target: "search" });
  };

  /** Desktop: the kept draft for this option and headword, reopened as it was left. */
  const reopenDraft = (key: string) => {
    if (!desk || !draft || draftOrigin?.key !== key || draftOrigin.query !== query) return false;
    setSaveError(null);
    setMode("form");
    setFocusRequest({ target: "fr" });
    return true;
  };

  const openPicked = (s: Suggestion) => {
    const next = draftFromSuggestion(s, folders, { autoSort, slang: slangDetect, examples: examplesOn });
    setDraft(next);
    setDraftOrigin({ query, key: variantKey(s) });
    setErrors({});
    setSaveError(null);
    setMode("form");
    // The fields the pick filled are lit together as the form opens (A5).
    light(filledByPick(next));
    if (desk) setFocusRequest({ target: "fr" });
  };

  const pickSuggestion = (s: Suggestion) => {
    if (reopenDraft(variantKey(s))) return;
    // Desktop: at once, focus in the first field (Tab order, ⌘↵).
    if (desk) return openPicked(s);
    // Phones: the row ink-fills (--dur-instant) and holds for --dur-flash before the form replaces
    // it (A5); the keyboard goes down at once to show the card.
    if (picked !== null) return;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setPicked(variantKey(s));
    pickTimer.current = window.setTimeout(() => {
      pickTimer.current = null;
      setPicked(null);
      openPicked(s);
    }, tokenMs("--dur-flash", 120));
  };

  const openManual = () => {
    if (reopenDraft(MANUAL_KEY)) return;
    const other = quick.other.trim();
    const next =
      direction === "ru"
        ? manualDraft({ fr: other, ru: trimmed, folder: quick.folder })
        : manualDraft({ fr: trimmed, ru: other, folder: quick.folder });
    setDraft(next);
    setDraftOrigin({ query, key: MANUAL_KEY });
    setSpot(null);
    setErrors({});
    setSaveError(null);
    setMode("form");
    setFocusRequest({ target: !next.fr ? "fr" : !next.ru ? "ru" : "fr" });
  };

  const backToSearch = () => {
    setSpot(null);
    setMode("search");
    // A form opened filled (from «Контекст») never asked for «Варианты»; same query = no new request.
    requestSuggestions(query);
    if (!desk) {
      setDraft(null);
      setDraftOrigin(null);
    }
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
    setSpot(null);
    setLeaving(false);
    setMode("search");
    setQuery("");
    requestSuggestions("");
    setDraft(null);
    setDraftOrigin(null);
    setErrors({});
    setAckDuplicate(null);
    setQuick(EMPTY_QUICK);
    setFocusRequest({ target: "search" });
  };

  const undo = (result: SaveResult) => {
    undoSave(result).catch(() => snackbar.show({ message: "Не получилось отменить" }));
  };

  /**
   * The page snackbar. When the sheet is closing it enters only once the sheet has cleared (A8: the
   * sheet closes in --dur-enter; the desktop dialog goes at once), never over the sinking sheet.
   */
  const showUndoSnackbar = (message: string, result: SaveResult, afterClose = false) => {
    const show = () => snackbar.show({ message, actionLabel: "Отменить", onAction: () => undo(result) });
    if (afterClose && !desk) window.setTimeout(show, sheetCloseMs());
    else show();
  };

  /** Closing hands a pending in-sheet undo over to the page snackbar. */
  const handleOpenChange = (next: boolean) => {
    if (!next && undoBar) {
      showUndoSnackbar(undoBar.message, undoBar.result, true);
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

  const commit = async (request: SaveRequest | SaveRequest[], message: string, andMore: boolean): Promise<SaveResult | null> => {
    setSaving(andMore ? "more" : "add");
    setSaveError(null);
    // «Добавить» closes the sheet: from now on it shows what was submitted, not the saved word
    // coming back as «Уже есть…» or the next card number.
    if (!andMore) setFrozen({ label, duplicate, listRows });
    let result: SaveResult;
    try {
      result = await saveWordGroups(Array.isArray(request) ? request : [request]);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Не получилось сохранить");
      setSaving(null);
      setFrozen(null);
      return null;
    }
    if (andMore) {
      setUndoBar({ id: ++undoSeq.current, message, result });
      setFreshId(result.words[0]?.id ?? null);
      // The fields fade out (--dur-exit), then the empty search comes back focused; the buttons
      // keep refusing presses until then, so the same draft cannot be added twice.
      setLeaving(true);
      window.setTimeout(() => {
        startOver();
        setSaving(null);
      }, exitMs());
    } else {
      setUndoBar(null);
      setSaving(null);
      onOpenChange(false);
      showUndoSnackbar(message, result, true);
    }
    return result;
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
    const fillLater = formEnrich.pending ? enrichScope(draft) : null;
    void commit(draftToSaveRequest(draft), `Добавлено · ${draft.fr.trim()}`, andMore).then((result) => {
      if (result) void fillSavedWords(result.words.map((word) => ({ word, scope: fillLater ?? FIELDS_ONLY })));
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
      const scope = { ...FULL_SCOPE, folder: quick.folder.kind === "inbox" };
      if (result) void fillSavedWords(result.words.map((word) => ({ word, scope })));
    });
  };

  const saveList = () => {
    if (saving || listSelected.length === 0) return;
    // One save group per theme: the chosen one, or with automatic themes each row's own pick.
    const groups = new Map<string, { request: SaveRequest; rows: ListRow[] }>();
    for (const r of listSelected) {
      const auto = listAuto ? (r.autoFolder ?? INBOX_CHOICE) : null;
      const folder = auto ?? listFolder ?? INBOX_CHOICE;
      const confidence = auto && auto.kind !== "inbox" && r.enrich ? r.enrich.confidence : null;
      const key = `${choiceKey(folder)}\u0001${confidence ?? ""}`;
      let group = groups.get(key);
      if (!group) {
        group = {
          request: {
            words: [],
            folder,
            folderSource: auto || folder.kind === "inbox" ? "auto" : "user",
            folderConfidence: confidence,
            newFolderCreatedBy: auto ? "auto" : "user",
          },
          rows: [],
        };
        groups.set(key, group);
      }
      group.rows.push(r);
      group.request.words.push({
        fr: r.fr,
        ru: r.ru,
        source: "import",
        ...(r.enrich && { pos: r.enrich.pos, gender: r.enrich.gender }),
        ...(r.enrich && slangDetect && { slang_level: r.enrich.slang_level, verlan: r.enrich.verlan }),
        ...(r.enrich && examplesOn && { example_fr: r.enrich.example_fr, example_ru: r.enrich.example_ru }),
      });
    }
    const ordered = [...groups.values()];
    const rows = ordered.flatMap((g) => g.rows);
    void commit(
      ordered.map((g) => g.request),
      `Добавлено ${nWords(listSelected.length)}`,
      false,
    ).then((result) => {
      if (!result) return;
      const scope = { ...FULL_SCOPE, folder: listAuto };
      void fillSavedWords(result.words.map((word, i) => ({ word, scope: rows[i]?.enrich ? FIELDS_ONLY : scope })));
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

  // Desktop keys (DESKTOP-SPEC §4 «Add dialog»): ⌘↵ «Добавить», ⇧⌘↵ «Добавить и ещё»; Esc from
  // the form or «Несколько слов» goes back to the search (draft and list kept), else closes.
  // Anything typed makes the dialog ignore scrim clicks and Radix's own Esc, so Esc is handled
  // here, one layer per press.
  const dirty = mode === "form" || draft !== null || (mode === "search" ? trimmed !== "" : listText.trim() !== "");
  const onDeskKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === "Escape") {
      if (e.repeat) return;
      if (mode !== "search") {
        // Form and «Несколько слов» step back to the search (what was typed stays); then Esc closes.
        e.preventDefault();
        backToSearch();
      } else if (dirty) {
        e.preventDefault();
        handleOpenChange(false);
      }
      return;
    }
    if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey) || e.altKey || e.defaultPrevented || e.repeat) return;
    if (mode === "form") {
      e.preventDefault();
      saveForm(e.shiftKey);
    } else if (!e.shiftKey && mode === "list") {
      e.preventDefault();
      saveList();
    } else if (!e.shiftKey && quickVisible) {
      e.preventDefault();
      saveQuick();
    }
  });
  useEffect(() => {
    if (!desk || !open) return;
    const listener = (e: KeyboardEvent) => onDeskKey(e);
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, [desk, open]);

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
          <Button
            variant="secondary"
            block
            pending={saving === "more"}
            pendingLabel="Добавляем…"
            blocked={saving === "add"}
            onClick={() => saveForm(true)}
          >
            Добавить и ещё
          </Button>
          <Button block pending={saving === "add"} pendingLabel="Добавляем…" blocked={saving === "more"} onClick={() => saveForm(false)}>
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
        <Button block pending={saving !== null} pendingLabel="Добавляем…" disabled={listSelected.length === 0} onClick={saveList}>
          {listSelected.length > 0 ? `Добавить ${nWords(listSelected.length)}` : "Добавить"}
        </Button>
      </>
    );
  } else if (quickVisible) {
    footer = (
      <>
        {undoLine}
        {errorLine}
        <Button block pending={saving !== null} pendingLabel="Добавляем…" onClick={saveQuick}>
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

  if (desk) {
    const status = undoBar && (
      <UndoLine
        message={undoBar.message}
        onUndo={() => {
          undo(undoBar.result);
          setUndoBar(null);
          setFocusRequest({ target: mode === "list" ? "list" : mode === "form" ? "fr" : "search" });
        }}
      />
    );
    const onDraftChange = (patch: Partial<WordDraft>) => {
      setDraft((d) => (d ? { ...d, ...patch } : d));
      if ("fr" in patch) setErrors((e) => ({ ...e, fr: undefined }));
      if ("ru" in patch) setErrors((e) => ({ ...e, ru: undefined }));
    };
    return (
      <Sheet
        open={open}
        onOpenChange={handleOpenChange}
        height="large"
        dialogWidth={640}
        // In «Несколько слов» Esc steps back to the search (handled above), even with nothing pasted.
        dismissible={!dirty && mode !== "list"}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
        header={
          <DeskChrome
            label={label}
            title={mode === "list" ? "Несколько слов" : "Новое слово"}
            onBack={mode === "search" ? undefined : backToSearch}
            onScreenshot={mode === "list" ? undefined : () => handleOpenChange(false)}
            onList={mode === "list" ? undefined : () => openList()}
          />
        }
      >
        {mode === "search" && (
          <DeskSearchPanel
            inputRef={inputRef}
            value={query}
            onValueChange={changeQuery}
            onSubmit={submitSearch}
            onPasteList={openList}
            suggest={suggest}
            suggestionsEnabled={suggestionsEnabled}
            autoSort={autoSort}
            showSlang={slangDetect}
            folders={folders}
            context={context}
            dictionary={dictionary}
            dictionaryLoading={dictionaryLoading}
            onPickHit={pickHit}
            onPickSuggestion={pickSuggestion}
            onManual={openManual}
            duplicate={duplicate}
            onOpenWord={openWord}
            onAddAnyway={() => setAckDuplicate(dupKey)}
            quick={quickVisible ? quick : null}
            onQuickChange={(patch) => setQuick((q) => ({ ...q, ...patch }))}
            onLeave={() => handleOpenChange(false)}
            onQuickSave={saveQuick}
            preferredKey={draft && draftOrigin && draftOrigin.query === query ? draftOrigin.key : null}
            freshId={freshId}
            saving={saving !== null}
            saveError={saveError}
            status={status}
          />
        )}
        {mode === "form" && draft && (
          <DeskWordForm
            draft={draft}
            onChange={onDraftChange}
            folders={folders}
            errors={errors}
            frRef={frRef}
            ruRef={ruRef}
            duplicate={duplicate}
            onOpenWord={openWord}
            detection={detection}
            spot={spot}
            onSave={saveForm}
            saving={saving}
            leaving={leaving}
            saveError={saveError}
            status={status}
          />
        )}
        {mode === "list" && (
          <DeskListPanel
            textareaRef={listRef}
            text={listText}
            onText={setListText}
            rows={listRows}
            onToggle={toggleListRow}
            folder={listFolder ?? INBOX_CHOICE}
            onFolder={setListFolder}
            auto={autoSort ? { selected: listFolder === null, onSelect: () => setListFolder(null) } : undefined}
            folders={folders}
            show={detectPrefs}
            detection={listDetection}
            onSave={saveList}
            saving={saving !== null}
            saveError={saveError}
            status={status}
          />
        )}
      </Sheet>
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={handleOpenChange}
      height={mode === "search" ? "large" : "full"}
      dialogWidth={640}
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
          showSlang={slangDetect}
          folders={folders}
          context={context}
          dictionary={dictionary}
          dictionaryLoading={dictionaryLoading}
          onPickHit={pickHit}
          onPickSuggestion={pickSuggestion}
          pickedKey={picked}
          onManual={openManual}
          duplicate={duplicate}
          onOpenWord={openWord}
          onAddAnyway={() => setAckDuplicate(dupKey)}
          quick={quickVisible ? quick : null}
          onQuickChange={(patch) => setQuick((q) => ({ ...q, ...patch }))}
          onLeave={() => handleOpenChange(false)}
          freshId={freshId}
        />
      )}

      {mode === "form" && draft && (
        <div className={cx(leaving && "pointer-events-none opacity-0 transition-opacity duration-(--dur-exit) ease-exit")}>
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
            detection={detection}
            spot={spot}
          />
        </div>
      )}

      {mode === "list" && (
        <ListPanel
          textareaRef={listRef}
          text={listText}
          onText={setListText}
          rows={listRows}
          onToggle={toggleListRow}
          folder={listFolder ?? INBOX_CHOICE}
          onFolder={setListFolder}
          auto={autoSort ? { selected: listFolder === null, onSelect: () => setListFolder(null) } : undefined}
          folders={folders}
          show={detectPrefs}
          detection={listDetection}
        />
      )}
    </Sheet>
  );
}
