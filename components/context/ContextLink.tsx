"use client";

import Link from "next/link";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icons";
import { contextHref } from "./data";

// Ways into «Контекст» from other screens (mockups E-Word, E-Add, E-Library).

/** Word card, beside «+ Ещё пример»: «Примеры из жизни ›». `onNavigate` closes the sheet it sits in. */
export function LifeExamplesLink({ fr, onNavigate, className }: { fr: string; onNavigate?: () => void; className?: string }) {
  return (
    <Link
      href={contextHref(fr)}
      onClick={onNavigate}
      className={cx(
        "relative inline-flex h-9 items-center gap-1 text-[13px] leading-5 font-medium text-ink underline decoration-red decoration-[1.5px] underline-offset-4",
        "before:absolute before:-inset-y-1 before:inset-x-0",
        className,
      )}
    >
      Примеры из жизни
      <Icon name="chevron-right" size={14} />
    </Link>
  );
}

/**
 * A ruled row that opens the query in «Контекст»: «Как «kiffer» говорят в жизни · КОНТЕКСТ ›» (add
 * sheet) or «Посмотреть «kiffer» в Контексте» with a subline (library search with no match).
 */
export function ContextRow({
  q,
  variant = "add",
  onNavigate,
  className,
}: {
  q: string;
  variant?: "add" | "library" | "desk";
  onNavigate?: () => void;
  className?: string;
}) {
  const word = (
    <span lang="fr" className="font-serif text-[16px]">
      «{q}»
    </span>
  );
  if (variant === "library") {
    return (
      <Link
        href={contextHref(q)}
        onClick={onNavigate}
        className={cx("flex min-h-[60px] items-center gap-3 border-b border-rule py-2 text-ink no-underline active:bg-surface-2", className)}
      >
        <Icon name="search" size={20} className="shrink-0" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[15px] leading-5">Посмотреть {word} в Контексте</span>
          <span className="text-[13px] leading-[18px] text-muted">примеры из веба, синонимы, спряжение</span>
        </span>
        <Icon name="chevron-right" size={16} className="shrink-0 text-muted" />
      </Link>
    );
  }
  return (
    <Link
      href={contextHref(q)}
      onClick={onNavigate}
      className={cx(
        "flex items-center gap-2.5 border-b border-rule text-ink no-underline",
        variant === "desk" ? "hover-fade -mx-6 min-h-11 px-6 hoverable:bg-hover-surface" : "min-h-[52px] active:bg-surface-2",
        className,
      )}
    >
      <Icon name="search" size={variant === "desk" ? 16 : 18} className="shrink-0 text-muted" />
      <span className="min-w-0 flex-1 text-[14px] leading-5">Как {word} говорят в жизни</span>
      <span className="meta shrink-0">Контекст</span>
      <Icon name="chevron-right" size={16} className="shrink-0 text-muted" />
    </Link>
  );
}
