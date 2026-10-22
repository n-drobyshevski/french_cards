"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { cx } from "./cx";
import { Icon } from "./Icons";

export interface HeaderProps {
  /** Screen title, Newsreader 22. */
  title?: ReactNode;
  /** Mono uppercase label in place of the title, e.g. «Библиотека / тема». */
  eyebrow?: ReactNode;
  /**
   * Back target: a path renders a link; a function is called on tap.
   * Omitted: history back, or `fallbackHref` when there is no history (opened from a link).
   */
  back?: string | (() => void);
  fallbackHref?: string;
  /** «Назад» by default. */
  backLabel?: string;
  /** Hide the back arrow. */
  noBack?: boolean;
  /** Right-side actions (IconButton, tertiary Button). */
  actions?: ReactNode;
  className?: string;
}

const backClass =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-chip bg-transparent text-ink active:bg-surface-2";

/** Screen header: 44px row 16px below the safe area, back arrow + title + optional actions. */
export function Header({
  title,
  eyebrow,
  back,
  fallbackHref = "/",
  backLabel = "Назад",
  noBack = false,
  actions,
  className,
}: HeaderProps) {
  const router = useRouter();
  const arrow = <Icon name="back" size={20} />;

  let backEl: ReactNode = null;
  if (!noBack) {
    backEl =
      typeof back === "string" ? (
        <Link href={back} aria-label={backLabel} className={backClass}>
          {arrow}
        </Link>
      ) : (
        <button
          type="button"
          aria-label={backLabel}
          className={backClass}
          onClick={() => {
            if (typeof back === "function") back();
            else if (window.history.length > 1) router.back();
            else router.replace(fallbackHref);
          }}
        >
          {arrow}
        </button>
      );
  }

  return (
    <header className={cx("mt-4 flex h-11 shrink-0 items-center gap-1", noBack ? "pl-4" : "pl-1", actions ? "pr-1" : "pr-4", className)}>
      {backEl}
      <div className="flex min-w-0 flex-1 items-center">
        {title != null && (
          <h1 className="m-0 truncate font-serif text-[22px] leading-7 font-medium tracking-[-0.01em] text-ink">{title}</h1>
        )}
        {title == null && eyebrow != null && <span className="meta truncate">{eyebrow}</span>}
      </div>
      {actions && <div className="flex shrink-0 items-center">{actions}</div>}
    </header>
  );
}
