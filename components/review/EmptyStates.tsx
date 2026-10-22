import Link from "next/link";
import { Button, buttonClasses } from "@/components/ui/Button";

/** No words anywhere yet: the first-run call to action. */
export function EmptyLibrary({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-1 flex-col">
      <span className="meta mt-8 leading-4">Повторение</span>
      <h1 className="mt-2 mb-0 font-serif text-[34px] leading-10 font-medium tracking-[-0.015em]">Пока нет слов</h1>
      <p className="mt-3 mb-0 max-w-[34ch] text-[15px] leading-[22px] text-muted">
        Добавьте первое слово или выражение — оно появится здесь карточкой с переводом.
      </p>
      <div className="min-h-6 flex-1" />
      <div className="flex shrink-0 flex-col gap-2">
        <Button block icon="plus" onClick={onAdd}>
          Добавить слово
        </Button>
        <Link href="/import" className={buttonClasses({ variant: "tertiary", size: "md", block: true })}>
          Импорт со скриншота
        </Link>
      </div>
    </div>
  );
}

/** The chosen theme has no words. */
export function EmptyFolder({ folderName, onShowAll, onAdd }: { folderName: string; onShowAll: () => void; onAdd: () => void }) {
  return (
    <div className="flex flex-1 flex-col">
      <span className="meta mt-8 leading-4">тема: {folderName}</span>
      <h1 className="mt-2 mb-0 font-serif text-[34px] leading-10 font-medium tracking-[-0.015em]">В этой теме пока нет слов</h1>
      <div className="min-h-6 flex-1" />
      <div className="flex shrink-0 flex-col gap-2">
        <Button block onClick={onShowAll}>
          Все темы
        </Button>
        <Button variant="tertiary" size="md" block onClick={onAdd}>
          Добавить слова
        </Button>
      </div>
    </div>
  );
}
