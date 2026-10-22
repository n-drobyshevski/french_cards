"use client";

import Link from "next/link";
import { Fragment, useId } from "react";
import { Kbd } from "@/components/ui/Kbd";
import { DialogChrome, Sheet } from "@/components/ui/Sheet";
import { useFormatKeys } from "@/lib/key-names";
import { useShell } from "./ShellContext";

/** A key combo ("Mod+Enter"), or a muted word between caps. */
type KeyPart = string | { then: true } | { or: true };

interface ShortcutRow {
  label: string;
  keys: KeyPart[];
}

interface ShortcutGroup {
  id: string;
  title: string;
  rows: ShortcutRow[];
}

const THEN = { then: true } as const;
const OR = { or: true } as const;

/** The full keyboard map (DESKTOP-SPEC §4), in the two columns of D-Shortcuts. */
export const SHORTCUT_COLUMNS: ShortcutGroup[][] = [
  [
    {
      id: "all",
      title: "Везде",
      rows: [
        { label: "Новое слово", keys: ["N"] },
        { label: "Поиск в библиотеке", keys: ["/"] },
        { label: "Все клавиши", keys: ["?"] },
        { label: "Повторение", keys: ["G", THEN, "R"] },
        { label: "Библиотека", keys: ["G", THEN, "L"] },
        { label: "Импорт", keys: ["G", THEN, "I"] },
        { label: "Скрыть боковую панель", keys: ["["] },
        { label: "Следующая область", keys: ["F6"] },
        { label: "Вставить скриншот", keys: ["Mod+V"] },
        { label: "Закрыть или отменить", keys: ["Escape"] },
      ],
    },
    {
      id: "review",
      title: "Повторение",
      rows: [
        { label: "Перевернуть карточку", keys: ["Space", OR, "Enter"] },
        { label: "Не знаю / Сложно / Знаю", keys: ["1", "2", "3"] },
        { label: "Не знаю / Знаю", keys: ["Left", "Right"] },
        { label: "Отменить ответ", keys: ["Z"] },
        { label: "Ещё практика", keys: ["P"] },
        { label: "Закончить практику", keys: ["Escape"] },
      ],
    },
  ],
  [
    {
      id: "library",
      title: "Библиотека",
      rows: [
        { label: "Следующее / предыдущее слово", keys: ["J", "K"] },
        { label: "Открыть карточку", keys: ["Enter"] },
        { label: "Изменить слово", keys: ["E"] },
        { label: "Отметить", keys: ["X"] },
        { label: "Расширить выделение", keys: ["Shift+Down"] },
        { label: "Выбрать все", keys: ["Mod+A"] },
        { label: "Переместить в тему", keys: ["M"] },
        { label: "Удалить", keys: ["Delete", OR, "Mod+Backspace"] },
        { label: "Отменить действие", keys: ["Z"] },
        { label: "Повторить тему", keys: ["R"] },
        { label: "Переименовать тему", keys: ["F2"] },
      ],
    },
    {
      id: "add",
      title: "Новое слово и импорт",
      rows: [
        { label: "По подсказкам", keys: ["Up", "Down"] },
        { label: "Выбрать подсказку", keys: ["Enter"] },
        { label: "Добавить", keys: ["Mod+Enter"] },
        { label: "Добавить и ещё", keys: ["Shift+Mod+Enter"] },
      ],
    },
  ],
];

function Group({ group, first }: { group: ShortcutGroup; first: boolean }) {
  const id = useId();
  const format = useFormatKeys();
  return (
    <section aria-labelledby={id} className={first ? undefined : "mt-5"}>
      <div className="flex h-7 items-center border-b border-ink">
        <h3 id={id} className="m-0 text-[13px] leading-5 font-medium">
          {group.title}
        </h3>
      </div>
      <dl className="m-0">
        {group.rows.map((row) => (
          <div key={row.label} className="flex h-[30px] items-center justify-between gap-3 border-b border-rule">
            <dt className="text-[14px] leading-5 whitespace-nowrap">{row.label}</dt>
            <dd className="m-0 flex items-center gap-1.5">
              {row.keys.map((part, i) => (
                <Fragment key={i}>
                  {typeof part === "string" ? (
                    <Kbd>{format(part)}</Kbd>
                  ) : (
                    <span className="text-[12px] leading-4 text-muted">{"then" in part ? "затем" : "или"}</span>
                  )}
                </Fragment>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** «Клавиши» overlay (`?`, D-Shortcuts): every key in two columns. Mounted once by AppShell. */
export function ShortcutsDialog() {
  const { shortcutsOpen, setShortcutsOpen } = useShell();
  return (
    <Sheet
      open={shortcutsOpen}
      onOpenChange={setShortcutsOpen}
      height="large"
      dialogWidth={800}
      description="Все клавиши приложения"
      onOpenAutoFocus={(event) => {
        // Focus the dialog itself, not the close button (no ring on open); Tab still enters it.
        event.preventDefault();
        (event.target as HTMLElement | null)?.focus();
      }}
      header={<DialogChrome label="Справка" title="Клавиши" />}
      footer={
        <p className="m-0 text-[13px] leading-5 text-muted">
          Однобуквенные клавиши можно выключить в{" "}
          <Link
            href="/settings#set-keys"
            onClick={() => setShortcutsOpen(false)}
            className="font-medium text-ink underline decoration-1 underline-offset-[3px]"
          >
            настройках
          </Link>
        </p>
      }
    >
      <div className="grid grid-cols-1 items-start gap-x-12 px-6 pt-4 pb-2 md:grid-cols-2">
        {SHORTCUT_COLUMNS.map((column, c) => (
          <div key={c} className={c > 0 ? "max-md:mt-5" : undefined}>
            {column.map((group, g) => (
              <Group key={group.id} group={group} first={g === 0} />
            ))}
          </div>
        ))}
      </div>
    </Sheet>
  );
}
