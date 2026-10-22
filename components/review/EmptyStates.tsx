import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { buttonClasses } from "@/components/ui/button-classes";

/** From 768 up the empty states sit in the review column, top 64, actions in one row. */
const DESK_COLUMN = "md:mx-auto md:w-(--col-w) md:max-w-[calc(100%-48px)] md:flex-none md:pt-16";
const DESK_PRIMARY = "md:h-11 md:w-auto md:px-4 md:text-[14px]";
const DESK_SECONDARY =
  "md:h-11 md:w-auto md:border md:border-boundary md:bg-surface md:px-4 md:text-[14px] md:no-underline hoverable:bg-hover-surface";

/** No words anywhere yet: the first-run call to action. */
export function EmptyLibrary({ onAdd }: { onAdd: () => void }) {
  return (
    <div className={`flex flex-1 flex-col ${DESK_COLUMN}`}>
      <span className="meta mt-8 leading-4 md:hidden">Повторение</span>
      <h1 className="mt-2 mb-0 font-serif text-[34px] leading-10 font-medium tracking-[-0.015em] md:mt-0">Пока нет слов</h1>
      <p className="mt-3 mb-0 max-w-[34ch] text-[15px] leading-[22px] text-muted md:max-w-[60ch]">
        Добавьте первое слово или выражение — оно появится здесь карточкой с переводом.
      </p>
      <div className="min-h-6 flex-1 md:min-h-0 md:flex-none md:basis-6" />
      <div className="flex shrink-0 flex-col gap-2 md:flex-row md:gap-4">
        <Button block icon="plus" onClick={onAdd} className={DESK_PRIMARY}>
          Добавить слово
        </Button>
        <Link href="/import" className={buttonClasses({ variant: "tertiary", size: "md", block: true, className: DESK_SECONDARY })}>
          Импорт со скриншота
        </Link>
      </div>
    </div>
  );
}

/** The chosen theme has no words. */
export function EmptyFolder({ folderName, onShowAll, onAdd }: { folderName: string; onShowAll: () => void; onAdd: () => void }) {
  return (
    <div className={`flex flex-1 flex-col ${DESK_COLUMN}`}>
      <span className="meta mt-8 leading-4 md:hidden">тема: {folderName}</span>
      <h1 className="mt-2 mb-0 font-serif text-[34px] leading-10 font-medium tracking-[-0.015em] md:mt-0">В этой теме пока нет слов</h1>
      <div className="min-h-6 flex-1 md:min-h-0 md:flex-none md:basis-6" />
      <div className="flex shrink-0 flex-col gap-2 md:flex-row md:gap-4">
        <Button block onClick={onShowAll} className={DESK_PRIMARY}>
          Все темы
        </Button>
        <Button variant="tertiary" size="md" block onClick={onAdd} className={DESK_SECONDARY}>
          Добавить слова
        </Button>
      </div>
    </div>
  );
}
