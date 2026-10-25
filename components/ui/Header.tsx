"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, ViewTransition, type ReactNode, type ViewTransitionProps } from "react";
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
  /** View-transition types for a path `back` link, e.g. ["nav-back"] (L6). */
  backTransitionTypes?: string[];
  /** Hide the back arrow. */
  noBack?: boolean;
  /** Right-side actions (IconButton, tertiary Button). */
  actions?: ReactNode;
  /**
   * Phones only (D4 Bold, MOTION-SPEC §4.10): the header row holds back + actions over --paper and
   * stays at the top; `title` is a large Newsreader 32 title in the content under it. When that title
   * has scrolled under the row it fades into the row as a centred 17px title, and a hairline draws
   * left → right under the row while content is under it. From 768 up it is the standard header.
   * Opt-in; `eyebrow` is ignored on phones here.
   */
  large?: boolean;
  /** Large mode: marks after the large title («закреплена», «на паузе»). */
  titleAside?: ReactNode;
  /** Large mode: classes for the large title's row, e.g. "px-0" inside padded content, "[&>h1]:text-[28px] [&>h1]:leading-9". */
  largeTitleClassName?: string;
  /** Large mode: wraps the large title in a ViewTransition with these props (a shared-element morph, e.g. library drawer → theme page). */
  largeTitleTransition?: Omit<ViewTransitionProps, "children">;
  className?: string;
}

const backClass =
  "press-sm inline-flex size-11 shrink-0 items-center justify-center rounded-chip bg-transparent text-ink active:bg-surface-2";

/** Screen header: 44px row 16px below the safe area, back arrow + title + optional actions. */
export function Header({
  title,
  eyebrow,
  back,
  fallbackHref = "/",
  backLabel = "Назад",
  backTransitionTypes,
  noBack = false,
  actions,
  large = false,
  titleAside,
  largeTitleClassName,
  largeTitleTransition,
  className,
}: HeaderProps) {
  const router = useRouter();
  const arrow = <Icon name="back" size={20} />;

  let backEl: ReactNode = null;
  if (!noBack) {
    backEl =
      typeof back === "string" ? (
        <Link href={back} aria-label={backLabel} transitionTypes={backTransitionTypes} className={backClass}>
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

  if (large && title != null) {
    return (
      <LargeTitleHeader
        title={title}
        titleAside={titleAside}
        largeTitleClassName={largeTitleClassName}
        largeTitleTransition={largeTitleTransition}
        className={className}
      >
        <div className={cx("relative flex h-11 items-center gap-1", noBack ? "pl-4" : "pl-1", actions ? "pr-1" : "pr-4")}>
          {backEl}
          <div className="flex min-w-0 flex-1 items-center">
            <h1 className="m-0 truncate font-serif text-[22px] leading-7 font-medium tracking-[-0.01em] text-ink max-md:hidden">{title}</h1>
          </div>
          {actions && <div className="flex shrink-0 items-center">{actions}</div>}
        </div>
      </LargeTitleHeader>
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

/**
 * The large-title shell: a sticky row (16px under the safe area, --paper) with the compact title and
 * the hairline, then the large title in the flow. One IntersectionObserver on the large title, with
 * the row's height cut off the top of the viewport: partly under the row → hairline; fully under →
 * compact title. From 768 up only the standard row shows (the compact parts and the large title are
 * md:hidden). Reduced motion: both swap without moving (globals.css).
 */
function LargeTitleHeader({
  title,
  titleAside,
  largeTitleClassName,
  largeTitleTransition,
  className,
  children,
}: {
  title: ReactNode;
  titleAside?: ReactNode;
  largeTitleClassName?: string;
  largeTitleTransition?: Omit<ViewTransitionProps, "children">;
  className?: string;
  children: ReactNode;
}) {
  const barRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const [under, setUnder] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const largeTitle = <h1 className="m-0 min-w-0 font-serif text-[32px] leading-10 font-medium tracking-[-0.015em] break-words text-ink">{title}</h1>;

  useEffect(() => {
    const bar = barRef.current;
    const el = titleRef.current;
    if (!bar || !el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const top = entry.rootBounds?.top ?? bar.getBoundingClientRect().bottom;
        const above = entry.boundingClientRect.top < top - 0.5;
        setUnder(above);
        setCollapsed(above && !entry.isIntersecting);
      },
      { rootMargin: `-${Math.round(bar.offsetHeight)}px 0px 0px 0px`, threshold: [0, 1] },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <header
        ref={barRef}
        className={cx(
          "relative shrink-0 md:mt-4",
          "max-md:sticky max-md:z-20 max-md:top-0 max-md:mt-[calc(var(--safe-top)*-1)] max-md:bg-paper max-md:pt-[calc(16px+var(--safe-top))]",
          className,
        )}
      >
        {children}
        <span
          aria-hidden="true"
          data-on={collapsed ? "" : undefined}
          className="header-compact-title pointer-events-none absolute inset-x-[60px] bottom-0 flex h-11 items-center justify-center md:hidden"
        >
          <span className="truncate font-serif text-[17px] leading-6 font-medium text-ink">{title}</span>
        </span>
        <span aria-hidden="true" data-on={under ? "" : undefined} className="header-hairline absolute inset-x-0 bottom-0 h-px bg-rule md:hidden" />
      </header>
      <div ref={titleRef} className={cx("mt-2 flex min-h-10 items-center gap-3 px-4 md:hidden", largeTitleClassName)}>
        {largeTitleTransition ? <ViewTransition {...largeTitleTransition}>{largeTitle}</ViewTransition> : largeTitle}
        {titleAside}
      </div>
    </>
  );
}
