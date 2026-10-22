"use client";

import { useState } from "react";
import { useUndoSnackbar } from "@/components/library/undo";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icons";
import { DialogChrome, Sheet } from "@/components/ui/Sheet";
import { useSnackbar } from "@/components/ui/Snackbar";
import { MAX_EXAMPLES, wordExamples } from "@/lib/examples";
import { exitMs, sheetCloseMs } from "@/lib/motion";
import type { Word } from "@/lib/types";
import { updateWord } from "@/lib/words";
import { hasExample, KIND_LABELS, placeExample, plural } from "./data";
import { Hit, type ShownExample } from "./parts";

const EXAMPLE_FORMS = ["пример", "примера", "примеров"] as const;

export interface ExampleSheetProps {
  /** The example to act on; null closes the sheet. */
  example: ShownExample | null;
  /** The saved word with the looked-up headword (null: not in the library). */
  word: Word | null;
  wide: boolean;
  onClose: () => void;
  /** Not saved yet: the add form, filled with the word and this example. */
  onAddWord: (example: ShownExample) => void;
}

/**
 * S-Example: what to do with one sentence. Saved word: «В карточку слова» (appended, up to
 * MAX_EXAMPLES), «Сделать главным» (first = the review card's example), «Скопировать». Not saved:
 * «Добавить слово с этим примером». A bottom sheet on phones, a dialog from 768 up.
 */
export function ExampleSheet({ example, word, wide, onClose, onAddWord }: ExampleSheetProps) {
  // Keep showing the last example while the sheet animates closed.
  const [shown, setShown] = useState<ShownExample | null>(example);
  if (example !== null && example !== shown) setShown(example);
  const [busy, setBusy] = useState<"add" | "main" | null>(null);
  const showUndo = useUndoSnackbar();
  const snackbar = useSnackbar();

  const ex = shown;
  const count = word ? wordExamples(word).length : 0;
  const present = !!word && !!ex && hasExample(word, ex.fr);
  const full = count >= MAX_EXAMPLES;
  const canMain = !!word && !!ex && placeExample(word, ex, { main: true }).ok;

  const afterClose = (fn: () => void) => window.setTimeout(fn, wide ? exitMs() : sheetCloseMs());

  const save = async (main: boolean) => {
    if (!word || !ex || busy) return;
    const placement = placeExample(word, ex, { main });
    if (!placement.ok) return;
    const before = { example_fr: word.example_fr, example_ru: word.example_ru, extra_examples: word.extra_examples ?? [] };
    setBusy(main ? "main" : "add");
    try {
      await updateWord(word.id, placement.patch);
    } catch {
      setBusy(null);
      snackbar.show({ message: "Не получилось сохранить пример" });
      return;
    }
    setBusy(null);
    onClose();
    const id = word.id;
    afterClose(() =>
      showUndo({
        message: main ? `Главный пример · ${word.fr}` : `Пример добавлен · ${word.fr}`,
        undo: () => void updateWord(id, before),
      }),
    );
  };

  const copy = async () => {
    if (!ex) return;
    try {
      await navigator.clipboard.writeText(ex.ru ? `${ex.fr}\n${ex.ru}` : ex.fr);
      snackbar.show({ message: "Пример скопирован" });
    } catch {
      snackbar.show({ message: "Не получилось скопировать" });
    }
  };

  const tag = ex ? [ex.invented ? "придуман" : ex.meaning ? `≈ ${ex.meaning}` : null, ex.invented ? null : KIND_LABELS[ex.kind]].filter(Boolean).join(" · ") : "";

  return (
    <Sheet
      open={example !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      height="auto"
      dialogWidth={560}
      title={wide ? undefined : "Пример"}
      header={wide ? <DialogChrome label={tag || undefined} title="Пример" /> : undefined}
    >
      {ex && (
        <div className="flex flex-col px-4 pb-7 md:px-6 md:pt-4 md:pb-6">
          {!wide && tag && <span className="meta mt-3">{tag}</span>}
          <p lang="fr" className="m-0 mt-2 font-serif text-[22px] leading-[30px] text-ink">
            <Hit fr={ex.fr} hit={ex.hit} />
          </p>
          {ex.ru && <p className="m-0 mt-1.5 text-[16px] leading-[22px] text-muted">{ex.ru}</p>}

          {!ex.invented && (
            <a
              href={ex.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 flex items-center gap-2.5 border-y border-rule py-3 text-ink no-underline hoverable:bg-hover-surface"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span lang="fr" className="truncate text-[14px] leading-5">
                  {ex.title ?? ex.domain}
                </span>
                <span className="font-mono text-[11px] leading-4 text-muted">{ex.domain}</span>
              </span>
              <Icon name="external" size={18} className="shrink-0" />
              <span className="sr-only">Источник, откроется в новой вкладке</span>
            </a>
          )}

          {word ? (
            <>
              <Button
                block
                className="mt-5"
                icon={present ? "check" : "plus"}
                disabled={present || full}
                pending={busy === "add"}
                pendingLabel="Добавляем…"
                blocked={busy === "main"}
                onClick={() => void save(false)}
              >
                {present ? "Уже в карточке" : full ? `У слова уже ${MAX_EXAMPLES} примеров` : "В карточку слова"}
              </Button>
              <p className="m-0 mt-2 text-center text-[13px] leading-[18px] text-muted">
                У{" "}
                <span lang="fr" className="font-serif text-[15px] text-ink italic">
                  {word.fr}
                </span>{" "}
                сейчас {count} {plural(count, EXAMPLE_FORMS)} из {MAX_EXAMPLES}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="secondary" size="md" disabled={!canMain} pending={busy === "main"} blocked={busy === "add"} onClick={() => void save(true)}>
                  Сделать главным
                </Button>
                <Button variant="secondary" size="md" className="border-rule" onClick={() => void copy()}>
                  Скопировать
                </Button>
              </div>
            </>
          ) : (
            <>
              <Button block className="mt-5" icon="plus" aria-haspopup="dialog" onClick={() => onAddWord(ex)}>
                Добавить слово с этим примером
              </Button>
              <Button variant="secondary" size="md" block className="mt-2 border-rule" onClick={() => void copy()}>
                Скопировать
              </Button>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}
